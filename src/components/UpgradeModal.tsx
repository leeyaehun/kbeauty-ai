'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, X } from 'lucide-react'

import {
  KBeautyIAP,
  isStoreKitAvailable,
  sortMembershipProducts,
  syncAppStoreEntitlement,
  type AppStoreProduct,
} from '@/lib/iap'
import { createClient } from '@/lib/supabase'

type UpgradeModalProps = {
  open?: boolean
  inline?: boolean
  onClose?: () => void
}

const PRO_FEATURES = [
  'Personal Color Analysis',
  'AI Makeup Color Try-On',
  'Skin History and Before/After',
  'Unlimited Analysis',
]

export default function UpgradeModal({
  open = true,
  inline = false,
  onClose,
}: UpgradeModalProps) {
  const router = useRouter()
  const [products, setProducts] = useState<AppStoreProduct[]>([])
  const [selectedProductId, setSelectedProductId] = useState<AppStoreProduct['id']>('kbeautyai_premium_monthly')
  const [storeLoading, setStoreLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const storeKitAvailable = useMemo(() => isStoreKitAvailable(), [])

  useEffect(() => {
    if (!storeKitAvailable) {
      setStoreLoading(false)
      return
    }

    let isActive = true

    async function loadProducts() {
      setStoreLoading(true)
      setError('')

      try {
        const [{ products: appStoreProducts }, entitlements] = await Promise.all([
          KBeautyIAP.getProducts(),
          KBeautyIAP.currentEntitlements(),
        ])
        const sortedProducts = sortMembershipProducts(appStoreProducts)

        if (!isActive) {
          return
        }

        setProducts(sortedProducts)
        setSelectedProductId(sortedProducts[0]?.id ?? 'kbeautyai_premium_monthly')

        if (entitlements.hasActivePremium && entitlements.transactions[0]) {
          await syncAppStoreEntitlement(entitlements.transactions[0])
          router.refresh()
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load App Store products.')
        }
      } finally {
        if (isActive) {
          setStoreLoading(false)
        }
      }
    }

    void loadProducts()

    return () => {
      isActive = false
    }
  }, [router, storeKitAvailable])

  if (!inline && (!open || dismissed)) {
    return null
  }

  const handleClose = () => {
    setDismissed(true)
    onClose?.()
  }

  const ensureSignedIn = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login?redirect=%2Fmembership')
      return false
    }

    return true
  }

  const handlePurchase = async () => {
    setLoading(true)
    setError('')

    try {
      if (!storeKitAvailable) {
        setError('Membership can be purchased in the iOS app with Apple In-App Purchase.')
        return
      }

      if (!(await ensureSignedIn())) {
        return
      }

      const transaction = await KBeautyIAP.purchase({ productId: selectedProductId })
      if (transaction.cancelled || transaction.pending) {
        setError(transaction.pending ? 'Purchase is pending App Store approval.' : '')
        return
      }

      await syncAppStoreEntitlement(transaction)
      router.refresh()
      router.push('/profile')
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : 'Unable to complete purchase.')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    setRestoreLoading(true)
    setError('')

    try {
      if (!storeKitAvailable) {
        setError('Restore Purchases is available in the iOS app.')
        return
      }

      if (!(await ensureSignedIn())) {
        return
      }

      const restoreResult = await KBeautyIAP.restore()
      const transaction = restoreResult.transactions[0]

      if (!restoreResult.hasActivePremium || !transaction) {
        setError('No active App Store Membership was found.')
        return
      }

      await syncAppStoreEntitlement(transaction)
      router.refresh()
      router.push('/profile')
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore purchases.')
    } finally {
      setRestoreLoading(false)
    }
  }

  const content = (
    <div className={`${inline ? 'brand-card p-8 md:p-10' : 'w-full max-w-xl rounded-[34px] border border-[rgba(255,107,157,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,240,245,0.94))] p-7 shadow-[0_30px_60px_rgba(149,64,109,0.18)] md:p-8'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            Membership feature
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
            Unlock your full beauty profile
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Get Membership to access advanced color analysis, richer history tracking, and upcoming makeup guidance.
          </p>
        </div>

        {!inline && (
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,107,157,0.16)] bg-white/90 text-[var(--muted-strong)]"
            aria-label="Close membership prompt"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-7 grid gap-3">
        {PRO_FEATURES.map((feature) => (
          <div
            key={feature}
            className="flex items-center gap-3 rounded-[8px] border border-[rgba(255,107,157,0.12)] bg-white/85 px-5 py-4 text-sm font-medium text-[var(--ink)] shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
          >
            <Check className="h-4 w-4 shrink-0 text-[#d94d82]" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <div className="mt-7 grid gap-3">
        {storeLoading ? (
          <div className="rounded-[8px] border border-[#f0c8d8] bg-white/80 px-5 py-4 text-sm font-semibold text-[var(--muted)]">
            Loading App Store products...
          </div>
        ) : products.length > 0 ? (
          products.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => setSelectedProductId(product.id)}
              className={`flex items-center justify-between rounded-[8px] border px-5 py-4 text-left transition ${
                selectedProductId === product.id
                  ? 'border-[#ff6b9d] bg-[#fff4f8] shadow-[0_12px_22px_rgba(149,64,109,0.08)]'
                  : 'border-[#f0c8d8] bg-white/80'
              }`}
            >
              <span>
                <span className="block text-sm font-semibold text-[var(--ink)]">{product.title}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">{product.description}</span>
              </span>
              <span className="ml-4 whitespace-nowrap text-sm font-semibold text-[#d94d82]">{product.displayPrice}</span>
            </button>
          ))
        ) : (
          <div className="rounded-[8px] border border-[#f0c8d8] bg-white/80 px-5 py-4 text-sm text-[var(--muted)]">
            Membership purchases are available through Apple In-App Purchase in the iOS app.
          </div>
        )}
      </div>

      {error && (
        <p className="mt-5 text-sm font-medium text-[#ef4444]">{error}</p>
      )}

      <button
        type="button"
        onClick={handlePurchase}
        disabled={loading || restoreLoading || storeLoading || !storeKitAvailable}
        className="brand-button-primary mt-7 w-full py-4 font-semibold"
      >
        {loading ? 'Purchasing...' : 'Continue with Apple In-App Purchase'}
      </button>

      <button
        type="button"
        onClick={handleRestore}
        disabled={loading || restoreLoading || storeLoading || !storeKitAvailable}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#f0c8d8] bg-white px-5 py-3 text-sm font-semibold text-[#d94d82] disabled:opacity-60"
      >
        <RotateCcw className="h-4 w-4" />
        <span>{restoreLoading ? 'Restoring...' : 'Restore Purchases'}</span>
      </button>
    </div>
  )

  if (inline) {
    return content
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(89,34,58,0.28)] px-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose()
        }
      }}
    >
      {content}
    </div>
  )
}
