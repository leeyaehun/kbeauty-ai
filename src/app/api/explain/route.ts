import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  return new Anthropic({ apiKey })
}

export async function POST(req: NextRequest) {
  try {
    const anthropic = getAnthropicClient()
    const { product, analysisResult } = await req.json()

    if (!product || !analysisResult) {
      return NextResponse.json({ error: '데이터가 없어요' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `피부 분석 결과와 제품 정보를 보고 추천 이유를 2문장으로 설명해줘. 한국어로 답해줘. 다른 텍스트 없이 설명만 써줘.

피부 분석:
- 피부 타입: ${analysisResult.skin_type}
- 수분도: ${analysisResult.scores.hydration}/100
- 유분도: ${analysisResult.scores.oiliness}/100  
- 민감도: ${analysisResult.scores.sensitivity}/100
- 피부 고민: ${analysisResult.concerns.join(', ')}

추천 제품:
- 제품명: ${product.name}
- 브랜드: ${product.brand}
- 카테고리: ${product.category}
- 피부 프로파일: ${JSON.stringify(product.skin_profile)}

이 제품이 왜 이 피부 타입에 맞는지 K-뷰티 성분 관점에서 2문장으로 설명해줘.`
        }
      ]
    })

    const explanation = message.content[0]?.type === 'text'
      ? message.content[0].text
      : ''

    return NextResponse.json({ explanation })
  } catch (error: any) {
    console.error('설명 생성 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
