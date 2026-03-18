import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from 'playwright'

import { embedMissingProducts } from './embed-products'
import {
  USER_AGENT,
  loadExistingProducts,
  normalizeGlobalProductUrl,
  normalizeWhitespace,
  parsePrice,
  sleep,
  upsertProduct,
} from './oliveyoung-shared'

const SEARCH_URL = 'https://global.oliveyoung.com/display/search'

const GLOBAL_CATEGORIES = [
  { key: 'serum', label: 'Serum', queries: ['serum', 'ampoule'] },
  { key: 'cream', label: 'Cream', queries: ['cream'] },
  { key: 'toner', label: 'Toner', queries: ['toner'] },
  { key: 'cleanser', label: 'Cleanser', queries: ['cleanser'] },
  { key: 'sun_care', label: 'Sun Care', queries: ['sun care', 'sunscreen'] },
  { key: 'mask', label: 'Mask', queries: ['mask', 'sheet mask'] },
  { key: 'eye_cream', label: 'Eye Cream', queries: ['eye cream'] },
  { key: 'lip', label: 'Lip', queries: ['lip tint', 'lip gloss', 'lip stick'] },
  { key: 'foundation', label: 'Foundation', queries: ['foundation'] },
  { key: 'blush', label: 'Blush', queries: ['blush'] },
  { key: 'eyeshadow', label: 'Eyeshadow', queries: ['eyeshadow', 'eye shadow'] },
  { key: 'mascara', label: 'Mascara', queries: ['mascara'] },
  { key: 'body_hair', label: 'Body & Hair', queries: ['body wash', 'body lotion', 'shampoo', 'treatment', 'hair oil'] },
] as const

type GlobalCategory = (typeof GLOBAL_CATEGORIES)[number]

type ProductCandidate = {
  affiliateUrl: string
  brand: string
  category: GlobalCategory['key']
  imageUrl: string
  name: string
  price: number
}

type CategoryReport = {
  inserted: number
  updated: number
}

type SearchResponseProduct = Record<string, unknown>

const requestDelayMs = Math.max(
  0,
  Number.parseInt(process.env.GLOBAL_OLIVEYOUNG_REQUEST_DELAY_MS ?? '300', 10)
)
const resultPageLimit = Math.max(
  1,
  Number.parseInt(process.env.GLOBAL_OLIVEYOUNG_RESULT_PAGE_LIMIT ?? '30', 10)
)
const rowsPerPage = Math.max(
  24,
  Number.parseInt(process.env.GLOBAL_OLIVEYOUNG_ROWS_PER_PAGE ?? '48', 10)
)
const categoryFilter = new Set(
  (process.env.GLOBAL_OLIVEYOUNG_CATEGORY_FILTER ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)

const activeCategories = GLOBAL_CATEGORIES.filter((category) =>
  categoryFilter.size === 0 ? true : categoryFilter.has(category.key)
)

const report = new Map<GlobalCategory['key'], CategoryReport>(
  GLOBAL_CATEGORIES.map((category) => [category.key, { inserted: 0, updated: 0 }])
)

function bumpReport(category: GlobalCategory['key'], action: 'inserted' | 'updated') {
  const stats = report.get(category)

  if (!stats) {
    return
  }

  stats[action] += 1
}

function buildSearchUrl(query: string, pageNo?: number) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('query', query)

  if (pageNo && pageNo > 1) {
    url.searchParams.set('page', String(pageNo))
  }

  return url.toString()
}

function pickString(source: SearchResponseProduct, keys: string[]) {
  for (const key of keys) {
    const value = source[key]

    if (typeof value === 'string' && value.trim()) {
      return normalizeWhitespace(value)
    }
  }

  return ''
}

function pickNumber(source: SearchResponseProduct, keys: string[]) {
  for (const key of keys) {
    const value = source[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = parsePrice(value)

      if (parsed > 0) {
        return parsed
      }
    }
  }

  return 0
}

