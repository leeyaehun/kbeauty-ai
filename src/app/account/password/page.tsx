'use client'

import { createClient } from '@/lib/supabase'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function PasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setMessage('Your password has been updated.')
    setTimeout(() => {
      router.push('/profile')
      router.refresh()
    }, 800)
  }

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell max-w-xl">
        <div className="mb-10 flex justify-center">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <section className="brand-card p-8 text-center md:p-10">
          <div className="mx-auto mb-6 inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.18),rgba(246,222,177,0.38))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            Account security
          </div>
          <h1 className="mb-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
            Update your password
          </h1>
          <p className="mx-auto mb-8 max-w-md text-base leading-7 text-[var(--muted)]">
            Choose a new password for your K-Beauty AI account.
          </p>

          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm text-left">
            <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-[var(--ink)]">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mb-4 w-full rounded-[8px] border border-[#f0c8d8] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[#ff6b9d] focus:ring-4 focus:ring-[#ff6b9d]/15"
            />

            <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-[var(--ink)]">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mb-5 w-full rounded-[8px] border border-[#f0c8d8] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[#ff6b9d] focus:ring-4 focus:ring-[#ff6b9d]/15"
            />

            <button
              type="submit"
              disabled={loading}
              className="brand-button-primary w-full px-6 py-4 text-center font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>

          {message ? (
            <p className="mx-auto mt-4 max-w-sm rounded-[8px] bg-[#f6deb1]/35 px-4 py-3 text-left text-sm leading-6 text-[var(--ink)]">
              {message}
            </p>
          ) : null}

          {error ? (
            <p className="mx-auto mt-4 max-w-sm rounded-[8px] bg-red-50 px-4 py-3 text-left text-sm leading-6 text-red-700">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}
