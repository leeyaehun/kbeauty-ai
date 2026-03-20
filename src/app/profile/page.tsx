'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Crown, Globe2, Heart, LogOut, Palette, ScrollText, Sparkles } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import RegionModal from '@/components/RegionModal'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

type UserPlan = 'free' | 'membership'

function getProfileName(user: User | null) {
  if (!user) {
    return ''
  }

  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const fullName = metadata?.full_name ?? metadata?.name

  if (typeof fullName === 'string' && fullName.trim().length > 0) {
    return fullName
  }

  return 'K-Beauty Member'
}

function getProfileImage(user: User | null) {
  if (!user) {
    return null
  }

  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const avatarUrl = metadata?.avatar_url ?? metadata?.picture

  return typeof avatarUrl === 'string' ? avatarUrl : null
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [plan, setPlan] = useState<UserPlan>('free')
  const [region, setRegion] = useState<ShoppingRegion>('korea')
  const [showRegionModal, setShowRegionModal] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [wishlistCount, setWishlistCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const loadProfile = async () => {
      const [
        { data: { user: currentUser } },
      ] = await Promise.all([
        supabase.auth.getUser(),
      ])

      setUser(currentUser)

      if (currentUser) {
        const [{ data: planData }, wishlistRes] = await Promise.all([
          supabase
            .from('user_plans')
            .select('plan')
            .eq('user_id', currentUser.id)
            .single(),
          fetch('/api/wishlist', { cache: 'no-store' }),
        ])

        setPlan(planData?.plan === 'membership' ? 'membership' : 'free')

        if (wishlistRes.ok) {
          const wishlistData = await wishlistRes.json()
          setWishlistCount(Array.isArray(wishlistData.items) ? wishlistData.items.length : 0)
        } else {
          setWishlistCount(0)
        }
      } else {
        setPlan('free')
        setWishlistCount(0)
      }

      const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)
      setRegion(isShoppingRegion(storedRegion) ? storedRegion : 'korea')
      setLoading(false)
    }

    void loadProfile()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const profileName = useMemo(() => getProfileName(user), [user])
  const profileImage = useMemo(() => getProfileImage(user), [user])

  const handleGoogleLogin = async () => {
    const supabase = createClient()

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?redirect=/profile`,
      },
    })
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setPlan('free')
    router.push('/')
    router.refresh()
  }

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setError('')

    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()

      if (res.status === 401) {
        router.push('/login?redirect=checkout')
        return
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      setError(data.error || 'Something went wrong.')
    } catch {
      setError('Something went wrong.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleRegionSelect = (nextRegion: ShoppingRegion) => {
    window.localStorage.setItem(REGION_STORAGE_KEY, nextRegion)
    setRegion(nextRegion)
    setShowRegionModal(false)
  }

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card flex items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/50 border-t-[#ff6b9d]" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">K-Beauty AI</p>
            <p className="text-sm text-[var(--muted)]">Loading your profile...</p>
          </div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
        <div className="brand-shell max-w-3xl">
          <div className="brand-card p-8 text-center md:p-10">
            <div className="mx-auto inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.18),rgba(246,222,177,0.34))] p-4 text-[#d94d82]">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Sign in to save your progress
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-[var(--muted)]">
              Keep your glow history, revisit your beauty preferences, and continue your K-beauty journey across devices.
            </p>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="brand-button-primary mx-auto mt-8 flex w-full max-w-sm items-center justify-center gap-3 px-6 py-4 font-semibold"
            >
              Continue with Google
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      {showRegionModal ? (
        <RegionModal
          title="Update your shopping region"
          description="Switch between Olive Young Korea and Olive Young Global whenever you need different storefront links."
          onSelect={handleRegionSelect}
          onClose={() => setShowRegionModal(false)}
        />
      ) : null}

      <div className="brand-shell max-w-4xl">
        <section className="brand-card p-7 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-[rgba(255,107,157,0.18)] bg-[linear-gradient(135deg,#ff8ab3,#f6deb1)] shadow-[0_18px_34px_rgba(149,64,109,0.12)]">
                {profileImage ? (
                  <img src={profileImage} alt={profileName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white">
                    {(profileName || user.email || 'K').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Beauty profile</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                  {profileName}
                </h1>
                <p className="mt-2 text-sm text-[var(--muted)]">{user.email}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-4 py-2 text-sm font-semibold ${
                plan === 'membership'
                  ? 'bg-[linear-gradient(135deg,rgba(255,107,157,0.16),rgba(246,222,177,0.4))] text-[#d94d82]'
                  : 'bg-[#fff4f8] text-[var(--muted-strong)]'
              }`}>
                {plan === 'membership' ? 'Membership' : 'Free'}
              </span>
              {plan === 'membership' ? (
                <span className="rounded-full bg-[#fff8e8] px-4 py-2 text-sm font-semibold text-[#c89b3c]">
                  Active
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4">
          <button
            type="button"
            onClick={() => router.push('/history')}
            className="brand-card-soft flex items-center justify-between px-5 py-5 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0f5] text-[#d94d82]">
                <ScrollText className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">My Skin History</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Review your past AI skin analyses.</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </button>

          <button
            type="button"
            onClick={() => router.push('/wishlist')}
            className="brand-card-soft flex items-center justify-between px-5 py-5 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0f5] text-[#d94d82]">
                <Heart className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">
                  My Wishlist {wishlistCount > 0 ? `(${wishlistCount})` : ''}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">Saved products ready for your next checkout.</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </button>

          <button
            type="button"
            onClick={() => router.push('/personal-color')}
            className="brand-card-soft flex items-center justify-between px-5 py-5 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0f5] text-[#d94d82]">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">My Personal Color</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Open your membership-powered color analysis.</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </button>

          <button
            type="button"
            onClick={() => setShowRegionModal(true)}
            className="brand-card-soft flex items-center justify-between px-5 py-5 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0f5] text-[#d94d82]">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">Change Region</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Current region: {region === 'korea' ? 'Korea' : 'Global'}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </button>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={checkoutLoading || plan === 'membership'}
            className="brand-card-soft flex items-center justify-between px-5 py-5 text-left disabled:opacity-70"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0f5] text-[#d94d82]">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">
                  {plan === 'membership' ? 'Membership Active' : 'Get Membership'}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {plan === 'membership'
                    ? 'Your subscription is currently active.'
                    : 'Unlock personal color analysis and premium features.'}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </button>

        </section>

        {error ? (
          <p className="mt-4 text-sm font-medium text-[#ef4444]">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-8 flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#ef4444]"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </main>
  )
}
