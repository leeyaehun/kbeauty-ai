'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import ProductCard from '@/components/ProductCard'
import { getProductPricePresentation, type PriceCurrencyCode } from '@/lib/pricing'
import { REGION_STORAGE_KEY, isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createClient } from '@/lib/supabase'

const CATEGORY_LABELS: Record<string, string> = {
  Toner: 'Toner',
  Moisturizer: 'Moisturizer',
  Serum: 'Serum',
  Cream: 'Cream',
  'Face Mask': 'Face Mask',
  Cleanser: 'Cleanser',
  'Sun Care': 'Sun Care',
  Hair: 'Hair',
  Body: 'Body',
  세럼: 'Serum',
  크림: 'Cream',
  토너: 'Toner',
  클렌저: 'Cleanser',
  선케어: 'Sun Care',
  마스크팩: 'Face Mask',
  샴푸: 'Hair',
  트리트먼트: 'Hair',
  헤어에센스: 'Hair',
  바디로션: 'Body',
  바디워시: 'Body',
  핸드크림: 'Body',
}

const POPULAR_PICK_TEXT = 'Popular K-Beauty pick'

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
  price_minor_unit?: boolean
  skin_profile: any
  similarity: number
  explanation?: string
  display_affiliate_url?: string | null
  display_link_region?: Region
  display_button_label?: string
}

type Region = ShoppingRegion

function isPopularPickCategory(category: string | null | undefined) {
  return category === 'Hair' || category === 'Body'
}

function getDisplayMatchScore(similarity: number | null | undefined) {
  return similarity ? Math.round(similarity * 100) : 60
}

function getDisplayPrice(product: Product) {
  return product.display_price ?? getProductPricePresentation(product.price, product.category).displayPrice
}

