import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

import { createServerSupabaseClient } from '@/lib/supabase'

type MakeupCategoryKey = 'foundation' | 'lip' | 'blush' | 'eyeshadow'

type MakeupProduct = {
  brand: string
  name: string
  reason: string
  shade: string
}

type MakeupProductSection = {
  tip: string
  products: MakeupProduct[]
}

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
  product_recommendations: Record<MakeupCategoryKey, MakeupProductSection>
}

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

const SEASON_BRANDS: Record<PersonalColorResult['season'], string[]> = {
  spring_warm: ['ROM&ND', 'Etude', 'Peripera', '3CE'],
  summer_cool: ['CLIO', 'Hera', 'Sulwhasoo', 'Moonshot'],
  autumn_warm: ['3CE', 'Espoir', 'Amuse', 'VDL'],
  winter_cool: ['MAC Korea', 'CLIO', 'Hera', 'Giorgio Armani Beauty Korea'],
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return new OpenAI({ apiKey })
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return null
  }

  return new Anthropic({ apiKey })
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

function seasonLabel(season: PersonalColorResult['season']) {
  return season
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildFallbackProductRecommendations(
  season: PersonalColorResult['season']
): Record<MakeupCategoryKey, MakeupProductSection> {
  const presets: Record<PersonalColorResult['season'], Record<MakeupCategoryKey, MakeupProductSection>> = {
    spring_warm: {
      foundation: {
        tip: 'Choose radiant bases with warm beige or peach undertones to keep your complexion fresh.',
        products: [
          { brand: 'Etude', name: 'Double Lasting Foundation', shade: 'Sand', reason: 'Its warm-beige tone keeps Spring Warm skin clear and lively.' },
          { brand: '3CE', name: 'Skin Fit Cover Liquid Foundation', shade: 'Warm Ivory', reason: 'A light warm base that supports bright spring warmth.' },
        ],
      },
      lip: {
        tip: 'Fresh coral, peach, and juicy rose shades keep your face bright.',
        products: [
          { brand: 'ROM&ND', name: 'Juicy Lasting Tint', shade: 'Jujube', reason: 'The soft coral-rose depth suits bright warm coloring beautifully.' },
          { brand: 'Peripera', name: 'Ink Mood Glowy Tint', shade: 'Coral Influencer', reason: 'A lively coral tint keeps Spring Warm lips vivid and clear.' },
        ],
      },
      blush: {
        tip: 'Reach for peach and apricot blush tones with a soft glow.',
        products: [
          { brand: 'Etude', name: 'Heart Pop Blusher', shade: 'Apricot Peach', reason: 'Its gentle apricot warmth flatters bright spring undertones.' },
          { brand: '3CE', name: 'Face Blush', shade: 'Nude Peach', reason: 'A fresh peach flush keeps your complexion warm and light.' },
        ],
      },
      eyeshadow: {
        tip: 'Golden beige, peach brown, and soft coral lids feel most harmonious.',
        products: [
          { brand: 'ROM&ND', name: 'Better Than Palette', shade: 'Peony Nude Garden', reason: 'The warm peachy neutrals add brightness without dulling your tone.' },
          { brand: 'Etude', name: 'Play Color Eyes', shade: 'Bakehouse', reason: 'Soft warm browns and peach tones suit Spring Warm eyes well.' },
        ],
      },
    },
    summer_cool: {
      foundation: {
        tip: 'Look for neutral-cool beige bases that feel refined rather than yellow.',
        products: [
          { brand: 'Hera', name: 'Black Cushion', shade: '21N1 Vanilla', reason: 'Its clean neutral-cool tone keeps Summer Cool skin polished.' },
          { brand: 'Moonshot', name: 'Micro Settingfit Cushion', shade: '201 Beige', reason: 'A balanced cool-leaning base that suits soft summer coloring.' },
        ],
      },
      lip: {
        tip: 'Rose, mauve, berry, and muted plum shades make your coloring look elegant.',
        products: [
          { brand: 'CLIO', name: 'Chiffon Blur Tint', shade: 'Mauve Letter', reason: 'A soft mauve lip matches Summer Cool undertones naturally.' },
          { brand: 'Hera', name: 'Sensual Powder Matte', shade: 'Rosy Suede', reason: 'Muted rose depth keeps cool summer makeup graceful.' },
        ],
      },
      blush: {
        tip: 'Soft pink, lavender pink, and muted berry blush will look the most natural.',
        products: [
          { brand: 'CLIO', name: 'Air Blur Whip Blush', shade: 'Lavender Flush', reason: 'Its cool pink softness enhances Summer Cool skin without heaviness.' },
          { brand: 'Moonshot', name: 'Melting Mood Blush', shade: 'Soft Mauve', reason: 'A muted mauve blush complements cool, gentle chroma.' },
        ],
      },
      eyeshadow: {
        tip: 'Choose dusty rose, taupe, and muted mauve neutrals over warm golds.',
        products: [
          { brand: 'CLIO', name: 'Pro Eye Palette', shade: 'Botanic Mauve', reason: 'Its cool mauve and taupe tones flatter Summer Cool eyes.' },
          { brand: 'Hera', name: 'Quad Eye Color', shade: 'Misty Mauve', reason: 'A refined cool-toned palette that matches soft summer contrast.' },
        ],
      },
    },
    autumn_warm: {
      foundation: {
        tip: 'Use golden or honey-beige bases with depth rather than pale pink tones.',
        products: [
          { brand: 'Espoir', name: 'Pro Tailor Be Glow Foundation', shade: 'Beige', reason: 'Its warm beige balance works beautifully on Autumn Warm skin.' },
          { brand: 'VDL', name: 'Cover Stain Perfecting Foundation', shade: 'Warm Sand', reason: 'A richer warm base that supports deeper autumn warmth.' },
        ],
      },
      lip: {
        tip: 'Terracotta, cinnamon rose, brick, and warm brown-reds look especially rich.',
        products: [
          { brand: '3CE', name: 'Blur Water Tint', shade: 'Sepia', reason: 'Its earthy rose-brown depth is ideal for Autumn Warm lips.' },
          { brand: 'Amuse', name: 'Dew Tint', shade: 'Boksoonga', reason: 'A warm muted tint that keeps autumn tones soft and flattering.' },
        ],
      },
      blush: {
        tip: 'Warm apricot, cinnamon peach, and muted tan blushes work best.',
        products: [
          { brand: 'Espoir', name: 'Real Cheek Up', shade: 'Apricot Me', reason: 'A mellow apricot flush complements warm, muted undertones.' },
          { brand: '3CE', name: 'Face Blush', shade: 'Rose Beige', reason: 'Its earthy beige-rose tone fits Autumn Warm depth well.' },
        ],
      },
      eyeshadow: {
        tip: 'Olive brown, camel, bronze, and cinnamon shadows feel the most natural.',
        products: [
          { brand: 'Amuse', name: 'Eye Color Palette', shade: 'Soft Bronze', reason: 'Bronzed neutrals bring out Autumn Warm richness and softness.' },
          { brand: 'VDL', name: 'Expert Color Eye Book', shade: 'Warm Brown', reason: 'The warm earthy shades harmonize with muted autumn coloring.' },
        ],
      },
    },
    winter_cool: {
      foundation: {
        tip: 'Pick neutral-cool or cool beige base shades with clear definition instead of yellow warmth.',
        products: [
          { brand: 'Hera', name: 'Black Cushion', shade: '21C1 Rose Vanilla', reason: 'Its cool clarity sharpens Winter Cool contrast beautifully.' },
          { brand: 'CLIO', name: 'Kill Cover The New Founwear Cushion', shade: 'Lingerie', reason: 'A clean cool-leaning shade that keeps winter skin crisp.' },
        ],
      },
      lip: {
        tip: 'Blue-red, berry, plum, and bold rose tones create the strongest harmony.',
        products: [
          { brand: 'Hera', name: 'Sensual Powder Matte', shade: 'Seoul Berry', reason: 'A vivid berry lip heightens clear Winter Cool contrast.' },
          { brand: 'CLIO', name: 'Chiffon Blur Tint', shade: 'Berry Deep', reason: 'Its cool berry depth suits winter undertones and drama.' },
        ],
      },
      blush: {
        tip: 'Clear berry pink or cool rose blush keeps your complexion bright and defined.',
        products: [
          { brand: 'CLIO', name: 'Air Blur Whip Blush', shade: 'Cool Berry', reason: 'A crisp cool flush keeps Winter Cool skin lively and sharp.' },
          { brand: 'Hera', name: 'Sensual Fresh Nude Blush', shade: 'Rosy Haze', reason: 'A cool rose tone adds definition without turning warm.' },
        ],
      },
      eyeshadow: {
        tip: 'Charcoal taupe, cool brown, mauve plum, and icy shimmer shades work best.',
        products: [
          { brand: 'Hera', name: 'Quad Eye Color', shade: 'Smoky Plum', reason: 'The cool plum depth complements Winter Cool intensity.' },
          { brand: 'CLIO', name: 'Pro Eye Palette', shade: 'Crystal Glam', reason: 'Its cool shimmer and taupe tones sharpen winter contrast.' },
        ],
      },
    },
  }

  return presets[season]
}

function normalizeMakeupSection(value: unknown, fallback: MakeupProductSection): MakeupProductSection {
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const section = value as Record<string, unknown>
  const products = Array.isArray(section.products)
    ? section.products
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const product = item as Record<string, unknown>
          return {
            brand: typeof product.brand === 'string' ? product.brand : '',
            name: typeof product.name === 'string' ? product.name : '',
            reason: typeof product.reason === 'string' ? product.reason : '',
            shade: typeof product.shade === 'string' ? product.shade : '',
          }
        })
        .filter((product) => product.brand && product.name && product.reason && product.shade)
        .slice(0, 2)
    : []

  return {
    tip: typeof section.tip === 'string' && section.tip.trim().length > 0 ? section.tip : fallback.tip,
    products: products.length === 2 ? products : fallback.products,
  }
}

