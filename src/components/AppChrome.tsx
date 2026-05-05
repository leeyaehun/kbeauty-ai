'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import BottomNav from '@/components/BottomNav'
import NativeAuthCallback from '@/components/NativeAuthCallback'
import TopNav from '@/components/TopNav'

const BOTTOM_NAV_HIDDEN_PATHS = new Set(['/analyze', '/survey'])

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const hideBottomNav = BOTTOM_NAV_HIDDEN_PATHS.has(pathname)

  return (
    <>
      <NativeAuthCallback />
      <TopNav />
      <div className={hideBottomNav ? '' : 'pb-[calc(80px+env(safe-area-inset-bottom))]'}>
        {children}
      </div>
      {hideBottomNav ? null : <BottomNav />}
    </>
  )
}
