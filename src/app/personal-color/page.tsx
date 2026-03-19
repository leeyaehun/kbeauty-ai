'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import UpgradeModal from '@/components/UpgradeModal'
import { createClient } from '@/lib/supabase'

type ColorSwatch = {
  name: string
  hex: string
}

type MakeupCategoryKey = 'foundation' | 'lip' | 'blush' | 'eyeshadow'
type ProductLinkType = 'oliveyoung_global' | 'brand_site' | 'search'

type MakeupProduct = {
  brand: string
  name: string
  reason: string
  shade: string
  product_url: string
  link_type: ProductLinkType
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
  best_colors: ColorSwatch[]
  avoid_colors: ColorSwatch[]
  makeup_recommendations: {
    foundation: string
    lip: string
    blush: string
    eyeshadow: string
  }
  celebrity_examples: string[]
  product_recommendations: Record<MakeupCategoryKey, MakeupProductSection>
}

const SEASON_LABELS: Record<PersonalColorResult['season'], { title: string, className: string }> = {
  spring_warm: {
    title: 'SPRING WARM',
    className: 'bg-[#FFE4C4] text-[#8B4513]',
  },
  summer_cool: {
    title: 'SUMMER COOL',
    className: 'bg-[#E6E6FA] text-[#483D8B]',
  },
  autumn_warm: {
    title: 'AUTUMN WARM',
    className: 'bg-[#FFD700] text-[#8B6914]',
  },
  winter_cool: {
    title: 'WINTER COOL',
    className: 'bg-[#E0F0FF] text-[#1a3a5c]',
  },
}

const MAKEUP_TABS: Array<{ key: MakeupCategoryKey, label: string }> = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'lip', label: 'Lip' },
  { key: 'blush', label: 'Blush' },
  { key: 'eyeshadow', label: 'Eyeshadow' },
]

function buildOliveYoungSearchUrl(brand: string, name: string) {
  const url = new URL('https://global.oliveyoung.com/search')
  url.searchParams.set('query', `${brand} ${name}`.trim())
  return url.toString()
}

function getProductButtonMeta(linkType: ProductLinkType) {
  switch (linkType) {
    case 'oliveyoung_global':
      return {
        label: 'Shop on Olive Young Global',
        className: 'bg-[#1d8a5b] text-white hover:bg-[#176d48]',
      }
    case 'brand_site':
      return {
        label: 'Shop on Brand Site',
        className: 'bg-[#d94d82] text-white hover:bg-[#bf3b6f]',
      }
    default:
      return {
        label: 'Search on Olive Young',
        className: 'bg-[#eef2f7] text-[#516074] hover:bg-[#dfe6ef]',
      }
  }
}

