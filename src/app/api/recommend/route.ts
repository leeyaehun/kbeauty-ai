import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

import { getProductPricePresentation, type PriceCurrencyCode } from '@/lib/pricing'

const MATCH_COUNT = 6
const MIN_MATCH_SCORE = 0.6
const QUERY_TIMEOUT_MS = 12000
const MAX_VECTOR_CANDIDATES = 2500
const DEFAULT_CATEGORIES = ['세럼', '크림', '토너', '클렌저', '선케어']
const CATEGORY_ALIASES: Record<string, string[]> = {
  세럼: ['세럼', 'serum'],
  크림: ['크림', 'cream'],
  토너: ['토너', 'toner'],
  클렌저: ['클렌저', 'cleanser'],
  선케어: ['선케어', 'sun_care'],
}

type RecommendedProduct = {
  id: string
  name: string | null
  brand: string | null
  price: number | null
  currency_code?: PriceCurrencyCode
  display_price?: string | null
  category: string | null
  image_url: string | null
  price_minor_unit?: boolean
  skin_profile: unknown
  affiliate_url?: string | null
  global_affiliate_url?: string | null
  similarity?: number | null
}

type CandidateProductRow = {
  id: string
  name: string | null
  brand: string | null
  price: number | null
  category: string | null
  affiliate_url: string | null
  global_affiliate_url: string | null
  image_url: string | null
  skin_profile: unknown
  embedding?: string | null
}

function isMissingGlobalAffiliateUrlColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return code === '42703' && typeof message === 'string' && message.includes('global_affiliate_url')
}

function createServiceRoleSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role credentials are not configured')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function withQueryTimeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('Supabase query timeout'), QUERY_TIMEOUT_MS)

  try {
    return await operation(controller.signal)
  } finally {
    clearTimeout(timeoutId)
  }
}

function resolveSearchCategories(category: string | null) {
  if (category && CATEGORY_ALIASES[category]) {
    return CATEGORY_ALIASES[category]
  }

  if (category) {
    return [category]
  }

  return DEFAULT_CATEGORIES.flatMap((entry) => CATEGORY_ALIASES[entry] ?? [entry])
}

function shuffle<T>(values: T[]) {
  const copy = [...values]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }

  return copy
}

function parseEmbeddingVector(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null
  }

  const parsed = trimmed
    .slice(1, -1)
    .split(',')
    .map((entry) => Number.parseFloat(entry))

  return parsed.some((entry) => Number.isNaN(entry)) ? null : parsed
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) {
    return 0
  }

  let dotProduct = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    dotProduct += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function isRecommendedProduct(value: RecommendedProduct | null): value is RecommendedProduct {
  return value !== null
}

function normalizeCandidateRows(rows: unknown) {
  const values = Array.isArray(rows) ? rows : []

  return values.map((product) => {
    const row = product as Record<string, unknown>

    return {
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : null,
      brand: typeof row.brand === 'string' ? row.brand : null,
      price: typeof row.price === 'number' ? row.price : null,
      category: typeof row.category === 'string' ? row.category : null,
      affiliate_url: typeof row.affiliate_url === 'string' ? row.affiliate_url : null,
      global_affiliate_url:
        typeof row.global_affiliate_url === 'string' ? row.global_affiliate_url : null,
      image_url: typeof row.image_url === 'string' ? row.image_url : null,
      skin_profile: row.skin_profile ?? null,
      embedding: typeof row.embedding === 'string' ? row.embedding : null,
    }
  }).filter((row) => row.id.length > 0)
}

async function selectProducts(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  categories: string[],
  columns: string,
  limit?: number,
  signal?: AbortSignal
) {
  let fullQuery = supabase
    .from('products')
    .select(columns)
    .in('category', categories)
    .not('embedding', 'is', null)

  if (signal) {
    fullQuery = fullQuery.abortSignal(signal)
  }

  if (typeof limit === 'number') {
    fullQuery = fullQuery.limit(limit)
  }

  const fullResult = await fullQuery

  if (!fullResult.error) {
    return {
      data: normalizeCandidateRows(fullResult.data),
      error: null,
    }
  }

  if (!isMissingGlobalAffiliateUrlColumn(fullResult.error)) {
    return {
      data: null,
      error: fullResult.error,
    }
  }

  console.warn('global_affiliate_url column is missing; falling back to affiliate_url only.')

  let fallbackQuery = supabase
    .from('products')
    .select(columns.replace(', global_affiliate_url', ''))
    .in('category', categories)
    .not('embedding', 'is', null)

  if (signal) {
    fallbackQuery = fallbackQuery.abortSignal(signal)
  }

  if (typeof limit === 'number') {
    fallbackQuery = fallbackQuery.limit(limit)
  }

  const fallbackResult = await fallbackQuery

  if (fallbackResult.error) {
    return {
      data: null,
      error: fallbackResult.error,
    }
  }

  return {
    data: normalizeCandidateRows(fallbackResult.data).map((product) => ({
      ...product,
      global_affiliate_url: null,
    })),
    error: null,
  }
}

