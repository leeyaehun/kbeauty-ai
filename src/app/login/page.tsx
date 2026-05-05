'use client'

import { createClient } from '@/lib/supabase'
import { getGoogleOAuthOptions } from '@/lib/auth'
import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [redirect, setRedirect] = useState('')
  const [googleEmail, setGoogleEmail] = useState('')
  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('redirect')
    setRedirect(value ?? '')
  }, [])

  const getCallbackUrl = () => {
    const callbackUrl = Capacitor.isNativePlatform()
      ? `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/native-callback`
      : `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`

    return `${callbackUrl}?redirect=${encodeURIComponent(redirect)}`
  }

  const handleGoogleLogin = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: getGoogleOAuthOptions(
        getCallbackUrl(),
        googleEmail
      ),
    })
  }

  const handleEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      return
    }

    setEmailLoading(true)
    setEmailSent(false)
    setAuthError('')

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: getCallbackUrl(),
        shouldCreateUser: true,
      },
    })

    setEmailLoading(false)

    if (error) {
      setAuthError(error.message)
      return
    }

    setEmailSent(true)
  }

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-10 flex justify-center">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="mx-auto max-w-xl">
          <div className="brand-card p-8 text-center md:p-10">
            <div className="mx-auto mb-6 inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.18),rgba(246,222,177,0.38))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Beauty account
            </div>
            <h1 className="mb-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Save your glow story
            </h1>
            <p className="mx-auto mb-10 max-w-md text-base leading-7 text-[var(--muted)]">
              Sign in to keep your analysis history, unlock a smoother Membership journey, and return to your personalized K-beauty recommendations anytime.
            </p>

            <div className="mx-auto w-full max-w-sm">
              <form onSubmit={handleGoogleLogin}>
                <label htmlFor="google-email" className="mb-2 block text-left text-sm font-semibold text-[var(--ink)]">
                  Google account email
                </label>
                <input
                  id="google-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={googleEmail}
                  onChange={(event) => setGoogleEmail(event.target.value)}
                  placeholder="Optional"
                  className="mb-4 w-full rounded-[8px] border border-[#f0c8d8] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[#ff6b9d] focus:ring-4 focus:ring-[#ff6b9d]/15"
                />
                <button
                  type="submit"
                  className="brand-button-primary flex w-full items-center justify-center gap-3 px-6 py-4 font-semibold"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#f0c8d8]" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">or</span>
                <div className="h-px flex-1 bg-[#f0c8d8]" />
              </div>

              <form onSubmit={handleEmailLogin}>
                <label htmlFor="email-login" className="mb-2 block text-left text-sm font-semibold text-[var(--ink)]">
                  Email address
                </label>
                <input
                  id="email-login"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mb-4 w-full rounded-[8px] border border-[#f0c8d8] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[#ff6b9d] focus:ring-4 focus:ring-[#ff6b9d]/15"
                />
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="brand-button-ghost w-full px-6 py-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {emailLoading ? 'Sending link...' : 'Send login link'}
                </button>
              </form>

              {emailSent ? (
                <p className="mt-4 rounded-[8px] bg-[#f6deb1]/35 px-4 py-3 text-left text-sm leading-6 text-[var(--ink)]">
                  Check your inbox for a secure login link.
                </p>
              ) : null}

              {authError ? (
                <p className="mt-4 rounded-[8px] bg-red-50 px-4 py-3 text-left text-sm leading-6 text-red-700">
                  {authError}
                </p>
              ) : null}
            </div>

            <button
              onClick={() => router.push('/analyze')}
              className="brand-button-ghost mt-4 px-6 py-3 text-sm font-semibold"
            >
              Continue Without Signing In
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
