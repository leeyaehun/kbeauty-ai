'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import RegionModal from '@/components/RegionModal'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

function getHomeName(user: User | null) {
  if (!user) {
    return ''
  }

  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const fullName = metadata?.full_name ?? metadata?.name

  if (typeof fullName === 'string' && fullName.trim().length > 0) {
    return fullName
  }

  const email = user.email ?? ''
  return email.split('@')[0] ?? 'there'
}

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRegionModal, setShowRegionModal] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)

    if (isShoppingRegion(storedRegion)) {
      setShowRegionModal(false)
      return
    }

    setShowRegionModal(true)
  }, [])

  const handleRegionSelect = (nextRegion: ShoppingRegion) => {
    window.localStorage.setItem(REGION_STORAGE_KEY, nextRegion)
    setShowRegionModal(false)
  }

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center">
        <div className="brand-card flex items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/50 border-t-[#ff6b9d]" />
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
      {showRegionModal ? <RegionModal onSelect={handleRegionSelect} /> : null}

      <div className="brand-shell max-w-4xl">
        <div className="mb-14 flex justify-center">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <section className="mx-auto max-w-3xl space-y-10 text-center">
          {user ? (
            <div className="space-y-3">
              <p className="text-lg font-medium text-[var(--muted)]">Welcome back!</p>
              <h1 className="text-5xl font-semibold leading-[0.94] tracking-[-0.04em] text-[var(--ink)] md:text-7xl">
                {getHomeName(user)}
              </h1>
            </div>
          ) : (
            <h1 className="text-5xl font-semibold leading-[0.94] tracking-[-0.04em] text-[var(--ink)] md:text-7xl">
              Your Skin.
              <br />
              Your Glow.
              <br />
              Your K-Beauty.
            </h1>
          )}

          <div className="mx-auto flex max-w-xl flex-col gap-4">
            <a
              href="/analyze"
              className="rounded-full bg-[linear-gradient(135deg,#ff6b9d,#ff9ec0)] px-8 py-5 text-center text-lg font-semibold text-white shadow-[0_20px_36px_rgba(217,77,130,0.22)]"
            >
              Start Skin Analysis
            </a>

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => router.push('/results-saved')}
                  className="w-full rounded-full border border-pink-200 bg-white px-8 py-4 font-semibold text-pink-500"
                >
                  View My Results →
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/personal-color')}
                  className="w-full rounded-full border border-pink-200 bg-white px-8 py-4 font-semibold text-pink-500"
                >
                  Discover Personal Color →
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="text-sm font-medium text-[var(--muted)] underline underline-offset-4"
              >
                Sign in to save your results
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
