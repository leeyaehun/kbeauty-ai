'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import UpgradeModal from '@/components/UpgradeModal'

const ANALYZE_TIMEOUT_MS = 30_000
const ANALYZE_MAX_RETRIES = 1

const SKIN_TYPE_KO: Record<string, string> = {
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
  normal: 'Normal',
}

const CONCERN_KO: Record<string, string> = {
  acne: 'Acne',
  hyperpigmentation: 'Pigmentation',
  wrinkles: 'Fine Lines',
  pores: 'Pores',
  redness: 'Redness',
  dryness: 'Dryness',
}

type AnalysisResult = {
  skin_type: string
  scores: {
    hydration: number
    oiliness: number
    sensitivity: number
    pigmentation: number
  }
  concerns: string[]
  skin_tone: string
  confidence: number
}

function safeParseSessionStorage<T>(key: string, fallback: T) {
  const value = sessionStorage.getItem(key)

  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function parseJsonResponse(response: Response) {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function getAnalyzeErrorMessage(error: unknown, status?: number) {
  if (error === 'no_face') {
    return 'No face detected. Please retake your photo.'
  }

  if (typeof error === 'string') {
    return error
  }

  return `The analysis request failed. (HTTP ${status})`
}

async function fetchAnalyzeWithRetry(imageBase64: string, surveyAnswers: Record<string, number>) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= ANALYZE_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          surveyAnswers,
        }),
        signal: controller.signal,
      })

      const data = await parseJsonResponse(response)

      if (!response.ok) {
        const message = getAnalyzeErrorMessage(data.error, response.status)

        if (attempt < ANALYZE_MAX_RETRIES && response.status >= 500) {
          lastError = new Error(message)
          continue
        }

        throw new Error(message)
      }

      if (data?.error === 'no_face') {
        throw new Error(getAnalyzeErrorMessage(data.error, response.status))
      }

      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.'
      const normalizedError =
        error instanceof DOMException && error.name === 'AbortError'
          ? new Error('The analysis request did not finish within 30 seconds. Please check your connection and try again.')
          : new Error(message)

      lastError = normalizedError

      if (attempt < ANALYZE_MAX_RETRIES) {
        continue
      }
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  throw lastError ?? new Error('Skin analysis failed.')
}