async function countSearchCandidates(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  categories: string[],
  signal?: AbortSignal
) {
  let query = supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .in('category', categories)
    .not('embedding', 'is', null)

  if (signal) {
    query = query.abortSignal(signal)
  }

  const result = await query

  return {
    count: typeof result.count === 'number' ? result.count : 0,
    error: result.error,
  }
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return new OpenAI({ apiKey })
}

function buildUserProfileText(analysisResult: any) {
  return `Skin type: ${analysisResult.skin_type} | Hydration: ${analysisResult.scores.hydration} | Oil level: ${analysisResult.scores.oiliness} | Sensitivity: ${analysisResult.scores.sensitivity} | Concerns: ${analysisResult.concerns.join(', ')}`
}

function normalizeMatchScore(similarity: unknown) {
  const raw = typeof similarity === 'number' ? similarity : Number(similarity)

  if (Number.isNaN(raw) || raw <= 0) {
    return MIN_MATCH_SCORE
  }

  const weighted = Math.max(0, Math.min(raw * 1.5, 1))

  return Number((MIN_MATCH_SCORE + weighted * 0.39).toFixed(4))
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient()
    const { analysisResult, category } = await req.json()

    if (!analysisResult) {
      return NextResponse.json({ error: 'Analysis result is missing.' }, { status: 400 })
    }

    const profileText = buildUserProfileText(analysisResult)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: profileText,
    })
    const userEmbedding = embeddingResponse.data[0].embedding

    const searchCategories = resolveSearchCategories(category ?? null)
    const supabase = createServiceRoleSupabaseClient()

    async function loadFallbackProducts() {
      const { data, error } = await withQueryTimeout((signal) =>
        selectProducts(
          supabase,
          searchCategories,
          'id, name, brand, price, category, affiliate_url, global_affiliate_url, image_url, skin_profile',
          120,
          signal
        )
      )

      if (error) {
        throw error
      }

      return shuffle(data ?? [])
        .slice(0, MATCH_COUNT)
        .map((product) => ({
          ...product,
          similarity: MIN_MATCH_SCORE,
        }))
    }

    let recommendedProducts: RecommendedProduct[] = []

    try {
      const { count, error: countError } = await withQueryTimeout((signal) =>
        countSearchCandidates(supabase, searchCategories, signal)
      )

      if (countError) {
        throw countError
      }

      if ((count ?? 0) === 0) {
        return NextResponse.json({ products: [] })
      }

      if ((count ?? 0) > MAX_VECTOR_CANDIDATES) {
        console.warn(
          `Skipping vector similarity search for ${count} candidates in ${searchCategories.join(', ')}`
        )
        recommendedProducts = await loadFallbackProducts()
      } else {
        const { data, error } = await withQueryTimeout((signal) =>
          selectProducts(
            supabase,
            searchCategories,
            'id, name, brand, price, category, affiliate_url, global_affiliate_url, image_url, skin_profile, embedding',
            count ?? MAX_VECTOR_CANDIDATES,
            signal
          )
        )

        if (error) {
          throw error
        }

        const scoredProducts: Array<RecommendedProduct | null> = (data ?? [])
          .map((product) => {
            const embedding = parseEmbeddingVector(product.embedding)

            if (!embedding) {
              return null
            }

            return {
              id: product.id,
              name: product.name,
              brand: product.brand,
              price: product.price,
              category: product.category,
              image_url: product.image_url,
              skin_profile: product.skin_profile,
              affiliate_url: product.affiliate_url,
              global_affiliate_url: product.global_affiliate_url,
              similarity: cosineSimilarity(userEmbedding, embedding),
            }
          })
        const rankedProducts: RecommendedProduct[] = scoredProducts
          .filter(isRecommendedProduct)
          .sort((left, right) => (right.similarity ?? 0) - (left.similarity ?? 0))
          .slice(0, MATCH_COUNT)

        recommendedProducts = rankedProducts
      }
    } catch (error) {
      console.error('Vector recommendation failed, falling back to category picks:', error)
      recommendedProducts = await loadFallbackProducts()
    }

    const mergedProducts = recommendedProducts.map((product) => {
      const pricePresentation = getProductPricePresentation(product.price, product.category)

      return {
        ...product,
        affiliate_url: product.affiliate_url ?? null,
        currency_code: pricePresentation.currencyCode,
        display_price: pricePresentation.displayPrice,
        global_affiliate_url: product.global_affiliate_url ?? null,
        price_minor_unit: pricePresentation.priceMinorUnit,
        similarity: normalizeMatchScore(product.similarity),
      }
    })

    return NextResponse.json({ products: mergedProducts })
  } catch (error: any) {
    console.error('Recommendation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
