export const CARE_SUBCATEGORIES = {
  Hair: ['Damaged Hair', 'Hair Loss', 'Oily Scalp', 'Dry Scalp', 'Curl & Frizz', 'General'],
  Body: ['Dry Skin', 'Rough Skin', 'Sensitive Skin', 'Body Acne', 'General'],
} as const

export type CareCategory = keyof typeof CARE_SUBCATEGORIES
export type CareSubcategory = (typeof CARE_SUBCATEGORIES)[CareCategory][number]

const HAIR_SOURCE_CATEGORIES = new Set(['Hair', 'hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스'])
const BODY_SOURCE_CATEGORIES = new Set(['Body', 'body', 'body_hair', '바디로션', '바디워시'])
const CANONICAL_HAIR_CATEGORIES = new Set(['Hair', 'hair', '샴푸', '트리트먼트', '헤어에센스'])
const CANONICAL_BODY_CATEGORIES = new Set(['Body', 'body', '바디로션', '바디워시'])

const OTHER_CARE_KEYWORDS = [
  'hand',
  'foot',
  'heel',
  'callus',
  'nail',
  'baby',
  'kids',
  'kid',
  'intimate',
  'feminine',
  'y-zone',
  'multi balm',
  'balm stick',
  'wellness',
  'oral',
  'tooth',
  'deodor',
  'sanit',
  '핸드',
  '풋',
  '발뒤꿈치',
  '네일',
  '베이비',
  '키즈',
]

const HAIR_KEYWORDS = [
  'hair',
  'scalp',
  'shampoo',
  'conditioner',
  'hair treatment',
  'hair oil',
  'hair essence',
  'hair pack',
  'hair mask',
  'no-wash',
  'curl',
  'wave',
  'perm',
  'root',
  '헤어',
  '두피',
  '샴푸',
  '트리트먼트',
  '컬링',
  '웨이브',
]

const BODY_KEYWORDS = [
  'body lotion',
  'body milk',
  'body cream',
  'body wash',
  'body scrub',
  'body butter',
  'body mist',
  'shower gel',
  'bath',
  '바디',
  '샤워',
  '바스',
  '워시',
  '스크럽',
]

const SKINCARE_KEYWORDS = [
  'toner',
  'essence',
  'ampoule',
  'serum',
  'cleanser',
  'cleansing',
  'mask',
  'pad',
  'sunscreen',
  'sun cream',
  'sun stick',
  'eye cream',
  'moisturizer',
  'emulsion',
  'cream',
  'lotion',
  'tonique',
  '토너',
  '에센스',
  '앰플',
  '세럼',
  '클렌저',
  '클렌징',
  '마스크',
  '패드',
  '선크림',
  '선케어',
  '아이크림',
  '모이스처',
  '에멀전',
  '크림',
  '로션',
]

const MAKEUP_KEYWORDS = [
  'lip',
  'tint',
  'gloss',
  'foundation',
  'cushion',
  'blush',
  'mascara',
  'eyeshadow',
  'eye shadow',
  'eyeliner',
  'cover',
  '립',
  '틴트',
  '파운데이션',
  '쿠션',
  '블러셔',
  '마스카라',
  '아이섀도',
  '아이라이너',
]

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase()
}

function hasKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword))
}

function isOtherCareProductName(value: string) {
  return hasKeyword(value, OTHER_CARE_KEYWORDS)
}

function isHairProductName(value: string) {
  return hasKeyword(value, HAIR_KEYWORDS) && !isOtherCareProductName(value)
}

function isBodyProductName(value: string) {
  return hasKeyword(value, BODY_KEYWORDS) && !isOtherCareProductName(value) && !isHairProductName(value)
}

function isSkincareProductName(value: string) {
  return hasKeyword(value, SKINCARE_KEYWORDS) && !isHairProductName(value) && !isBodyProductName(value)
}