export default function RecommendPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [region, setRegion] = useState<Region>('korea')
  const [regionReady, setRegionReady] = useState(false)

  const categories = ['Toner', 'Moisturizer', 'Serum', 'Cream', 'Face Mask', 'Cleanser', 'Sun Care', 'Hair', 'Body']

  useEffect(() => {
    const storedRegion = window.localStorage.getItem(REGION_STORAGE_KEY)

    if (isShoppingRegion(storedRegion)) {
      setRegion(storedRegion)
    } else {
      setRegion('korea')
    }

    setRegionReady(true)
  }, [])

  useEffect(() => {
    let isActive = true

    async function fetchRecommendations() {
      if (!regionReady) {
        return
      }

      setLoading(true)
      setError('')

      const analysisResult = JSON.parse(
        sessionStorage.getItem('analysisResult') || 'null'
      )

      if (!analysisResult) {
        router.push('/analyze')
        return
      }

      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisResult, category: selectedCategory, region })
        })

        const data = await res.json()

        if (!res.ok) {
          if (isActive) {
            setError(data.error || 'Recommendation request failed.')
          }
          return
        }

        const regionAwareProducts = ((data.products ?? []) as Product[])
          .map(product => {
            if (region === 'global') {
              return {
                ...product,
                display_affiliate_url: product.global_affiliate_url ?? product.affiliate_url,
                display_link_region: 'global' as const,
                display_button_label: 'Shop on Olive Young Global',
              }
            }

            return {
              ...product,
              display_affiliate_url: product.affiliate_url,
              display_link_region: 'korea' as const,
              display_button_label: 'Shop on Olive Young Korea',
            }
          })
          .filter(product => Boolean(product.display_affiliate_url))
          .sort((left, right) => {
            if (region !== 'global') {
              return 0
            }

            const leftPriority = left.global_affiliate_url ? 1 : 0
            const rightPriority = right.global_affiliate_url ? 1 : 0

            return rightPriority - leftPriority
          })

        const productsWithExplanation = await Promise.all(
          regionAwareProducts.map(async product => {
            if (isPopularPickCategory(product.category)) {
              return { ...product, explanation: POPULAR_PICK_TEXT }
            }

            try {
              const explainRes = await fetch('/api/explain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product, analysisResult })
              })
              const explainData = await explainRes.json()
              return { ...product, explanation: explainData.explanation || '' }
            } catch {
              return product
            }
          })
        )

        if (isActive) {
          setProducts(productsWithExplanation)
        }
      } catch {
        if (isActive) {
          setError('A network error occurred while loading recommendations.')
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    fetchRecommendations()

    return () => {
      isActive = false
    }
  }, [regionReady, region, router, selectedCategory])

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6">
        <div className="brand-card flex max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#d94d82]">Curating your routine ✨</p>
            <p className="text-sm text-[var(--muted)]">Matching products to your skin profile.</p>
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
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Recommendations are unavailable</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">{error}</p>
          <button
            onClick={() => router.push('/analyze')}
            className="brand-button-primary mt-8 px-8 py-4 font-semibold"
          >
            Back to Analysis
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Curated recommendations
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Your K-beauty lineup
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              Handpicked formulas aligned to your skin profile, explained in a softer editorial style for global beauty lovers.
            </p>
          </div>
          <div className="rounded-full border border-[rgba(200,155,60,0.24)] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(246,222,177,0.45))] px-5 py-3 text-sm font-semibold text-[#c89b3c] shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
            {products.length} personalized picks
          </div>
        </div>

        <div className="-mx-1 mb-6 flex gap-3 overflow-x-auto px-1 pb-3">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition-all ${
              selectedCategory === null
                ? 'bg-[#ff6b9d] text-white shadow-[0_16px_28px_rgba(217,77,130,0.22)]'
                : 'border border-[rgba(255,107,157,0.16)] bg-white/85 text-[var(--muted-strong)]'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-[#ff6b9d] text-white shadow-[0_16px_28px_rgba(217,77,130,0.22)]'
                  : 'border border-[rgba(255,107,157,0.16)] bg-white/85 text-[var(--muted-strong)]'
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>

        <div className="grid gap-5">
          {products.length === 0 ? (
            <div className="brand-card p-8 text-center">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                No regional matches available
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {region === 'global'
                  ? 'These recommendations do not currently have Olive Young Global links.'
                  : 'No products matched this filter yet. Try another category.'}
              </p>
            </div>
          ) : (
            products.map(product => {
              return (
                <ProductCard
                  key={product.id}
                  brand={product.brand}
                  categoryLabel={CATEGORY_LABELS[product.category] || product.category}
                  displayAffiliateUrl={product.display_affiliate_url}
                  displayButtonLabel={product.display_button_label}
                  displayPrice={getDisplayPrice(product)}
                  explanation={product.explanation || 'Balanced to support your skin profile with a targeted K-beauty ingredient focus.'}
                  imageUrl={product.image_url}
                  matchScore={getDisplayMatchScore(product.similarity)}
                  name={product.name}
                />
              )
            })
          )}
        </div>

        <div className="brand-card mt-6 p-6 text-center">
          <p className="text-lg font-semibold text-[var(--ink)]">K-Beauty AI Membership</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Unlimited analyses, history storage, and six product recommendations every time.
          </p>
          <button
            onClick={async () => {
              const supabase = createClient()
              const { data: { user } } = await supabase.auth.getUser()

              if (!user) {
                router.push('/login?redirect=checkout')
                return
              }

              const { data: planData } = await supabase
                .from('user_plans')
                .select('plan')
                .eq('user_id', user.id)
                .single()

              console.log('Current plan:', planData?.plan)

              const hasMembership = planData?.plan === 'membership'
              void hasMembership

              const res = await fetch('/api/stripe/checkout', { method: 'POST' })
              const data = await res.json()
              if (data.url) window.location.href = data.url
              else alert(data.error || 'Something went wrong.')
            }}
            className="brand-button-primary mt-5 w-full py-4 font-semibold"
          >
            Membership — $9/month
          </button>
        </div>

        <button
          onClick={() => router.push('/analyze')}
          className="brand-button-ghost mt-4 w-full py-4 font-semibold"
        >
          Analyze Again
        </button>
      </div>
    </main>
  )
}