function normalizeProductRecommendations(
  value: unknown,
  season: PersonalColorResult['season']
): Record<MakeupCategoryKey, MakeupProductSection> {
  const fallback = buildFallbackProductRecommendations(season)
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    foundation: normalizeMakeupSection(source.foundation, fallback.foundation),
    lip: normalizeMakeupSection(source.lip, fallback.lip),
    blush: normalizeMakeupSection(source.blush, fallback.blush),
    eyeshadow: normalizeMakeupSection(source.eyeshadow, fallback.eyeshadow),
  }
}

async function generateProductRecommendations(result: Omit<PersonalColorResult, 'product_recommendations'>) {
  const anthropic = getAnthropicClient()

  if (!anthropic) {
    return buildFallbackProductRecommendations(result.season)
  }

  const allowedBrands = SEASON_BRANDS[result.season].join(', ')
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1400,
    messages: [
      {
        role: 'user',
        content: `Based on this personal color analysis result: ${seasonLabel(result.season)} (${result.tone} tone)

Recommend specific K-beauty makeup products for each category.
Return ONLY JSON:
{
  "foundation": {
    "tip": "one sentence tip for foundation shade selection",
    "products": [
      { "brand": "brand name", "name": "product name", "reason": "why it suits this color type in one sentence", "shade": "recommended shade name" }
    ]
  },
  "lip": {
    "tip": "one sentence tip for lip color",
    "products": [
      { "brand": "brand name", "name": "product name", "reason": "why it suits", "shade": "shade name" }
    ]
  },
  "blush": {
    "tip": "one sentence tip",
    "products": [
      { "brand": "brand name", "name": "product name", "reason": "why it suits", "shade": "shade name" }
    ]
  },
  "eyeshadow": {
    "tip": "one sentence tip",
    "products": [
      { "brand": "brand name", "name": "product name", "reason": "why it suits", "shade": "shade name" }
    ]
  }
}

Use only globally available K-beauty brands for this season: ${allowedBrands}
Each category must have exactly 2 product recommendations.

Supporting analysis:
- Description: ${result.description}
- Best colors: ${result.best_colors.map((color) => `${color.name} (${color.hex})`).join(', ')}
- Avoid colors: ${result.avoid_colors.map((color) => `${color.name} (${color.hex})`).join(', ')}
- Characteristics: ${result.characteristics.join(', ')}`
      }
    ]
  })

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
  return normalizeProductRecommendations(parseJsonObject(text), result.season)
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
    product_recommendations: buildFallbackProductRecommendations(season),
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

    if (userPlan?.plan !== 'pro') {
      return NextResponse.json({ error: 'Personal color analysis is a Pro feature.' }, { status: 403 })
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
    let productRecommendations = buildFallbackProductRecommendations(normalizedResult.season)

    try {
      productRecommendations = await generateProductRecommendations(normalizedResult)
    } catch (recommendationError) {
      console.error('Makeup recommendation error:', recommendationError)
    }

    return NextResponse.json({
      ...normalizedResult,
      product_recommendations: productRecommendations,
    })
  } catch (error: any) {
    console.error('Personal color analysis error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error happened during personal color analysis.' },
      { status: 500 }
    )
  }
}
