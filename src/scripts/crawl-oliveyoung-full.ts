import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type BrowserContext, type Page } from 'playwright'

import { embedMissingProducts } from './embed-products'
import {
  USER_AGENT,
  countProductsByCategory,
  loadExistingProducts,
  normalizeDomesticProductUrl,
  normalizeWhitespace,
  parsePrice,
  sleep,
  upsertProduct,
} from './oliveyoung-shared'

const CATEGORY_LIST_SELECTOR = '#Contents ul.cate_prd_list > li'
const DOMESTIC_HOME_URL = 'https://www.oliveyoung.co.kr/store/main/main.do'

const DOMESTIC_CATEGORIES = [
  '세럼',
  '크림',
  '토너',
  '클렌저',
  '선케어',
  '마스크팩',
  '에센스',
  '아이크림',
  '미스트',
  '립',
  '파운데이션',
  'BB크림',
  '블러셔',
  '아이섀도',
  '마스카라',
  '아이라이너',
  '쿠션',
  '바디로션',
  '바디워시',
  '핸드크림',
  '샴푸',
  '트리트먼트',
  '헤어에센스',
] as const

type DomesticCategory = (typeof DOMESTIC_CATEGORIES)[number]

type Candidate = {
  affiliateUrl: string
  brand: string
  category: DomesticCategory
  imageUrl: string
  name: string
  price: number
}

type ProductDetail = {
  affiliateUrl: string
  imageUrl: string
  ingredientNames: string[]
}

type SourceSpec = {
  key: string
  label: string
  url: string
  classify: (name: string) => DomesticCategory | null
}

type CategoryReport = {
  inserted: number
  updated: number
}

