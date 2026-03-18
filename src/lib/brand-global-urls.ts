const BRAND_GLOBAL_URLS: Record<string, string> = {
  'ROM&ND': 'https://en.romand.co.kr',
  ROMAND: 'https://en.romand.co.kr',
  '3CE': 'https://www.stylenanda.com/pages/3ce-global',
  CLIO: 'https://www.clio-official.com',
  PERIPERA: 'https://www.peripera.co.kr/en',
  ETUDE: 'https://www.etude.com/en-global',
  HERA: 'https://www.hera.com/en',
  ESPOIR: 'https://www.espoir.com/en',
  AMUSE: 'https://amusebeauty.com',
  VDL: 'https://www.vdlcosmetics.com/en',
  MOONSHOT: 'https://moonshotcosmetics.com',
  SULWHASOO: 'https://www.sulwhasoo.com/global/en',
} as const

function normalizeBrandKey(brand: string) {
  return brand.trim().toUpperCase()
}

export function getBrandGlobalUrl(brand: string, productName: string) {
  const brandUrl = BRAND_GLOBAL_URLS[normalizeBrandKey(brand)]

  if (brandUrl) {
    return brandUrl
  }

  return `https://global.oliveyoung.com/search?query=${encodeURIComponent(`${brand} ${productName}`.trim())}`
}

export function hasBrandGlobalUrl(brand: string) {
  return normalizeBrandKey(brand) in BRAND_GLOBAL_URLS
}

