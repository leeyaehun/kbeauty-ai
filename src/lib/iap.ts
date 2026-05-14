'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

import { APP_STORE_PRODUCT_IDS, type AppStoreProductId } from '@/lib/membership'

export type AppStoreProduct = {
  currencyCode: string
  description: string
  displayPrice: string
  id: AppStoreProductId
  price: number
  title: string
}

export type AppStoreTransaction = {
  appAccountToken?: string | null
  environment?: string | null
  expiresDate?: string | null
  originalTransactionId: string
  productId: AppStoreProductId
  purchaseDate?: string | null
  signedTransactionJws: string
  transactionId: string
}

type ProductResponse = {
  products: AppStoreProduct[]
}

type TransactionResponse = AppStoreTransaction & {
  cancelled?: boolean
  pending?: boolean
}

type RestoreResponse = {
  hasActivePremium: boolean
  transactions: AppStoreTransaction[]
}

type KBeautyIAPPlugin = {
  currentEntitlements(): Promise<RestoreResponse>
  getProducts(): Promise<ProductResponse>
  purchase(options: { productId: AppStoreProductId }): Promise<TransactionResponse>
  restore(): Promise<RestoreResponse>
}

export const KBeautyIAP = registerPlugin<KBeautyIAPPlugin>('KBeautyIAP')

export function isStoreKitAvailable() {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('KBeautyIAP')
}

export function sortMembershipProducts(products: AppStoreProduct[]) {
  const rank = new Map(APP_STORE_PRODUCT_IDS.map((productId, index) => [productId, index]))

  return [...products].sort((left, right) => {
    return (rank.get(left.id) ?? 99) - (rank.get(right.id) ?? 99)
  })
}

export async function syncAppStoreEntitlement(transaction: AppStoreTransaction) {
  const res = await fetch('/api/app-store/entitlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transaction),
  })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Unable to activate Membership.')
  }

  return data as { plan: 'membership' }
}
