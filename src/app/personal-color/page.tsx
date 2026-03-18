'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import UpgradeModal from '@/components/UpgradeModal'

type ColorSwatch = {
  name: string
  hex: string
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
}

const SEASON_LABELS: Record<PersonalColorResult['season'], { emoji: string, title: string }> = {
  spring_warm: { emoji: '🌸', title: 'Spring Warm' },
  summer_cool: { emoji: '🫧', title: 'Summer Cool' },
  autumn_warm: { emoji: '🍂', title: 'Autumn Warm' },
  winter_cool: { emoji: '❄️', title: 'Winter Cool' },
}

export default function PersonalColorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PersonalColorResult | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [paramsReady, setParamsReady] = useState(false)

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

  const seasonMeta = result ? SEASON_LABELS[result.season] : null

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6">
        <div className="brand-card flex max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">Reading your color story ✨</p>
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

  if (!result || !seasonMeta) {
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
                Pro analysis
              </div>
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Your season</p>
              <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] text-[var(--ink)]">
                {seasonMeta.emoji} {seasonMeta.title}
              </h1>
              <div className="mt-5 inline-flex rounded-full border border-[rgba(255,107,157,0.14)] bg-[#fff0f5] px-4 py-2 text-sm font-semibold text-[#c89b3c]">
                {result.tone === 'warm' ? 'Warm Tone' : 'Cool Tone'}
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Best colors</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Colors to avoid</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Makeup recommendations</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] bg-[#fff0f5] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">Foundation</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{result.makeup_recommendations.foundation}</p>
                </div>
                <div className="rounded-[24px] bg-white p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">Lip</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{result.makeup_recommendations.lip}</p>
                </div>
                <div className="rounded-[24px] bg-white p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">Blush</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{result.makeup_recommendations.blush}</p>
                </div>
                <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,222,177,0.45))] p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c89b3c]">Eyeshadow</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{result.makeup_recommendations.eyeshadow}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
