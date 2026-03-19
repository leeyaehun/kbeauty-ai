import { chromium, type BrowserContext, type Page } from 'playwright'

import {
  USER_AGENT,
  normalizeDomesticProductUrl,
  normalizeGlobalProductUrl,
  normalizeWhitespace,
  sleep,
  supabase,
} from './oliveyoung-shared'

type ZeroPriceProduct = {
  affiliate_url: string | null
  brand: string | null
  id: string
  name: string | null
}

type Region = 'domestic' | 'global'

type PriceFixOutcome = 'updated' | 'nullified' | 'failed'

type PriceFixResult = {
  message?: string
  nextPrice: number | null
  outcome: PriceFixOutcome
}

const CONCURRENCY = Math.max(1, Number.parseInt(process.env.FIX_ZERO_PRICE_CONCURRENCY ?? '10', 10) || 10)
const FIX_ZERO_PRICE_LIMIT = Number.parseInt(process.env.FIX_ZERO_PRICE_LIMIT ?? '0', 10) || 0
const PAGE_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.FIX_ZERO_PRICE_PAGE_TIMEOUT_MS ?? '20000', 10) || 20000
)

const DOMESTIC_SELECTORS = [
  '.price-box .tx-cur .tx-num',
  '.prd-price .price',
  'meta[property="product:price:amount"]',
  'meta[itemprop="price"]',
]

const GLOBAL_SELECTORS = [
  '.product-price',
  '.price-box',
  'meta[property="product:price:amount"]',
  'meta[itemprop="price"]',
]

const GLOBAL_DETAIL_DATA_URL = 'https://global.oliveyoung.com/product/detail-data'

async function fetchZeroPriceProducts() {
  const allRows: ZeroPriceProduct[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, affiliate_url')
      .eq('price', 0)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(`price=0 제품 조회 실패: ${error.message}`)
    }

    const rows = (data ?? []) as ZeroPriceProduct[]
    allRows.push(...rows)

    if (rows.length < pageSize) {
      break
    }
  }

  return FIX_ZERO_PRICE_LIMIT > 0 ? allRows.slice(0, FIX_ZERO_PRICE_LIMIT) : allRows
}

function resolveRegion(url: string) {
  if (url.includes('global.oliveyoung.com')) {
    return 'global' as const
  }

  if (url.includes('oliveyoung.co.kr')) {
    return 'domestic' as const
  }

  return null
}

function normalizeProductUrl(url: string, region: Region) {
  return region === 'domestic' ? normalizeDomesticProductUrl(url) : normalizeGlobalProductUrl(url)
}

