import { mapGlobalCategoryPathToCategory, parseGlobalProductIdFromUrl } from './category-utils'
import { sleep, USER_AGENT } from './oliveyoung-shared'

const GLOBAL_DETAIL_DATA_URL = 'https://global.oliveyoung.com/product/detail-data'
const DETAIL_LOOKUP_RETRY_COUNT = 3

function buildDetailLookupError(prdtNo: string, responseText: string, reason: string) {
  const preview = responseText.trim().slice(0, 160)

  return new Error(`${reason} for ${prdtNo}${preview ? `: ${preview}` : ''}`)
}

export async function fetchGlobalProductCategoryPath(affiliateUrl: string | null | undefined) {
  const prdtNo = parseGlobalProductIdFromUrl(affiliateUrl)

  if (!prdtNo) {
    return {
      category: null,
      categoryPathEn: null,
      prdtNo: null,
    }
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= DETAIL_LOOKUP_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(GLOBAL_DETAIL_DATA_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json;charset=UTF-8',
          origin: 'https://global.oliveyoung.com',
          referer: `https://global.oliveyoung.com/product/detail?prdtNo=${prdtNo}`,
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({ prdtNo }),
      })

      const responseText = await response.text()

      if (!response.ok) {
        throw buildDetailLookupError(prdtNo, responseText, `detail-data http ${response.status}`)
      }

      let payload: {
        product?: {
          allPathCtgrNameEn?: string | null
          korAllPathCtgrName?: string | null
        } | null
      }

      try {
        payload = JSON.parse(responseText) as {
          product?: {
            allPathCtgrNameEn?: string | null
            korAllPathCtgrName?: string | null
          } | null
        }
      } catch {
        throw buildDetailLookupError(prdtNo, responseText, 'detail-data invalid json')
      }

      const categoryPathEn = payload.product?.allPathCtgrNameEn ?? payload.product?.korAllPathCtgrName ?? null

      return {
        category: mapGlobalCategoryPathToCategory(categoryPathEn),
        categoryPathEn,
        prdtNo,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < DETAIL_LOOKUP_RETRY_COUNT) {
        await sleep(400 * attempt)
      }
    }
  }

  throw lastError ?? new Error(`detail-data lookup failed for ${prdtNo}`)
}
