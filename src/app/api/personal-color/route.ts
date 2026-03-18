import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

import { createServerSupabaseClient } from '@/lib/supabase'

const MAKEUP_CATEGORY_LABELS = {
  foundation: '파운데이션',
  lip: '립',
  blush: '블러셔',
  eyeshadow: '아이섀도',
} as const

const GLOBAL_MAKEUP_BRANDS = [
  'Laneige',
  'Innisfree',
  'Etude',
  'Missha',
  'The Face Shop',
  'Clio',
  'Rom&nd',
  'Peripera',
  'Hera',
  'Espoir',
  'Amuse',
  'Holika Holika',
] as const

type MakeupCategoryKey = keyof typeof MAKEUP_CATEGORY_LABELS

type ColorSwatch = {
  name: string
  hex: string
}

type ProductRecommendation = {
  brand: string
  name: string
  reason: string
  olive_young_url: string
}

type ProductRecommendationSection = {
  tip: string
  recommended_products: ProductRecommendation[]
}

type PersonalColorResult = {
  season: 'spring_warm' | 'summer_cool' | 'autumn_warm' | 'winter_cool'
  tone: 'warm' | 'cool'
  description: string
  characteristics: string[]
  best_colors: ColorSwatch[]
  avoid_colors: ColorSwatch[]
  makeup_recommendations: Record<MakeupCategoryKey, string>
  celebrity_examples: string[]
  product_recommendations: Record<MakeupCategoryKey, ProductRecommendationSection>
}

