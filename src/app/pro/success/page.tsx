'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ProSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    // 5초 후 자동으로 분석 페이지로 이동
    const timer = setTimeout(() => {
      router.push('/analyze')
    }, 5000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl mb-6">🎉</div>
      <h1 className="text-3xl font-bold mb-4">Pro 업그레이드 완료!</h1>
      <p className="text-gray-400 mb-2">
        이제 무제한으로 피부 분석과 제품 추천을 받을 수 있어요
      </p>
      <p className="text-gray-500 text-sm mb-8">
        5초 후 자동으로 이동해요
      </p>
      <button
        onClick={() => router.push('/analyze')}
        className="bg-white text-black px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition"
      >
        지금 바로 분석하기
      </button>
    </main>
  )
}
