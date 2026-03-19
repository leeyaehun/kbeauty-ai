'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase'

type UpgradeModalProps = {
  open?: boolean
  inline?: boolean
  onClose?: () => void
}

const PRO_FEATURES = [
  '✨ Personal Color Analysis',
  '💄 AI Makeup Color Try-On (Coming Soon)',
  '📊 Skin History & Before/After',
  '♾️ Unlimited Analysis',
]

export default function UpgradeModal({
  open = true,
  inline = false,
  onClose,
}: UpgradeModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!inline && !open) {
    return null
  }

  const handleCheckout = async () => {
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      setError(data.error || 'Something went wrong.')
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <div className={`${inline ? 'brand-card p-8 md:p-10' : 'w-full max-w-xl rounded-[34px] border border-[rgba(255,107,157,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,240,245,0.94))] p-7 shadow-[0_30px_60px_rgba(149,64,109,0.18)] md:p-8'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            Pro feature
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
            Unlock your full beauty profile
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Upgrade to Pro to access advanced color analysis, richer history tracking, and upcoming makeup guidance.
          </p>
        </div>

        {!inline && onClose && (
          <button
            onClick={onClose}
            className="rounded-full border border-[rgba(255,107,157,0.16)] bg-white/90 px-4 py-2 text-sm font-semibold text-[var(--muted-strong)]"
          >
            Close
          </button>
        )}
      </div>

      <div className="mt-7 grid gap-3">
        {PRO_FEATURES.map((feature) => (
          <div
            key={feature}
            className="rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,240,245,0.92))] px-5 py-4 text-sm font-medium text-[var(--ink)] shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
          >
            {feature}
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-5 text-sm font-medium text-[#ef4444]">{error}</p>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="brand-button-primary mt-7 w-full py-4 font-semibold"
      >
        {loading ? 'Preparing checkout...' : '$9/month — Start Pro'}
      </button>
    </div>
  )

  if (inline) {
    return content
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(89,34,58,0.28)] px-6 backdrop-blur-sm">
      {content}
    </div>
  )
}
