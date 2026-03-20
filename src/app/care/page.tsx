'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import ProductCard from '@/components/ProductCard'
import ToastMessage from '@/components/ToastMessage'
import {
  CARE_SUBCATEGORIES,
  getCareExplanation,
  getDefaultCareSubcategory,
  type CareCategory,
  type CareSubcategory,
} from '@/lib/care'
import { getProductPricePresentation, type PriceCurrencyCode } from '@/lib/pricing'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

type Region = ShoppingRegion
type UserPlan = 'free' | 'membership'

type Product = {
  id: string
  name: string
  brand: string
  price: number | null
  currency_code?: PriceCurrencyCode
  display_price?: string | null
  category: string
  affiliate_url: string | null
  global_affiliate_url: string | null
  image_url: string | null
  subcategory?: string | null
  display_affiliate_url?: string | null
  display_button_label?: string
}

function getDisplayPrice(product: Product) {
  return product.display_price ?? getProductPricePresentation(product.price, product.category).displayPrice
}

function withRegionAwareDisplay(product: Product, region: Region, buttonLabel?: string) {
  if (region === 'global') {
    return {
      ...product,
      display_affiliate_url: product.global_affiliate_url ?? product.affiliate_url,
      display_button_label: buttonLabel ?? 'Shop on Olive Young Global',
    }
  }

  return {
    ...product,
    display_affiliate_url: product.affiliate_url,
    display_button_label: buttonLabel ?? 'Shop on Olive Young Korea',
  }
}

