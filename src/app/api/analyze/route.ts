import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const MAX_IMAGE_BYTES = 1024 * 1024
const OPENAI_TIMEOUT_MS = 30_000
const OPENAI_MAX_RETRIES = 1

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return new OpenAI({ apiKey })
}

function estimateBase64Bytes(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function extractMessageText(content: unknown) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter(item => item && typeof item === 'object' && 'type' in item && item.type === 'text')
      .map(item => ('text' in item && typeof item.text === 'string' ? item.text : ''))
      .join('\n')
  }

  return ''
}

function extractJsonString(rawText: string) {
  const trimmed = rawText.trim()

  if (!trimmed) {
    throw new Error('AI 응답이 비어 있어요.')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI 응답에서 JSON을 찾지 못했어요.')
  }

  return trimmed.slice(firstBrace, lastBrace + 1)
}

function clampScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(parsed)) {
    return 50
  }

  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeAnalysisResult(parsed: any) {
  return {
    skin_type: typeof parsed.skin_type === 'string' ? parsed.skin_type : 'normal',
    scores: {
      hydration: clampScore(parsed?.scores?.hydration),
      oiliness: clampScore(parsed?.scores?.oiliness),
      sensitivity: clampScore(parsed?.scores?.sensitivity),
      pigmentation: clampScore(parsed?.scores?.pigmentation),
    },
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns.filter((item: unknown) => typeof item === 'string')
      : [],
    skin_tone: typeof parsed.skin_tone === 'string' ? parsed.skin_tone : 'medium',
    confidence: typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5,
  }
}

async function requestVisionAnalysis(openai: OpenAI, base64Data: string, surveyAnswers: any) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 500,
        temperature: 0,
        response_format: { type: 'json_object' },
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
                text: `Analyze this skin image. Survey answers for reference: tightness=${surveyAnswers?.tightness ?? 'n/a'}/3, oiliness=${surveyAnswers?.oiliness ?? 'n/a'}/3, trouble=${surveyAnswers?.trouble ?? 'n/a'}/3. Return JSON only.`
              }
            ]
          }
        ]
      }, {
        timeout: OPENAI_TIMEOUT_MS,
        maxRetries: 0,
      })

      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vision API 호출에 실패했어요.'
      lastError = new Error(message)

      if (attempt >= OPENAI_MAX_RETRIES) {
        throw lastError
      }
    }
  }

  throw lastError ?? new Error('Vision API 호출에 실패했어요.')
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
    const imageBytes = estimateBase64Bytes(base64Data)

    if (imageBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: '촬영 이미지가 너무 커요. 다시 촬영하거나 조금 더 가까이에서 시도해주세요.' },
        { status: 413 }
      )
    }

    const response = await requestVisionAnalysis(openai, base64Data, surveyAnswers)
    const text = extractMessageText(response.choices[0]?.message?.content)
    const jsonText = extractJsonString(text)
    const analysisResult = normalizeAnalysisResult(JSON.parse(jsonText))

    if (surveyAnswers) {
      const surveyDry = Number(surveyAnswers.tightness ?? 0) / 3
      const surveyOily = Number(surveyAnswers.oiliness ?? 0) / 3
      const surveySensitive = Number(surveyAnswers.trouble ?? 0) / 3

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
    return NextResponse.json(
      { error: error?.message || '분석 중 알 수 없는 오류가 발생했어요.' },
      { status: 500 }
    )
  }
}