async function fetchProductListPage(page: Page, query: string, pageNo: number) {
  const response = await page.evaluate(
    async ({ requestedPageNo, requestedQuery, requestedRowsPerPage }) => {
      const sortElement = document.querySelector<HTMLInputElement>('#searchSortSelect')
      const minPrice = document.querySelector<HTMLInputElement>('#orgSchMinUSD')?.value ?? ''
      const maxPrice = document.querySelector<HTMLInputElement>('#orgSchMaxUSD')?.value ?? ''
      const payload: Record<string, string | number | string[] | Record<string, string[]>> = {
        attrValNoList: {},
        brandNoList: [],
        ctgrNoList: [],
        eventSlprcDscntRt: [],
        pageNum: requestedPageNo,
        query: requestedQuery,
        reviewScore: [],
        rowsPerPage: requestedRowsPerPage,
      }

      if (sortElement?.value) {
        payload.sort = sortElement.value
      }

      if (minPrice) {
        payload.lowestPrice = minPrice
      }

      if (maxPrice) {
        payload.highestPrice = maxPrice
      }

      const result = await fetch('/display/search/product-list', {
        body: JSON.stringify(payload),
        credentials: 'include',
        headers: {
          'accept': 'application/json, text/javascript, */*; q=0.01',
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        method: 'POST',
      })

      const text = await result.text()

      return {
        ok: result.ok,
        status: result.status,
        text,
      }
    },
    {
      requestedPageNo: pageNo,
      requestedQuery: query,
      requestedRowsPerPage: rowsPerPage,
    }
  )

  if (!response.ok) {
    throw new Error(`product-list returned ${response.status} for query="${query}" page=${pageNo}`)
  }

  const parsed = JSON.parse(response.text) as {
    search?: {
      hits?: {
        brandInfo?: Record<string, string>
        hit?: Array<{ fields?: SearchResponseProduct }>
      }
      productPriceMap?: Record<string, SearchResponseProduct>
    }
  }

  const hits = parsed.search?.hits?.hit ?? []
  const brandInfo = parsed.search?.hits?.brandInfo ?? {}
  const productPriceMap = parsed.search?.productPriceMap ?? {}
  const candidates = new Map<string, ProductCandidate>()

  for (const hit of hits) {
    const fields = hit.fields ?? {}
    const prdtNo = pickString(fields, ['prdtNo'])
    const priceInfo = prdtNo ? productPriceMap[prdtNo] ?? {} : {}
    const brandNo = pickString(fields, ['brandNo'])
    const affiliateUrl = prdtNo
      ? normalizeGlobalProductUrl(`https://global.oliveyoung.com/product/detail?prdtNo=${prdtNo}`)
      : ''
    const brand = pickString(fields, ['engBrandName', 'brandName', 'korBrandName']) || brandInfo[brandNo] || ''
    const name = pickString(fields, ['engPrdtName', 'prdtName', 'korPrdtName', 'productName'])
    const imageUrl = pickString(fields, ['imgPath', 'prdtImgPath', 'imgUrl', 'imageUrl', 'mainImg'])
    const price =
      pickNumber(fields, ['salePrice', 'curSalePrc', 'slPrc', 'finalPrice']) ||
      pickNumber(priceInfo, ['minPrice', 'minSalePrice', 'salePrice', 'curSalePrc'])

    if (!affiliateUrl || !name || !brand) {
      continue
    }

    candidates.set(affiliateUrl, {
      affiliateUrl,
      brand,
      category: 'serum',
      imageUrl,
      name,
      price,
    })
  }

  return candidates
}

async function processCategory(
  page: Page,
  refs: Awaited<ReturnType<typeof loadExistingProducts>>,
  sessionUrls: Set<string>,
  category: GlobalCategory
) {
  console.log(`\n[${category.label}] 전체 수집 시작`)

  const categoryCandidates = new Map<string, ProductCandidate>()

  for (const query of category.queries) {
    await page.goto(buildSearchUrl(query, 1), {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    await page.waitForSelector('#query', { state: 'attached', timeout: 15000 })

    for (let pageNo = 1; pageNo <= resultPageLimit; pageNo++) {
      const beforeCount = categoryCandidates.size
      const pageCandidates = await fetchProductListPage(page, query, pageNo)

      for (const [url, candidate] of pageCandidates.entries()) {
        if (!categoryCandidates.has(url)) {
          categoryCandidates.set(url, {
            ...candidate,
            category: category.key,
          })
        }
      }

      console.log(
        `[${category.label}] query="${query}" page=${pageNo} 신규 후보 ${pageCandidates.size}개, 누적 ${categoryCandidates.size}개`
      )

      if (pageCandidates.size === 0 || categoryCandidates.size === beforeCount) {
        break
      }
    }
  }

  let processed = 0

  for (const candidate of categoryCandidates.values()) {
    const globalUrl = normalizeGlobalProductUrl(candidate.affiliateUrl)

    if (!globalUrl || sessionUrls.has(globalUrl) || refs.byGlobalUrl.has(globalUrl)) {
      continue
    }

    const action = await upsertProduct(
      refs,
      {
        affiliate_url: globalUrl,
        global_affiliate_url: globalUrl,
        brand: candidate.brand,
        category: category.key,
        image_url: candidate.imageUrl,
        ingredient_names: [],
        name: candidate.name,
        price: candidate.price,
      },
      'global'
    )

    sessionUrls.add(globalUrl)
    bumpReport(category.key, action)
    processed += 1

    if (processed % 25 === 0) {
      console.log(`[${category.label}] ${processed}/${categoryCandidates.size} 저장`)
    }

    await sleep(requestDelayMs)
  }
}

function printReport() {
  console.log('\n글로벌 올리브영 카테고리별 처리 리포트')

  for (const category of activeCategories) {
    const stats = report.get(category.key) ?? { inserted: 0, updated: 0 }
    console.log(
      `- ${category.label}: inserted=${stats.inserted}, updated=${stats.updated}, total=${stats.inserted + stats.updated}`
    )
  }
}

async function main() {
  if (activeCategories.length === 0) {
    throw new Error('활성화된 글로벌 카테고리가 없습니다. GLOBAL_OLIVEYOUNG_CATEGORY_FILTER 값을 확인하세요.')
  }

  console.log('글로벌 올리브영 전체 카테고리 크롤링 시작...')
  console.log(`활성 카테고리: ${activeCategories.map((category) => category.key).join(', ')}`)
  console.log(`결과 페이지 제한: ${resultPageLimit}`)
  console.log(`페이지당 요청 개수: ${rowsPerPage}`)

  const refs = await loadExistingProducts()
  const sessionUrls = new Set<string>()

  console.log(`기존 affiliate_url ${refs.byAffiliateUrl.size}개, global_affiliate_url ${refs.byGlobalUrl.size}개 확인`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 2200 },
  })

  await context.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
  })

  const page = await context.newPage()

  try {
    for (const category of activeCategories) {
      await processCategory(page, refs, sessionUrls, category)
    }
  } finally {
    await context.close()
    await browser.close()
  }

  printReport()

  console.log('\n글로벌 크롤링 후 임베딩 생성 시작...')
  await embedMissingProducts()
}

const __filename = fileURLToPath(import.meta.url)
const isMain = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false

if (isMain) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
