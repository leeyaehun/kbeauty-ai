function normalizeBrandKey(brand: string) {
  return brand.trim().toUpperCase()
}

function normalizeProductKey(productName: string) {
  return productName
    .trim()
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const BRAND_BASE_URLS: Record<string, string> = {
  '3CE': 'https://www.stylenanda.com/pages/3ce-global',
  AMUSE: 'https://amusebeauty.com',
  CLIO: 'https://clubclio.shop',
  DERMATORY: 'https://clubclio.shop',
  ESPOIR: 'https://www.espoir.com/en',
  ETUDE: 'https://www.etude.com/int/en/index.php',
  GOODAL: 'https://clubclio.shop',
  HERA: 'https://int.hera.com',
  HEALINGBIRD: 'https://clubclio.shop',
  MOONSHOT: 'https://moonshot-cosmetics.com',
  PERIPERA: 'https://clubclio.shop',
  'ROM&ND': 'https://en.romand.co.kr',
  ROMAND: 'https://en.romand.co.kr',
  SULWHASOO: 'https://www.sulwhasoo.com/global/en',
  VDL: 'https://www.vdlcosmetics.com/en',
} as const

const BRAND_SEARCH_URL_BUILDERS: Partial<Record<string, (productName: string) => string>> = {
  CLIO: (productName) => `https://clubclio.shop/search?q=${encodeURIComponent(productName)}&type=product`,
  DERMATORY: (productName) => `https://clubclio.shop/search?q=${encodeURIComponent(productName)}&type=product`,
  GOODAL: (productName) => `https://clubclio.shop/search?q=${encodeURIComponent(productName)}&type=product`,
  HEALINGBIRD: (productName) => `https://clubclio.shop/search?q=${encodeURIComponent(productName)}&type=product`,
  PERIPERA: (productName) => `https://clubclio.shop/search?q=${encodeURIComponent(productName)}&type=product`,
}

type DirectProductMatch = {
  productNameIncludes: string[]
  url: string
}

const DIRECT_PRODUCT_URLS: Partial<Record<string, DirectProductMatch[]>> = {
  CLIO: [
    {
      productNameIncludes: ['CHIFFON BLUR TINT'],
      url: 'https://clubclio.shop/products/clio-chiffon-blur-tint',
    },
    {
      productNameIncludes: ['KILL COVER FOUNWEAR FOUNDATION'],
      url: 'https://clubclio.shop/products/clio-kill-cover-founwear-foundation',
    },
    {
      productNameIncludes: ['KILL COVER THE NEW FOUNWEAR CUSHION'],
      url: 'https://clubclio.shop/search?q=Kill%20Cover%20The%20New%20Founwear%20Cushion&type=product',
    },
    {
      productNameIncludes: ['AIR BLUR WHIP BLUSH'],
      url: 'https://clubclio.shop/search?q=Air%20Blur%20Whip%20Blush&type=product',
    },
    {
      productNameIncludes: ['PRO EYE PALETTE'],
      url: 'https://clubclio.shop/search?q=Pro%20Eye%20Palette&type=product',
    },
  ],
  HERA: [
    {
      productNameIncludes: ['BLACK CUSHION'],
      url: 'https://int.hera.com/products/black-cushion-foundation',
    },
    {
      productNameIncludes: ['SENSUAL POWDER MATTE'],
      url: 'https://int.hera.com/products/sensual-powder-matte-liquid',
    },
    {
      productNameIncludes: ['QUAD EYE COLOR'],
      url: 'https://int.hera.com/products/quad-eye-color',
    },
    {
      productNameIncludes: ['SENSUAL FRESH NUDE BLUSH'],
      url: 'https://int.hera.com/products/hera-blush',
    },
    {
      productNameIncludes: ['HERA BLUSH'],
      url: 'https://int.hera.com/products/hera-blush',
    },
  ],
} as const

function getDirectProductUrl(brand: string, productName: string) {
  const brandKey = normalizeBrandKey(brand)
  const productKey = normalizeProductKey(productName)
  const matches = DIRECT_PRODUCT_URLS[brandKey] ?? []

  return matches.find((entry) =>
    entry.productNameIncludes.some((needle) => productKey.includes(needle))
  )?.url ?? null
}

export function getBrandGlobalUrl(brand: string, productName: string) {
  const brandKey = normalizeBrandKey(brand)
  const productKey = productName.trim()
  const directProductUrl = getDirectProductUrl(brandKey, productName)

  if (directProductUrl) {
    return directProductUrl
  }

  const searchBuilder = BRAND_SEARCH_URL_BUILDERS[brandKey]

  if (searchBuilder && productKey) {
    return searchBuilder(`${brand} ${productKey}`.trim())
  }

  const brandUrl = BRAND_BASE_URLS[brandKey]

  if (brandUrl) {
    return brandUrl
  }

  return `https://global.oliveyoung.com/search?query=${encodeURIComponent(`${brand} ${productName}`.trim())}`
}

export function hasBrandGlobalUrl(brand: string) {
  const brandKey = normalizeBrandKey(brand)
  return brandKey in BRAND_BASE_URLS || brandKey in BRAND_SEARCH_URL_BUILDERS || brandKey in DIRECT_PRODUCT_URLS
}