const detailConcurrency = Math.max(
  1,
  Number.parseInt(process.env.OLIVEYOUNG_FULL_DETAIL_CONCURRENCY ?? '6', 10)
)
const listPageLimit = Math.max(
  0,
  Number.parseInt(process.env.OLIVEYOUNG_FULL_LIST_PAGE_LIMIT ?? '0', 10)
)
const pageSize = Math.max(
  24,
  Number.parseInt(process.env.OLIVEYOUNG_FULL_PAGE_SIZE ?? '48', 10)
)
const listPageRetryCount = Math.max(
  1,
  Number.parseInt(process.env.OLIVEYOUNG_FULL_PAGE_RETRY_COUNT ?? '3', 10)
)
const skipEmbed = process.env.OLIVEYOUNG_FULL_SKIP_EMBED === '1'
const sourceFilter = new Set(
  (process.env.OLIVEYOUNG_FULL_SOURCE_FILTER ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)

const report = new Map<DomesticCategory, CategoryReport>(
  DOMESTIC_CATEGORIES.map((category) => [category, { inserted: 0, updated: 0 }])
)

function hasAnyKeyword(name: string, keywords: RegExp[]) {
  return keywords.some((keyword) => keyword.test(name))
}

function directCategory(category: DomesticCategory) {
  return () => category
}

const DOMESTIC_SOURCES: SourceSpec[] = [
  {
    key: 'serum-essence',
    label: '에센스/세럼/앰플',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010014',
    classify: (name) =>
      hasAnyKeyword(name, [/에센스/i, /\bessence\b/i]) ? '에센스' : '세럼',
  },
  {
    key: 'cream-eyecream',
    label: '크림',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010015',
    classify: (name) =>
      hasAnyKeyword(name, [/아이\s*크림/i, /\beye\s*cream\b/i]) ? '아이크림' : '크림',
  },
  {
    key: 'toner',
    label: '토너',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010013',
    classify: directCategory('토너'),
  },
  {
    key: 'cleanser',
    label: '클렌징',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=10000010010',
    classify: directCategory('클렌저'),
  },
  {
    key: 'suncare',
    label: '선케어',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=10000010011',
    classify: directCategory('선케어'),
  },
  {
    key: 'mask',
    label: '마스크팩',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=10000010009',
    classify: directCategory('마스크팩'),
  },
  {
    key: 'mist',
    label: '미스트/오일',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100010017',
    classify: (name) =>
      hasAnyKeyword(name, [/미스트/i, /\bmist\b/i, /스프레이/i, /\bspray\b/i]) ? '미스트' : null,
  },
  {
    key: 'lip',
    label: '립메이크업',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100020006',
    classify: directCategory('립'),
  },
  {
    key: 'foundation',
    label: '파운데이션',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=1000001000200010002',
    classify: directCategory('파운데이션'),
  },
  {
    key: 'bb-cream',
    label: 'BB/CC',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=1000001000200010001',
    classify: directCategory('BB크림'),
  },
  {
    key: 'blush',
    label: '블러셔',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=1000001000200010006',
    classify: directCategory('블러셔'),
  },
  {
    key: 'cushion',
    label: '쿠션',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=1000001000200010009',
    classify: directCategory('쿠션'),
  },
  {
    key: 'eye-makeup',
    label: '아이메이크업',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100020007',
    classify: (name) => {
      if (hasAnyKeyword(name, [/아이라이너/i, /\beyeliner\b/i, /\bline?r\b/i])) {
        return '아이라이너'
      }

      if (hasAnyKeyword(name, [/마스카라/i, /\bmascara\b/i])) {
        return '마스카라'
      }

      if (hasAnyKeyword(name, [/아이\s*섀도/i, /아이\s*쉐도/i, /\beyeshadow\b/i, /\bshadow\b/i, /팔레트/i])) {
        return '아이섀도'
      }

      return null
    },
  },
  {
    key: 'body-lotion',
    label: '바디로션/크림',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=10000010003',
    classify: (name) =>
      hasAnyKeyword(name, [/핸드/i, /\bhand\b/i]) ? null : '바디로션',
  },
  {
    key: 'body-wash',
    label: '바디워시',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=1000001000300050001',
    classify: directCategory('바디워시'),
  },
  {
    key: 'hand-cream',
    label: '핸드케어',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100030016',
    classify: directCategory('핸드크림'),
  },
  {
    key: 'shampoo',
    label: '샴푸/린스',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100040008',
    classify: directCategory('샴푸'),
  },
  {
    key: 'treatment',
    label: '트리트먼트/팩',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100040007',
    classify: directCategory('트리트먼트'),
  },
  {
    key: 'hair-essence',
    label: '헤어에센스',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100040013',
    classify: directCategory('헤어에센스'),
  },
]

const activeSources = DOMESTIC_SOURCES.filter((source) =>
  sourceFilter.size === 0 ? true : sourceFilter.has(source.key)
)

function buildCategoryPageUrl(baseUrl: string, pageNo: number) {
  const url = new URL(baseUrl)
  url.searchParams.set('pageIdx', String(pageNo))
  url.searchParams.set('rowsPerPage', String(pageSize))
  url.searchParams.set('prdSort', '01')
  url.searchParams.set('searchTypeSort', 'btn_thumb')

  if (!url.searchParams.has('plusButtonFlag')) {
    url.searchParams.set('plusButtonFlag', 'N')
  }

  if (!url.searchParams.has('fltDispCatNo')) {
    url.searchParams.set('fltDispCatNo', '')
  }

  return url.toString()
}

function bumpReport(category: DomesticCategory, action: 'inserted' | 'updated') {
  const stats = report.get(category)

  if (!stats) {
    return
  }

  stats[action] += 1
}

function shouldSkipExistingDomesticProduct(
  refs: Awaited<ReturnType<typeof loadExistingProducts>>,
  affiliateUrl: string,
  category: DomesticCategory
) {
  const existing = refs.byAffiliateUrl.get(affiliateUrl)
  return existing?.category === category
}

async function waitForCategoryPage(page: Page) {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.waitForSelector(CATEGORY_LIST_SELECTOR, { timeout: 15000 })
      await page.waitForTimeout(1200)
      return
    } catch (error) {
      lastError = error

      const pageState = await page
        .evaluate(() => ({
          bodyText: document.body?.innerText ?? '',
          title: document.title ?? '',
          url: window.location.href,
        }))
        .catch(() => ({
          bodyText: '',
          title: '',
          url: page.url(),
        }))

      const waitingForChallenge =
        pageState.title.includes('잠시만 기다려') ||
        pageState.bodyText.includes('Enable JavaScript and cookies to continue') ||
        pageState.bodyText.includes('잠시만 기다려 주세요')

      if (!waitingForChallenge) {
        throw error
      }

      console.warn(
        `[국내 목록] Cloudflare 대기 페이지 감지, ${attempt}/4 재시도: ${pageState.url}`
      )
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(10000 * attempt)
    }
  }

  throw lastError
}