type ProductRow = {
  brand: string | null
  name: string | null
  category: string | null
  global_affiliate_url: string | null
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

function normalizeColorList(value: unknown, fallback: ColorSwatch[]) {
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

function buildGlobalSearchUrl(brand: string, name: string) {
  const url = new URL('https://global.oliveyoung.com/search')
  url.searchParams.set('query', `${brand} ${name}`.trim())
  return url.toString()
}

function isGlobalMakeupBrand(brand: string | null) {
  if (!brand) {
    return false
  }

  const normalizedBrand = brand.toLowerCase()
  return GLOBAL_MAKEUP_BRANDS.some((candidate) => normalizedBrand.includes(candidate.toLowerCase()))
}

function categoryKeyFromValue(category: string | null): MakeupCategoryKey | null {
  return (Object.entries(MAKEUP_CATEGORY_LABELS).find(([, value]) => value === category)?.[0] as MakeupCategoryKey | undefined) ?? null
}

function defaultProductRecommendations(makeupRecommendations: Record<MakeupCategoryKey, string>): Record<MakeupCategoryKey, ProductRecommendationSection> {
  return {
    foundation: {
      tip: makeupRecommendations.foundation,
      recommended_products: [],
    },
    lip: {
      tip: makeupRecommendations.lip,
      recommended_products: [],
    },
    blush: {
      tip: makeupRecommendations.blush,
      recommended_products: [],
    },
    eyeshadow: {
      tip: makeupRecommendations.eyeshadow,
      recommended_products: [],
    },
  }
}

function normalizeProductRecommendations(
  value: unknown,
  makeupRecommendations: Record<MakeupCategoryKey, string>
): Record<MakeupCategoryKey, ProductRecommendationSection> {
  const source = value && typeof value === 'object'
    ? value as Partial<Record<MakeupCategoryKey, unknown>>
    : {}

  const defaults = defaultProductRecommendations(makeupRecommendations)

  for (const categoryKey of Object.keys(MAKEUP_CATEGORY_LABELS) as MakeupCategoryKey[]) {
    const section = source[categoryKey]

    if (!section || typeof section !== 'object') {
      continue
    }

    const parsedSection = section as Record<string, unknown>
    const recommendedProducts = Array.isArray(parsedSection.recommended_products)
      ? parsedSection.recommended_products
          .filter((item) => item && typeof item === 'object')
          .map((item) => {
            const entry = item as Record<string, unknown>
            const brand = typeof entry.brand === 'string' ? entry.brand : 'K-Beauty Pick'
            const name = typeof entry.name === 'string' ? entry.name : 'Signature Match'

            return {
              brand,
              name,
              reason: typeof entry.reason === 'string'
                ? entry.reason
                : `A strong ${categoryKey} match for your personal coloring.`,
              olive_young_url: typeof entry.olive_young_url === 'string'
                ? entry.olive_young_url
                : buildGlobalSearchUrl(brand, name),
            }
          })
          .slice(0, 3)
      : []

    defaults[categoryKey] = {
      tip: typeof parsedSection.tip === 'string'
        ? parsedSection.tip
        : makeupRecommendations[categoryKey],
      recommended_products: recommendedProducts,
    }
  }

  return defaults
}

function normalizePersonalColorResult(parsed: any): PersonalColorResult {
  const season = normalizeSeason(parsed?.season)
  const makeupRecommendations = {
    foundation: typeof parsed?.makeup_recommendations?.foundation === 'string'
      ? parsed.makeup_recommendations.foundation
      : 'Choose undertone-matched base shades that keep your complexion balanced.',
    lip: typeof parsed?.makeup_recommendations?.lip === 'string'
      ? parsed.makeup_recommendations.lip
      : 'Use lip shades that repeat the warmth or coolness in your natural coloring.',
    blush: typeof parsed?.makeup_recommendations?.blush === 'string'
      ? parsed.makeup_recommendations.blush
      : 'Pick blush tones that echo your natural undertone and keep the face lively.',
    eyeshadow: typeof parsed?.makeup_recommendations?.eyeshadow === 'string'
      ? parsed.makeup_recommendations.eyeshadow
      : 'Stay with eye tones that harmonize with your chroma and depth.',
  }

  return {
    season,
    tone: normalizeTone(parsed?.tone, season),
    description: typeof parsed?.description === 'string'
      ? parsed.description
      : 'Your coloring appears balanced with a naturally harmonious palette.',
    characteristics: normalizeStringList(parsed?.characteristics),
    best_colors: normalizeColorList(parsed?.best_colors, [
      { name: 'Coral', hex: '#FF7F6E' },
      { name: 'Peach', hex: '#FFB38A' },
      { name: 'Golden Yellow', hex: '#F5C451' },
    ]),
    avoid_colors: normalizeColorList(parsed?.avoid_colors, [
      { name: 'Cool Gray', hex: '#94A3B8' },
      { name: 'Icy Blue', hex: '#C7E7FF' },
    ]),
    makeup_recommendations: makeupRecommendations,
    celebrity_examples: normalizeStringList(parsed?.celebrity_examples),
    product_recommendations: normalizeProductRecommendations(parsed?.product_recommendations, makeupRecommendations),
  }
}

function mergeSupabaseRecommendations(
  products: ProductRow[],
  base: Record<MakeupCategoryKey, ProductRecommendationSection>,
  tone: PersonalColorResult['tone']
) {
  const merged = structuredClone(base)

  for (const product of products) {
    if (!product.brand || !product.name || !isGlobalMakeupBrand(product.brand)) {
      continue
    }

    const categoryKey = categoryKeyFromValue(product.category)

    if (!categoryKey || merged[categoryKey].recommended_products.length >= 3) {
      continue
    }

    merged[categoryKey].recommended_products.push({
      brand: product.brand,
      name: product.name,
      reason: `A globally popular K-beauty ${categoryKey} option that suits a ${tone} personal color direction.`,
      olive_young_url: product.global_affiliate_url ?? buildGlobalSearchUrl(product.brand, product.name),
    })
  }

  return merged
}

function buildStaticFallbackRecommendations(
  base: Record<MakeupCategoryKey, ProductRecommendationSection>,
  tone: PersonalColorResult['tone']
) {
  const presets: Record<MakeupCategoryKey, Array<{ brand: string, name: string, reason: string }>> = tone === 'cool'
    ? {
        foundation: [
          { brand: 'Missha', name: 'M Perfect Cover BB Cream No.21', reason: 'A softer cool-beige base that flatters cool undertones.' },
          { brand: 'Etude', name: 'Double Lasting Foundation Vanilla', reason: 'A light, balanced tone that keeps cool skin clear.' },
        ],
        lip: [
          { brand: 'Rom&nd', name: 'Blur Fudge Tint 10 Raisin Fig', reason: 'A muted berry tone that complements cool coloring.' },
          { brand: 'CLIO', name: 'Devil Lip Lacquer 006', reason: 'A deeper cool red that sharpens cool-toned contrast.' },
        ],
        blush: [
          { brand: 'Peripera', name: 'Pure Blushed Sunshine Cheek Calm Pink', reason: 'A soft pink flush that stays cool and clean.' },
          { brand: 'Etude', name: 'Heart Pop Blusher Lavender Pink', reason: 'A light pink-lilac blush for cool softness.' },
        ],
        eyeshadow: [
          { brand: 'CLIO', name: 'Pro Eye Palette Atelier in Hannam', reason: 'A wearable neutral-cool palette for refined definition.' },
          { brand: 'Rom&nd', name: 'Better Than Palette Dusty Fog Garden', reason: 'Muted cool browns and taupes suit cool undertones.' },
        ],
      }
    : {
        foundation: [
          { brand: 'Missha', name: 'M Perfect Cover BB Cream No.23', reason: 'A warm-beige base that keeps warm skin natural and even.' },
          { brand: 'Etude', name: 'Double Lasting Foundation Sand', reason: 'A soft warm tone that harmonizes with golden undertones.' },
        ],
        lip: [
          { brand: 'Rom&nd', name: 'Juicy Lasting Tint 07 Jujube', reason: 'A warm rose-coral that brightens warm complexions.' },
          { brand: 'Laneige', name: 'Lip Glowy Balm Grapefruit', reason: 'A fresh warm coral tint that keeps the lips lively.' },
        ],
        blush: [
          { brand: 'Peripera', name: 'Pure Blushed Sunshine Cheek Milk Tea Coral', reason: 'A peachy flush that flatters warm undertones.' },
          { brand: 'Etude', name: 'Heart Pop Blusher Apricot Peach', reason: 'A gentle apricot tone that keeps warmth soft and fresh.' },
        ],
        eyeshadow: [
          { brand: 'CLIO', name: 'Pro Eye Palette Coral Studio', reason: 'Warm coral and brown tones suit warm seasons well.' },
          { brand: 'Innisfree', name: 'My Palette Warm Brown Edit', reason: 'A wearable warm-brown family that enhances golden undertones.' },
        ],
      }

  const merged = structuredClone(base)

  for (const categoryKey of Object.keys(MAKEUP_CATEGORY_LABELS) as MakeupCategoryKey[]) {
    if (merged[categoryKey].recommended_products.length > 0) {
      continue
    }

    merged[categoryKey].recommended_products = presets[categoryKey].map((product) => ({
      ...product,
      olive_young_url: buildGlobalSearchUrl(product.brand, product.name),
    }))
  }

  return merged
}

async function generateClaudeRecommendations(
  result: PersonalColorResult,
  missingCategories: MakeupCategoryKey[]
) {
  const anthropic = getAnthropicClient()

  if (!anthropic || missingCategories.length === 0) {
    return null
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 900,
    messages: [
      {
        role: 'user',
        content: `You are a K-beauty makeup artist. Based on this personal color result, return ONLY JSON with keys for these categories: ${missingCategories.join(', ')}.

Season: ${result.season}
Tone: ${result.tone}
Description: ${result.description}
Best colors: ${result.best_colors.map((color) => `${color.name} (${color.hex})`).join(', ')}
Avoid colors: ${result.avoid_colors.map((color) => `${color.name} (${color.hex})`).join(', ')}

For each requested category, return:
{
  "tip": "one sentence",
  "recommended_products": [
    { "brand": "Brand", "name": "Product name", "reason": "Why it fits" }
  ]
}

Use globally known K-beauty brands when possible. Include up to 2 products per category.`
      }
    ]
  })

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
  return parseJsonObject(text) as Partial<Record<MakeupCategoryKey, ProductRecommendationSection>>
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
          content: `You are a professional personal color analyst. Analyze the skin undertone, eye color, and hair color in the image to determine the seasonal color type (Spring Warm, Summer Cool, Autumn Warm, Winter Cool). Return ONLY JSON.

Important: Focus on bone structure, vein color on wrist area if visible, and overall undertone rather than surface skin color which can be affected by lighting.

You are analyzing people of ALL ethnicities and skin tones — Asian, Black, White, Hispanic, Middle Eastern, and mixed heritage.

Personal color analysis works for everyone regardless of skin tone. Focus exclusively on:

1. Undertone (warm yellow/golden vs cool pink/blue)
2. Value (light, medium, deep)
3. Chroma (bright/clear vs muted/soft)

Do NOT assume ethnicity or default to any racial group. Analyze only what you see in the image. If lighting makes analysis uncertain, ask the user to retake in natural daylight rather than guessing.`
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
    { "name": "Coral", "hex": "#FF6B6B" }
  ],
  "avoid_colors": [
    { "name": "Icy Blue", "hex": "#A8D8EA" }
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
    let normalizedResult = normalizePersonalColorResult(parsed)

    const { data: products } = await supabase
      .from('products')
      .select('brand, name, category, global_affiliate_url')
      .in('category', Object.values(MAKEUP_CATEGORY_LABELS))

    let productRecommendations = mergeSupabaseRecommendations(
      (products ?? []) as ProductRow[],
      normalizedResult.product_recommendations,
      normalizedResult.tone
    )

    const missingCategories = (Object.keys(MAKEUP_CATEGORY_LABELS) as MakeupCategoryKey[]).filter(
      (categoryKey) => productRecommendations[categoryKey].recommended_products.length === 0
    )

    if (missingCategories.length > 0) {
      try {
        const claudeRecommendations = await generateClaudeRecommendations(normalizedResult, missingCategories)
        if (claudeRecommendations) {
          const normalizedClaudeRecommendations = normalizeProductRecommendations(
            claudeRecommendations,
            normalizedResult.makeup_recommendations
          )

          for (const categoryKey of missingCategories) {
            productRecommendations[categoryKey] = normalizedClaudeRecommendations[categoryKey]
          }
        }
      } catch (fallbackError) {
        console.error('Claude product fallback error:', fallbackError)
      }
    }

    productRecommendations = buildStaticFallbackRecommendations(productRecommendations, normalizedResult.tone)

    normalizedResult = {
      ...normalizedResult,
      product_recommendations: productRecommendations,
    }

    return NextResponse.json(normalizedResult)
  } catch (error: any) {
    console.error('Personal color analysis error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error happened during personal color analysis.' },
      { status: 500 }
    )
  }
}
