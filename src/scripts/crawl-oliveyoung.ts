import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type BrowserContext, type Page } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

const __DEFAULT_TARGET = 100
const CATEGORY_LIST_SELECTOR = '#Contents ul.cate_prd_list > li'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

const CATEGORIES = [
  {
    name: '세럼',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010014',
  },
  {
    name: '크림',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010015',
  },
  {
    name: '토너',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010013',
  },
  {
    name: '클렌저',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=10000010010',
  },
  {
    name: '선케어',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=10000010011',
  },
] as const

type CategoryName = (typeof CATEGORIES)[number]['name']

type ProductCandidate = {
  affiliateUrl: string
  brand: string
  category: CategoryName
  imageUrl: string
  name: string
  price: number
}

type ProductDetail = {
  affiliateUrl: string
  imageUrl: string
  ingredientNames: string[]
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

const targetPerCategory = Math.max(
  1,
  Number.parseInt(process.env.OLIVEYOUNG_TARGET_PER_CATEGORY ?? `${__DEFAULT_TARGET}`, 10)
)
const listPageLimit = Math.max(
  1,
  Number.parseInt(process.env.OLIVEYOUNG_LIST_PAGE_LIMIT ?? '7', 10)
)
const detailConcurrency = Math.max(
  1,
  Number.parseInt(process.env.OLIVEYOUNG_DETAIL_CONCURRENCY ?? '4', 10)
)
const categoryFilter = new Set(
  (process.env.OLIVEYOUNG_CATEGORIES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)

const activeCategories = CATEGORIES.filter((category) =>
  categoryFilter.size === 0 ? true : categoryFilter.has(category.name)
)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeProductUrl(url: string) {
  const parsed = new URL(url)
  const goodsNo = parsed.searchParams.get('goodsNo')
  const dispCatNo = parsed.searchParams.get('dispCatNo')

  if (!goodsNo) {
    return parsed.toString()
  }

  const normalized = new URL('https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do')
  normalized.searchParams.set('goodsNo', goodsNo)

  if (dispCatNo) {
    normalized.searchParams.set('dispCatNo', dispCatNo)
  }

  return normalized.toString()
}

function parsePrice(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number.parseInt(digits, 10) : 0
}

async function loadExistingProductUrls() {
  const existingUrls = new Set<string>()
  const existingCounts = new Map<CategoryName, number>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('products')
      .select('affiliate_url, category')
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load existing products: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    for (const row of data) {
      if (row.affiliate_url) {
        existingUrls.add(normalizeProductUrl(row.affiliate_url))
      }

      if (row.category && CATEGORIES.some((category) => category.name === row.category)) {
        const categoryName = row.category as CategoryName
        existingCounts.set(categoryName, (existingCounts.get(categoryName) ?? 0) + 1)
      }
    }

    if (data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return {
    existingCounts,
    existingUrls,
  }
}

async function waitForCategoryPage(page: Page) {
  await page.waitForSelector(CATEGORY_LIST_SELECTOR, { timeout: 20000 })
  await page.waitForTimeout(1500)
}

async function scrapeCategoryPage(page: Page, categoryName: CategoryName) {
  return page.$$eval(
    CATEGORY_LIST_SELECTOR,
    (items, providedCategoryName) =>
      items.map((item) => {
        const link =
          item.querySelector<HTMLAnchorElement>('.prd_thumb[href*="/store/goods/getGoodsDetail.do"]') ??
          item.querySelector<HTMLAnchorElement>('.prd_name a[href*="/store/goods/getGoodsDetail.do"]')
        const brand = item.querySelector<HTMLElement>('.tx_brand')?.textContent ?? ''
        const name = item.querySelector<HTMLElement>('.tx_name')?.textContent ?? ''
        const currentPrice =
          item.querySelector<HTMLElement>('.prd_price .tx_cur .tx_num')?.textContent ??
          item.querySelector<HTMLElement>('.prd_price .tx_cur')?.textContent ??
          item.querySelector<HTMLElement>('.prd_price .tx_num')?.textContent ??
          ''
        const imageUrl =
          item.querySelector<HTMLImageElement>('.prd_thumb img')?.getAttribute('src') ??
          item.querySelector<HTMLImageElement>('img')?.getAttribute('src') ??
          ''

        return {
          affiliateUrl: link?.href ?? '',
          brand: brand.trim(),
          category: providedCategoryName,
          imageUrl,
          name: name.trim(),
          price: currentPrice,
        }
      }),
    categoryName
  )
}

async function collectCategoryCandidates(
  context: BrowserContext,
  category: (typeof CATEGORIES)[number],
  existingUrls: Set<string>,
  sessionUrls: Set<string>,
  remainingTarget: number
) {
  const page = await context.newPage()
  const candidates: ProductCandidate[] = []
  const localUrls = new Set<string>()
  const candidateTarget = remainingTarget + 40

  try {
    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitForCategoryPage(page)

    for (let pageNo = 1; pageNo <= listPageLimit; pageNo++) {
      const rawItems = await scrapeCategoryPage(page, category.name)

      for (const rawItem of rawItems) {
        if (!rawItem.affiliateUrl || !rawItem.name) {
          continue
        }

        const normalizedUrl = normalizeProductUrl(rawItem.affiliateUrl)

        if (existingUrls.has(normalizedUrl) || sessionUrls.has(normalizedUrl) || localUrls.has(normalizedUrl)) {
          continue
        }

        localUrls.add(normalizedUrl)
        candidates.push({
          affiliateUrl: normalizedUrl,
          brand: normalizeWhitespace(rawItem.brand),
          category: rawItem.category,
          imageUrl: rawItem.imageUrl,
          name: normalizeWhitespace(rawItem.name),
          price: parsePrice(rawItem.price),
        })

        if (candidates.length >= candidateTarget) {
          break
        }
      }

      console.log(`[${category.name}] 목록 ${pageNo}페이지에서 누적 ${candidates.length}개 후보 확보`)

      if (candidates.length >= candidateTarget) {
        break
      }

      const nextPageNo = pageNo + 1
      const nextLink = page.locator(`.pageing a[data-page-no="${nextPageNo}"]`).first()

      if (!(await nextLink.count())) {
        break
      }

      await nextLink.click()
      await page.waitForFunction(
        (expectedPageNo) =>
          document.querySelector('.pageing strong')?.textContent?.trim() === String(expectedPageNo),
        nextPageNo,
        { timeout: 20000 }
      )
      await waitForCategoryPage(page)
    }
  } finally {
    await page.close()
  }

  return candidates
}

async function scrapeProductDetail(page: Page, candidate: ProductCandidate) {
  try {
    await page.goto(candidate.affiliateUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    await page.waitForTimeout(3500)

    const productInfoButton = page.locator('button', { hasText: '상품정보 제공고시' }).first()

    if (await productInfoButton.count()) {
      await productInfoButton.scrollIntoViewIfNeeded()
      await productInfoButton.click({ timeout: 5000 })

      try {
        await page.waitForFunction(
          () => document.body.innerText.includes('화장품법에 따라 기재해야 하는 모든 성분'),
          undefined,
          { timeout: 8000 }
        )
      } catch {
        const descriptionMoreButton = page.locator('button', { hasText: '상품설명 더보기' }).first()

        if (await descriptionMoreButton.count()) {
          await descriptionMoreButton.click({ timeout: 5000 }).catch(() => {})
          await page.waitForTimeout(1000)
        }

        await productInfoButton.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(1500)
      }
    }

    return page.evaluate(
      ({ fallbackImageUrl, fallbackUrl }) => {
        const rows = Array.from(document.querySelectorAll('table tr')).map((row) => {
          const cells = Array.from(row.children).map((cell) => (cell.textContent ?? '').trim())
          return {
            label: cells[0] ?? '',
            value: cells.slice(1).join(' ').trim(),
          }
        })
        const ingredientRow = rows.find((row) =>
          /화장품법.*모든 성분|전성분|모든성분/.test(row.label)
        )
        const canonicalUrl =
          document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? fallbackUrl
        const ogImage =
          document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? fallbackImageUrl
        const ingredientText =
          ingredientRow?.value ??
          (document.body.innerText.match(/화장품법에 따라 기재해야 하는 모든 성분\s+([\s\S]*?)\s+(기능성 화장품 식품의약품안전처 심사필 여부|사용할 때의 주의사항)/)?.[1] ??
            '')

        return {
          affiliateUrl: canonicalUrl,
          imageUrl: ogImage,
          ingredientNames: ingredientText
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }
      },
      {
        fallbackImageUrl: candidate.imageUrl,
        fallbackUrl: candidate.affiliateUrl,
      }
    ) as Promise<ProductDetail>
  } catch (error) {
    console.error(`상세 페이지 수집 실패: ${candidate.name}`, error)
    return null
  }
}

async function insertProducts(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return [] as Array<Record<string, unknown>>
  }

  const { error } = await supabase.from('products').insert(rows)

  if (!error) {
    return rows
  }

  console.warn(`배치 저장 실패, 개별 저장으로 재시도합니다: ${error.message}`)

  const insertedRows: Array<Record<string, unknown>> = []

  for (const row of rows) {
    const { error: rowError } = await supabase.from('products').insert(row)

    if (rowError) {
      console.error(`개별 저장 실패: ${String(row.name ?? 'unknown')}`, rowError.message)
      continue
    }

    insertedRows.push(row)
  }

  return insertedRows
}

async function processCategory(
  context: BrowserContext,
  category: (typeof CATEGORIES)[number],
  existingUrls: Set<string>,
  sessionUrls: Set<string>,
  existingCounts: Map<CategoryName, number>
) {
  const existingCount = existingCounts.get(category.name) ?? 0
  const remainingTarget = Math.max(0, targetPerCategory - existingCount)

  if (remainingTarget === 0) {
    console.log(`\n[${category.name}] 이미 ${existingCount}개가 저장되어 있어 건너뜁니다.`)
    return 0
  }

  console.log(`\n[${category.name}] 후보 수집 시작 (기존 ${existingCount}개, 추가 목표 ${remainingTarget}개)`)

  const candidates = await collectCategoryCandidates(
    context,
    category,
    existingUrls,
    sessionUrls,
    remainingTarget
  )
  const pages = await Promise.all(Array.from({ length: detailConcurrency }, () => context.newPage()))

  try {
    let candidateIndex = 0
    let savedCount = 0

    while (candidateIndex < candidates.length && savedCount < remainingTarget) {
      const batch = candidates.slice(candidateIndex, candidateIndex + detailConcurrency)
      const batchResults = await Promise.all(
        batch.map((candidate, index) => scrapeProductDetail(pages[index], candidate))
      )
      const rows: Array<Record<string, unknown>> = []

      for (let index = 0; index < batch.length; index++) {
        const candidate = batch[index]
        const detail = batchResults[index]

        if (!detail || detail.ingredientNames.length === 0) {
          console.warn(`[${category.name}] 성분표를 찾지 못해 건너뜀: ${candidate.name}`)
          continue
        }

        const normalizedUrl = normalizeProductUrl(detail.affiliateUrl || candidate.affiliateUrl)

        if (existingUrls.has(normalizedUrl) || sessionUrls.has(normalizedUrl)) {
          continue
        }

        rows.push({
          affiliate_url: normalizedUrl,
          brand: candidate.brand,
          category: category.name,
          image_url: detail.imageUrl || candidate.imageUrl,
          ingredient_names: detail.ingredientNames,
          name: candidate.name,
          price: candidate.price,
        })
      }

      if (rows.length > 0) {
        const remaining = remainingTarget - savedCount
        const insertedRows = await insertProducts(rows.slice(0, remaining))

        for (const row of insertedRows) {
          const affiliateUrl = String(row.affiliate_url)
          existingUrls.add(affiliateUrl)
          sessionUrls.add(affiliateUrl)
        }

        savedCount += insertedRows.length
        console.log(`[${category.name}] 현재까지 ${savedCount}/${remainingTarget}개 추가 저장`)
      }

      candidateIndex += detailConcurrency
      await sleep(700)
    }

    if (savedCount < remainingTarget) {
      console.warn(
        `[${category.name}] 추가 목표 ${remainingTarget}개 중 ${savedCount}개만 저장했습니다. 후보가 부족하거나 성분표 추출에 실패한 상품이 있습니다.`
      )
    }

    existingCounts.set(category.name, existingCount + savedCount)
    return savedCount
  } finally {
    await Promise.all(pages.map((page) => page.close()))
  }
}

async function main() {
  if (activeCategories.length === 0) {
    throw new Error('활성화된 카테고리가 없습니다. OLIVEYOUNG_CATEGORIES 값을 확인하세요.')
  }

  console.log('올리브영 크롤링 시작...')
  console.log(`카테고리당 목표: ${targetPerCategory}개`)
  console.log(`목록 페이지 제한: ${listPageLimit}`)
  console.log(`상세 동시 처리 수: ${detailConcurrency}`)

  const { existingCounts, existingUrls } = await loadExistingProductUrls()
  const sessionUrls = new Set<string>()

  console.log(`기존 products 테이블에서 ${existingUrls.size}개 URL을 확인했습니다.`)
  for (const category of activeCategories) {
    const existingCount = existingCounts.get(category.name) ?? 0
    console.log(`[${category.name}] 기존 저장 개수: ${existingCount}`)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 2200 },
    locale: 'ko-KR',
  })

  await context.setExtraHTTPHeaders({
    'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  })

  try {
    let totalSaved = 0

    for (const category of activeCategories) {
      const saved = await processCategory(context, category, existingUrls, sessionUrls, existingCounts)
      totalSaved += saved
    }

    console.log(`\n완료! 총 ${totalSaved}개 제품 저장됨`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
