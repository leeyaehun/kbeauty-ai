'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORY_KO: Record<string, string> = {
  세럼: 'Serum',
  크림: 'Cream',
  토너: 'Toner',
  클렌저: 'Cleanser',
  선케어: 'Suncare',
}

type Product = {
  id: string
  name: string
  brand: string
  price: number
  category: string
  affiliate_url: string
  image_url: string
  skin_profile: any
  similarity: number
  explanation?: string
}

export default function RecommendPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [error, setError] = useState('')

  const categories = ['세럼', '크림', '토너', '클렌저', '선케어']

  useEffect(() => {
    async function fetchRecommendations() {
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
          body: JSON.stringify({ analysisResult, category: selectedCategory })
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Recommendation request failed.')
          return
        }

        const productsWithExplanation = await Promise.all(
          data.products.map(async (product: Product) => {
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

        setProducts(productsWithExplanation)
      } catch {
        setError('A network error occurred while loading recommendations.')
      } finally {
        setLoading(false)
      }
    }

    fetchRecommendations()
  }, [router, selectedCategory])

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

        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all ${
              selectedCategory === null
                ? 'brand-button-primary'
                : 'brand-button-secondary'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'brand-button-primary'
                  : 'brand-button-secondary'
              }`}
            >
              {CATEGORY_KO[cat]}
            </button>
          ))}
        </div>

        <div className="grid gap-5">
          {products.map(product => (
            <div
              key={product.id}
              className="brand-card overflow-hidden p-6 md:p-7"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="brand-chip px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">
                      {product.brand}
                    </span>
                    <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-xs font-semibold text-[#c89b3c]">
                      {CATEGORY_KO[product.category] || product.category}
                    </span>
                  </div>

                  <h2 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--ink)]">
                    {product.name}
                  </h2>

                  <p className="mt-3 text-2xl font-semibold text-[#d94d82]">
                    ${product.price.toLocaleString()}
                  </p>

                  {product.explanation && (
                    <div className="mt-5 rounded-[22px] border border-[rgba(255,107,157,0.14)] bg-[linear-gradient(135deg,rgba(255,240,245,0.92),rgba(255,255,255,0.92))] p-5 shadow-[0_16px_28px_rgba(149,64,109,0.08)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Why it fits</p>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted-strong)]">
                        {product.explanation}
                      </p>
                    </div>
                  )}
                </div>

                <div className="w-full max-w-xs rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,240,245,0.9))] p-5 shadow-[0_18px_30px_rgba(149,64,109,0.08)]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--muted)]">Match score</span>
                    <span className="text-lg font-semibold text-[#d94d82]">
                      {Math.round(product.similarity * 100)}%
                    </span>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#ff6b9d,#f6deb1)]"
                      style={{ width: `${Math.round(product.similarity * 100)}%` }}
                    />
                  </div>

                  <a
                    href={product.affiliate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brand-button-primary mt-6 block w-full px-5 py-3 text-center font-semibold"
                  >
                    Shop on Olive Young
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="brand-card mt-6 p-6 text-center">
          <p className="text-lg font-semibold text-[var(--ink)]">K-Beauty AI Pro</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Unlimited analyses, history storage, and six product recommendations every time.
          </p>
          <button
            onClick={async () => {
              const res = await fetch('/api/stripe/checkout', { method: 'POST' })
              const data = await res.json()
              if (data.url) window.location.href = data.url
              else alert(data.error || 'Something went wrong.')
            }}
            className="brand-button-primary mt-5 w-full py-4 font-semibold"
          >
            Start Pro — $9/month
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
