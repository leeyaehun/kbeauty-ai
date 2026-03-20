import { USER_AGENT, sleep, supabase } from './oliveyoung-shared'

const PAGE_SIZE = 200
const CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.FIX_GLOBAL_IMAGES_CONCURRENCY ?? '10', 10)
)
const FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.FIX_GLOBAL_IMAGES_TIMEOUT_MS ?? '20000', 10)
)
const REQUEST_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.FIX_GLOBAL_IMAGES_DELAY_MS ?? '100', 10)
)
const MAX_PRODUCTS = Math.max(
  0,
  Number.parseInt(process.env.FIX_GLOBAL_IMAGES_MAX_PRODUCTS ?? '0', 10)
)

type ProductRow = {
  brand: string | null
  detail_url: string
  id: string
  name: string | null
}

type ProductQueryRow = {
  affiliate_url?: unknown
  brand?: unknown
  global_affiliate_url?: unknown
  id?: unknown
  name?: unknown
}

function isMissingGlobalAffiliateUrlColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return code === '42703' && typeof message === 'string' && message.includes('global_affiliate_url')
}

function isGlobalOliveYoungUrl(url: string | null | undefined) {
  return typeof url === 'string' && url.startsWith('https://global.oliveyoung.com/')
}

function normalizeImageUrl(rawUrl: string, pageUrl: string) {
  const trimmed = rawUrl
    .trim()
    .replace(/&amp;/g, '&')

  if (!trimmed) {
    return null
  }

  try {
    return new URL(trimmed, pageUrl).toString()
  } catch {
    return null
  }
}

function extractByMetaTag(html: string) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<link[^>]+rel=["']preload["'][^>]+href=["']([^"']+)["'][^>]+as=["']image["']/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function extractByContainerClass(html: string, className: string) {
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>[\\s\\S]{0,3000}?<img[^>]+(?:src|data-src)=["']([^"']+)["']`,
    'i'
  )
  const match = html.match(pattern)

  return match?.[1] ?? null
}

function extractByImageClass(html: string, className: string) {
  const patterns = [
    new RegExp(`<img[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]+src=["']([^"']+)["']`, 'i'),
    new RegExp(`<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*\\b${className}\\b[^"']*["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

async function loadTargetProducts() {
  const products: ProductRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const fullResult = await supabase
      .from('products')
      .select('id, name, brand, affiliate_url, global_affiliate_url')
      .not('global_affiliate_url', 'is', null)
      .or('image_url.is.null,image_url.eq.')
      .range(from, to)

    let data = fullResult.data as ProductQueryRow[] | null

    if (fullResult.error) {
      if (!isMissingGlobalAffiliateUrlColumn(fullResult.error)) {
        throw new Error(`Failed to load target products: ${fullResult.error.message}`)
      }

      const fallbackResult = await supabase
        .from('products')
        .select('id, name, brand, affiliate_url')
        .ilike('affiliate_url', 'https://global.oliveyoung.com/%')
        .or('image_url.is.null,image_url.eq.')
        .range(from, to)

      if (fallbackResult.error) {
        throw new Error(`Failed to load target products: ${fallbackResult.error.message}`)
      }

      data = fallbackResult.data as ProductQueryRow[] | null
    }

    if (!data || data.length === 0) {
      break
    }

    products.push(
      ...data
        .map((row) => {
          const value = row as Record<string, unknown>
          const detailUrlCandidate =
            typeof value.global_affiliate_url === 'string'
              ? value.global_affiliate_url
              : typeof value.affiliate_url === 'string'
                ? value.affiliate_url
                : null

          if (typeof value.id !== 'string' || !isGlobalOliveYoungUrl(detailUrlCandidate)) {
            return null
          }

          return {
            brand: typeof value.brand === 'string' ? value.brand : null,
            detail_url: detailUrlCandidate,
            id: value.id,
            name: typeof value.name === 'string' ? value.name : null,
          }
        })
        .filter((product): product is ProductRow => product !== null)
    )

    if (data.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return MAX_PRODUCTS > 0 ? products.slice(0, MAX_PRODUCTS) : products
}

async function fetchImageUrl(detailUrl: string) {
  const response = await fetch(detailUrl, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`)
  }

  const html = await response.text()
  const imageUrl =
    extractByMetaTag(html) ??
    extractByContainerClass(html, 'product-image') ??
    extractByContainerClass(html, 'pdp-image') ??
    extractByImageClass(html, 'main-image')

  return imageUrl ? normalizeImageUrl(imageUrl, detailUrl) : null
}

async function updateProductImage(productId: string, imageUrl: string) {
  const { error } = await supabase
    .from('products')
    .update({ image_url: imageUrl })
    .eq('id', productId)

  if (error) {
    throw new Error(`Failed to update ${productId}: ${error.message}`)
  }
}

async function main() {
  console.log('글로벌 제품 이미지 재크롤링 시작...')

  const products = await loadTargetProducts()
  console.log(`대상 제품 ${products.length}개`)

  if (products.length === 0) {
    console.log('이미지가 비어 있는 글로벌 제품이 없습니다.')
    return
  }

  const imageCache = new Map<string, Promise<string | null>>()

  let successCount = 0
  let failureCount = 0

  async function processProduct(product: ProductRow, index: number) {
    const detailUrl = product.detail_url

    try {
      let imagePromise = imageCache.get(detailUrl)

      if (!imagePromise) {
        imagePromise = fetchImageUrl(detailUrl)
        imageCache.set(detailUrl, imagePromise)
      }

      const imageUrl = await imagePromise

      if (!imageUrl) {
        failureCount += 1
        console.warn(`[${index + 1}/${products.length}] no image: ${product.brand ?? ''} ${product.name ?? ''}`)
        return
      }

      await updateProductImage(product.id, imageUrl)
      successCount += 1
      console.log(`[${index + 1}/${products.length}] updated image: ${product.brand ?? ''} ${product.name ?? ''}`)
    } catch (error) {
      failureCount += 1
      console.error(`[${index + 1}/${products.length}] failed: ${product.brand ?? ''} ${product.name ?? ''}`, error)
    }

    if (REQUEST_DELAY_MS > 0) {
      await sleep(REQUEST_DELAY_MS)
    }
  }

  for (let start = 0; start < products.length; start += CONCURRENCY) {
    const chunk = products.slice(start, start + CONCURRENCY)
    await Promise.all(chunk.map((product, offset) => processProduct(product, start + offset)))
  }

  console.log(`완료! 성공 ${successCount}건, 실패 ${failureCount}건`)
  console.log(`이미지 채워진 제품 수: ${successCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
