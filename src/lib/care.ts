export const CARE_SUBCATEGORIES = {
  Hair: ['Damaged Hair', 'Hair Loss', 'Oily Scalp', 'Dry Scalp', 'Curl & Frizz', 'General'],
  Body: ['Dry Skin', 'Rough Skin', 'Sensitive Skin', 'Body Acne', 'General'],
  'Foot Care': ['Dry Heel', 'General'],
} as const

export type CareCategory = keyof typeof CARE_SUBCATEGORIES
export type CareSubcategory = (typeof CARE_SUBCATEGORIES)[CareCategory][number]

const HAIR_SOURCE_CATEGORIES = new Set(['Hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스'])
const BODY_SOURCE_CATEGORIES = new Set(['Body', 'body_hair', '바디로션', '바디워시', '핸드크림'])
const FOOT_KEYWORDS = [
  'foot',
  'heel',
  'callus',
  'feet',
  '풋',
  '발',
  '발뒤꿈치',
  '각질',
]
const HAIR_KEYWORDS = [
  'hair',
  'scalp',
  'shampoo',
  'conditioner',
  'treatment',
  'pomade',
  'curl',
  'wax',
  '헤어',
  '두피',
  '샴푸',
  '트리트먼트',
]
const BODY_KEYWORDS = [
  'body',
  'hand',
  'bath',
  'wash',
  'lotion',
  'scrub',
  'butter',
  'mist',
  '바디',
  '핸드',
  '워시',
  '로션',
  '스크럽',
]

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase()
}

function hasKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword))
}

export function getDefaultCareSubcategory(category: CareCategory) {
  return CARE_SUBCATEGORIES[category][0]
}

export function normalizeCareCategory(value: string | null | undefined): CareCategory | null {
  if (value === 'Hair' || value === 'Body' || value === 'Foot Care') {
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

  if (hasKeyword(normalizedName, FOOT_KEYWORDS)) {
    return 'Foot Care'
  }

  if (HAIR_SOURCE_CATEGORIES.has(normalizedCategory) && hasKeyword(normalizedName, HAIR_KEYWORDS)) {
    return 'Hair'
  }

  if (normalizedCategory === 'Hair') {
    return 'Hair'
  }

  if (BODY_SOURCE_CATEGORIES.has(normalizedCategory) && hasKeyword(normalizedName, BODY_KEYWORDS)) {
    return 'Body'
  }

  if (normalizedCategory === 'Body') {
    return 'Body'
  }

  if (normalizedCategory === 'body_hair') {
    if (hasKeyword(normalizedName, HAIR_KEYWORDS)) {
      return 'Hair'
    }

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

  if (careCategory === 'Body') {
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

  if (hasKeyword(normalizedName, ['발뒤꿈치', 'heel', '풋크림', 'foot cream', 'foot', 'callus', 'crack'])) {
    return 'Dry Heel'
  }

  return 'General'
}

export function getCareExplanation(category: CareCategory, subcategory: CareSubcategory) {
  if (category === 'Foot Care') {
    return subcategory === 'Dry Heel'
      ? 'Picked for dry heel and rough foot care needs.'
      : 'Browse everyday foot care staples from Olive Young.'
  }

  if (category === 'Hair') {
    return `Browse Korean hair care picks for ${subcategory.toLowerCase()} concerns.`
  }

  return `Browse body care picks for ${subcategory.toLowerCase()} concerns.`
}
