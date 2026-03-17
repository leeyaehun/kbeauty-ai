'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ProSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    // Auto-navigate to the analysis page after 5 seconds
    const timer = setTimeout(() => {
      router.push('/analyze')
    }, 5000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <main className="brand-page flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl mb-6">🎉</div>
      <div className="brand-mark mb-6">K-Beauty AI</div>
      <h1 className="mb-4 text-3xl font-bold text-[var(--ink)]">You’re officially Pro!</h1>
      <p className="mb-2 text-[var(--muted)]">
        You now have unlimited skin analyses and personalized product recommendations.
      </p>
      <p className="mb-8 text-sm text-[var(--muted)]">
        We’ll take you back in 5 seconds.
      </p>
      <button
        onClick={() => router.push('/analyze')}
        className="brand-button-primary px-8 py-3 font-semibold"
      >
        Start My Next Analysis
      </button>
    </main>
  )
}
