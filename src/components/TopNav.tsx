'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, UserRound } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase'

function getUserAvatar(user: User | null) {
  if (!user) {
    return null
  }

  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const avatarUrl = metadata?.avatar_url ?? metadata?.picture

  return typeof avatarUrl === 'string' ? avatarUrl : null
}

function getUserName(user: User | null) {
  if (!user) {
    return ''
  }

  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const fullName = metadata?.full_name ?? metadata?.name

  if (typeof fullName === 'string' && fullName.trim().length > 0) {
    return fullName
  }

  return user.email ?? ''
}

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const showBackButton = pathname !== '/'
  const avatarUrl = getUserAvatar(user)
  const userName = getUserName(user)

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(255,107,157,0.18)] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-[72px] items-center justify-start">
          {showBackButton ? (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,107,157,0.14)] bg-[#fff7fb] text-[#d94d82] transition hover:border-[rgba(255,107,157,0.3)] hover:bg-white"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <Link
          href="/"
          className="truncate text-sm font-semibold uppercase tracking-[0.22em] text-[#d94d82] md:text-base"
        >
          K-Beauty AI
        </Link>

        <div className="flex min-w-[72px] items-center justify-end">
          {user ? (
            <Link
              href="/profile"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[rgba(255,107,157,0.14)] bg-[linear-gradient(135deg,rgba(255,107,157,0.12),rgba(246,222,177,0.28))]"
              aria-label={userName ? `${userName} profile` : 'Profile'}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName || 'Profile'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#ff8ab3,#f6deb1)] text-white">
                  <UserRound className="h-5 w-5" />
                </div>
              )}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.push(`/login?redirect=${encodeURIComponent(pathname || '/')}`)}
              className="rounded-full border border-[rgba(255,107,157,0.18)] bg-[#fff4f8] px-4 py-2 text-sm font-semibold text-[#d94d82] transition hover:border-[rgba(255,107,157,0.34)] hover:bg-white"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
