'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import UpgradeModal from '@/components/UpgradeModal'

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
  makeup_recommendations: {
    foundation: string
    lip: string
    blush: string
    eyeshadow: string
  }
  celebrity_examples: string[]
  product_recommendations: {
    foundation: ProductRecommendationSection
    lip: ProductRecommendationSection
    blush: ProductRecommendationSection
    eyeshadow: ProductRecommendationSection
  }
}

type MakeupTabKey = keyof PersonalColorResult['product_recommendations']

const SEASON_STYLES: Record<PersonalColorResult['season'], { label: string, badgeClass: string }> = {
  spring_warm: {
    label: 'Spring Warm',
    badgeClass: 'bg-[linear-gradient(135deg,rgba(255,182,193,0.62),rgba(255,240,245,0.94))] text-[#c25174]',
  },
  summer_cool: {
    label: 'Summer Cool',
    badgeClass: 'bg-[linear-gradient(135deg,rgba(221,232,255,0.72),rgba(255,255,255,0.96))] text-[#5778b8]',
  },
  autumn_warm: {
    label: 'Autumn Warm',
    badgeClass: 'bg-[linear-gradient(135deg,rgba(245,197,129,0.74),rgba(255,245,228,0.96))] text-[#a9602d]',
  },
  winter_cool: {
    label: 'Winter Cool',
    badgeClass: 'bg-[linear-gradient(135deg,rgba(209,221,255,0.74),rgba(255,255,255,0.96))] text-[#4c5d8f]',
  },
}

const MAKEUP_TABS: Array<{ key: MakeupTabKey, label: string }> = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'lip', label: 'Lip' },
  { key: 'blush', label: 'Blush' },
  { key: 'eyeshadow', label: 'Eyeshadow' },
]

