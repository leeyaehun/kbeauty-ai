export function stripLeadingTags(value: string) {
  let normalized = value.trim()

  while (true) {
    const next = normalized.replace(/^\s*(\[[^\]]*\]|\([^)]+\))\s*/, '')

    if (next === normalized) {
      return normalized
    }

    normalized = next.trim()
  }
}

export function extractPrimaryProductName(value: string) {
  return stripLeadingTags(value)
    .split(/\(\+|기획\s*\(|\(free gift:|\(special gift:|\(gift:|\(증정/i)[0]
    .trim()
}

export function isGlobalOliveYoungUrl(url: string | null | undefined) {
  return typeof url === 'string' && url.includes('global.oliveyoung.com/')
}

export function parseGlobalProductIdFromUrl(url: string | null | undefined) {
  if (typeof url !== 'string' || url.length === 0) {
    return null
  }

  try {
    const parsed = new URL(url)
    const prdtNo = parsed.searchParams.get('prdtNo')
    return prdtNo && prdtNo.length > 0 ? prdtNo : null
  } catch {
    return null
  }
}

function hasAnyKeyword(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value))
}

function decodeGlobalCategoryPath(value: string) {
  return value
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mapGlobalCategoryPathToCategory(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const normalized = decodeGlobalCategoryPath(value)

  if (
    normalized.includes('> Essence & Serum') ||
    normalized.includes('> 에센스') ||
    normalized.includes('> 세럼')
  ) {
    return 'serum' as const
  }

  if (
    normalized.includes('> Face Masks') ||
    normalized.includes('> 마스크') ||
    normalized.includes('> 패드')
  ) {
    return 'mask' as const
  }

  if (normalized.includes('> Suncare') || normalized.includes('> 선케어')) {
    return 'sun_care' as const
  }

  if (
    normalized.includes('> Cleansers') ||
    normalized.includes('> 클렌저') ||
    normalized.includes('> 클렌징')
  ) {
    return 'cleanser' as const
  }

  if (normalized.includes('> Toner') || normalized.includes('> 토너')) {
    return 'toner' as const
  }

  if (normalized.includes('> Eye Care') || normalized.includes('> 아이 케어')) {
    return 'eye_cream' as const
  }

  if (
    normalized.includes('> Moisturizers > Cream') ||
    normalized.includes('> 모이스처라이저 > 크림')
  ) {
    return 'cream' as const
  }

  if (
    normalized.includes('> Moisturizers') ||
    normalized.includes('> 모이스처라이저') ||
    normalized.includes('> 로션') ||
    normalized.includes('> 에멀전') ||
    normalized.includes('> 미스트') ||
    normalized.includes('> 페이스 오일') ||
    normalized.includes('> 올인원')
  ) {
    return 'moisturizer' as const
  }

  if (
    normalized.includes('> Hair') ||
    normalized.includes('> Bath & Body') ||
    normalized.includes('> Wellness') ||
    normalized.includes('> Men`s Care') ||
    normalized.includes('> 건강/위생') ||
    normalized.includes('> 헤어') ||
    normalized.includes('> 바디') ||
    normalized.includes('> 핸드') ||
    normalized.includes('> 풋') ||
    normalized.includes('> 발 관리')
  ) {
    return 'body_hair' as const
  }

  if (
    normalized.includes('> Makeup') ||
    normalized.includes('> 메이크업') ||
    normalized.includes('> 페이스') ||
    normalized.includes('> 립') ||
    normalized.includes('> 아이') ||
    normalized.includes('> 브러시') ||
    normalized.includes('> 도구')
  ) {
    return 'foundation' as const
  }

  return null
}

export function detectTonerKeyword(value: string) {
  return /(^|[^a-z])(toner|tonique)([^a-z]|$)|토너(?!\s*패드)/i.test(value)
}

export function isTonerPrimaryProductName(value: string) {
  const primaryName = extractPrimaryProductName(value)

  if (/toner\s*pad|토너\s*패드/i.test(primaryName)) {
    return false
  }

  return detectTonerKeyword(primaryName)
}

export function resolveTonerCategoryForSource(affiliateUrl: string | null | undefined) {
  return isGlobalOliveYoungUrl(affiliateUrl) ? 'toner' : '토너'
}

export function isGlobalSunCarePrimaryProductName(value: string) {
  return hasAnyKeyword(extractPrimaryProductName(value), [
    /\bsunscreen\b/i,
    /\bsun\s*cream\b/i,
    /\bsun\s*serum\b/i,
    /\bsun\s*lotion\b/i,
    /\bsun\s*stick\b/i,
    /\bsun\s*essence\b/i,
    /\bsun\s*gel\b/i,
    /\bsun\s*all[\s-]*in[\s-]*one\b/i,
    /\bsun\s*moisturizer\b/i,
    /\btone[\s-]*up\s*sun\b/i,
    /\bspf\s*\d+/i,
    /\buv\b/i,
    /선크림/i,
    /선케어/i,
    /선\s*세럼/i,
    /선\s*스틱/i,
  ])
}

export function isGlobalBodyHairPrimaryProductName(value: string) {
  return hasAnyKeyword(extractPrimaryProductName(value), [
    /\bbody\s*lotion\b/i,
    /\bbody\s*milk\b/i,
    /\bbody\s*cream\b/i,
    /\bbody\s*emulsion\b/i,
    /\bbody\s*wash\b/i,
    /\bface\s*&\s*body\b/i,
    /\bbody\s*&\s*hand\b/i,
    /\bhand\b/i,
    /\bnail\b/i,
    /\blip\s*balm\b/i,
    /\bbaby\b/i,
    /\bkids?\b/i,
    /\bwash\b/i,
    /\btissue\b/i,
    /\bsoap\b/i,
    /\bbath\b/i,
    /\bshampoo\b/i,
    /\bconditioner\b/i,
    /\btreatment\b/i,
    /\bhair\b/i,
    /\bscalp\b/i,
    /\bperfume\s*hand\s*cream\b/i,
  ])
}

export function isGlobalEyeCreamPrimaryProductName(value: string) {
  return /\beye\s*cream\b/i.test(extractPrimaryProductName(value))
}

export function isGlobalMakeupPrimaryProductName(value: string) {
  return hasAnyKeyword(extractPrimaryProductName(value), [
    /\btinted\s+moisturizer\b/i,
    /\bfoundation\b/i,
    /\bbb\b/i,
    /\bcushion\b/i,
    /\bblush\b/i,
    /\btone[\s-]*up\b/i,
    /\bcover\s*lotion\b/i,
    /\beyeshadow\b/i,
    /\beye\s*shadow\b/i,
    /\bmascara\b/i,
    /\beyeliner\b/i,
    /\blip\s*(tint|stick|gloss|balm)\b/i,
    /\baegyo-sal\b/i,
  ])
}

export function isGlobalMaskPrimaryProductName(value: string) {
  return /\bmask\b/i.test(extractPrimaryProductName(value))
}

function isGlobalMoisturizerLotionCandidate(value: string, fallbackCategory?: string) {
  const primaryName = extractPrimaryProductName(value)

  if (!/\blotion\b/i.test(primaryName)) {
    return false
  }

  const lotionSignals = hasAnyKeyword(primaryName, [
    /\bfor\s*men\b/i,
    /\bfacial\b/i,
    /\bskin\b/i,
    /\bmoistur/i,
    /\bcalming\b/i,
    /\bsoothing\b/i,
    /\bbarrier\b/i,
    /\bceramide\b/i,
    /\bcica\b/i,
    /\bhydra/i,
    /\bhyal/i,
    /\baqua\b/i,
    /\bato\b/i,
    /\bpanthenol\b/i,
    /\bpdrn\b/i,
    /\ball[\s-]*in[\s-]*one\b/i,
  ])

  if (!lotionSignals) {
    return false
  }

  if (fallbackCategory === 'body_hair') {
    return hasAnyKeyword(primaryName, [
      /\bfor\s*men\b/i,
      /\bfacial\b/i,
      /\bskin\b/i,
      /\bmoistur/i,
      /\bceramide\b/i,
      /\bcica\b/i,
      /\baqua\b/i,
      /\bato\b/i,
      /\ball[\s-]*in[\s-]*one\b/i,
    ])
  }

  return true
}

export function isGlobalMoisturizerPrimaryProductName(value: string, fallbackCategory?: string) {
  const primaryName = extractPrimaryProductName(value)

  if (
    isGlobalSunCarePrimaryProductName(primaryName) ||
    isGlobalBodyHairPrimaryProductName(primaryName) ||
    isGlobalEyeCreamPrimaryProductName(primaryName) ||
    isGlobalMakeupPrimaryProductName(primaryName) ||
    isTonerPrimaryProductName(primaryName) ||
    isGlobalMaskPrimaryProductName(primaryName)
  ) {
    return false
  }

  if (hasAnyKeyword(primaryName, [
    /\bmoisturizer\b/i,
    /\bmoisturizing\s+(cream|lotion)\b/i,
    /\bemulsion\b/i,
    /\bskin\s*lotion\b/i,
    /\ball\s*in\s*one\b/i,
  ])) {
    return true
  }

  return isGlobalMoisturizerLotionCandidate(primaryName, fallbackCategory)
}

export function resolveGlobalSkincareCategory<T extends string>(
  name: string,
  fallbackCategory: T
): T | 'toner' | 'moisturizer' | 'sun_care' | 'body_hair' | 'eye_cream' | 'foundation' | 'mask' {
  if (isTonerPrimaryProductName(name)) {
    return 'toner'
  }

  if (isGlobalSunCarePrimaryProductName(name)) {
    return 'sun_care'
  }

  if (isGlobalBodyHairPrimaryProductName(name)) {
    return 'body_hair'
  }

  if (isGlobalEyeCreamPrimaryProductName(name)) {
    return 'eye_cream'
  }

  if (isGlobalMaskPrimaryProductName(name)) {
    return 'mask'
  }

  if (isGlobalMakeupPrimaryProductName(name)) {
    return 'foundation'
  }

  if (isGlobalMoisturizerPrimaryProductName(name, fallbackCategory)) {
    return 'moisturizer'
  }

  return fallbackCategory
}