async function primeDomesticSession(page: Page) {
  await page.goto(DOMESTIC_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })

  for (let attempt = 1; attempt <= 4; attempt++) {
    const pageState = await page
      .evaluate(() => ({
        bodyText: document.body?.innerText ?? '',
        title: document.title ?? '',
      }))
      .catch(() => ({
        bodyText: '',
        title: '',
      }))

    const waitingForChallenge =
      pageState.title.includes('잠시만 기다려') ||
      pageState.bodyText.includes('Enable JavaScript and cookies to continue') ||
      pageState.bodyText.includes('잠시만 기다려 주세요')

    if (!waitingForChallenge) {
      return
    }

    console.warn(`[국내 세션] 메인 페이지 Cloudflare 대기 감지, ${attempt}/4 대기`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(8000 * attempt)
  }
}

async function readDomesticPageState(page: Page) {
  return page
    .evaluate(() => ({
      bodyText: document.body?.innerText ?? '',
      hasList: Boolean(document.querySelector('#Contents ul.cate_prd_list > li')),
      title: document.title ?? '',
      url: window.location.href,
    }))
    .catch(() => ({
      bodyText: '',
      hasList: false,
      title: '',
      url: page.url(),
    }))
}

async function scrapeCategoryPage(page: Page) {
  return page.$$eval(CATEGORY_LIST_SELECTOR, (items) =>
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
        imageUrl: imageUrl.trim(),
        name: name.trim(),
        price: currentPrice,
      }
    })
  )
}

