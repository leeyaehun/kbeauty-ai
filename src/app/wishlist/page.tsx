'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import ToastMessage from '@/components/ToastMessage'
import { getProductPricePresentation, type PriceCurrencyCode } from '@/lib/pricing'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'
import { readWishlistProductIds, removeWishlistProductId } from '@/lib/wishlist-storage'

type WishlistProduct = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  global_affiliate_url: string | null
  id: string
  image_url: string | null
  name: string | null
  price: number | null
}

type WishlistItem = {
  created_at: string
  product: WishlistProduct
  product_id: string
}

type Region = ShoppingRegion

function getBrandInitial(brand: string | null | undefined) {
  const initial = brand?.trim().charAt(0)
  return initial ? initial.toUpperCase() : 'K'
}

function getDisplayPrice(product: WishlistProduct) {
  return getProductPricePresentation(product.price, product.category).displayPrice
}

function getDisplayLink(product: WishlistProduct, region: Region) {
  if (region === 'global') {
    return product.global_affiliate_url ?? product.affiliate_url
  }

  return product.affiliate_url
}

async function loadFallbackWishlistItems(productIds: string[]) {
  if (productIds.length === 0) {
    return [] as WishlistItem[]
  }

  const params = new URLSearchParams({
    productIds: productIds.join(','),
  })

  const res = await fetch(`/api/wishlist?${params.toString()}`, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))

  return res.ok ? ((data.items ?? []) as WishlistItem[]) : []
}

export default function WishlistPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [items, setItems] = useState<WishlistItem[]>([])
  const [region, setRegion] = useState<Region>('korea')
  const [toastMessage, setToastMessage] = useState('')
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!toastMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => setToastMessage(''), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  useEffect(() => {
    const supabase = createClient()

    const loadWishlist = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      setUser(currentUser)

      const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)
      setRegion(isShoppingRegion(storedRegion) ? storedRegion : 'korea')

      if (!currentUser) {
        setLoading(false)
        return
      }

      const res = await fetch('/api/wishlist', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        setItems((data.items ?? []) as WishlistItem[])
      } else if (data.error_code === 'wishlist_table_missing') {
        const fallbackProductIds = readWishlistProductIds(currentUser.id)
        const fallbackItems = await loadFallbackWishlistItems(fallbackProductIds)
        setItems(fallbackItems)
      }

      setLoading(false)
    }

    void loadWishlist()
  }, [])

  const itemCount = useMemo(() => items.length, [items])

  const handleRemove = async (productId: string) => {
    if (pendingIds.has(productId)) {
      return
    }

    setPendingIds((current) => new Set(current).add(productId))

    try {
      const res = await fetch('/api/wishlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))

        if (res.status === 503 && data.error_code === 'wishlist_table_missing' && user) {
          removeWishlistProductId(user.id, productId)
          setItems((current) => current.filter((item) => item.product_id !== productId))
          setToastMessage('Removed from wishlist')
          return
        }

        throw new Error(data.error || 'Failed to remove wishlist item.')
      }

      setItems((current) => current.filter((item) => item.product_id !== productId))
      setToastMessage('Removed from wishlist')
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Failed to remove wishlist item.')
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(productId)
        return next
      })
    }
  }

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card flex items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/50 border-t-[#ff6b9d]" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">K-Beauty AI</p>
            <p className="text-sm text-[var(--muted)]">Loading your wishlist...</p>
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
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Sign in to save your wishlist</h1>
            <p className="mt-4 text-base leading-7 text-[var(--muted)]">
              Save products you love and come back to them anytime in your beauty profile.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login?redirect=/wishlist')}
              className="brand-button-primary mt-8 px-8 py-4 font-semibold"
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
      <ToastMessage message={toastMessage} />

      <div className="brand-shell max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Saved beauty picks
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">My Wishlist</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {itemCount} saved product{itemCount === 1 ? '' : 's'} ready for your next K-beauty haul.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="brand-card p-8 text-center md:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Your wishlist is empty</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              Save products from your recommendations to build your perfect routine.
            </p>
            <button
              type="button"
              onClick={() => router.push('/recommend')}
              className="brand-button-primary mt-8 px-8 py-4 font-semibold"
            >
              Discover products
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => {
              const product = item.product
              const displayLink = getDisplayLink(product, region)

              return (
                <div
                  key={item.product_id}
                  className="brand-card flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name ?? 'Wishlist product'}
                        className="h-20 w-20 shrink-0 rounded-[22px] object-cover shadow-[0_12px_24px_rgba(149,64,109,0.12)]"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-pink-300 to-pink-500 shadow-[0_12px_24px_rgba(149,64,109,0.12)]">
                        <span className="text-2xl font-bold text-white">
                          {getBrandInitial(product.brand)}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">
                        {product.brand}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold leading-snug tracking-[-0.03em] text-[var(--ink)]">
                        {product.name}
                      </h2>
                      <p className="mt-3 text-lg font-semibold text-[#d94d82]">
                        {getDisplayPrice(product) ?? 'Price unavailable'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {displayLink ? (
                      <a
                        href={displayLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="brand-button-primary px-5 py-3 text-center font-semibold"
                      >
                        Shop on Olive Young
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleRemove(item.product_id)}
                      disabled={pendingIds.has(item.product_id)}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(255,107,157,0.18)] bg-[#fff7fb] disabled:opacity-70"
                      aria-label="Remove from wishlist"
                    >
                      <Heart className="h-5 w-5 fill-[#FF6B9D] text-[#FF6B9D]" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
