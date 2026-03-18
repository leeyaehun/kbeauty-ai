'use client'

import type { ShoppingRegion } from '@/lib/region'

type RegionModalProps = {
  onSelect: (region: ShoppingRegion) => void
}

const OPTIONS: Array<{
  region: ShoppingRegion
  title: string
  description: string
}> = [
  {
    region: 'korea',
    title: '🇰🇷 Shopping in Korea',
    description: 'See Olive Young Korea links and shop the local storefront.',
  },
  {
    region: 'global',
    title: '🌐 Shopping Globally',
    description: 'See Olive Young Global links curated for international shoppers.',
  },
]

export default function RegionModal({ onSelect }: RegionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(89,34,58,0.28)] px-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[34px] border border-[rgba(255,107,157,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,240,245,0.94))] p-7 shadow-[0_30px_60px_rgba(149,64,109,0.18)] md:p-8">
        <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
          Shopping region
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
          Choose your Olive Young storefront
        </h2>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          We’ll tailor shopping links to your region. You can change this any time from the home page.
        </p>

        <div className="mt-7 grid gap-4">
          {OPTIONS.map((option) => (
            <button
              key={option.region}
              onClick={() => onSelect(option.region)}
              className="rounded-[28px] border border-[rgba(255,107,157,0.16)] bg-white/90 px-6 py-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,107,157,0.34)] hover:shadow-[0_18px_30px_rgba(149,64,109,0.10)]"
            >
              <p className="text-lg font-semibold text-[var(--ink)]">{option.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