function extractNumericCandidates(text: string) {
  return Array.from(text.matchAll(/\d[\d,.]*/g))
    .map((match) => Number.parseInt(match[0].replace(/[^\d]/g, ''), 10))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function pickBestPrice(texts: string[]) {
  const candidates = texts.flatMap(extractNumericCandidates)

  if (candidates.length === 0) {
    return null
  }

  return Math.min(...candidates)
}

async function collectTexts(page: Page, selectors: string[]) {
  const values: string[] = []

  for (const selector of selectors) {
    const locator = page.locator(selector).first()

    try {
      if ((await locator.count()) === 0) {
        continue
      }

      const tagName = await locator.evaluate((node) => node.tagName.toLowerCase()).catch(() => null)
      const rawValue = tagName === 'meta'
        ? await locator.getAttribute('content')
        : await locator.textContent({ timeout: 2500 })

      const text = normalizeWhitespace(rawValue ?? '')

      if (text) {
        values.push(text)
      }
    } catch {}
  }

  return values
}

async function extractPriceFromPage(page: Page, region: Region) {
  const selectors = region === 'domestic' ? DOMESTIC_SELECTORS : GLOBAL_SELECTORS
  const initialTexts = await collectTexts(page, selectors)
  const initialPrice = pickBestPrice(initialTexts)

  if (initialPrice) {
    return initialPrice
  }

  await sleep(1200)

  const retryTexts = await collectTexts(page, selectors)
  const retryPrice = pickBestPrice(retryTexts)

  if (retryPrice) {
    return retryPrice
  }

  return null
}

async function configureContext(context: BrowserContext) {
  await context.setExtraHTTPHeaders({
    'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  })

  await context.route('**/*', async (route) => {
    const type = route.request().resourceType()

    if (type === 'image' || type === 'font' || type === 'media') {
      await route.abort()
      return
    }

    await route.continue()
  })
}

async function updateProductPrice(productId: string, nextPrice: number | null) {
  const { error } = await supabase
    .from('products')
    .update({ price: nextPrice })
    .eq('id', productId)

  if (error) {
    throw new Error(error.message)
  }
}

function parseGlobalProductId(url: string) {
  try {
    const parsed = new URL(url)
    const prdtNo = parsed.searchParams.get('prdtNo')
    return prdtNo && prdtNo.length > 0 ? prdtNo : null
  } catch {
    return null
  }
}

function formatGlobalAmount(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null
  }

  return Math.round(numeric * 100)
}

async function fetchGlobalPriceFromApi(affiliateUrl: string) {
  const prdtNo = parseGlobalProductId(affiliateUrl)

  if (!prdtNo) {
    return null
  }

  const response = await fetch(GLOBAL_DETAIL_DATA_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json;charset=UTF-8',
      'origin': 'https://global.oliveyoung.com',
      'referer': `https://global.oliveyoung.com/product/detail?prdtNo=${prdtNo}`,
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({ prdtNo }),
  })

  if (!response.ok) {
    throw new Error(`global detail-data http ${response.status}`)
  }

  let payload: {
    product?: {
      nrmlAmt?: number | null
      saleAmt?: number | null
    } | null
  }

  try {
    payload = await response.json() as {
      product?: {
        nrmlAmt?: number | null
        saleAmt?: number | null
      } | null
    }
  } catch {
    return null
  }

  return formatGlobalAmount(payload.product?.saleAmt) ?? formatGlobalAmount(payload.product?.nrmlAmt)
}

async function fixSinglePrice(
  product: ZeroPriceProduct,
  contexts: Partial<Record<Region, BrowserContext>>
): Promise<PriceFixResult> {
  if (!product.affiliate_url) {
    await updateProductPrice(product.id, null)
    return {
      nextPrice: null,
      outcome: 'nullified',
      message: 'affiliate_url missing',
    }
  }

  const region = resolveRegion(product.affiliate_url)

  if (!region) {
    await updateProductPrice(product.id, null)
    return {
      nextPrice: null,
      outcome: 'nullified',
      message: 'unsupported affiliate_url',
    }
  }

  if (region === 'global') {
    try {
      const nextPrice = await fetchGlobalPriceFromApi(product.affiliate_url)

      if (!nextPrice) {
        await updateProductPrice(product.id, null)
        return {
          nextPrice: null,
          outcome: 'nullified',
          message: 'global price parse failed',
        }
      }

      await updateProductPrice(product.id, nextPrice)
      return {
        nextPrice,
        outcome: 'updated',
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unexpected end of JSON input')) {
        await updateProductPrice(product.id, null)
        return {
          nextPrice: null,
          outcome: 'nullified',
          message: 'global price parse failed',
        }
      }

      return {
        nextPrice: null,
        outcome: 'failed',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const context = contexts[region]

  if (!context) {
    await updateProductPrice(product.id, null)
    return {
      nextPrice: null,
      outcome: 'nullified',
      message: 'browser context unavailable',
    }
  }

  const page = await context.newPage()
  page.setDefaultTimeout(PAGE_TIMEOUT_MS)

  try {
    const url = normalizeProductUrl(product.affiliate_url, region)
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })

    if (response && response.status() >= 400) {
      await updateProductPrice(product.id, null)
      return {
        nextPrice: null,
        outcome: 'nullified',
        message: `http ${response.status()}`,
      }
    }

    const title = await page.title().catch(() => '')

    if (title === 'Just a moment...') {
      await updateProductPrice(product.id, null)
      return {
        nextPrice: null,
        outcome: 'nullified',
        message: 'cloudflare challenge',
      }
    }

    const nextPrice = await extractPriceFromPage(page, region)

    if (!nextPrice) {
      await updateProductPrice(product.id, null)
      return {
        nextPrice: null,
        outcome: 'nullified',
        message: 'price parse failed',
      }
    }

    await updateProductPrice(product.id, nextPrice)

    return {
      nextPrice,
      outcome: 'updated',
    }
  } catch (error) {
    return {
      nextPrice: null,
      outcome: 'failed',
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await page.close().catch(() => {})
  }
}

async function countRemainingZeroPrices() {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('price', 0)

  if (error) {
    throw new Error(`남은 price=0 조회 실패: ${error.message}`)
  }

  return count ?? 0
}

async function main() {
  const products = await fetchZeroPriceProducts()

  console.log(`price = 0 제품 ${products.length}개 확인`)

  if (products.length === 0) {
    return
  }

  const needsDomesticBrowser = products.some((product) =>
    typeof product.affiliate_url === 'string' && product.affiliate_url.includes('oliveyoung.co.kr')
  )

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  let domesticContext: BrowserContext | null = null
  const contexts: Partial<Record<Region, BrowserContext>> = {}

  if (needsDomesticBrowser) {
    browser = await chromium.launch({
      headless: true,
    })

    domesticContext = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 1200 },
    })

    await configureContext(domesticContext)
    contexts.domestic = domesticContext
  }

  let successCount = 0
  let nullifiedCount = 0
  let failedCount = 0
  let cursor = 0

  const workerCount = Math.min(CONCURRENCY, products.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor
        cursor += 1

        if (index >= products.length) {
          return
        }

        const product = products[index]
        const result = await fixSinglePrice(product, contexts)
        const label = `${product.brand ?? ''} ${product.name ?? product.id}`.trim()

        if (result.outcome === 'updated') {
          successCount += 1
          console.log(`[${index + 1}/${products.length}] updated ${result.nextPrice} - ${label}`)
        } else if (result.outcome === 'nullified') {
          nullifiedCount += 1
          console.log(`[${index + 1}/${products.length}] nullified - ${label} (${result.message ?? 'no price'})`)
        } else {
          failedCount += 1
          console.error(`[${index + 1}/${products.length}] failed - ${label} (${result.message ?? 'unknown error'})`)
        }

        await sleep(250)
      }
    })
  )

  if (domesticContext) {
    await domesticContext.close()
  }

  if (browser) {
    await browser.close()
  }

  const remainingZeroPrices = await countRemainingZeroPrices()

  console.log('\n가격 보정 완료')
  console.log(`성공: ${successCount}`)
  console.log(`null 처리: ${nullifiedCount}`)
  console.log(`실패: ${failedCount}`)
  console.log(`남은 price = 0: ${remainingZeroPrices}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
