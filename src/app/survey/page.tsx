'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const questions = [
  {
    id: 'tightness',
    question: '세안 후 피부가 당기나요?',
    options: [
      { value: 1, label: '전혀 안 당겨요' },
      { value: 2, label: '조금 당겨요' },
      { value: 3, label: '많이 당겨요' },
    ]
  },
  {
    id: 'oiliness',
    question: 'T존(이마, 코)이 번들거리나요?',
    options: [
      { value: 1, label: '전혀 안 번들거려요' },
      { value: 2, label: '조금 번들거려요' },
      { value: 3, label: '많이 번들거려요' },
    ]
  },
  {
    id: 'trouble',
    question: '트러블이 자주 생기나요?',
    options: [
      { value: 1, label: '거의 없어요' },
      { value: 2, label: '가끔 생겨요' },
      { value: 3, label: '자주 생겨요' },
    ]
  },
]

export default function SurveyPage() {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, number>>({})

  const allAnswered = questions.every(q => answers[q.id] !== undefined)

  const handleNext = () => {
    sessionStorage.setItem('surveyAnswers', JSON.stringify(answers))
    router.push('/results')
  }

  return (
    <main className="min-h-screen bg-black text-white p-6 flex flex-col">
      <h1 className="text-2xl font-bold mb-2">피부 설문</h1>
      <p className="text-gray-400 text-sm mb-8">정확한 분석을 위해 3가지만 답해주세요</p>

      <div className="flex flex-col gap-8 flex-1">
        {questions.map((q, idx) => (
          <div key={q.id}>
            <p className="text-base font-medium mb-3">
              {idx + 1}. {q.question}
            </p>
            <div className="flex flex-col gap-2">
              {q.options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    answers[q.id] === opt.value
                      ? 'border-white bg-white text-black font-medium'
                      : 'border-white/20 text-gray-300 hover:border-white/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={!allAnswered}
        className={`mt-8 w-full py-4 rounded-full font-semibold transition-all ${
          allAnswered
            ? 'bg-white text-black hover:bg-gray-100'
            : 'bg-white/20 text-white/40 cursor-not-allowed'
        }`}
      >
        분석 시작하기
      </button>
    </main>
  )
}