import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const SEARCH_URL = 'https://global.oliveyoung.com/display/search'
const TARGET_PER_CATEGORY = 50
const REQUEST_DELAY_MS = 80

const MAKEUP_CATEGORIES = [
  { key: 'lip', label: 'Lip', searchQuery: 'lip tint' },
  { key: 'foundation', label: 'Foundation & BB', searchQuery: 'foundation bb' },
  { key: 'blush', label: 'Blush & Highlighter', searchQuery: 'blush highlighter' },
  { key: 'eyeshadow', label: 'Eye', searchQuery: 'eye shadow' },
] as const

type MakeupCategory = (typeof MAKEUP_CATEGORIES)[number]['key']

type ProductCandidate = {
  affiliateUrl: string
  brand: string
  name: string
  price: number
  imageUrl: string
  category: MakeupCategory
}

function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is missing. Check ${envPath}.`)
  }

  return value
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeProductUrl(url: string) {
  try {
    const parsed = new URL(url)
    const prdtNo = parsed.searchParams.get('prdtNo')

    if (!prdtNo) {
      return parsed.toString()
    }

    const normalized = new URL('https://global.oliveyoung.com/product/detail')
    normalized.searchParams.set('prdtNo', prdtNo)
    return normalized.toString()
  } catch {
    return url
  }
}

function isMissingGlobalAffiliateUrlColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return (
    (code === '42703' && typeof message === 'string' && message.includes('global_affiliate_url')) ||
    (typeof message === 'string' && message.includes('global_affiliate_url'))
  )
}

function isMissingRegionColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return (
    (code === '42703' && typeof message === 'string' && message.includes('region')) ||
    (typeof message === 'string' && message.includes('region'))
  )
}

function removeUnsupportedColumns<T extends Record<string, unknown>>(row: T, error: unknown) {
  const nextRow = { ...row }
  let changed = false

  if (isMissingGlobalAffiliateUrlColumn(error) && 'global_affiliate_url' in nextRow) {
    delete nextRow.global_affiliate_url
    changed = true
  }

  if (isMissingRegionColumn(error) && 'region' in nextRow) {
    delete nextRow.region
    changed = true
  }

  return changed ? nextRow : null
}

function isDuplicateProductNameError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const message = 'message' in error ? error.message : null
  return typeof message === 'string' && message.includes('products_name_unique')
}

async function loadExistingGlobalMakeupUrls() {
  const existingUrls = new Set<string>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const to = from + pageSize - 1
    const fullQuery = await supabase
      .from('products')
      .select('affiliate_url, global_affiliate_url, category')
      .in('category', MAKEUP_CATEGORIES.map((category) => category.key))
      .range(from, to)

    let data = fullQuery.data

    if (fullQuery.error) {
      if (!isMissingGlobalAffiliateUrlColumn(fullQuery.error)) {
        throw new Error(`Failed to load existing global makeup URLs: ${fullQuery.error.message}`)
      }

      const fallbackQuery = await supabase
        .from('products')
        .select('affiliate_url, category')
        .in('category', MAKEUP_CATEGORIES.map((category) => category.key))
        .range(from, to)

      if (fallbackQuery.error) {
        throw new Error(`Failed to load existing global makeup URLs: ${fallbackQuery.error.message}`)
      }

      data = (fallbackQuery.data ?? []).map((row) => ({
        ...row,
        global_affiliate_url: null,
      }))
    }

    if (!data || data.length === 0) {
      break
    }

    for (const row of data) {
      if (row.global_affiliate_url) {
        existingUrls.add(normalizeProductUrl(row.global_affiliate_url))
      } else if (row.affiliate_url) {
        existingUrls.add(normalizeProductUrl(row.affiliate_url))
      }
    }

    if (data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return existingUrls
}

async function collectCategoryCandidates(page: Page, category: (typeof MAKEUP_CATEGORIES)[number]) {
  const searchUrl = new URL(SEARCH_URL)
  searchUrl.searchParams.set('query', category.searchQuery)

  await page.goto(searchUrl.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  })
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1200)

  const rawRows = await page.evaluate(({ categoryKey }) => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/product/detail?prdtNo="]'))

    return anchors.map((anchor) => {
      const element = anchor
      const card =
        element.closest('li, article, .prd-unit, .product-unit, .prod-item, .product-item, .inner, .swiper-slide') ??
        element.parentElement
      const text = String(card?.textContent ?? element.textContent ?? '').replace(/\s+/g, ' ').trim()
      const alt = String(card?.querySelector('img')?.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim()
      const brandText = String(
        card?.querySelector('.brand-name, .tx_brand, [data-testid*="brand"]')?.textContent ?? ''
      ).replace(/\s+/g, ' ').trim()
      const priceText =
        String(
          card?.querySelector('.price, .price-current, .sales-price, [data-testid*="price"]')?.textContent ?? ''
        ).replace(/\s+/g, ' ').trim()
      const imageUrl =
        String(
          card?.querySelector('img')?.getAttribute('src') ??
          card?.querySelector('img')?.getAttribute('data-src') ??
          ''
        ).replace(/\s+/g, ' ').trim()

      return {
        affiliateUrl: String(element.href ?? '').replace(/\s+/g, ' ').trim(),
        text,
        alt,
        brandText,
        priceText,
        imageUrl,
        category: categoryKey,
      }
    })
  }, { categoryKey: category.key })

  const deduped = new Map<string, ProductCandidate>()

  for (const row of rawRows as Array<Record<string, string>>) {
    const affiliateUrl = normalizeProductUrl(row.affiliateUrl ?? '')
    const alt = normalizeWhitespace(row.alt ?? '')
    const text = normalizeWhitespace(row.text ?? '')

    if (!affiliateUrl || !alt) {
      continue
    }

    const prefix = text.includes(alt) ? text.slice(0, text.indexOf(alt)) : ''
    const brand = normalizeWhitespace(
      row.brandText ||
      prefix.replace(/\bBEST\b|\bNEW\b|\bEXCLUSIVE\b/gi, ' ') ||
      alt.split(' ')[0]
    )
    const name = normalizeWhitespace(alt)
    const price = Math.round(Number.parseFloat((row.priceText ?? '').replace(/[^\d.]/g, '')) || 0)

    if (!brand || !name) {
      continue
    }

    if (!deduped.has(affiliateUrl)) {
      deduped.set(affiliateUrl, {
        affiliateUrl,
        brand,
        name,
        price,
        imageUrl: normalizeWhitespace(row.imageUrl ?? ''),
        category: row.category as MakeupCategory,
      })
    }
  }

  return Array.from(deduped.values()).slice(0, TARGET_PER_CATEGORY)
}

async function upsertProduct(row: Record<string, unknown>) {
  const url = String(row.global_affiliate_url)
  const productName = String(row.name ?? '')

  const existingUrlQuery = await supabase
    .from('products')
    .select('id')
    .eq('affiliate_url', url)
    .maybeSingle()

  if (existingUrlQuery.error && existingUrlQuery.error.code !== 'PGRST116') {
    throw new Error(`Failed to find existing product for ${url}: ${existingUrlQuery.error.message}`)
  }

  if (existingUrlQuery.data?.id) {
    let nextRow = { ...row }

    while (true) {
      const updateResult = await supabase
        .from('products')
        .update(nextRow)
        .eq('id', existingUrlQuery.data.id)

      if (!updateResult.error) {
        break
      }

      const fallbackRow = removeUnsupportedColumns(nextRow, updateResult.error)

      if (!fallbackRow) {
        throw new Error(`Failed to update ${url}: ${updateResult.error.message}`)
      }

      nextRow = fallbackRow
    }

    return 'updated'
  }

  let nextRow = { ...row }
  let error: { message: string } | null = null

  while (true) {
    const insertResult = await supabase.from('products').insert(nextRow)

    if (!insertResult.error) {
      return 'inserted'
    }

    const fallbackRow = removeUnsupportedColumns(nextRow, insertResult.error)

    if (!fallbackRow) {
      error = insertResult.error
      break
    }

    nextRow = fallbackRow
  }

  if (error && isDuplicateProductNameError(error) && productName) {
    const { data: existingByName, error: existingByNameError } = await supabase
      .from('products')
      .select('id')
      .eq('name', productName)
      .maybeSingle()

    if (existingByNameError && existingByNameError.code !== 'PGRST116') {
      throw new Error(`Failed to resolve duplicate for ${productName}: ${existingByNameError.message}`)
    }

    if (existingByName?.id) {
      let duplicateRow = { ...row }

      while (true) {
        const updateResult = await supabase
          .from('products')
          .update(duplicateRow)
          .eq('id', existingByName.id)

        if (!updateResult.error) {
          break
        }

        const fallbackRow = removeUnsupportedColumns(duplicateRow, updateResult.error)

        if (!fallbackRow) {
          throw new Error(`Failed to update duplicate ${productName}: ${updateResult.error.message}`)
        }

        duplicateRow = fallbackRow
      }

      return 'updated'
    }
  }

  if (error) {
    throw new Error(`Failed to insert ${url}: ${error.message}`)
  }

  return 'inserted'
}

async function processCategory(
  page: Page,
  category: (typeof MAKEUP_CATEGORIES)[number]
) {
  console.log(`\n[${category.label}] collecting candidates...`)
  const candidates = await collectCategoryCandidates(page, category)
  let savedCount = 0

  for (const candidate of candidates) {
    const globalUrl = normalizeProductUrl(candidate.affiliateUrl)
    const row = {
      affiliate_url: globalUrl,
      global_affiliate_url: globalUrl,
      brand: candidate.brand,
      category: category.key,
      image_url: candidate.imageUrl,
      ingredient_names: [] as string[],
      name: candidate.name,
      price: candidate.price,
      region: 'global',
    }

    await upsertProduct(row)
    savedCount += 1
    console.log(`[${category.label}] ${savedCount}/${TARGET_PER_CATEGORY} saved: ${candidate.brand} ${candidate.name}`)
    await sleep(REQUEST_DELAY_MS)
  }

  if (savedCount < TARGET_PER_CATEGORY) {
    console.warn(`[${category.label}] only saved ${savedCount}/${TARGET_PER_CATEGORY}`)
  }

  return savedCount
}

async function countGlobalMakeupProducts() {
  const counts: Record<MakeupCategory, number> = {
    lip: 0,
    foundation: 0,
    blush: 0,
    eyeshadow: 0,
  }

  for (const category of MAKEUP_CATEGORIES) {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category', category.key)

    if (error) {
      throw new Error(`Failed to count ${category.key}: ${error.message}`)
    }

    counts[category.key] = count ?? 0
  }

  return counts
}

async function main() {
  console.log('Global Olive Young makeup crawl started...')
  const existingUrls = await loadExistingGlobalMakeupUrls()
  console.log(`Found ${existingUrls.size} existing global makeup URLs in products.`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 2200 },
    locale: 'en-US',
  })

  await context.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
  })

  const page = await context.newPage()

  try {
    let totalSaved = 0

    for (const category of MAKEUP_CATEGORIES) {
      totalSaved += await processCategory(page, category)
    }

    const counts = await countGlobalMakeupProducts()
    console.log('\nGlobal makeup crawl finished.')
    console.log(`Inserted or updated ${totalSaved} products in this run.`)
    console.log(`lip=${counts.lip}, foundation=${counts.foundation}, blush=${counts.blush}, eyeshadow=${counts.eyeshadow}, total=${counts.lip + counts.foundation + counts.blush + counts.eyeshadow}`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
