'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import RegionModal from '@/components/RegionModal'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

type UserPlan = 'free' | 'membership'

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
  const [plan, setPlan] = useState<UserPlan>('free')
  const [loading, setLoading] = useState(true)
  const [showRegionModal, setShowRegionModal] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)

      if (!user) {
        setPlan('free')
        setLoading(false)
        return
      }

      const { data: planData } = await supabase
        .from('user_plans')
        .select('plan')
        .eq('user_id', user.id)
        .single()

      setPlan(planData?.plan === 'membership' ? 'membership' : 'free')
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
                  onClick={() => router.push('/personal-color')}
                  className="w-full rounded-full border border-pink-200 bg-white px-8 py-4 font-semibold text-pink-500"
                >
                  Discover Personal Color →
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/care')}
                  className="w-full rounded-full border border-pink-200 bg-white px-8 py-4 font-semibold text-pink-500"
                >
                  Hair &amp; Body Care →
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="text-sm font-medium text-[var(--muted)] underline underline-offset-4"
                >
                  Sign in to save your results
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/care')}
                  className="w-full rounded-full border border-pink-200 bg-white px-8 py-4 font-semibold text-pink-500"
                >
                  Hair &amp; Body Care →
                </button>
              </>
            )}
          </div>

          {plan !== 'membership' ? (
            <div className="mx-auto max-w-xl rounded-[28px] border border-[rgba(255,107,157,0.14)] bg-white/92 p-6 text-center shadow-[0_18px_34px_rgba(149,64,109,0.08)]">
              <p className="text-lg font-semibold text-[var(--ink)]">K-Beauty AI Membership</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Unlock personal color analysis and premium makeup recommendations.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    router.push('/login?redirect=checkout')
                    return
                  }

                  void fetch('/api/stripe/checkout', { method: 'POST' })
                    .then((res) => res.json())
                    .then((data) => {
                      if (data.url) {
                        window.location.href = data.url
                        return
                      }

                      alert(data.error || 'Something went wrong.')
                    })
                }}
                className="brand-button-primary mt-5 w-full py-4 font-semibold"
              >
                Membership — $9/month
              </button>
            </div>
          ) : null}

          <div className="pt-2 text-xs text-[var(--muted)]">
            <a href="/privacy" className="hover:text-[#d94d82]">Privacy Policy</a>
            <span className="px-2">·</span>
            <a href="/terms" className="hover:text-[#d94d82]">Terms of Service</a>
          </div>
        </section>
      </div>
    </main>
  )
}
