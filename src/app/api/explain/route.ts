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
      return NextResponse.json({ error: 'Missing product or analysis data.' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Look at the skin analysis result and the product information, then explain the recommendation in polished, friendly English for a global beauty audience. Return only the explanation.

Skin analysis:
- Skin type: ${analysisResult.skin_type}
- Hydration: ${analysisResult.scores.hydration}/100
- Oil level: ${analysisResult.scores.oiliness}/100
- Sensitivity: ${analysisResult.scores.sensitivity}/100
- Concerns: ${analysisResult.concerns.join(', ')}

Recommended product:
- Product name: ${product.name}
- Brand: ${product.brand}
- Category: ${product.category}
- Skin profile: ${JSON.stringify(product.skin_profile)}

Explain in 1 short sentence (max 20 words) why this product suits this skin type. Focus on the key ingredient benefit only.`
        }
      ]
    })

    const explanation = message.content[0]?.type === 'text'
      ? message.content[0].text
      : ''

    return NextResponse.json({ explanation })
  } catch (error: any) {
    console.error('Explanation generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
