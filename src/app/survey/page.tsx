'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const questions = [
  {
    id: 'tightness',
    question: 'How does your skin feel a few hours after washing your face?',
    options: [
      { value: 1, label: 'Dry and uncomfortable' },
      { value: 2, label: 'Normal and balanced' },
      { value: 3, label: 'Oily or shiny' },
    ]
  },
  {
    id: 'oiliness',
    question: 'Where does your face get oily or shiny during the day?',
    options: [
      { value: 1, label: 'Never oily' },
      { value: 2, label: 'Just my nose & forehead' },
      { value: 3, label: 'My whole face' },
    ]
  },
  {
    id: 'trouble',
    question: 'How often do you get pimples, redness, or skin irritation?',
    options: [
      { value: 1, label: 'Rarely' },
      { value: 2, label: 'Sometimes' },
      { value: 3, label: 'Often (almost every week)' },
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
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="brand-card p-7 md:p-8">
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Skin quiz
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Tell us how your skin feels 💗
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              These three answers help the camera analysis feel more human, more nuanced, and more aligned with your real skin behavior.
            </p>
          </aside>

          <section className="space-y-5">
            {questions.map((q, idx) => (
              <div key={q.id} className="brand-card p-6 md:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                  Question {idx + 1}
                </p>
                <p className="mt-3 text-xl font-semibold text-[var(--ink)]">
                  {q.question}
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  {q.options.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                      className={`rounded-[22px] border px-5 py-4 text-left transition-all duration-200 ${
                        answers[q.id] === opt.value
                          ? 'border-[rgba(255,107,157,0.44)] bg-[linear-gradient(135deg,rgba(255,107,157,0.12),rgba(255,240,245,0.96))] shadow-[0_18px_30px_rgba(149,64,109,0.12)]'
                          : 'border-[rgba(255,107,157,0.14)] bg-white/80 hover:-translate-y-0.5 hover:border-[rgba(255,107,157,0.34)] hover:shadow-[0_16px_26px_rgba(149,64,109,0.08)]'
                      }`}
                    >
                      <span className="font-medium text-[var(--ink)]">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={handleNext}
              disabled={!allAnswered}
              className={`w-full py-4 font-semibold ${
                allAnswered
                  ? 'brand-button-primary'
                  : 'cursor-not-allowed rounded-full bg-[rgba(255,179,209,0.45)] text-white/70'
              }`}
            >
                Start Skin Analysis
            </button>
          </section>
        </div>
      </div>
    </main>
  )
}
