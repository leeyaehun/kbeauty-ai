'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import RegionModal from '@/components/RegionModal'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [region, setRegion] = useState<ShoppingRegion | null>(null)
  const [showRegionModal, setShowRegionModal] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)

    if (isShoppingRegion(storedRegion)) {
      setRegion(storedRegion)
      setShowRegionModal(false)
      return
    }

    setShowRegionModal(true)
  }, [])

  const handleRegionSelect = (nextRegion: ShoppingRegion) => {
    window.localStorage.setItem(REGION_STORAGE_KEY, nextRegion)
    setRegion(nextRegion)
    setShowRegionModal(false)
  }

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center">
        <div className="brand-card flex items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/50 border-t-[#ff6b9d] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">K-Beauty AI</p>
            <p className="text-sm text-[var(--muted)]">Preparing your glow ritual...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      {showRegionModal && (
        <RegionModal onSelect={handleRegionSelect} />
      )}

      <div className="brand-shell">
        <div className="mb-10 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#d94d82]">
              Seoul-inspired skin intelligence
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.94] tracking-[-0.04em] text-[var(--ink)] md:text-7xl">
                Your Skin. Your Glow. Your K-Beauty.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
                Get your personalized K-beauty routine in 30 seconds — powered by AI.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="brand-card-soft p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">01</p>
                <p className="font-semibold text-[var(--ink)]">Snap your skin</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Live face capture built for quick mobile analysis.</p>
              </div>
              <div className="brand-card-soft p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">02</p>
                <p className="font-semibold text-[var(--ink)]">Decode your needs</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Hydration, oil balance, sensitivity, and concern mapping.</p>
              </div>
              <div className="brand-card-soft p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">03</p>
                <p className="font-semibold text-[var(--ink)]">Shop your match</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Product picks with K-beauty ingredient reasoning and fit score.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="/analyze"
                className="brand-button-primary px-8 py-4 text-center font-semibold"
              >
                Start Skin Analysis
              </a>

              {!user && (
                <button
                  onClick={() => router.push('/login')}
                  className="brand-button-secondary px-8 py-4 font-semibold"
                >
                  Sign in to Save Your History
                </button>
              )}

              {user && (
                <a
                  href="/history"
                  className="brand-button-secondary px-8 py-4 text-center font-semibold"
                >
                  My Skin History
                </a>
              )}

              {user && (
                <button
                  onClick={async () => {
                    const supabase = createClient()
                    await supabase.auth.signOut()
                    setUser(null)
                  }}
                  className="brand-button-secondary px-8 py-4 font-semibold"
                >
                  Sign Out
                </button>
              )}
            </div>

            <div className="text-sm text-[var(--muted)]">
              {user ? `Signed in as ${user.email}` : 'No account required to try your first analysis.'}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={() => setShowRegionModal(true)}
                className="brand-button-ghost px-6 py-3 text-sm font-semibold"
              >
                Change Region
              </button>
              {region && (
                <span className="text-sm text-[var(--muted)]">
                  Current shopping region: {region === 'korea' ? 'Korea' : 'Global'}
                </span>
              )}
            </div>
          </div>

          <div className="brand-card relative overflow-hidden p-6 md:p-8">
            <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,#ffb3d1_0%,rgba(255,179,209,0.16)_46%,transparent_75%)]" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between rounded-[24px] bg-white/80 p-4 shadow-[0_18px_34px_rgba(149,64,109,0.08)]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Glow Profile</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">Luminous, balanced skin</p>
                </div>
                <div className="rounded-full bg-[#fff0f5] px-4 py-2 text-sm font-semibold text-[#c89b3c]">
                  K-Beauty Edit
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] bg-[#fff0f5] p-5">
                  <p className="text-sm font-semibold text-[#d94d82]">Hydration</p>
                  <p className="mt-3 text-4xl font-semibold text-[var(--ink)]">92</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Barrier comfort and glow retention mapped from one selfie.</p>
                </div>
                <div className="rounded-[24px] bg-white p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
                  <p className="text-sm font-semibold text-[#d94d82]">Routine Match</p>
                  <p className="mt-3 text-4xl font-semibold text-[var(--ink)]">6</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Curated product suggestions with ingredient-level explanations.</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-[rgba(200,155,60,0.25)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,222,177,0.45))] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c89b3c]">Designed for global beauty lovers</p>
                <p className="mt-3 text-lg font-semibold text-[var(--ink)]">
                  Elevated diagnostics, soft femininity, and practical skincare guidance in one polished flow.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
