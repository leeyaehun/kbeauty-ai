'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORY_KO: Record<string, string> = {
  세럼: '세럼',
  크림: '크림',
  토너: '토너',
  클렌저: '클렌저',
  선케어: '선케어',
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
          setError(data.error || '추천 실패')
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
        setError('네트워크 오류가 발생했어요')
      } finally {
        setLoading(false)
      }
    }

    fetchRecommendations()
  }, [router, selectedCategory])

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-white text-lg">맞춤 제품 찾는 중...</p>
        <p className="text-gray-400 text-sm">AI가 최적의 K-뷰티 제품을 찾고 있어요</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-white text-lg">오류가 발생했어요</p>
        <p className="text-gray-400 text-sm">{error}</p>
        <button
          onClick={() => router.push('/analyze')}
          className="mt-4 px-6 py-3 bg-white text-black rounded-full font-semibold"
        >
          다시 시도하기
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-bold mb-1">맞춤 제품 추천</h1>
      <p className="text-gray-400 text-sm mb-6">내 피부 타입에 맞는 K-뷰티 제품이에요</p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
            selectedCategory === null
              ? 'bg-white text-black font-medium'
              : 'border border-white/20 text-gray-300'
          }`}
        >
          전체
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-white text-black font-medium'
                : 'border border-white/20 text-gray-300'
            }`}
          >
            {CATEGORY_KO[cat]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {products.map(product => (
          <div
            key={product.id}
            className="bg-white/5 rounded-2xl p-5 border border-white/10"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs text-gray-400 mb-1">{product.brand}</p>
                <p className="font-medium text-base leading-tight">{product.name}</p>
              </div>
              <span className="text-xs bg-white/10 px-2 py-1 rounded-full text-gray-300 ml-2 whitespace-nowrap">
                {product.category}
              </span>
            </div>

            <p className="text-lg font-bold text-white mb-3">
              {product.price.toLocaleString()}원
            </p>

            {product.explanation && (
              <p className="text-sm text-gray-300 leading-relaxed mb-4 border-l-2 border-white/20 pl-3">
                {product.explanation}
              </p>
            )}

            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-400">매칭도</span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full"
                  style={{ width: `${Math.round(product.similarity * 100)}%` }}
                />
              </div>
              <span className="text-xs text-green-400 font-medium">
                {Math.round(product.similarity * 100)}%
              </span>
            </div>

            <a
              href={product.affiliate_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 bg-white text-black text-center rounded-xl font-semibold text-sm hover:bg-gray-100 transition"
            >
              올리브영에서 보기
            </a>
          </div>
        ))}
      </div>

      {/* Pro 업그레이드 버튼 */}
      <div className="mt-6 p-5 border border-white/20 rounded-2xl text-center">
        <p className="text-white font-semibold mb-1">K-Beauty AI Pro</p>
        <p className="text-gray-400 text-sm mb-4">
          무제한 분석 · 히스토리 저장 · 제품 6개 추천
        </p>
        <button
          onClick={async () => {
            const res = await fetch('/api/stripe/checkout', { method: 'POST' })
            const data = await res.json()
            if (data.url) window.location.href = data.url
            else alert(data.error || '오류가 발생했어요')
          }}
          className="w-full py-3 bg-white text-black rounded-full font-semibold hover:bg-gray-100 transition"
        >
          $9/월 Pro 시작하기
        </button>
      </div>

      <button
        onClick={() => router.push('/analyze')}
        className="w-full mt-4 py-4 border border-white/20 text-white rounded-full font-semibold hover:border-white/50 transition"
      >
        다시 분석하기
      </button>
    </main>
  )
}
