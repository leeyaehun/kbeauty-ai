'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
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

const SKIN_TYPE_LABEL: Record<string, string> = {
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
  normal: 'Normal',
}

const CONCERN_LABEL: Record<string, string> = {
  acne: 'Acne',
  hyperpigmentation: 'Pigmentation',
  wrinkles: 'Fine Lines',
  pores: 'Pores',
  redness: 'Redness',
  dryness: 'Dryness',
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

export default function ResultsSavedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true

    async function loadResults() {
      const supabase = createClient()

      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (!isActive) {
          return
        }

        setUser(currentUser)

        let nextResult: AnalysisResult | null = null

        if (currentUser) {
          const [{ data: analysisData, error: analysisError }] = await Promise.all([
            supabase
              .from('analyses')
              .select('skin_type, scores, concerns')
              .eq('user_id', currentUser.id)
              .order('created_at', { ascending: false })
              .limit(1),
          ])

          if (analysisError) {
            throw new Error(analysisError.message)
          }

          nextResult = normalizeAnalysisResult(analysisData?.[0] ?? null)
        } else {
          nextResult = normalizeAnalysisResult(
            safeParse<Record<string, unknown> | null>(sessionStorage.getItem('analysisResult'), null)
          )
        }

        if (!isActive) {
          return
        }

        setAnalysisResult(nextResult)
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
            <p className="text-sm text-[var(--muted)]">Bringing back your skin snapshot.</p>
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
              : 'Analyze your skin once to unlock your latest result snapshot and product recommendations.'}
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
        <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
          <aside className="space-y-6">
            <div className="brand-card overflow-hidden p-8">
              <div className="mb-4 inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.14),rgba(246,222,177,0.34))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                Saved skin portrait
              </div>
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Your skin type</p>
              <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] text-[var(--ink)]">
                {SKIN_TYPE_LABEL[analysisResult.skin_type] || analysisResult.skin_type}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                Your latest saved result is ready. Open recommendations to browse the full category selection again.
              </p>
            </div>

            {analysisResult.concerns.length > 0 ? (
              <div className="brand-card p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Main concerns</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {analysisResult.concerns.map((concern) => (
                    <span
                      key={concern}
                      className="brand-chip px-4 py-2 text-sm font-medium"
                    >
                      {CONCERN_LABEL[concern] || concern}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <section className="space-y-6">
            <div className="brand-card p-7 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Glow metrics</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Your skin scoreboard</h2>
                </div>
                <div className="rounded-full bg-[#fff0f5] px-4 py-2 text-sm font-semibold text-[#c89b3c]">
                  Latest saved
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
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
              </div>
            </div>

            <div className="brand-card p-7 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Next step</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Build your routine</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Open recommendations to browse toner, serum, cream, cleanser, sun care, hair, and body categories with the full picker.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/recommend')}
                  className="brand-button-primary w-full py-4 font-semibold"
                >
                  Personalized Product Recommendations
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/analyze')}
                  className="brand-button-ghost w-full py-3 text-sm font-semibold"
                >
                  Analyze Again
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