export default function PersonalColorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PersonalColorResult | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [paramsReady, setParamsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<MakeupCategoryKey>('foundation')

  useEffect(() => {
    let isActive = true

    async function loadMembershipAccess() {
      const searchParams = new URLSearchParams(window.location.search)
      const requestedUpgrade = searchParams.get('upgrade') === '1'

      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          if (isActive) {
            setShowUpgrade(requestedUpgrade)
          }
          return
        }

        const { data: planData } = await supabase
          .from('user_plans')
          .select('plan')
          .eq('user_id', user.id)
          .single()

        console.log('Current plan:', planData?.plan)

        const hasMembership = planData?.plan === 'membership'

        if (isActive) {
          setShowUpgrade(requestedUpgrade && !hasMembership)
        }
      } catch {
        if (isActive) {
          setShowUpgrade(requestedUpgrade)
        }
      } finally {
        if (isActive) {
          setParamsReady(true)
        }
      }
    }

    loadMembershipAccess()

    return () => {
      isActive = false
    }
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

  const seasonMeta = result ? SEASON_LABELS[result.season] : null
  const activeRecommendation = useMemo(
    () => (result ? result.product_recommendations[activeTab] : null),
    [activeTab, result]
  )

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6">
        <div className="brand-card flex max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">Reading your color story</p>
            <p className="text-sm text-[var(--muted)]">Analyzing undertone, eye color, and hair harmony.</p>
          </div>
        </div>
      </main>
    )
  }

  if (showUpgrade) {
    return (
      <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
        <div className="brand-shell max-w-3xl">
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
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">K-Beauty AI</div>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Personal color is unavailable</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">{error}</p>
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
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="space-y-6">
            <div className="brand-card overflow-hidden p-8">
              <div className="mb-4 inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.14),rgba(246,222,177,0.34))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                Membership analysis
              </div>
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Your season</p>
              <div className={`mt-4 inline-flex rounded-full px-5 py-3 text-sm font-semibold tracking-[0.16em] ${seasonMeta.className}`}>
                {seasonMeta.title}
              </div>
              <div
                className={`mt-5 inline-flex rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.14em] ${
                  result.tone === 'warm'
                    ? 'border-[#CC5500] bg-[#FFF0E6] text-[#CC5500]'
                    : 'border-[#0055CC] bg-[#E6F0FF] text-[#0055CC]'
                }`}
              >
                {result.tone === 'warm' ? 'WARM TONE' : 'COOL TONE'}
              </div>
              <p className="mt-5 text-sm leading-7 text-[var(--muted)]">
                {result.description}
              </p>
            </div>

            <div className="brand-card p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Key characteristics</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {result.characteristics.map((item) => (
                  <span key={item} className="brand-chip px-4 py-2 text-sm font-medium">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="brand-card p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Celebrity inspiration</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {result.celebrity_examples.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,222,177,0.42))] px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-[0_12px_20px_rgba(149,64,109,0.06)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="brand-card p-7 md:p-8">
              <div className="border-b border-[rgba(148,163,184,0.18)] pb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Best colors</p>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {result.best_colors.map((color) => (
                  <div
                    key={`${color.name}-${color.hex}`}
                    className="rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,240,245,0.92))] p-4 shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
                  >
                    <div
                      className="h-14 w-14 rounded-full shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)]"
                      style={{ backgroundColor: color.hex }}
                    />
                    <p className="mt-3 text-sm font-semibold text-[var(--ink)]">{color.name}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="brand-card p-7 md:p-8">
              <div className="border-b border-[rgba(148,163,184,0.18)] pb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Colors to avoid</p>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {result.avoid_colors.map((color) => (
                  <div
                    key={`${color.name}-${color.hex}`}
                    className="rounded-[24px] border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.96))] p-4 shadow-[0_14px_24px_rgba(100,116,139,0.08)]"
                  >
                    <div
                      className="h-14 w-14 rounded-full shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)]"
                      style={{ backgroundColor: color.hex }}
                    />
                    <p className="mt-3 text-sm font-semibold text-[var(--ink)]">{color.name}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="brand-card p-7 md:p-8">
              <div className="border-b border-[rgba(148,163,184,0.18)] pb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Makeup recommendations</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {MAKEUP_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      activeTab === tab.key
                        ? 'bg-[#d94d82] text-white shadow-[0_12px_24px_rgba(217,77,130,0.22)]'
                        : 'border border-[rgba(255,107,157,0.16)] bg-white text-[#d94d82]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[#fff6fa] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">Tip</p>
                <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{activeRecommendation.tip}</p>
              </div>

              <div className="mt-5 grid gap-4">
                {activeRecommendation.products.map((product) => (
                  <div
                    key={`${activeTab}-${product.brand}-${product.name}-${product.shade}`}
                    className="rounded-[24px] border border-[rgba(255,107,157,0.16)] bg-white p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">{product.brand}</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--ink)]">{product.name}</h3>
                    <div className="mt-3 inline-flex rounded-full bg-[#fff0f5] px-3 py-1 text-xs font-semibold text-[#b83b73]">
                      {product.shade}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)] line-clamp-1">{product.reason}</p>
                    <a
                      href={product.product_url || buildOliveYoungSearchUrl(product.brand, product.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-5 inline-flex rounded-full px-5 py-3 text-center text-sm font-semibold transition-colors ${getProductButtonMeta(product.link_type).className}`}
                    >
                      {getProductButtonMeta(product.link_type).label}
                    </a>
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
