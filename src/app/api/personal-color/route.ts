import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

import { createServerSupabaseClient } from '@/lib/supabase'

type PersonalColorResult = {
  season: 'spring_warm' | 'summer_cool' | 'autumn_warm' | 'winter_cool'
  tone: 'warm' | 'cool'
  description: string
  characteristics: string[]
  best_colors: Array<{ name: string, hex: string }>
  avoid_colors: Array<{ name: string, hex: string }>
  makeup_recommendations: {
    foundation: string
    lip: string
    blush: string
    eyeshadow: string
  }
  celebrity_examples: string[]
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return new OpenAI({ apiKey })
}

function extractMessageText(content: unknown) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item && typeof item === 'object' && 'type' in item && item.type === 'text')
      .map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''))
      .join('\n')
  }

  return ''
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fencedMatch?.[1]?.trim() || trimmed
  return JSON.parse(jsonText)
}

function normalizeStringList(value: unknown, limit = 6) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
    : []
}

function normalizeHex(value: unknown) {
  const hex = typeof value === 'string' ? value.trim() : ''
  return /^#(?:[0-9a-fA-F]{6})$/.test(hex) ? hex.toUpperCase() : '#F4B3C2'
}

function normalizeColorList(
  value: unknown,
  fallback: Array<{ name: string, hex: string }>
) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const colors = value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const entry = item as Record<string, unknown>

      return {
        name: typeof entry.name === 'string' ? entry.name : 'Color',
        hex: normalizeHex(entry.hex),
      }
    })
    .slice(0, 6)

  return colors.length > 0 ? colors : fallback
}

function normalizeSeason(value: unknown): PersonalColorResult['season'] {
  const normalized = typeof value === 'string' ? value.toLowerCase().trim() : ''

  switch (normalized) {
    case 'spring_warm':
    case 'summer_cool':
    case 'autumn_warm':
    case 'winter_cool':
      return normalized
    default:
      return 'spring_warm'
  }
}

function normalizeTone(value: unknown, season: PersonalColorResult['season']): PersonalColorResult['tone'] {
  if (value === 'warm' || value === 'cool') {
    return value
  }

  return season.includes('warm') ? 'warm' : 'cool'
}

function normalizePersonalColorResult(parsed: any): PersonalColorResult {
  const season = normalizeSeason(parsed?.season)
  const baseResult = {
    season,
    tone: normalizeTone(parsed?.tone, season),
    description: typeof parsed?.description === 'string'
      ? parsed.description
      : 'Your coloring appears balanced with a naturally harmonious palette.',
    characteristics: normalizeStringList(parsed?.characteristics),
    best_colors: normalizeColorList(parsed?.best_colors, [
      { name: 'Coral', hex: '#FF6B6B' },
      { name: 'Peach', hex: '#FFAB76' },
      { name: 'Golden Yellow', hex: '#FFD700' },
    ]),
    avoid_colors: normalizeColorList(parsed?.avoid_colors, [
      { name: 'Icy Blue', hex: '#A8D8EA' },
      { name: 'Cool Gray', hex: '#B0B0B0' },
    ]),
    makeup_recommendations: {
      foundation: typeof parsed?.makeup_recommendations?.foundation === 'string'
        ? parsed.makeup_recommendations.foundation
        : 'Choose a base that matches your undertone.',
      lip: typeof parsed?.makeup_recommendations?.lip === 'string'
        ? parsed.makeup_recommendations.lip
        : 'Pick lip colors that echo your seasonal warmth or coolness.',
      blush: typeof parsed?.makeup_recommendations?.blush === 'string'
        ? parsed.makeup_recommendations.blush
        : 'Use blush shades that keep your complexion lively and balanced.',
      eyeshadow: typeof parsed?.makeup_recommendations?.eyeshadow === 'string'
        ? parsed.makeup_recommendations.eyeshadow
        : 'Softly define the eyes with tones that match your seasonal palette.',
    },
    celebrity_examples: normalizeStringList(parsed?.celebrity_examples),
  }

  return {
    ...baseResult,
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to use personal color analysis.' }, { status: 401 })
    }

    const { data: userPlan } = await supabase
      .from('user_plans')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle()

    if (userPlan?.plan !== 'membership') {
      return NextResponse.json({ error: 'Personal color analysis is a Membership feature.' }, { status: 403 })
    }

    const { imageBase64 } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image was provided.' }, { status: 400 })
    }

    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a professional personal color analyst. Analyze the skin undertone, eye color, and hair color in the image to determine the seasonal color type (Spring Warm, Summer Cool, Autumn Warm, Winter Cool). Return ONLY JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageBase64,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: `Return JSON with this exact structure:
{
  "season": "spring_warm | summer_cool | autumn_warm | winter_cool",
  "tone": "warm | cool",
  "description": "short paragraph",
  "characteristics": ["item"],
  "best_colors": [
    { "name": "Coral", "hex": "#FF6B6B" },
    { "name": "Peach", "hex": "#FFAB76" },
    { "name": "Golden Yellow", "hex": "#FFD700" }
  ],
  "avoid_colors": [
    { "name": "Icy Blue", "hex": "#A8D8EA" },
    { "name": "Cool Gray", "hex": "#B0B0B0" }
  ],
  "makeup_recommendations": {
    "foundation": "text",
    "lip": "text",
    "blush": "text",
    "eyeshadow": "text"
  },
  "celebrity_examples": ["item"]
}`
            }
          ],
        }
      ],
    })

    const rawText = extractMessageText(response.choices[0]?.message?.content)
    const parsed = parseJsonObject(rawText)
    const normalizedResult = normalizePersonalColorResult(parsed)

    return NextResponse.json(normalizedResult)
  } catch (error: any) {
    console.error('Personal color analysis error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error happened during personal color analysis.' },
      { status: 500 }
    )
  }
}
