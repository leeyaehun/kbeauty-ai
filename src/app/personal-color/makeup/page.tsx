'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type MakeupCategoryKey = 'foundation' | 'lip' | 'blush' | 'eyeshadow'
type ProductLinkType = 'oliveyoung_global' | 'brand_site' | 'search'
type PersonalColorSeason = 'spring_warm' | 'summer_cool' | 'autumn_warm' | 'winter_cool'

type PersonalColorSwatch = {
  name: string
  hex: string
}

type MakeupProduct = {
  brand: string
  image_url: string | null
  link_type: ProductLinkType
  name: string
  product_url: string
  reason: string
  shade: string
}

type MakeupProductSection = {
  tip: string
  products: MakeupProduct[]
}

type PersonalColorResult = {
  season: PersonalColorSeason
  tone: 'warm' | 'cool'
  description: string
  characteristics: string[]
  best_colors: PersonalColorSwatch[]
  avoid_colors: PersonalColorSwatch[]
  makeup_recommendations: {
    foundation: string
    lip: string
    blush: string
    eyeshadow: string
  }
  celebrity_examples: string[]
  product_recommendations?: Record<MakeupCategoryKey, MakeupProductSection>
}

const PERSONAL_COLOR_RESULT_KEY = 'personalColorResult'
const MAKEUP_TABS: Array<{ key: MakeupCategoryKey, label: string }> = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'lip', label: 'Lip' },
  { key: 'blush', label: 'Blush' },
  { key: 'eyeshadow', label: 'Eyeshadow' },
]

const SEASON_META: Record<PersonalColorSeason, { badgeClassName: string, title: string, description: string }> = {
  autumn_warm: {
    badgeClassName: 'bg-[#FFE8C2] text-[#8B6914]',
    description: 'Autumn Warm looks best in rich, earthy, and softly warm shades with natural depth.',
    title: 'AUTUMN WARM',
  },
  spring_warm: {
    badgeClassName: 'bg-[#FFE4C4] text-[#8B4513]',
    description: 'Spring Warm shines in bright, fresh, and golden shades that feel light and lively.',
    title: 'SPRING WARM',
  },
  summer_cool: {
    badgeClassName: 'bg-[#E6E6FA] text-[#483D8B]',
    description: 'Summer Cool suits soft, muted, and cool-toned colors that feel calm and elegant.',
    title: 'SUMMER COOL',
  },
  winter_cool: {
    badgeClassName: 'bg-[#E0F0FF] text-[#1A3A5C]',
    description: 'Winter Cool stands out in clear, cool, and high-contrast colors with crisp definition.',
    title: 'WINTER COOL',
  },
}

function getBrandInitial(brand: string | null | undefined) {
  const initial = brand?.trim().charAt(0)
  return initial ? initial.toUpperCase() : 'K'
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

function getProductButtonMeta(linkType: ProductLinkType) {
  switch (linkType) {
    case 'oliveyoung_global':
      return {
        className: 'bg-[#1a4660] text-white hover:bg-[#14354a]',
        label: 'Shop on Olive Young Global',
      }
    case 'brand_site':
      return {
        className: 'bg-[#9e5746] text-white hover:bg-[#824636]',
        label: 'Shop on Brand Site',
      }
    default:
      return {
        className: 'bg-[#edf1f5] text-[#445267] hover:bg-[#dce4ed]',
        label: 'Search on Olive Young',
      }
  }
}

function MakeupImage({
  brand,
  imageUrl,
  productName,
}: {
  brand: string
  imageUrl: string | null
  productName: string
}) {
  const [imageFailed, setImageFailed] = useState(false)

  if (!imageUrl || imageFailed) {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[24px] bg-gradient-to-br from-pink-300 to-pink-500 shadow-[0_12px_24px_rgba(149,64,109,0.12)]">
        <span className="text-3xl font-bold text-white">
          {getBrandInitial(brand)}
        </span>
      </div>
    )
  }

  return (
    <img
      src={imageUrl}
      alt={productName}
      className="h-24 w-24 shrink-0 rounded-[24px] object-cover shadow-[0_12px_24px_rgba(149,64,109,0.12)]"
      onError={() => setImageFailed(true)}
    />
  )
}

