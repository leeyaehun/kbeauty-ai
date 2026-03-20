import {
  isDomesticBodyPrimaryProductName,
  isDomesticHairPrimaryProductName,
  isDomesticOtherCarePrimaryProductName,
  isGlobalBodyPrimaryProductName,
  isGlobalHairPrimaryProductName,
  isOtherCarePrimaryProductName,
  resolveDomesticMakeupCategory,
  resolveDomesticSkincareCategory,
  resolveGlobalMakeupCategory,
  resolveGlobalSkincareCategory,
} from './category-utils'
import { supabase } from './oliveyoung-shared'

type ProductRow = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  id: string
  name: string | null
}

const PAGE_SIZE = 1000
const ORIGINAL_CARE_SOURCE_CATEGORIES = new Set([
  'Body',
  'Hair',
  'body',
  'hair',
  'body_hair',
  '바디로션',
  '바디워시',
  '핸드크림',
  '샴푸',
  '트리트먼트',
  '헤어에센스',
])

const CARE_SCAN_CATEGORIES = new Set([
  ...ORIGINAL_CARE_SOURCE_CATEGORIES,
  'Toner',
  'Cleanser',
  'Cream',
  'Moisturizer',
  'Serum',
  'Face Mask',
  'Sun Care',
  '토너',
  '에센스',
  '아이크림',
  '립',
  '파운데이션',
  '블러셔',
  '아이섀도',
  '마스카라',
  'toner',
  'cleanser',
  'cream',
  'moisturizer',
  'serum',
  'mask',
  'sun_care',
  'eye_cream',
  'lip',
  'foundation',
  'blush',
  'eyeshadow',
  'mascara',
])

const CARE_INSPECTION_PATTERN =
  /\b(hand|foot|heel|callus|nail|body|bath|shower|wash|scrub|butter|mist|hair|scalp|shampoo|conditioner|treatment|curl|wave|perm|baby|kids?)\b|핸드|풋|발뒤꿈치|네일|바디|바스|샤워|워시|스크럽|헤어|두피|샴푸|트리트먼트|베이비|키즈/i
const HAIR_TREATMENT_FALLBACK_PATTERN = /\btreatment\b|트리트먼트/i
const HAIR_TREATMENT_EXCLUSION_PATTERN =
  /\b(essence|toner|serum|ampoule|mask|cream|cleanser|foam|lotion|emulsion|moistur|sun)\b|에센스|토너|세럼|앰플|마스크|크림|클렌저|로션|에멀전|선/i

