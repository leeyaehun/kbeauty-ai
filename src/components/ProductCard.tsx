'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'

function getBrandInitial(brand: string | null | undefined) {
  const initial = brand?.trim().charAt(0)

  return initial ? initial.toUpperCase() : 'K'
}

function ProductImage({
  brand,
  imageUrl,
  productName,
}: {
  brand: string
  imageUrl: string | null
  productName: string
}) {
  const [imageFailed, setImageFailed] = useState(false)

  if (!imageUrl || imageFailed) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-pink-300 to-pink-500 shadow-[0_12px_24px_rgba(149,64,109,0.12)]">
        <span className="text-2xl font-bold text-white">
          {getBrandInitial(brand)}
        </span>
      </div>
    )
  }

  return (
    <img
      src={imageUrl}
      alt={productName}
      className="h-20 w-20 shrink-0 rounded-[22px] object-cover shadow-[0_12px_24px_rgba(149,64,109,0.12)]"
      onError={() => setImageFailed(true)}
    />
  )
}

export type ProductCardProps = {
  brand: string
  categoryLabel: string
  displayAffiliateUrl?: string | null
  displayButtonLabel?: string
  displayPrice: string | null
  explanation: string
  imageUrl: string | null
  matchScore: number
  name: string
  productAction?: ReactNode
}

export default function ProductCard({
  brand,
  categoryLabel,
  displayAffiliateUrl,
  displayButtonLabel,
  displayPrice,
  explanation,
  imageUrl,
  matchScore,
  name,
  productAction,
}: ProductCardProps) {
  return (
    <div className="brand-card overflow-hidden p-6 md:p-7">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <ProductImage
            brand={brand}
            imageUrl={imageUrl}
            productName={name}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="brand-chip px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">
                  {brand}
                </span>
                <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-xs font-semibold text-[#c89b3c]">
                  {categoryLabel}
                </span>
              </div>

              {productAction ? (
                <div className="shrink-0">
                  {productAction}
                </div>
              ) : null}
            </div>

            <h2 className="mt-3 text-lg font-semibold leading-snug tracking-[-0.03em] text-[var(--ink)] md:text-xl">
              {name}
            </h2>

            <p className="mt-2 text-xl font-semibold text-[#d94d82]">
              {displayPrice ?? 'Price unavailable'}
            </p>

            <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
              {explanation}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,240,245,0.92))] p-4 shadow-[0_16px_28px_rgba(149,64,109,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--muted)]">Match score</span>
            <span className="text-lg font-semibold text-[#d94d82]">
              {matchScore}%
            </span>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#ff6b9d,#f6deb1)]"
              style={{ width: `${matchScore}%` }}
            />
          </div>

          {displayAffiliateUrl && (
            <a
              href={displayAffiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="brand-button-primary mt-4 block w-full px-5 py-3 text-center font-semibold"
            >
              {displayButtonLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