export default function PersonalColorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PersonalColorResult | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [paramsReady, setParamsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<MakeupTabKey>('foundation')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    setShowUpgrade(searchParams.get('upgrade') === '1')
    setParamsReady(true)
  }, [])

  useEffect(() => {
    if (!paramsReady) {
      return
    }

    if (showUpgrade) {
      setLoading(false)
      return
    }

    async function analyzePersonalColor() {
      const imageData = sessionStorage.getItem('capturedImage')

      if (!imageData) {
        router.push('/analyze')
        return
      }

      try {
        const res = await fetch('/api/personal-color', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: imageData }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Personal color analysis failed.')
          return
        }

        setResult(data)
      } catch {
        setError('A network error occurred while analyzing your personal color.')
      } finally {
        setLoading(false)
      }
    }

    analyzePersonalColor()
  }, [paramsReady, router, showUpgrade])

  const seasonMeta = useMemo(() => (result ? SEASON_STYLES[result.season] : null), [result])
  const activeRecommendation = result ? result.product_recommendations[activeTab] : null

  if (loading) {
    return (
      <main className="brand-page flex min-h-screen overflow-y-auto px-6 pb-24 pt-8">
        <div className="brand-card mx-auto flex w-full max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d] animate-spin" />
          <div className="min-w-0 break-words">
            <p className="break-words text-sm font-semibold text-[#d94d82]">Reading your color story</p>
            <p className="break-words text-sm text-[var(--muted)]">Analyzing undertone, eye color, and hair harmony.</p>
          </div>
        </div>
      </main>
    )
  }

  if (showUpgrade) {
    return (
      <main className="brand-page brand-grid min-h-screen overflow-y-auto px-6 pb-24 pt-8 md:px-8 md:py-10">
        <div className="brand-shell max-w-3xl break-words">
          <div className="mb-8 flex justify-center md:justify-start">
            <div className="brand-mark">K-Beauty AI</div>
          </div>
          <UpgradeModal inline />
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="brand-page flex min-h-screen overflow-y-auto px-6 pb-24 pt-10">
        <div className="brand-card mx-auto w-full max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">K-Beauty AI</div>
          <h1 className="mt-6 break-words text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Personal color is unavailable</h1>
          <p className="mt-4 break-words text-base leading-7 text-[var(--muted)]">{error}</p>
          <button
            onClick={() => router.push('/results')}
            className="brand-button-primary mt-8 px-8 py-4 font-semibold"
          >
            Back to Results
          </button>
        </div>
      </main>
    )
  }

  if (!result || !seasonMeta || !activeRecommendation) {
    return null
  }

  return (
    <main className="brand-page brand-grid min-h-screen overflow-y-auto px-6 pb-24 pt-8 md:px-8 md:py-10">
      <div className="brand-shell min-w-0 break-words">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="space-y-6">
            <div className="brand-card min-w-0 overflow-hidden p-8">
              <div className="mb-4 inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.14),rgba(246,222,177,0.34))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                Pro analysis
              </div>
              <p className="break-words text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Your season</p>
              <div className={`mt-4 inline-flex rounded-full px-5 py-3 text-base font-semibold ${seasonMeta.badgeClass}`}>
                {seasonMeta.label}
              </div>
              <div className="mt-4 inline-flex rounded-full border border-[rgba(255,107,157,0.14)] bg-[#fff0f5] px-4 py-2 text-sm font-semibold text-[#c89b3c]">
                {result.tone === 'warm' ? 'Warm Tone' : 'Cool Tone'}
              </div>
              <p className="mt-5 break-words text-sm leading-7 text-[var(--muted)]">
                {result.description}
              </p>
              <p className="mt-5 break-words rounded-[22px] border border-[rgba(200,155,60,0.18)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,222,177,0.34))] px-5 py-4 text-sm leading-6 text-[var(--muted-strong)]">
                For best results, take your photo in natural daylight.
              </p>
            </div>

            <div className="brand-card min-w-0 p-7">
              <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Key characteristics</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {result.characteristics.map((item) => (
                  <span key={item} className="brand-chip break-words px-4 py-2 text-sm font-medium">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="brand-card min-w-0 p-7">
              <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Celebrity inspiration</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {result.celebrity_examples.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,222,177,0.42))] px-4 py-2 text-sm font-semibold text-[var(--ink)] break-words shadow-[0_12px_20px_rgba(149,64,109,0.06)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="brand-card min-w-0 p-7 md:p-8">
              <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Best colors</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {result.best_colors.map((color) => (
                  <div
                    key={`${color.name}-${color.hex}`}
                    className="w-[calc(20%-0.6rem)] min-w-[56px] max-w-[72px] flex-1 rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,240,245,0.92))] p-3 text-center shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
                  >
                    <div
                      className="mx-auto h-12 w-12 rounded-full shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)] sm:h-14 sm:w-14"
                      style={{ backgroundColor: color.hex }}
                    />
                    <p className="mt-3 break-words text-xs font-semibold text-[var(--ink)] sm:text-sm">{color.name}</p>
                    <p className="mt-1 break-all text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)] sm:text-xs">{color.hex}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="brand-card min-w-0 p-7 md:p-8">
              <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Colors to avoid</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {result.avoid_colors.map((color) => (
                  <div
                    key={`${color.name}-${color.hex}`}
                    className="w-[calc(20%-0.6rem)] min-w-[56px] max-w-[72px] flex-1 rounded-[24px] border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.96))] p-3 text-center shadow-[0_14px_24px_rgba(100,116,139,0.08)]"
                  >
                    <div
                      className="mx-auto h-12 w-12 rounded-full shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)] sm:h-14 sm:w-14"
                      style={{ backgroundColor: color.hex }}
                    />
                    <p className="mt-3 break-words text-xs font-semibold text-[var(--ink)] sm:text-sm">{color.name}</p>
                    <p className="mt-1 break-all text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)] sm:text-xs">{color.hex}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="brand-card min-w-0 p-7 md:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">K-beauty picks</p>
                  <h2 className="mt-2 break-words text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                    Makeup recommendations
                  </h2>
                </div>
              </div>

              <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
                {MAKEUP_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all ${
                      activeTab === tab.key
                        ? 'brand-button-primary'
                        : 'brand-button-secondary'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,240,245,0.92))] p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
                <p className="break-words text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">Category tip</p>
                <p className="mt-3 break-words text-sm leading-7 text-[var(--ink)]">{activeRecommendation.tip}</p>
              </div>

              <div className="mt-5 grid gap-4">
                {activeRecommendation.recommended_products.map((product) => (
                  <div
                    key={`${product.brand}-${product.name}`}
                    className="w-full max-w-full min-w-0 rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-white/95 p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">{product.brand}</p>
                        <h3 className="mt-2 line-clamp-2 break-words text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">{product.name}</h3>
                        <p className="mt-3 line-clamp-2 break-words text-sm leading-7 text-[var(--muted)]">{product.reason}</p>
                      </div>
                      <a
                        href={product.olive_young_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="brand-button-secondary w-full shrink-0 px-5 py-3 text-center font-semibold md:w-auto"
                      >
                        Search on Olive Young Global
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
