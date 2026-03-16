import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 크롤링할 카테고리 URL
const CATEGORIES = [
  { name: '세럼', url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?cateCode=C000000010' },
  { name: '크림', url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?cateCode=C000000020' },
  { name: '토너', url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?cateCode=C000000030' },
  { name: '클렌저', url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?cateCode=C000000040' },
  { name: '선케어', url: 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?cateCode=C000000050' },
]

async function scrapeProductList(page: any, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  const products = await page.evaluate(() => {
    const items = document.querySelectorAll('.prd-item')
    return Array.from(items).map((item: any) => ({
      name: item.querySelector('.tx-name')?.textContent?.trim() || '',
      brand: item.querySelector('.tx-brand')?.textContent?.trim() || '',
      price: item.querySelector('.tx-price')?.textContent?.replace(/[^0-9]/g, '') || '0',
      url: item.querySelector('a')?.href || '',
    }))
  })

  return products
}

async function scrapeProductDetail(page: any, url: string) {
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // 성분 탭 클릭
    const ingredientTab = await page.$('.ingredient-tab, [data-tab="ingredient"], .goods-ingredients')
    if (ingredientTab) await ingredientTab.click()
    await page.waitForTimeout(1000)

    const detail = await page.evaluate(() => {
      const ingredientEl = document.querySelector('.ingredient-list, .goods-ingredients, .ing-list')
      const imageEl = document.querySelector('.goods-img img, .product-img img')

      return {
        ingredients: ingredientEl?.textContent?.trim() || '',
        image_url: imageEl?.getAttribute('src') || '',
      }
    })

    return detail
  } catch (e) {
    return { ingredients: '', image_url: '' }
  }
}

async function main() {
  console.log('올리브영 크롤링 시작...')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // User-Agent 설정 (봇 감지 우회)
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  })

  let totalSaved = 0
  const TARGET = 500

  for (const category of CATEGORIES) {
    if (totalSaved >= TARGET) break

    console.log(`\n[${category.name}] 크롤링 중...`)

    const products = await scrapeProductList(page, category.url)
    console.log(`${products.length}개 제품 목록 수집`)

    for (const product of products) {
      if (totalSaved >= TARGET) break
      if (!product.url || !product.name) continue

      // 상세 페이지에서 성분 가져오기
      const detail = await scrapeProductDetail(page, product.url)

      // 성분명 파싱 (쉼표로 구분)
      const ingredientNames = detail.ingredients
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)

      const row = {
        name: product.name,
        brand: product.brand,
        price: parseInt(product.price) || 0,
        category: category.name,
        ingredient_names: ingredientNames,
        image_url: detail.image_url,
        affiliate_url: product.url,
      }

      const { error } = await supabase
        .from('products')
        .upsert(row, { onConflict: 'name' })

      if (error) {
        console.error(`저장 실패: ${product.name}`, error.message)
      } else {
        totalSaved++
        console.log(`[${totalSaved}/${TARGET}] ${product.brand} - ${product.name}`)
      }

      // 과호출 방지 딜레이
      await page.waitForTimeout(1000)
    }
  }

  await browser.close()
  console.log(`\n완료! 총 ${totalSaved}개 제품 저장됨`)
}

main().catch(console.error)