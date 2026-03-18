import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from 'playwright'

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

const DOMESTIC_HOME_URL = 'https://www.oliveyoung.co.kr/store/main/main.do'
const CATEGORY_LIST_SELECTOR = '#Contents ul.cate_prd_list > li'

const HAIR_SOURCES = [
  {
    key: 'treatment',
    label: '트리트먼트/팩',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100040007',
    fallbackCategory: '트리트먼트',
  },
  {
    key: 'hair-essence',
    label: '헤어에센스',
    url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo=100000100040013',
    fallbackCategory: '헤어에센스',
  },
] as const

type HairCategory = '트리트먼트' | '헤어에센스'

type Candidate = {
  affiliateUrl: string
  brand: string
  category: HairCategory
  imageUrl: string
  name: string
  price: number
}

function buildCategoryPageUrl(baseUrl: string, pageNo: number) {
  const url = new URL(baseUrl)
  url.searchParams.set('pageIdx', String(pageNo))
  url.searchParams.set('rowsPerPage', '48')
  url.searchParams.set('prdSort', '01')
  url.searchParams.set('searchTypeSort', 'btn_thumb')
  url.searchParams.set('plusButtonFlag', 'N')
  url.searchParams.set('fltDispCatNo', '')
  return url.toString()
}

function classifyHairCategory(name: string, fallbackCategory: HairCategory) {
  const normalizedName = normalizeWhitespace(name).toLowerCase()
  const isTreatment =
    /트리트먼트|treatment|헤어\s*팩|hair\s*pack|마스크|mask|노워시/.test(normalizedName)
  const isHairEssence =
    /헤어\s*에센스|hair\s*essence|헤어\s*오일|hair\s*oil|세럼|serum|에센스|essence|오일|oil/.test(
      normalizedName
    )

  if (isTreatment && !isHairEssence) {
    return '트리트먼트'
  }

  if (isHairEssence && !isTreatment) {
    return '헤어에센스'
  }

  return fallbackCategory
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

    console.warn(`[헤어 보정] 메인 페이지 Cloudflare 대기 감지, ${attempt}/4 대기`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(8000 * attempt)
  }
}

async function readPageState(page: Page) {
  return page
    .evaluate(() => ({
      bodyText: document.body?.innerText ?? '',
      hasList: Boolean(document.querySelector('#Contents ul.cate_prd_list > li')),
      title: document.title ?? '',
    }))
    .catch(() => ({
      bodyText: '',
      hasList: false,
      title: '',
    }))
}

async function waitForCategoryPage(page: Page) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.waitForSelector(CATEGORY_LIST_SELECTOR, { timeout: 20000 })
      await page.waitForTimeout(1200)
      return true
    } catch {
      const pageState = await readPageState(page)
      const waitingForChallenge =
        pageState.title.includes('잠시만 기다려') ||
        pageState.bodyText.includes('Enable JavaScript and cookies to continue') ||
        pageState.bodyText.includes('잠시만 기다려 주세요')

      if (!waitingForChallenge && !pageState.hasList) {
        return false
      }

      console.warn(`[헤어 보정] 목록 대기 재시도 ${attempt}/4`)
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(8000 * attempt)
    }
  }

  return false
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

function shouldSkipCandidate(
  refs: Awaited<ReturnType<typeof loadExistingProducts>>,
  affiliateUrl: string,
  name: string,
  category: HairCategory
) {
  const byAffiliate = refs.byAffiliateUrl.get(affiliateUrl)
  if (byAffiliate?.category === category) {
    return true
  }

  const byName = refs.byName.get(name)
  if (byName?.category === category) {
    return true
  }

  return false
}

async function collectCandidates(
  page: Page,
  refs: Awaited<ReturnType<typeof loadExistingProducts>>,
  source: (typeof HAIR_SOURCES)[number]
) {
  const candidates: Candidate[] = []
  const localKeys = new Set<string>()
  const seenPageKeys = new Set<string>()

  await primeDomesticSession(page)

  for (let pageNo = 1; pageNo <= 30; pageNo++) {
    const pageUrl = buildCategoryPageUrl(source.url, pageNo)
    await page
      .goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
      .catch((error) => {
        console.warn(`[${source.label}] ${pageNo}페이지 이동 경고: ${String(error)}`)
      })

    const hasList = await waitForCategoryPage(page)
    if (!hasList) {
      break
    }

    const rawItems = await scrapeCategoryPage(page)
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

    let pageCandidates = 0

    for (const rawItem of rawItems) {
      const normalizedUrl = normalizeDomesticProductUrl(rawItem.affiliateUrl)
      const normalizedName = normalizeWhitespace(rawItem.name)
      const normalizedBrand = normalizeWhitespace(rawItem.brand)
      const category = classifyHairCategory(normalizedName, source.fallbackCategory)
      const dedupeKey = `${normalizedName}::${category}`

      if (!normalizedUrl || !normalizedName || localKeys.has(dedupeKey)) {
        continue
      }

      if (shouldSkipCandidate(refs, normalizedUrl, normalizedName, category)) {
        continue
      }

      localKeys.add(dedupeKey)
      candidates.push({
        affiliateUrl: normalizedUrl,
        brand: normalizedBrand,
        category,
        imageUrl: rawItem.imageUrl,
        name: normalizedName,
        price: parsePrice(rawItem.price),
      })
      pageCandidates += 1
    }

    console.log(`[${source.label}] ${pageNo}페이지 수집 완료, 신규 후보 ${pageCandidates}개`)

    if (rawItems.length < 48) {
      break
    }
  }

  return candidates
}

async function main() {
  const refs = await loadExistingProducts()
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
    for (const source of HAIR_SOURCES) {
      console.log(`\n[${source.label}] 헤어 카테고리 보정 시작`)
      const page = await context.newPage()

      try {
        const candidates = await collectCandidates(page, refs, source)
        console.log(`[${source.label}] 최종 후보 ${candidates.length}개`)

        let processed = 0

        for (const candidate of candidates) {
          await upsertProduct(
            refs,
            {
              affiliate_url: candidate.affiliateUrl,
              brand: candidate.brand,
              category: candidate.category,
              image_url: candidate.imageUrl,
              ingredient_names: [],
              name: candidate.name,
              price: candidate.price,
            },
            'domestic'
          )

          processed += 1

          if (processed % 25 === 0 || processed === candidates.length) {
            console.log(`[${source.label}] ${processed}/${candidates.length} 저장`)
          }

          await sleep(150)
        }
      } finally {
        await page.close()
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const counts = await countProductsByCategory(['트리트먼트', '헤어에센스'])
  console.log('\n헤어 카테고리 DB 누적 개수')
  console.log(`- 트리트먼트: ${counts.get('트리트먼트') ?? 0}`)
  console.log(`- 헤어에센스: ${counts.get('헤어에센스') ?? 0}`)

  console.log('\n헤어 카테고리 보정 후 임베딩 생성 시작...')
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