async function collectSourceCandidates(
  context: BrowserContext,
  refs: Awaited<ReturnType<typeof loadExistingProducts>>,
  sessionUrls: Set<string>,
  source: SourceSpec
) {
  let page = await context.newPage()
  const candidates: Candidate[] = []
  const localUrls = new Set<string>()
  const seenPageKeys = new Set<string>()

  try {
    await primeDomesticSession(page)

    for (let pageNo = 1; listPageLimit === 0 || pageNo <= listPageLimit; pageNo++) {
      const pageUrl = buildCategoryPageUrl(source.url, pageNo)
      let rawItems: Awaited<ReturnType<typeof scrapeCategoryPage>> | null = null

      for (let attempt = 1; attempt <= listPageRetryCount; attempt++) {
        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
          await waitForCategoryPage(page)
          rawItems = await scrapeCategoryPage(page)
          break
        } catch (error) {
          const pageState = await readDomesticPageState(page)
          const waitingForChallenge =
            pageState.title.includes('잠시만 기다려') ||
            pageState.bodyText.includes('Enable JavaScript and cookies to continue') ||
            pageState.bodyText.includes('잠시만 기다려 주세요')

          if (!waitingForChallenge && !pageState.hasList) {
            rawItems = []
            break
          }

          if (attempt === listPageRetryCount) {
            throw error
          }

          console.warn(
            `[${source.label}] ${pageNo}페이지 진입 실패, ${attempt}/${listPageRetryCount} 재시도`
          )
          await page.close().catch(() => {})
          page = await context.newPage()
          await primeDomesticSession(page)
        }
      }

      if (!rawItems) {
        break
      }

      if (rawItems.length === 0) {
        break
      }

      const pageKey = rawItems
        .slice(0, 5)
        .map((item) => normalizeDomesticProductUrl(item.affiliateUrl))
        .join('|')

      if (pageKey && seenPageKeys.has(pageKey)) {
        break
      }

      if (pageKey) {
        seenPageKeys.add(pageKey)
      }

      let newCandidates = 0

      for (const rawItem of rawItems) {
        const normalizedUrl = normalizeDomesticProductUrl(rawItem.affiliateUrl)
        const normalizedName = normalizeWhitespace(rawItem.name)
        const normalizedBrand = normalizeWhitespace(rawItem.brand)
        const category = source.classify(normalizedName)

        if (!normalizedUrl || !normalizedName || !category) {
          continue
        }

        if (
          shouldSkipExistingDomesticProduct(refs, normalizedUrl, category) ||
          sessionUrls.has(normalizedUrl) ||
          localUrls.has(normalizedUrl)
        ) {
          continue
        }

        localUrls.add(normalizedUrl)
        candidates.push({
          affiliateUrl: normalizedUrl,
          brand: normalizedBrand,
          category,
          imageUrl: rawItem.imageUrl,
          name: normalizedName,
          price: parsePrice(rawItem.price),
        })
        newCandidates += 1
      }

      console.log(`[${source.label}] ${pageNo}페이지 수집 완료, 신규 후보 ${newCandidates}개`)

      if (rawItems.length < pageSize) {
        break
      }
    }
  } finally {
    await page.close()
  }

  return candidates
}

async function scrapeProductDetail(page: Page, candidate: Candidate) {
  try {
    await page.goto(candidate.affiliateUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    await page.waitForTimeout(2500)

    const productInfoButton = page.locator('button', { hasText: '상품정보 제공고시' }).first()

    if (await productInfoButton.count()) {
      await productInfoButton.scrollIntoViewIfNeeded().catch(() => {})
      await productInfoButton.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1200)
    }

    return (await page.evaluate(
      ({ fallbackImageUrl, fallbackUrl }) => {
        const rows = Array.from(document.querySelectorAll('table tr')).map((row) => {
          const cells = Array.from(row.children).map((cell) => (cell.textContent ?? '').trim())
          return {
            label: cells[0] ?? '',
            value: cells.slice(1).join(' ').trim(),
          }
        })
        const ingredientRow = rows.find((row) => /화장품법.*모든 성분|전성분|모든성분/.test(row.label))
        const canonicalUrl =
          document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? fallbackUrl
        const ogImage =
          document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? fallbackImageUrl
        const bodyText = document.body.innerText
        const fallbackIngredients =
          bodyText.match(
            /화장품법에 따라 기재해야 하는 모든 성분\s+([\s\S]*?)\s+(기능성 화장품 식품의약품안전처 심사필 여부|사용할 때의 주의사항|사용기한 또는 개봉 후 사용기간)/
          )?.[1] ?? ''
        const ingredientText = ingredientRow?.value ?? fallbackIngredients

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
    )) as ProductDetail
  } catch {
    console.warn(`[${candidate.category}] 상세 수집 실패, 목록 정보로 저장합니다: ${candidate.name}`)
    return {
      affiliateUrl: candidate.affiliateUrl,
      imageUrl: candidate.imageUrl,
      ingredientNames: [],
    } satisfies ProductDetail
  }
}

async function processSource(
  context: BrowserContext,
  refs: Awaited<ReturnType<typeof loadExistingProducts>>,
  sessionUrls: Set<string>,
  source: SourceSpec
) {
  console.log(`\n[${source.label}] 전체 페이지 수집 시작`)
  const candidates = await collectSourceCandidates(context, refs, sessionUrls, source)

  if (candidates.length === 0) {
    console.log(`[${source.label}] 저장할 신규 후보가 없습니다.`)
    return
  }

  const detailPages = await Promise.all(
    Array.from({ length: detailConcurrency }, () => context.newPage())
  )

  try {
    for (let index = 0; index < candidates.length; index += detailConcurrency) {
      const batch = candidates.slice(index, index + detailConcurrency)
      const details = await Promise.all(
        batch.map((candidate, batchIndex) => scrapeProductDetail(detailPages[batchIndex], candidate))
      )

      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const candidate = batch[batchIndex]
        const detail = details[batchIndex]
        const normalizedUrl = normalizeDomesticProductUrl(detail.affiliateUrl || candidate.affiliateUrl)

        if (
          sessionUrls.has(normalizedUrl) ||
          shouldSkipExistingDomesticProduct(refs, normalizedUrl, candidate.category)
        ) {
          continue
        }

        const action = await upsertProduct(
          refs,
          {
            affiliate_url: normalizedUrl,
            brand: candidate.brand,
            category: candidate.category,
            image_url: detail.imageUrl || candidate.imageUrl,
            ingredient_names: detail.ingredientNames,
            name: candidate.name,
            price: candidate.price,
          },
          'domestic'
        )

        sessionUrls.add(normalizedUrl)
        bumpReport(candidate.category, action)
      }

      console.log(
        `[${source.label}] ${Math.min(index + detailConcurrency, candidates.length)}/${candidates.length} 처리`
      )
      await sleep(400)
    }
  } finally {
    await Promise.all(detailPages.map((page) => page.close()))
  }
}

