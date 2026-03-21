import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

import {
  type PersonalColorResultBase,
  generateProductRecommendations,
  loadMakeupProductLinks,
  resolveProductLinks,
} from '@/lib/personal-color-makeup'
import { createServerSupabaseClient } from '@/lib/supabase'

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return null
  }

  return new Anthropic({ apiKey })
}

function normalizePersonalColorResult(value: unknown): PersonalColorResultBase | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Record<string, unknown>
  const season = source.season
  const tone = source.tone

  if (
    (season !== 'spring_warm' && season !== 'summer_cool' && season !== 'autumn_warm' && season !== 'winter_cool') ||
    (tone !== 'warm' && tone !== 'cool')
  ) {
    return null
  }

  const toSwatchList = (input: unknown) =>
    Array.isArray(input)
      ? input
        .filter((item): item is { name: string, hex: string } => (
          Boolean(item) &&
          typeof item === 'object' &&
          'name' in item &&
          'hex' in item &&
          typeof item.name === 'string' &&
          typeof item.hex === 'string'
        ))
        .slice(0, 8)
      : []

  return {
    season,
    tone,
    description: typeof source.description === 'string' ? source.description : '',
    characteristics: Array.isArray(source.characteristics)
      ? source.characteristics.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [],
    best_colors: toSwatchList(source.best_colors),
    avoid_colors: toSwatchList(source.avoid_colors),
    makeup_recommendations: source.makeup_recommendations && typeof source.makeup_recommendations === 'object'
      ? {
        foundation: typeof (source.makeup_recommendations as Record<string, unknown>).foundation === 'string'
          ? (source.makeup_recommendations as Record<string, string>).foundation
          : '',
        lip: typeof (source.makeup_recommendations as Record<string, unknown>).lip === 'string'
          ? (source.makeup_recommendations as Record<string, string>).lip
          : '',
        blush: typeof (source.makeup_recommendations as Record<string, unknown>).blush === 'string'
          ? (source.makeup_recommendations as Record<string, string>).blush
          : '',
        eyeshadow: typeof (source.makeup_recommendations as Record<string, unknown>).eyeshadow === 'string'
          ? (source.makeup_recommendations as Record<string, string>).eyeshadow
          : '',
      }
      : {
        foundation: '',
        lip: '',
        blush: '',
        eyeshadow: '',
      },
    celebrity_examples: Array.isArray(source.celebrity_examples)
      ? source.celebrity_examples.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [],
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

    const { result } = await req.json()
    const normalizedResult = normalizePersonalColorResult(result)

    if (!normalizedResult) {
      return NextResponse.json({ error: 'Personal color result is missing.' }, { status: 400 })
    }

    let productRecommendations

    try {
      productRecommendations = await generateProductRecommendations(normalizedResult, getAnthropicClient())
    } catch (recommendationError) {
      console.error('Makeup recommendation error:', recommendationError)
      productRecommendations = await generateProductRecommendations(normalizedResult, null)
    }

    const { data: productRows, error: productLookupError } = await loadMakeupProductLinks(supabase)

    if (productLookupError) {
      throw new Error(`Failed to load makeup product links: ${(productLookupError as { message?: string }).message ?? 'Unknown error'}`)
    }

    const resolvedRecommendations = resolveProductLinks(productRecommendations, productRows ?? [])

    return NextResponse.json({
      product_recommendations: resolvedRecommendations,
    })
  } catch (error: any) {
    console.error('Personal color makeup error:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error happened during makeup recommendations.' },
      { status: 500 }
    )
  }
}
