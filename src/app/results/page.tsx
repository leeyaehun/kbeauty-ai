'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const SKIN_TYPE_KO: Record<string, string> = {
  dry: '건성',
  oily: '지성',
  combination: '복합성',
  sensitive: '민감성',
  normal: '중성',
}

const CONCERN_KO: Record<string, string> = {
  acne: '여드름',
  hyperpigmentation: '색소침착',
  wrinkles: '주름',
  pores: '모공',
  redness: '붉은기',
  dryness: '건조함',
}

type AnalysisResult = {
  skin_type: string
  scores: {
    hydration: number
    oiliness: number
    sensitivity: number
    pigmentation: number
  }
  concerns: string[]
  skin_tone: string
  confidence: number
}

export default function ResultsPage() {
  const router = useRouter()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function analyze() {
      const imageData = sessionStorage.getItem('capturedImage')
      const surveyAnswers = JSON.parse(sessionStorage.getItem('surveyAnswers') || '{}')

      if (!imageData) {
        router.push('/analyze')
        return
      }

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageData,
            surveyAnswers,
          })
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || '분석 실패')
          return
        }

        setResult(data)
        sessionStorage.setItem('analysisResult', JSON.stringify(data))
      } catch {
        setError('네트워크 오류가 발생했어요')
      } finally {
        setLoading(false)
      }
    }

    analyze()
  }, [router])

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-white text-lg">피부 분석 중...</p>
        <p className="text-gray-400 text-sm">AI가 피부를 분석하고 있어요</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-white text-lg">분석 중 오류가 발생했어요</p>
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

  if (!result) return null

  const scores = [
    { label: '수분도', value: result.scores.hydration, color: 'bg-blue-400' },
    { label: '유분도', value: result.scores.oiliness, color: 'bg-yellow-400' },
    { label: '민감도', value: result.scores.sensitivity, color: 'bg-red-400' },
    { label: '색소침착', value: result.scores.pigmentation, color: 'bg-purple-400' },
  ]

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-bold mb-1">분석 결과</h1>
      <p className="text-gray-400 text-sm mb-8">AI 피부 분석이 완료됐어요</p>

      <div className="bg-white/10 rounded-2xl p-6 mb-6 text-center">
        <p className="text-gray-400 text-sm mb-2">내 피부 타입</p>
        <p className="text-4xl font-bold mb-2">
          {SKIN_TYPE_KO[result.skin_type] || result.skin_type}
        </p>
        <p className="text-gray-400 text-xs">
          신뢰도 {Math.round(result.confidence * 100)}%
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-6 mb-6">
        <p className="text-sm font-medium mb-4">피부 점수</p>
        <div className="flex flex-col gap-4">
          {scores.map(score => (
            <div key={score.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">{score.label}</span>
                <span className="font-medium">{score.value}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full ${score.color} rounded-full transition-all duration-700`}
                  style={{ width: `${score.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {result.concerns.length > 0 && (
        <div className="bg-white/5 rounded-2xl p-6 mb-8">
          <p className="text-sm font-medium mb-3">주요 피부 고민</p>
          <div className="flex flex-wrap gap-2">
            {result.concerns.map(concern => (
              <span
                key={concern}
                className="px-3 py-1 bg-white/10 rounded-full text-sm text-gray-300"
              >
                {CONCERN_KO[concern] || concern}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={() => router.push('/recommend')}
          className="w-full py-4 bg-white text-black rounded-full font-semibold hover:bg-gray-100 transition"
        >
          맞춤 제품 추천받기
        </button>
        <button
          onClick={() => router.push('/analyze')}
          className="w-full py-4 border border-white/20 text-white rounded-full font-semibold hover:border-white/50 transition"
        >
          다시 분석하기
        </button>
      </div>
    </main>
  )
}
