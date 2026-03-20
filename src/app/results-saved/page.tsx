'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import ProductCard from '@/components/ProductCard'
import { getProductPricePresentation, type PriceCurrencyCode } from '@/lib/pricing'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

type ScoreSet = {
  hydration: number
  oiliness: number
  sensitivity: number
  pigmentation: number
}

type AnalysisResult = {
  concerns: string[]
  scores: ScoreSet
  skin_tone?: string
  skin_type: string
}

type RecommendedProduct = {
  affiliate_url: string | null
  brand: string
  category: string
  display_affiliate_url?: string | null
  display_button_label?: string
  display_price?: string | null
  explanation?: string
  global_affiliate_url: string | null
  id: string
  image_url: string | null
  name: string
  price: number | null
  similarity?: number | null
  currency_code?: PriceCurrencyCode
}

const SKIN_TYPE_LABEL: Record<string, string> = {
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
  normal: 'Normal',
}

const CATEGORY_LABELS: Record<string, string> = {
  Toner: 'Toner',
  Moisturizer: 'Moisturizer',
  Serum: 'Serum',
  Cream: 'Cream',
  'Face Mask': 'Face Mask',
  Cleanser: 'Cleanser',
  'Sun Care': 'Sun Care',
  Hair: 'Hair',
  Body: 'Body',
  moisturizer: 'Moisturizer',
  serum: 'Serum',
  cream: 'Cream',
  toner: 'Toner',
  cleanser: 'Cleanser',
  sun_care: 'Sun Care',
  mask: 'Face Mask',
  body_hair: 'Body & Hair',
}

function safeParse<T>(value: string | null, fallback: T) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(parsed)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeAnalysisResult(value: unknown): AnalysisResult | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Record<string, unknown>
  const scores = source.scores && typeof source.scores === 'object' ? source.scores as Record<string, unknown> : {}
  const skinType = typeof source.skin_type === 'string' ? source.skin_type : null

  if (!skinType) {
    return null
  }

  return {
    concerns: Array.isArray(source.concerns) ? source.concerns.filter((item): item is string => typeof item === 'string') : [],
    scores: {
      hydration: normalizeScore(scores.hydration),
      oiliness: normalizeScore(scores.oiliness),
      sensitivity: normalizeScore(scores.sensitivity),
      pigmentation: normalizeScore(scores.pigmentation),
    },
    skin_tone: typeof source.skin_tone === 'string' ? source.skin_tone : undefined,
    skin_type: skinType,
  }
}

function getDisplayPrice(product: RecommendedProduct) {
  return product.display_price ?? getProductPricePresentation(product.price, product.category).displayPrice
}

function withRegionAwareDisplay(product: RecommendedProduct, region: ShoppingRegion) {
  if (region === 'global') {
    return {
      ...product,
      display_affiliate_url: product.global_affiliate_url ?? product.affiliate_url,
      display_button_label: 'Shop on Olive Young Global',
    }
  }

  return {
    ...product,
    display_affiliate_url: product.affiliate_url,
    display_button_label: 'Shop on Olive Young Korea',
  }
}

function getDisplayMatchScore(similarity: number | null | undefined) {
  return similarity ? Math.round(similarity * 100) : 60
}

async function fetchRecommendations(analysisResult: AnalysisResult, region: ShoppingRegion) {
  const response = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysisResult, region }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load recommendations.')
  }

  return ((data.products ?? []) as RecommendedProduct[])
    .map((product) => withRegionAwareDisplay(product, region))
    .filter((product) => Boolean(product.display_affiliate_url))
}