export default function PersonalColorMakeupPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<MakeupCategoryKey>('foundation')
  const [result, setResult] = useState<PersonalColorResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadResult() {
      const storedResult = safeParse<PersonalColorResult | null>(
        sessionStorage.getItem(PERSONAL_COLOR_RESULT_KEY),
        null
      )

      setResult(storedResult)
      setLoading(false)

      if (!storedResult || storedResult.product_recommendations) {
        return
      }

      setLoadingRecommendations(true)
      setError('')

      try {
        const response = await fetch('/api/personal-color/makeup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: storedResult }),
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load makeup recommendations.')
        }

        const nextResult = {
          ...storedResult,
          product_recommendations: data.product_recommendations,
        }

        sessionStorage.setItem(PERSONAL_COLOR_RESULT_KEY, JSON.stringify(nextResult))
        setResult(nextResult)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load makeup recommendations.')
      } finally {
        setLoadingRecommendations(false)
      }
    }

    void loadResult()
  }, [])

  const seasonMeta = result ? SEASON_META[result.season] : null
  const activeRecommendation = useMemo(
    () => (result?.product_recommendations ? result.product_recommendations[activeTab] : null),
    [activeTab, result]
  )

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6">
        <div className="brand-card flex max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d]" />
          <div>
            <p className="text-sm font-semibold text-[#7c5d67]">Loading your makeup picks</p>
            <p className="text-sm text-[var(--muted)]">Preparing your personal color matches.</p>
          </div>
        </div>
      </main>
    )
  }

  if (!result || !seasonMeta) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">K-Beauty AI</div>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Analyze personal color first</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            Start your personal color analysis before opening makeup recommendations.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push('/personal-color')}
              className="brand-button-primary px-8 py-4 font-semibold"
            >
              Go to Personal Color
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="brand-button-secondary px-8 py-4 font-semibold"
            >
              Back to Home
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell max-w-6xl">
        <section className="brand-card p-7 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className={`inline-flex rounded-full px-5 py-3 text-sm font-semibold tracking-[0.16em] ${seasonMeta.badgeClassName}`}>
                {seasonMeta.title}
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                Your Makeup Recommendations
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {seasonMeta.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/personal-color')}
              className="brand-button-secondary px-6 py-3 font-semibold"
            >
              Back to Personal Color
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-[34px] border border-white/70 bg-white/62 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl md:p-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Makeup Categories</p>
            <p className="mt-3 text-sm leading-7 text-[#5f4a61]">
              Browse your personal color makeup picks by category and open the product links directly.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {MAKEUP_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-[#2d1b2f] text-white shadow-[0_18px_32px_rgba(45,27,47,0.22)]'
                    : 'border border-white/70 bg-white/82 text-[#5a4a5d] shadow-[0_12px_24px_rgba(60,43,57,0.08)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingRecommendations ? (
            <div className="mt-6 rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,245,250,0.88))] p-8 text-center shadow-[0_18px_34px_rgba(60,43,57,0.08)]">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d]" />
              <p className="mt-4 text-sm font-semibold text-[#7c5d67]">Loading makeup recommendations</p>
              <p className="mt-2 text-sm text-[var(--muted)]">We already finished your personal color analysis. Makeup picks are loading now.</p>
            </div>
          ) : error ? (
            <div className="mt-6 rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,245,250,0.88))] p-8 text-center shadow-[0_18px_34px_rgba(60,43,57,0.08)]">
              <p className="text-sm font-semibold text-[#7c5d67]">Makeup recommendations are unavailable</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
            </div>
          ) : activeRecommendation ? (
            <>
              <div className="mt-6 rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,245,250,0.88))] p-5 shadow-[0_18px_34px_rgba(60,43,57,0.08)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Color direction</p>
                <p className="mt-3 text-sm leading-7 text-[#2d1b2f]">{activeRecommendation.tip}</p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {activeRecommendation.products.map((product) => {
                  const buttonMeta = getProductButtonMeta(product.link_type)

                  return (
                    <article
                      key={`${activeTab}-${product.brand}-${product.name}-${product.shade}`}
                      className="rounded-[30px] border border-white/70 bg-white/84 p-5 shadow-[0_18px_38px_rgba(60,43,57,0.08)]"
                    >
                      <div className="flex items-start gap-4">
                        <MakeupImage
                          brand={product.brand}
                          imageUrl={product.image_url}
                          productName={product.name}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="brand-chip px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">
                              {product.brand}
                            </span>
                            <span className="rounded-full bg-[#f7edf2] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b5061]">
                              {product.shade}
                            </span>
                          </div>

                          <h2 className="mt-3 text-lg font-semibold leading-snug tracking-[-0.03em] text-[var(--ink)] md:text-xl">
                            {product.name}
                          </h2>

                          <p className="mt-3 text-sm leading-7 text-[#5f4a61]">
                            {product.reason}
                          </p>
                        </div>
                      </div>

                      <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mt-5 inline-flex w-full justify-center rounded-full px-5 py-3 text-center text-sm font-semibold transition ${buttonMeta.className}`}
                      >
                        {buttonMeta.label}
                      </a>
                    </article>
                  )
                })}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  )
}