async function loadCareProducts() {
  const products: ProductRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category, affiliate_url')
      .in('category', [...CARE_SCAN_CATEGORIES])
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load care products: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    products.push(
      ...data.map((row) => ({
        affiliate_url: typeof row.affiliate_url === 'string' ? row.affiliate_url : null,
        brand: typeof row.brand === 'string' ? row.brand : null,
        category: typeof row.category === 'string' ? row.category : null,
        id: String(row.id),
        name: typeof row.name === 'string' ? row.name : null,
      }))
    )

    if (data.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return products
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

function shouldInspectProduct(product: ProductRow) {
  if (!product.name) {
    return false
  }

  if (ORIGINAL_CARE_SOURCE_CATEGORIES.has(product.category ?? '')) {
    return true
  }

  return CARE_INSPECTION_PATTERN.test(product.name)
}

function isHairTreatmentFallbackProduct(product: ProductRow) {
  if (!product.name) {
    return false
  }

  if (!HAIR_TREATMENT_FALLBACK_PATTERN.test(product.name)) {
    return false
  }

  return !HAIR_TREATMENT_EXCLUSION_PATTERN.test(product.name)
}

function resolveTargetCategory(product: ProductRow) {
  if (!product.name) {
    return product.category
  }

  const isGlobal = product.affiliate_url?.includes('global.oliveyoung.com') ?? false

  if (ORIGINAL_CARE_SOURCE_CATEGORIES.has(product.category ?? '')) {
    if (isGlobal) {
      if (isOtherCarePrimaryProductName(product.name)) {
        return 'other_care'
      }

      const makeupCategory = resolveGlobalMakeupCategory(product.name)

      if (makeupCategory) {
        return makeupCategory
      }

      const skincareCategory = resolveGlobalSkincareCategory(product.name, 'body_hair')

      if (skincareCategory !== 'body_hair') {
        return skincareCategory
      }

      if (isGlobalBodyPrimaryProductName(product.name)) {
        return 'body'
      }

      if (isGlobalHairPrimaryProductName(product.name)) {
        return 'hair'
      }

      return isHairTreatmentFallbackProduct(product) ? 'hair' : 'other_care'
    }

    if (isDomesticOtherCarePrimaryProductName(product.name)) {
      return 'other_care'
    }

    const makeupCategory = resolveDomesticMakeupCategory(product.name)

    if (makeupCategory) {
      return makeupCategory
    }

    const skincareCategory = resolveDomesticSkincareCategory(product.name)

    if (skincareCategory) {
      return skincareCategory
    }

    if (isDomesticHairPrimaryProductName(product.name)) {
      return 'Hair'
    }

    if (isDomesticBodyPrimaryProductName(product.name)) {
      return 'Body'
    }

    return isHairTreatmentFallbackProduct(product) ? 'Hair' : 'other_care'
  }

  if ((product.category ?? '') === 'other_care') {
    if (isGlobal) {
      if (isOtherCarePrimaryProductName(product.name)) {
        return 'other_care'
      }

      const makeupCategory = resolveGlobalMakeupCategory(product.name)

      if (makeupCategory) {
        return makeupCategory
      }

      const skincareCategory = resolveGlobalSkincareCategory(product.name, 'other_care')

      if (skincareCategory !== 'other_care') {
        return skincareCategory
      }

      if (isGlobalBodyPrimaryProductName(product.name)) {
        return 'body'
      }

      if (isGlobalHairPrimaryProductName(product.name) || isHairTreatmentFallbackProduct(product)) {
        return 'hair'
      }

      return 'other_care'
    }

    if (isDomesticOtherCarePrimaryProductName(product.name)) {
      return 'other_care'
    }

    const makeupCategory = resolveDomesticMakeupCategory(product.name)

    if (makeupCategory) {
      return makeupCategory
    }

    const skincareCategory = resolveDomesticSkincareCategory(product.name)

    if (skincareCategory) {
      return skincareCategory
    }

    if (isDomesticBodyPrimaryProductName(product.name)) {
      return 'Body'
    }

    if (isDomesticHairPrimaryProductName(product.name) || isHairTreatmentFallbackProduct(product)) {
      return 'Hair'
    }

    return 'other_care'
  }

  if (isGlobal) {
    if (isOtherCarePrimaryProductName(product.name)) {
      return 'other_care'
    }

    const makeupCategory = resolveGlobalMakeupCategory(product.name)

    if (makeupCategory) {
      return makeupCategory
    }

    if (isGlobalHairPrimaryProductName(product.name)) {
      return 'hair'
    }

    if (isGlobalBodyPrimaryProductName(product.name)) {
      return 'body'
    }

    return product.category
  }

  if (isDomesticOtherCarePrimaryProductName(product.name)) {
    return 'other_care'
  }

  const makeupCategory = resolveDomesticMakeupCategory(product.name)

  if (makeupCategory) {
    return makeupCategory
  }

  if (isDomesticHairPrimaryProductName(product.name)) {
    return 'Hair'
  }

  if (isDomesticBodyPrimaryProductName(product.name)) {
    return 'Body'
  }

  return product.category
}

async function main() {
  console.log('Hair & Body 카테고리 정리 시작...')

  const products = await loadCareProducts()
  const fixTargets = products
    .map((product) => {
      if (!shouldInspectProduct(product)) {
        return null
      }

      const targetCategory = resolveTargetCategory(product)

      if (!targetCategory || product.category === targetCategory) {
        return null
      }

      const region = product.affiliate_url?.includes('global.oliveyoung.com') ? 'global' : 'korea'

      return {
        ...product,
        region,
        targetCategory,
      }
    })
    .filter(
      (
        product
      ): product is ProductRow & {
        region: 'global' | 'korea'
        targetCategory: string
      } => product !== null
    )

  console.log(`검사 대상 care 상품 수: ${products.length}`)
  console.log(`재분류 대상 수: ${fixTargets.length}`)

  const preflightSummary = Object.fromEntries(
    [...new Set(fixTargets.map((product) => `${product.region}:${product.targetCategory}`))]
      .sort()
      .map((key) => [
        key,
        fixTargets.filter((product) => `${product.region}:${product.targetCategory}` === key).length,
      ])
  )

  console.log(`이동 예정 분포: ${JSON.stringify(preflightSummary)}`)

  let updatedCount = 0

  for (const product of fixTargets) {
    await updateCategory(product.id, product.targetCategory)
    updatedCount += 1

    if (updatedCount <= 25 || updatedCount % 100 === 0) {
      console.log(
        `[${updatedCount}/${fixTargets.length}] ${product.region} ${product.brand ?? ''} ${product.name ?? ''} -> ${product.targetCategory}`
      )
    }
  }

  console.log(`완료! Hair & Body 정리 ${updatedCount}건`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