function printCurrentReport() {
  console.log('\n국내 올리브영 카테고리별 처리 리포트')

  for (const category of DOMESTIC_CATEGORIES) {
    const stats = report.get(category) ?? { inserted: 0, updated: 0 }
    console.log(
      `- ${category}: inserted=${stats.inserted}, updated=${stats.updated}, total=${stats.inserted + stats.updated}`
    )
  }
}

async function printFinalCounts() {
  const counts = await countProductsByCategory(DOMESTIC_CATEGORIES)

  console.log('\n국내 올리브영 카테고리별 DB 누적 개수')

  for (const category of DOMESTIC_CATEGORIES) {
    console.log(`- ${category}: ${counts.get(category) ?? 0}`)
  }
}

async function main() {
  if (activeSources.length === 0) {
    throw new Error('활성화된 국내 카테고리 소스가 없습니다. OLIVEYOUNG_FULL_SOURCE_FILTER 값을 확인하세요.')
  }

  console.log('국내 올리브영 전체 카테고리 크롤링 시작...')
  console.log(`활성 소스: ${activeSources.map((source) => source.key).join(', ')}`)
  console.log(`목록 페이지 제한: ${listPageLimit === 0 ? '없음' : listPageLimit}`)
  console.log(`상세 동시 처리 수: ${detailConcurrency}`)

  const refs = await loadExistingProducts()
  const sessionUrls = new Set<string>()

  console.log(`기존 affiliate_url ${refs.byAffiliateUrl.size}개, global_affiliate_url ${refs.byGlobalUrl.size}개 확인`)

  for (const source of activeSources) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      locale: 'ko-KR',
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 2200 },
    })

    await context.setExtraHTTPHeaders({
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    })

    try {
      await processSource(context, refs, sessionUrls, source)
    } finally {
      await context.close()
      await browser.close()
    }
  }

  printCurrentReport()
  await printFinalCounts()

  if (skipEmbed) {
    console.log('\nOLIVEYOUNG_FULL_SKIP_EMBED=1 이므로 임베딩은 건너뜁니다.')
  } else {
    console.log('\n국내 크롤링 후 임베딩 생성 시작...')
    await embedMissingProducts()
  }
}

const __filename = fileURLToPath(import.meta.url)
const isMain = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false

if (isMain) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