export default function ResultsSavedPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [region, setRegion] = useState<ShoppingRegion>('korea')
  const [loading, setLoading] = useState(true)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [products, setProducts] = useState<RecommendedProduct[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true

    async function loadResults() {
      const supabase = createClient()
      const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)
      const nextRegion = isShoppingRegion(storedRegion) ? storedRegion : 'korea'

      setRegion(nextRegion)

      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (!isActive) {
          return
        }

        setUser(currentUser)

        let nextResult: AnalysisResult | null = null

        if (currentUser) {
          const { data, error: analysisError } = await supabase
            .from('analyses')
            .select('skin_type, scores, concerns')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1)

          if (analysisError) {
            throw new Error(analysisError.message)
          }

          nextResult = normalizeAnalysisResult(data?.[0] ?? null)
        } else {
          nextResult = normalizeAnalysisResult(
            safeParse<Record<string, unknown> | null>(sessionStorage.getItem('analysisResult'), null)
          )
        }

        if (!isActive) {
          return
        }

        setAnalysisResult(nextResult)

        if (!nextResult) {
          setProducts([])
          setLoading(false)
          return
        }

        const nextProducts = await fetchRecommendations(nextResult, nextRegion)

        if (!isActive) {
          return
        }

        setProducts(nextProducts)
      } catch (loadError) {
        if (!isActive) {
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load saved results.')
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    void loadResults()

    return () => {
      isActive = false
    }
  }, [])

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card flex items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/50 border-t-[#ff6b9d]" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">Loading your latest results</p>
            <p className="text-sm text-[var(--muted)]">Bringing back your skin snapshot and picks.</p>
          </div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card max-w-lg p-8 text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Results are unavailable</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/analyze')}
            className="brand-button-primary mt-8 px-8 py-4 font-semibold"
          >
            Analyze My Skin Now
          </button>
        </div>
      </main>
    )
  }

  if (!analysisResult) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card max-w-xl p-10 text-center">
          <div className="brand-chip mx-auto inline-flex px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            Saved results
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">No analysis yet</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            {user
              ? 'Run your first analysis to see your saved skin results here.'
              : 'Analyze your skin once to unlock your latest result snapshot and product picks.'}
          </p>
          <button
            type="button"
            onClick={() => router.push('/analyze')}
            className="brand-button-primary mt-8 w-full py-4 text-lg font-semibold"
          >
            Analyze My Skin Now
          </button>
        </div>
      </main>
    )
  }

  const scores = [
    { label: 'Hydration', value: analysisResult.scores.hydration, color: '#60a5fa', glow: 'from-[#cfe6ff] to-[#ffffff]' },
    { label: 'Oil Level', value: analysisResult.scores.oiliness, color: '#e7b300', glow: 'from-[#fff0be] to-[#ffffff]' },
    { label: 'Sensitivity', value: analysisResult.scores.sensitivity, color: '#f87171', glow: 'from-[#ffd8d8] to-[#ffffff]' },
    { label: 'Pigmentation', value: analysisResult.scores.pigmentation, color: '#c084fc', glow: 'from-[#f1e2ff] to-[#ffffff]' },
  ]

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Latest saved result
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              {SKIN_TYPE_LABEL[analysisResult.skin_type] || analysisResult.skin_type}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              Your latest skin snapshot and personalized product matches.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/analyze')}
            className="brand-button-ghost px-5 py-3 text-sm font-semibold"
          >
            Analyze Again
          </button>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {scores.map((score) => (
            <div
              key={score.label}
              className={`rounded-[26px] border border-[rgba(255,107,157,0.14)] bg-gradient-to-br ${score.glow} p-5 shadow-[0_18px_30px_rgba(149,64,109,0.08)]`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--muted-strong)]">{score.label}</p>
                <p className="text-2xl font-semibold" style={{ color: score.color }}>{score.value}</p>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${score.value}%`, backgroundColor: score.color }}
                />
              </div>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Recommended next</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                Personalized product picks
              </h2>
            </div>
            <div className="rounded-full border border-[rgba(200,155,60,0.24)] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(246,222,177,0.45))] px-5 py-3 text-sm font-semibold text-[#c89b3c] shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
              {products.length} picks
            </div>
          </div>

          {products.length === 0 ? (
            <div className="brand-card p-8 text-center">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                No recommendations yet
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Your saved result is ready, but product matches are not available right now.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  brand={product.brand}
                  categoryLabel={CATEGORY_LABELS[product.category] || product.category}
                  displayAffiliateUrl={product.display_affiliate_url}
                  displayButtonLabel={product.display_button_label}
                  displayPrice={getDisplayPrice(product)}
                  explanation={product.explanation || 'Balanced to support your current skin profile.'}
                  imageUrl={product.image_url}
                  matchScore={getDisplayMatchScore(product.similarity)}
                  name={product.name}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