export default function CarePage() {
  const router = useRouter()
  const [region, setRegion] = useState<Region>('korea')
  const [regionReady, setRegionReady] = useState(false)
  const [careCategory, setCareCategory] = useState<CareCategory>('Hair')
  const [careSubcategory, setCareSubcategory] = useState<CareSubcategory>(getDefaultCareSubcategory('Hair'))
  const [careProducts, setCareProducts] = useState<Product[]>([])
  const [careLoading, setCareLoading] = useState(true)
  const [careError, setCareError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [plan, setPlan] = useState<UserPlan>('free')
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [pendingWishlistIds, setPendingWishlistIds] = useState<Set<string>>(new Set())

  const careCategories = Object.keys(CARE_SUBCATEGORIES) as CareCategory[]
  const pathnameForLogin = '/care'
  const isMember = plan === 'membership'
  const visibleProducts = isMember ? careProducts : careProducts.slice(0, 3)
  const blurredProducts = isMember ? [] : careProducts.slice(3, 6)

  useEffect(() => {
    const supabase = createClient()
    const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)

    if (isShoppingRegion(storedRegion)) {
      setRegion(storedRegion)
    } else {
      setRegion('korea')
    }

    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser)

      if (!currentUser) {
        setPlan('free')
        return
      }

      void supabase
        .from('user_plans')
        .select('plan')
        .eq('user_id', currentUser.id)
        .single()
        .then(({ data: planData }) => {
          setPlan(planData?.plan === 'membership' ? 'membership' : 'free')
        })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)

      if (!session?.user) {
        setPlan('free')
        return
      }

      void supabase
        .from('user_plans')
        .select('plan')
        .eq('user_id', session.user.id)
        .single()
        .then(({ data: planData }) => {
          setPlan(planData?.plan === 'membership' ? 'membership' : 'free')
        })
    })

    setRegionReady(true)

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!toastMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setToastMessage(''), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  useEffect(() => {
    setCareSubcategory(getDefaultCareSubcategory(careCategory))
  }, [careCategory])

  useEffect(() => {
    let isActive = true

    async function loadWishlist() {
      if (!user) {
        if (isActive) {
          setWishlistIds(new Set())
        }
        return
      }

      try {
        const res = await fetch('/api/wishlist', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (isActive) {
            setWishlistIds(new Set())
          }
          if (data.error) {
            console.error('Wishlist load failed:', data.error)
          }
          return
        }

        if (isActive) {
          setWishlistIds(new Set((data.productIds ?? []) as string[]))
        }
      } catch {
        if (isActive) {
          setWishlistIds(new Set())
        }
      }
    }

    void loadWishlist()

    return () => {
      isActive = false
    }
  }, [user])

  async function handleWishlistToggle(productId: string) {
    if (pendingWishlistIds.has(productId)) {
      return
    }

    if (!user) {
      setToastMessage('Sign in to save products')
      window.setTimeout(() => {
        router.push(`/login?redirect=${encodeURIComponent(pathnameForLogin)}`)
      }, 450)
      return
    }

    const isSaved = wishlistIds.has(productId)

    setPendingWishlistIds((current) => new Set(current).add(productId))
    setWishlistIds((current) => {
      const next = new Set(current)
      if (isSaved) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })

    try {
      const res = await fetch('/api/wishlist', {
        method: isSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update wishlist.')
      }

      setToastMessage(isSaved ? 'Removed from wishlist' : 'Added to wishlist')
    } catch (error) {
      setWishlistIds((current) => {
        const next = new Set(current)
        if (isSaved) {
          next.add(productId)
        } else {
          next.delete(productId)
        }
        return next
      })
      setToastMessage(error instanceof Error ? error.message : 'Failed to update wishlist.')
    } finally {
      setPendingWishlistIds((current) => {
        const next = new Set(current)
        next.delete(productId)
        return next
      })
    }
  }

  function goToMembership() {
    if (!user) {
      router.push('/login?redirect=%2Fmembership')
      return
    }

    router.push('/membership')
  }

  useEffect(() => {
    let isActive = true

    async function fetchCareProducts() {
      if (!regionReady) {
        return
      }

      setCareLoading(true)
      setCareError('')

      try {
        const params = new URLSearchParams({
          category: careCategory,
          subcategory: careSubcategory,
          region,
        })
        const res = await fetch(`/api/care?${params.toString()}`, { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) {
          if (isActive) {
            setCareError(data.error || 'Failed to load care products.')
          }
          return
        }

        const nextProducts = ((data.products ?? []) as Product[])
          .map((product) => withRegionAwareDisplay(product, region, 'Shop on Olive Young'))
          .filter((product) => Boolean(product.display_affiliate_url))

        if (isActive) {
          setCareProducts(nextProducts)
        }
      } catch {
        if (isActive) {
          setCareError('A network error occurred while loading care products.')
        }
      } finally {
        if (isActive) {
          setCareLoading(false)
        }
      }
    }

    void fetchCareProducts()

    return () => {
      isActive = false
    }
  }, [careCategory, careSubcategory, region, regionReady])

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <ToastMessage message={toastMessage} />

      <div className="brand-shell">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Hair &amp; Body Care
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Hair &amp; Body Care
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              Browse by concern
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/recommend')}
            className="w-full rounded-full border border-pink-200 px-6 py-4 text-left text-sm font-semibold text-pink-500 md:w-auto"
          >
            Personalized Skin Picks
          </button>
        </div>

        <div className="-mx-1 mb-4 flex gap-3 overflow-x-auto px-1 pb-3">
          {careCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setCareCategory(category)}
              className={`shrink-0 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition-all ${
                careCategory === category
                  ? 'bg-[#ff6b9d] text-white shadow-[0_16px_28px_rgba(217,77,130,0.22)]'
                  : 'border border-[rgba(255,107,157,0.16)] bg-white/85 text-[var(--muted-strong)]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="-mx-1 mb-6 flex gap-3 overflow-x-auto px-1 pb-3">
          {CARE_SUBCATEGORIES[careCategory].map((subcategory) => (
            <button
              key={subcategory}
              type="button"
              onClick={() => setCareSubcategory(subcategory)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                careSubcategory === subcategory
                  ? 'bg-[#ffe1eb] text-[#d94d82] shadow-[0_12px_24px_rgba(217,77,130,0.12)]'
                  : 'border border-[rgba(255,107,157,0.14)] bg-white/90 text-[var(--muted-strong)]'
              }`}
            >
              {subcategory}
            </button>
          ))}
        </div>

        {careLoading ? (
          <div className="brand-card p-8 text-center">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              Loading care picks
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              Pulling Olive Young products for {careSubcategory.toLowerCase()}.
            </p>
          </div>
        ) : careError ? (
          <div className="brand-card p-8 text-center">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              Hair &amp; Body products are unavailable
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{careError}</p>
          </div>
        ) : careProducts.length === 0 ? (
          <div className="brand-card p-8 text-center">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              No products found for this concern
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              Try another concern tab to browse more Hair &amp; Body options.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                brand={product.brand}
                categoryLabel={product.subcategory ?? careSubcategory}
                displayAffiliateUrl={product.display_affiliate_url}
                displayButtonLabel={product.display_button_label}
                displayPrice={getDisplayPrice(product)}
                explanation={getCareExplanation(careCategory, (product.subcategory as CareSubcategory | null) ?? careSubcategory)}
                imageUrl={product.image_url}
                name={product.name}
                showMatchScore={false}
                productAction={(
                  <button
                    type="button"
                    onClick={() => handleWishlistToggle(product.id)}
                    disabled={pendingWishlistIds.has(product.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,107,157,0.16)] bg-white/90 transition hover:border-[rgba(255,107,157,0.34)] disabled:opacity-70"
                    aria-label={wishlistIds.has(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart
                      className="h-5 w-5"
                      fill={wishlistIds.has(product.id) ? '#FF6B9D' : 'none'}
                      color={wishlistIds.has(product.id) ? '#FF6B9D' : '#9ca3af'}
                    />
                  </button>
                )}
              />
            ))}

            {blurredProducts.map((product) => (
              <div key={product.id} className="relative overflow-hidden rounded-[32px]">
                <div className="pointer-events-none select-none blur-sm">
                  <ProductCard
                    brand={product.brand}
                    categoryLabel={product.subcategory ?? careSubcategory}
                    displayAffiliateUrl={product.display_affiliate_url}
                    displayButtonLabel={product.display_button_label}
                    displayPrice={getDisplayPrice(product)}
                    explanation={getCareExplanation(careCategory, (product.subcategory as CareSubcategory | null) ?? careSubcategory)}
                    imageUrl={product.image_url}
                    name={product.name}
                    showMatchScore={false}
                    productAction={(
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,107,157,0.16)] bg-white/90"
                        aria-hidden="true"
                      >
                        <Heart className="h-5 w-5" color="#9ca3af" />
                      </button>
                    )}
                  />
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[32px] bg-white/60 px-6 text-center">
                  <p className="text-sm font-semibold text-gray-800">Members only</p>
                  <button
                    type="button"
                    onClick={goToMembership}
                    className="mt-3 rounded-full bg-pink-500 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Unlock with Membership
                  </button>
                </div>
              </div>
            ))}

            {!isMember && blurredProducts.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-pink-200 bg-pink-50 p-4 text-center">
                <p className="text-sm font-semibold text-pink-700">Get 6 personalized picks</p>
                <p className="mt-1 text-xs text-pink-500">
                  Unlock full recommendations with Membership
                </p>
                <button
                  type="button"
                  onClick={goToMembership}
                  className="mt-3 rounded-full bg-pink-500 px-6 py-2 text-sm font-semibold text-white"
                >
                  Join Membership - $9/month
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  )
}
