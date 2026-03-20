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

export function resolveGlobalSkincareCategory<T extends string>(name: string, fallbackCategory: T): T | 'toner' {
  return isTonerPrimaryProductName(name) ? 'toner' : fallbackCategory
}
