'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock3, Home, UserRound } from 'lucide-react'

const TABS = [
  {
    href: '/',
    icon: Home,
    label: 'Home',
    match: (pathname: string) => pathname === '/',
  },
  {
    href: '/history',
    icon: Clock3,
    label: 'History',
    match: (pathname: string) => pathname.startsWith('/history'),
  },
  {
    href: '/profile',
    icon: UserRound,
    label: 'Profile',
    match: (pathname: string) => pathname.startsWith('/profile'),
  },
] as const

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[rgba(255,107,157,0.18)] bg-white/95 backdrop-blur-xl">
      <div
        className="mx-auto flex h-16 w-full max-w-3xl items-start justify-around px-4 pt-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          const Icon = tab.icon

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-[76px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-[#fff0f5] text-[#FF6B9D]'
                  : 'text-[#8f8690] hover:bg-[#fff7fb] hover:text-[#d94d82]'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-[#FF6B9D]' : 'text-[#8f8690]'}`} />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
