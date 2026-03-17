import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

import { createServerSupabaseClient } from '@/lib/supabase'

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return new OpenAI({ apiKey })
}

function buildUserProfileText(analysisResult: any) {
  return `피부타입: ${analysisResult.skin_type} | 수분도: ${analysisResult.scores.hydration} | 유분도: ${analysisResult.scores.oiliness} | 민감도: ${analysisResult.scores.sensitivity} | 고민: ${analysisResult.concerns.join(', ')}`
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient()
    const { analysisResult, category } = await req.json()

    if (!analysisResult) {
      return NextResponse.json({ error: '분석 결과가 없어요' }, { status: 400 })
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
      console.error('제품 검색 실패:', error)
      return NextResponse.json({ error: '제품 검색 실패' }, { status: 500 })
    }

    return NextResponse.json({ products })
  } catch (error: any) {
    console.error('추천 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
