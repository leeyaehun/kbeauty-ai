import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return new OpenAI({ apiKey })
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient()
    const { imageBase64, surveyAnswers } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: '이미지가 없어요' }, { status: 400 })
    }

    // base64에서 헤더 제거
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are a professional dermatologist AI specializing in Korean skin types.
Analyze the skin in the image and return ONLY a JSON object, no other text.
JSON format:
{
  "skin_type": "dry|oily|combination|sensitive|normal",
  "scores": {
    "hydration": 0-100,
    "oiliness": 0-100,
    "sensitivity": 0-100,
    "pigmentation": 0-100
  },
  "concerns": ["acne"|"hyperpigmentation"|"wrinkles"|"pores"|"redness"|"dryness"],
  "skin_tone": "fair|medium|tan|deep",
  "confidence": 0-1
}`
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Data}`,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: `Analyze this skin image. Survey answers for reference: tightness=${surveyAnswers?.tightness}/3, oiliness=${surveyAnswers?.oiliness}/3, trouble=${surveyAnswers?.trouble}/3. Return JSON only.`
            }
          ]
        }
      ]
    })

    const text = response.choices[0].message.content || ''

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI 분석 실패' }, { status: 500 })
    }

    const analysisResult = JSON.parse(jsonMatch[0])

    // 설문 결과와 Vision 결과 결합 (7:3 가중치)
    if (surveyAnswers) {
      const surveyDry = surveyAnswers.tightness / 3
      const surveyOily = surveyAnswers.oiliness / 3
      const surveySensitive = surveyAnswers.trouble / 3

      analysisResult.scores.hydration = Math.round(
        analysisResult.scores.hydration * 0.7 + (1 - surveyDry) * 100 * 0.3
      )
      analysisResult.scores.oiliness = Math.round(
        analysisResult.scores.oiliness * 0.7 + surveyOily * 100 * 0.3
      )
      analysisResult.scores.sensitivity = Math.round(
        analysisResult.scores.sensitivity * 0.7 + surveySensitive * 100 * 0.3
      )
    }

    return NextResponse.json(analysisResult)

  } catch (error: any) {
    console.error('분석 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
