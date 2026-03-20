import {
  detectTonerKeyword,
  isGlobalOliveYoungUrl,
  isTonerPrimaryProductName,
  resolveTonerCategoryForSource,
} from './category-utils'
import { isMissingGlobalAffiliateUrlColumn, supabase } from './oliveyoung-shared'

type ProductRow = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  global_affiliate_url: string | null
  id: string
  name: string | null
}

const PAGE_SIZE = 1000
const TONER_CATEGORIES = new Set(['Toner', 'toner', '토너'])
const CLEANSER_CATEGORIES = new Set(['Cleanser', 'cleanser', '클렌저'])
const SUN_CATEGORIES = new Set(['Sun Care', 'sun_care', '선케어'])
const MASK_CATEGORIES = new Set(['Face Mask', 'mask', '마스크팩'])

function isCleanserKeyword(value: string) {
  return /클렌저|클렌징|cleanser|cleansing|폼\s*클렌저|foam\s*cleanser/i.test(value)
}

function isSunKeyword(value: string) {
  return /선크림|선케어|선\s*스틱|선\s*세럼|sunscreen|sun\s*cream|sun\s*stick|sun\s*serum|spf\b/i.test(value)
}

function isMaskKeyword(value: string) {
  return /마스크|sheet\s*mask|(^|\s)mask(\s|$)/i.test(value)
}

async function loadProducts() {
  const products: ProductRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const fullResult = await supabase
      .from('products')
      .select('id, name, brand, category, affiliate_url, global_affiliate_url')
      .range(from, to)

    let rows = fullResult.data as Array<Record<string, unknown>> | null

    if (fullResult.error) {
      if (!isMissingGlobalAffiliateUrlColumn(fullResult.error)) {
        throw new Error(`Failed to load products: ${fullResult.error.message}`)
      }

      const fallbackResult = await supabase
        .from('products')
        .select('id, name, brand, category, affiliate_url')
        .range(from, to)

      if (fallbackResult.error) {
        throw new Error(`Failed to load products: ${fallbackResult.error.message}`)
      }

      rows = (fallbackResult.data ?? []).map((row) => ({
        ...row,
        global_affiliate_url: null,
      }))
    }

    if (!rows || rows.length === 0) {
      break
    }

    products.push(
      ...rows.map((row) => ({
        affiliate_url: typeof row.affiliate_url === 'string' ? row.affiliate_url : null,
        brand: typeof row.brand === 'string' ? row.brand : null,
        category: typeof row.category === 'string' ? row.category : null,
        global_affiliate_url:
          typeof row.global_affiliate_url === 'string' ? row.global_affiliate_url : null,
        id: String(row.id),
        name: typeof row.name === 'string' ? row.name : null,
      }))
    )

    if (rows.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return products
}

function getPreferredAffiliateUrl(product: ProductRow) {
  return product.global_affiliate_url ?? product.affiliate_url
}

function buildMismatchAudit(products: ProductRow[]) {
  const tonerMismatch = products.filter(
    (product) =>
      typeof product.name === 'string' &&
      detectTonerKeyword(product.name) &&
      !TONER_CATEGORIES.has(product.category ?? '')
  )
  const cleanserMismatch = products.filter(
    (product) =>
      typeof product.name === 'string' &&
      isCleanserKeyword(product.name) &&
      !CLEANSER_CATEGORIES.has(product.category ?? '')
  )
  const sunMismatch = products.filter(
    (product) =>
      typeof product.name === 'string' &&
      isSunKeyword(product.name) &&
      !SUN_CATEGORIES.has(product.category ?? '')
  )
  const maskMismatch = products.filter(
    (product) =>
      typeof product.name === 'string' &&
      isMaskKeyword(product.name) &&
      !MASK_CATEGORIES.has(product.category ?? '')
  )

  return {
    cleanser_not_cleanser: cleanserMismatch.length,
    mask_not_mask: maskMismatch.length,
    sun_not_sun: sunMismatch.length,
    toner_not_toner: tonerMismatch.length,
  }
}

function buildTonerFixTargets(products: ProductRow[]) {
  return products
    .map((product) => {
      if (typeof product.name !== 'string' || !isTonerPrimaryProductName(product.name)) {
        return null
      }

      const affiliateUrl = getPreferredAffiliateUrl(product)
      const targetCategory = resolveTonerCategoryForSource(affiliateUrl)

      if (product.category === targetCategory) {
        return null
      }

      return {
        ...product,
        targetCategory,
      }
    })
    .filter(
      (
        product
      ): product is ProductRow & {
        targetCategory: string
      } => product !== null
    )
}

async function updateCategory(productId: string, category: string) {
  const { error } = await supabase
    .from('products')
    .update({ category })
    .eq('id', productId)

  if (error) {
    throw new Error(`Failed to update ${productId}: ${error.message}`)
  }
}

async function main() {
  console.log('상품 카테고리 미스매치 점검 시작...')

  const products = await loadProducts()
  const audit = buildMismatchAudit(products)
  const tonerFixTargets = buildTonerFixTargets(products)

  console.log(`총 상품 수: ${products.length}`)
  console.log(`오분류 의심 수치(휴리스틱): toner=${audit.toner_not_toner}, cleanser=${audit.cleanser_not_cleanser}, sun=${audit.sun_not_sun}, mask=${audit.mask_not_mask}`)
  console.log(`토너 카테고리 수정 대상: ${tonerFixTargets.length}`)

  let updatedCount = 0

  for (const product of tonerFixTargets) {
    await updateCategory(product.id, product.targetCategory)
    updatedCount += 1
    console.log(
      `[${updatedCount}/${tonerFixTargets.length}] ${product.brand ?? ''} ${product.name ?? ''} -> ${product.targetCategory}`
    )
  }

  const globalTonerCount = tonerFixTargets.filter((product) =>
    isGlobalOliveYoungUrl(getPreferredAffiliateUrl(product))
  ).length
  const domesticTonerCount = tonerFixTargets.length - globalTonerCount

  console.log(`완료! 토너 카테고리 수정 ${updatedCount}건`)
  console.log(`- 글로벌 toner 수정: ${globalTonerCount}건`)
  console.log(`- 국내 토너 수정: ${domesticTonerCount}건`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
