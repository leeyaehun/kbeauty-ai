import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

const SEARCH_URL = 'https://global.oliveyoung.com/display/search'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const REQUEST_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.GLOBAL_OLIVEYOUNG_REQUEST_DELAY_MS ?? '700', 10)
)
const MAX_PRODUCTS = Math.max(
  0,
  Number.parseInt(process.env.GLOBAL_OLIVEYOUNG_MAX_PRODUCTS ?? '0', 10)
)
const ONLY_MISSING = process.env.GLOBAL_OLIVEYOUNG_ONLY_MISSING === '1'

type ProductRow = {
  id: string
  brand: string
  name: string
  global_affiliate_url: string | null
}

type RawCandidate = {
  href: string
  text: string
  brandText: string
  nameText: string
  imageAlt: string
}

type SearchCandidate = {
  href: string
  text: string
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

function normalizeForMatch(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\u2122\u00ae]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function tokenize(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function buildSearchQueries(product: ProductRow) {
  const brand = normalizeWhitespace(product.brand)
  const name = normalizeWhitespace(product.name)
  const nameWithoutBrand = normalizeWhitespace(
    name.toLowerCase().startsWith(brand.toLowerCase()) ? name.slice(brand.length) : name
  )

  return unique(
    [`${brand} ${name}`, name, `${brand} ${nameWithoutBrand}`, nameWithoutBrand]
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean)
  )
}

function computeMatchScore(product: ProductRow, candidate: SearchCandidate) {
  const productBrand = normalizeForMatch(product.brand)
  const productName = normalizeForMatch(product.name)
  const productText = normalizeForMatch(`${product.brand} ${product.name}`)
  const candidateText = normalizeForMatch(candidate.text)

  if (!candidateText) {
    return 0
  }

  const brandTokens = tokenize(product.brand)
  const nameTokens = tokenize(product.name)
  const matchedBrandTokens = brandTokens.filter((token) => candidateText.includes(token)).length
  const matchedNameTokens = nameTokens.filter((token) => candidateText.includes(token)).length
  const brandRatio = brandTokens.length === 0 ? 1 : matchedBrandTokens / brandTokens.length
  const nameRatio = nameTokens.length === 0 ? 0 : matchedNameTokens / nameTokens.length

  let score = 0

  if (candidateText.includes(productText)) {
    score += 10
  }

  if (candidateText.includes(productName)) {
    score += 8
  }

  if (candidateText.includes(productBrand)) {
    score += 4
  }

  score += brandRatio * 3
  score += nameRatio * 8

  return Number(score.toFixed(3))
}

function isAcceptableMatch(product: ProductRow, candidate: SearchCandidate, score: number) {
  const candidateText = normalizeForMatch(candidate.text)
  const brandTokens = tokenize(product.brand)
  const nameTokens = tokenize(product.name)
  const matchedBrandTokens = brandTokens.filter((token) => candidateText.includes(token)).length
  const matchedNameTokens = nameTokens.filter((token) => candidateText.includes(token)).length
  const brandRatio = brandTokens.length === 0 ? 1 : matchedBrandTokens / brandTokens.length
  const nameRatio = nameTokens.length === 0 ? 0 : matchedNameTokens / nameTokens.length

  if (score >= 14) {
    return true
  }

  return nameRatio >= 0.7 && brandRatio >= 0.5 && score >= 10
}

async function loadProducts() {
  const products: ProductRow[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const to = from + pageSize - 1
    let query = supabase
      .from('products')
      .select('id, brand, name, global_affiliate_url')
      .range(from, to)

    if (ONLY_MISSING) {
      query = query.is('global_affiliate_url', null)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to load products: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    products.push(...data)

    if (data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return MAX_PRODUCTS > 0 ? products.slice(0, MAX_PRODUCTS) : products
}

async function extractCandidates(page: Page, query: string) {
  const searchUrl = new URL(SEARCH_URL)
  searchUrl.searchParams.set('query', query)

  await page.goto(searchUrl.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  })
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1200)

  const rawCandidates = await page.evaluate(() => {
    const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/product/detail?prdtNo="]')
    )
    const rows: RawCandidate[] = []

    for (const anchor of anchors) {
      const href = anchor.href?.trim()

      if (!href) {
        continue
      }

      const card =
        anchor.closest('li, article, .prd-unit, .product-unit, .prod-item, .product-item, .inner, .swiper-slide') ??
        anchor.parentElement

      const text = card?.textContent ?? anchor.textContent ?? ''
      const brandText =
        card?.querySelector<HTMLElement>('.brand-name, .tx_brand, [data-testid*="brand"]')?.textContent ?? ''
      const nameText =
        card?.querySelector<HTMLElement>('.product-name, .prd-name, .tx_name, [data-testid*="name"]')?.textContent ??
        ''
      const imageAlt = card?.querySelector<HTMLImageElement>('img[alt]')?.getAttribute('alt') ?? ''

      rows.push({
        href,
        text: normalizeWhitespace(text),
        brandText: normalizeWhitespace(brandText),
        nameText: normalizeWhitespace(nameText),
        imageAlt: normalizeWhitespace(imageAlt),
      })
    }

    return rows
  })

  const deduped = new Map<string, SearchCandidate>()

  for (const candidate of rawCandidates) {
    const text = normalizeWhitespace(
      [candidate.brandText, candidate.nameText, candidate.imageAlt, candidate.text].filter(Boolean).join(' ')
    )

    deduped.set(candidate.href, {
      href: candidate.href,
      text,
    })
  }

  return [...deduped.values()]
}

async function findGlobalAffiliateUrl(page: Page, product: ProductRow) {
  for (const query of buildSearchQueries(product)) {
    const candidates = await extractCandidates(page, query)

    if (candidates.length === 0) {
      continue
    }

    const scoredCandidates = candidates
      .map((candidate) => ({
        candidate,
        score: computeMatchScore(product, candidate),
      }))
      .sort((a, b) => b.score - a.score)

    const bestMatch = scoredCandidates[0]

    if (bestMatch && isAcceptableMatch(product, bestMatch.candidate, bestMatch.score)) {
      return bestMatch.candidate.href
    }
  }

  return null
}

async function updateProduct(productId: string, globalAffiliateUrl: string | null) {
  const { error } = await supabase
    .from('products')
    .update({ global_affiliate_url: globalAffiliateUrl })
    .eq('id', productId)

  if (error) {
    throw new Error(`Failed to update product ${productId}: ${error.message}`)
  }
}

async function main() {
  console.log('글로벌 올리브영 링크 매칭 시작...')

  const products = await loadProducts()
  console.log(`처리 대상 제품 ${products.length}개`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  let matched = 0
  let cleared = 0
  let unchanged = 0
  let failed = 0

  try {
    for (const [index, product] of products.entries()) {
      try {
        const globalAffiliateUrl = await findGlobalAffiliateUrl(page, product)

        if (globalAffiliateUrl) {
          if (product.global_affiliate_url !== globalAffiliateUrl) {
            await updateProduct(product.id, globalAffiliateUrl)
          }

          matched++
          console.log(
            `[${index + 1}/${products.length}] matched ${product.brand} - ${product.name} -> ${globalAffiliateUrl}`
          )
        } else if (product.global_affiliate_url !== null) {
          await updateProduct(product.id, null)
          cleared++
          console.log(`[${index + 1}/${products.length}] cleared ${product.brand} - ${product.name}`)
        } else {
          unchanged++
          console.log(`[${index + 1}/${products.length}] no match ${product.brand} - ${product.name}`)
        }

        if (REQUEST_DELAY_MS > 0) {
          await sleep(REQUEST_DELAY_MS)
        }
      } catch (error) {
        failed++
        console.error(`[${index + 1}/${products.length}] failed ${product.brand} - ${product.name}`, error)
      }
    }
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  console.log(`완료! matched ${matched}, cleared ${cleared}, unchanged ${unchanged}, failed ${failed}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