function isMakeupProductName(value: string) {
  return hasKeyword(value, MAKEUP_KEYWORDS) && !isHairProductName(value) && !isBodyProductName(value)
}

export function getDefaultCareSubcategory(category: CareCategory) {
  return CARE_SUBCATEGORIES[category][0]
}

export function normalizeCareCategory(value: string | null | undefined): CareCategory | null {
  if (value === 'Hair' || value === 'Body') {
    return value
  }

  return null
}

export function isCareSubcategory(category: CareCategory, value: string | null | undefined): value is CareSubcategory {
  return typeof value === 'string' && (CARE_SUBCATEGORIES[category] as readonly string[]).includes(value)
}

export function getCareSourceCategories(category: CareCategory) {
  if (category === 'Hair') {
    return [...HAIR_SOURCE_CATEGORIES]
  }

  return [...BODY_SOURCE_CATEGORIES]
}

export function deriveCareCategory(name: string | null | undefined, category: string | null | undefined): CareCategory | null {
  const normalizedName = normalize(name)
  const normalizedCategory = category ?? ''

  if (!normalizedName || isOtherCareProductName(normalizedName)) {
    return null
  }

  if (isHairProductName(normalizedName)) {
    return 'Hair'
  }

  if (isBodyProductName(normalizedName)) {
    return 'Body'
  }

  if (isSkincareProductName(normalizedName) || isMakeupProductName(normalizedName)) {
    return null
  }

  if (CANONICAL_HAIR_CATEGORIES.has(normalizedCategory)) {
    return 'Hair'
  }

  if (CANONICAL_BODY_CATEGORIES.has(normalizedCategory)) {
    return 'Body'
  }

  return null
}

export function deriveCareSubcategory(name: string | null | undefined, careCategory: CareCategory): CareSubcategory {
  const normalizedName = normalize(name)

  if (careCategory === 'Hair') {
    if (
      hasKeyword(normalizedName, ['손상', 'damage', '케라틴', 'keratin', '단백질', 'protein', '복구', 'repair'])
    ) {
      return 'Damaged Hair'
    }

    if (
      hasKeyword(normalizedName, ['탈모', 'hair loss', '두피', 'scalp', '볼륨', 'volume', '모발 강화'])
    ) {
      return 'Hair Loss'
    }

    if (hasKeyword(normalizedName, ['지성', 'oily', '딥클렌', 'deep clean', '청결', 'sebum'])) {
      return 'Oily Scalp'
    }

    if (hasKeyword(normalizedName, ['건성', 'dry', '보습', 'moisture', 'hydrat'])) {
      return 'Dry Scalp'
    }

    if (
      hasKeyword(normalizedName, [
        '곱슬',
        'frizz',
        '스무딩',
        'smoothing',
        'curl cream',
        'curling',
        'wave',
        'perm',
        '웨이브',
        '컬링',
        '컬크림',
      ])
    ) {
      return 'Curl & Frizz'
    }

    return 'General'
  }

  if (hasKeyword(normalizedName, ['각질', 'exfoli', '스크럽', 'scrub'])) {
    return 'Rough Skin'
  }

  if (hasKeyword(normalizedName, ['민감', 'sensitive', '순한', 'gentle', 'calming'])) {
    return 'Sensitive Skin'
  }

  if (hasKeyword(normalizedName, ['여드름', 'acne', '트러블', 'blemish'])) {
    return 'Body Acne'
  }

  if (hasKeyword(normalizedName, ['건조', 'dry', '보습', 'moisture', '로션', 'lotion', 'cream', 'butter'])) {
    return 'Dry Skin'
  }

  return 'General'
}

export function getCareExplanation(category: CareCategory, subcategory: CareSubcategory) {
  if (category === 'Hair') {
    return `Browse Korean hair care picks for ${subcategory.toLowerCase()} concerns.`
  }

  return `Browse body care picks for ${subcategory.toLowerCase()} concerns.`
}
