'use client'

import UpgradeModal from '@/components/UpgradeModal'

export default function MembershipPage() {
  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell max-w-3xl">
        <UpgradeModal inline />
      </div>
    </main>
  )
}
