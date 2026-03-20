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
    throw new Error('The AI response was empty.')
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('We couldn’t find JSON in the AI response.')
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

function isNoFaceResult(parsed: unknown): parsed is { error: 'no_face' } {
  return Boolean(
    parsed &&
    typeof parsed === 'object' &&
    'error' in parsed &&
    parsed.error === 'no_face'
  )
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
            content: `You are a skincare analysis AI with strong K-beauty expertise.
First check if there is a human face in the image.
If no face is detected, return: { "error": "no_face" }
If face is detected, proceed with skin analysis.
Return ONLY a JSON object, with no extra text.
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
                text: `Analyze this skin image for a global beauty user. Survey answers for context: tightness=${surveyAnswers?.tightness ?? 'n/a'}/3, oiliness=${surveyAnswers?.oiliness ?? 'n/a'}/3, breakouts=${surveyAnswers?.trouble ?? 'n/a'}/3. Focus on hydration, sebum balance, sensitivity, pigmentation, and likely concerns. Return JSON only.`
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
      const message = error instanceof Error ? error.message : 'The Vision API request failed.'
      lastError = new Error(message)

      if (attempt >= OPENAI_MAX_RETRIES) {
        throw lastError
      }
    }
  }

  throw lastError ?? new Error('The Vision API request failed.')
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient()
    const { imageBase64, surveyAnswers } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image was provided.' }, { status: 400 })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const imageBytes = estimateBase64Bytes(base64Data)

    if (imageBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Your selfie is too large. Please retake it or move a little closer.' },
        { status: 413 }
      )
    }

    const response = await requestVisionAnalysis(openai, base64Data, surveyAnswers)
    const text = extractMessageText(response.choices[0]?.message?.content)
    const jsonText = extractJsonString(text)
    const parsedResult = JSON.parse(jsonText)

    if (isNoFaceResult(parsedResult)) {
      return NextResponse.json(parsedResult, { status: 422 })
    }

    const analysisResult = normalizeAnalysisResult(parsedResult)

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
    console.error('Analysis error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error happened during analysis.' },
      { status: 500 }
    )
  }
}