export default function ResultsPage() {
  const router = useRouter()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isProUser, setIsProUser] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    async function analyze() {
      const imageData = sessionStorage.getItem('capturedImage')
      const surveyAnswers = safeParseSessionStorage<Record<string, number>>('surveyAnswers', {})

      if (!imageData) {
        setError('Your selfie wasn’t saved. Please head back to the camera and try again.')
        setLoading(false)
        return
      }

      try {
        const data = await fetchAnalyzeWithRetry(imageData, surveyAnswers)

        setResult(data)
        sessionStorage.setItem('analysisResult', JSON.stringify(data))

        try {
          const { createClient } = await import('@/lib/supabase')
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()

          setIsSignedIn(Boolean(user))
          setIsProUser(false)

          if (user) {
            const { data: userPlan } = await supabase
              .from('user_plans')
              .select('plan')
              .eq('user_id', user.id)
              .maybeSingle()

            setIsProUser(userPlan?.plan === 'membership')

            await supabase.from('analyses').insert({
              user_id: user.id,
              skin_type: data.skin_type,
              scores: data.scores,
              concerns: data.concerns,
              image_url: imageData,
            })
          }
        } catch (historyError) {
          console.error('Analysis history save failed:', historyError)
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Skin analysis failed.')
      } finally {
        setLoading(false)
      }
    }

    analyze()
  }, [router])

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6">
        <div className="brand-card flex max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">Analyzing your glow ✨</p>
            <p className="text-sm text-[var(--muted)]">AI is mapping your skin profile now.</p>
          </div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">K-Beauty AI</div>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Analysis needs another try</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">{error}</p>
          <button
            onClick={() => router.push('/analyze')}
            className="brand-button-primary mt-8 px-8 py-4 font-semibold"
          >
            Back to Camera
          </button>
        </div>
      </main>
    )
  }

  if (!result) return null

  const scores = [
    { label: 'Hydration', value: result.scores.hydration, color: '#60a5fa', glow: 'from-[#cfe6ff] to-[#ffffff]' },
    { label: 'Oil Level', value: result.scores.oiliness, color: '#e7b300', glow: 'from-[#fff0be] to-[#ffffff]' },
    { label: 'Sensitivity', value: result.scores.sensitivity, color: '#f87171', glow: 'from-[#ffd8d8] to-[#ffffff]' },
    { label: 'Pigmentation', value: result.scores.pigmentation, color: '#c084fc', glow: 'from-[#f1e2ff] to-[#ffffff]' },
  ]

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />

      <div className="brand-shell">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
          <aside className="space-y-6">
            <div className="brand-card overflow-hidden p-8">
              <div className="mb-4 inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.14),rgba(246,222,177,0.34))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                Skin portrait
              </div>
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Your skin type</p>
              <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] text-[var(--ink)]">
                {SKIN_TYPE_KO[result.skin_type] || result.skin_type}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                A soft synthesis of image analysis and your survey answers, designed to reflect how your skin behaves in real life.
              </p>

              <div className="mt-8 rounded-[26px] border border-[rgba(200,155,60,0.24)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,222,177,0.42))] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c89b3c]">Confidence</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">
                  {Math.round(result.confidence * 100)}%
                </p>
              </div>
            </div>

            {result.concerns.length > 0 && (
              <div className="brand-card p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Main concerns</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {result.concerns.map(concern => (
                    <span
                      key={concern}
                      className="brand-chip px-4 py-2 text-sm font-medium"
                    >
                      {CONCERN_KO[concern] || concern}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <section className="space-y-6">
            <div className="brand-card p-7 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Glow metrics</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Your skin scoreboard</h2>
                </div>
                <div className="rounded-full bg-[#fff0f5] px-4 py-2 text-sm font-semibold text-[#c89b3c]">
                  AI completed
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {scores.map(score => (
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
                Move into product recommendations to see which K-beauty formulas best complement your hydration, oil balance, and sensitivity profile.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={() => router.push('/recommend')}
                  className="brand-button-primary w-full py-4 font-semibold"
                >
                  Personalized Product Recommendations
                </button>

                <button
                  onClick={() => {
                    if (isProUser) {
                      router.push('/personal-color')
                      return
                    }

                    setShowUpgradeModal(true)
                  }}
                  className="brand-button-secondary w-full py-4 font-semibold"
                >
                  Discover Your Personal Color ✨
                  <span className="ml-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">
                    Membership
                  </span>
                </button>

                {isSignedIn ? (
                  <button
                    onClick={() => router.push('/history')}
                    className="brand-button-secondary w-full py-4 font-semibold"
                  >
                    View My Skin History
                  </button>
                ) : (
                  <button
                    onClick={() => router.push('/login')}
                    className="brand-button-secondary w-full py-4 font-semibold"
                  >
                    Sign in to track your progress
                  </button>
                )}

                <button
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/api/og?skin_type=${result.skin_type}&hydration=${result.scores.hydration}&oiliness=${result.scores.oiliness}&sensitivity=${result.scores.sensitivity}`
                    if (navigator.share) {
                      navigator.share({
                        title: 'K-Beauty AI Skin Analysis Results',
                        text: `My skin type is ${SKIN_TYPE_KO[result.skin_type]}! I just tried K-Beauty AI 💖`,
                        url: shareUrl,
                      })
                    } else {
                      navigator.clipboard.writeText(shareUrl)
                      alert('Link copied!')
                    }
                  }}
                  className="brand-button-secondary w-full py-4 font-semibold"
                >
                  Share My Results
                </button>

                <button
                  onClick={() => router.push('/analyze')}
                  className="brand-button-ghost w-full py-4 font-semibold"
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
