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

        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="brand-card-soft p-5">
              <p className="font-semibold text-[var(--ink)]">Analyze My Skin</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Take a selfie and get your skin result.</p>
            </div>
            <div className="brand-card-soft p-5">
              <p className="font-semibold text-[var(--ink)]">See My Results</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Open your latest saved skin result.</p>
            </div>
            <div className="brand-card-soft p-5">
              <p className="font-semibold text-[var(--ink)]">Browse Recommendations</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Explore products by category after analysis.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a
              href="/analyze"
              className="brand-button-primary px-8 py-4 text-center font-semibold"
            >
              Start Skin Analysis
            </a>

            <a
              href="/results-saved"
              className="brand-button-secondary px-8 py-4 text-center font-semibold"
            >
              View Results
            </a>

            <a
              href="/recommend"
              className="brand-button-secondary px-8 py-4 text-center font-semibold"
            >
              Recommendations
            </a>

            {!user ? (
              <button
                onClick={() => router.push('/login')}
                className="brand-button-secondary px-8 py-4 font-semibold"
              >
                Sign in to Save Your History
              </button>
            ) : (
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
        </section>
      </div>
    </main>
  )
}
