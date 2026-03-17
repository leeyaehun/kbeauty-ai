import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

import { createServerSupabaseClient } from '@/lib/supabase'

type RecommendedProduct = {
  id: string
  affiliate_url?: string | null
  global_affiliate_url?: string | null
  [key: string]: unknown
}

type ProductUrlRow = {
  id: string
  affiliate_url: string | null
  global_affiliate_url: string | null
}

function isMissingGlobalAffiliateUrlColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return code === '42703' && typeof message === 'string' && message.includes('global_affiliate_url')
}

async function loadProductUrls(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, productIds: string[]) {
  const fullQuery = await supabase
    .from('products')
    .select('id, affiliate_url, global_affiliate_url')
    .in('id', productIds)

  if (!fullQuery.error) {
    return {
      data: (fullQuery.data ?? []) as ProductUrlRow[],
      error: null,
    }
  }

  if (!isMissingGlobalAffiliateUrlColumn(fullQuery.error)) {
    return {
      data: null,
      error: fullQuery.error,
    }
  }

  console.warn('global_affiliate_url column is missing; falling back to affiliate_url only.')

  const fallbackQuery = await supabase
    .from('products')
    .select('id, affiliate_url')
    .in('id', productIds)

  if (fallbackQuery.error) {
    return {
      data: null,
      error: fallbackQuery.error,
    }
  }

  return {
    data: (fallbackQuery.data ?? []).map((product) => ({
      id: product.id,
      affiliate_url: product.affiliate_url,
      global_affiliate_url: null,
    })),
    error: null,
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

    const supabase = await createServerSupabaseClient()
    const { data: products, error } = await supabase.rpc('match_products', {
      query_embedding: userEmbedding,
      skin_type_filter: category || null,
      category_filter: null,
      match_count: 6,
    })

    if (error) {
      console.error('Product lookup failed:', error)
      return NextResponse.json({ error: 'We couldn’t load product recommendations.' }, { status: 500 })
    }

    const recommendedProducts = (products ?? []) as RecommendedProduct[]
    const productIds = recommendedProducts
      .map((product) => product.id)
      .filter((id): id is string => Boolean(id))

    if (productIds.length === 0) {
      return NextResponse.json({ products: [] })
    }

    const { data: productUrls, error: productUrlsError } = await loadProductUrls(supabase, productIds)

    if (productUrlsError) {
      console.error('Product URL merge failed:', productUrlsError)
      return NextResponse.json({ error: 'We couldn’t load product recommendations.' }, { status: 500 })
    }

    const productUrlMap = new Map(
      (productUrls ?? []).map((product) => [
        product.id,
        {
          affiliate_url: product.affiliate_url,
          global_affiliate_url: product.global_affiliate_url,
        },
      ])
    )

    const mergedProducts = recommendedProducts.map((product) => {
      const mergedUrls = productUrlMap.get(product.id)

      return {
        ...product,
        affiliate_url: mergedUrls?.affiliate_url ?? product.affiliate_url ?? null,
        global_affiliate_url: mergedUrls?.global_affiliate_url ?? product.global_affiliate_url ?? null,
      }
    })

    return NextResponse.json({ products: mergedProducts })
  } catch (error: any) {
    console.error('Recommendation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
