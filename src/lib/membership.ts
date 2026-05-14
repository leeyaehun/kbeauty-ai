export type UserPlan = 'free' | 'membership'

export type MembershipPlanRow = {
  app_store_expires_at?: string | null
  app_store_original_transaction_id?: string | null
  entitlement_source?: string | null
  plan?: string | null
}

export const APP_STORE_PRODUCT_IDS = [
  'kbeautyai_premium_monthly',
  'kbeautyai_premium_yearly',
] as const

export type AppStoreProductId = (typeof APP_STORE_PRODUCT_IDS)[number]

export function isAppStoreProductId(value: unknown): value is AppStoreProductId {
  return typeof value === 'string' && APP_STORE_PRODUCT_IDS.includes(value as AppStoreProductId)
}

export function hasActiveMembership(planData: MembershipPlanRow | null | undefined, now = new Date()) {
  if (
    planData?.plan !== 'membership' ||
    planData.entitlement_source !== 'app_store' ||
    !planData.app_store_original_transaction_id
  ) {
    return false
  }

  if (!planData.app_store_expires_at) {
    return true
  }

  const expiresAt = Date.parse(planData.app_store_expires_at)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

export function getPlanFromMembership(planData: MembershipPlanRow | null | undefined): UserPlan {
  return hasActiveMembership(planData) ? 'membership' : 'free'
}

export const MEMBERSHIP_PLAN_SELECT =
  'plan, entitlement_source, app_store_original_transaction_id, app_store_expires_at'
