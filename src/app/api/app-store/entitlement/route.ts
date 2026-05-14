import { NextRequest, NextResponse } from 'next/server'

import {
  hasActiveMembership,
  isAppStoreProductId,
  type MembershipPlanRow,
} from '@/lib/membership'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase'

type AppStoreEntitlementPayload = {
  appAccountToken?: unknown
  environment?: unknown
  expiresDate?: unknown
  originalTransactionId?: unknown
  productId?: unknown
  purchaseDate?: unknown
  signedTransactionJws?: unknown
  transactionId?: unknown
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function parseAppStoreDate(value: unknown) {
  const dateValue = getString(value)
  if (!dateValue) {
    return null
  }

  const timestamp = Date.parse(dateValue)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp)
}

function parseSignedTransactionPayload(jws: string) {
  const [, payload] = jws.split('.')
  if (!payload) {
    return null
  }

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(normalizedPayload, 'base64').toString('utf8')
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSupabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await authSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to activate Membership.' }, { status: 401 })
    }

    const payload = (await req.json()) as AppStoreEntitlementPayload
    const productId = getString(payload.productId)
    const transactionId = getString(payload.transactionId)
    const originalTransactionId = getString(payload.originalTransactionId)
    const signedTransactionJws = getString(payload.signedTransactionJws)

    if (!isAppStoreProductId(productId)) {
      return NextResponse.json({ error: 'Unsupported App Store product.' }, { status: 400 })
    }

    if (!transactionId || !originalTransactionId || !signedTransactionJws) {
      return NextResponse.json({ error: 'A verified App Store transaction is required.' }, { status: 400 })
    }

    const signedPayload = parseSignedTransactionPayload(signedTransactionJws)
    if (!signedPayload) {
      return NextResponse.json({ error: 'The App Store transaction could not be read.' }, { status: 400 })
    }

    if (
      signedPayload.productId !== productId ||
      signedPayload.transactionId !== transactionId ||
      signedPayload.originalTransactionId !== originalTransactionId
    ) {
      return NextResponse.json({ error: 'The App Store transaction does not match the request.' }, { status: 400 })
    }

    if (signedPayload.bundleId !== 'com.kbeautyai.app') {
      return NextResponse.json({ error: 'The App Store transaction belongs to a different app.' }, { status: 400 })
    }

    if (signedPayload.revocationDate) {
      return NextResponse.json({ error: 'The App Store transaction has been revoked.' }, { status: 403 })
    }

    const expiresAt =
      parseAppStoreDate(payload.expiresDate) ??
      (typeof signedPayload.expiresDate === 'number' ? new Date(signedPayload.expiresDate) : null)

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'The App Store Membership has expired.' }, { status: 403 })
    }

    const purchaseDate =
      parseAppStoreDate(payload.purchaseDate) ??
      (typeof signedPayload.purchaseDate === 'number' ? new Date(signedPayload.purchaseDate) : null)
    const serviceSupabase = createServiceRoleSupabaseClient()
    const now = new Date().toISOString()

    const { data, error } = await serviceSupabase
      .from('user_plans')
      .upsert(
        {
          app_store_environment: getString(payload.environment) ?? getString(signedPayload.environment),
          app_store_expires_at: expiresAt?.toISOString() ?? null,
          app_store_last_verified_at: now,
          app_store_original_transaction_id: originalTransactionId,
          app_store_product_id: productId,
          app_store_purchase_at: purchaseDate?.toISOString() ?? now,
          app_store_transaction_id: transactionId,
          entitlement_source: 'app_store',
          plan: 'membership',
          user_id: user.id,
        },
        { onConflict: 'user_id' }
      )
      .select('plan, entitlement_source, app_store_original_transaction_id, app_store_expires_at')
      .single<MembershipPlanRow>()

    if (error) {
      console.error('App Store entitlement upsert failed:', error)
      return NextResponse.json({ error: 'Unable to activate Membership.' }, { status: 500 })
    }

    if (!hasActiveMembership(data)) {
      return NextResponse.json({ error: 'The App Store Membership is not active.' }, { status: 403 })
    }

    return NextResponse.json({ plan: 'membership' })
  } catch (error) {
    console.error('App Store entitlement error:', error)
    return NextResponse.json({ error: 'Unable to activate Membership.' }, { status: 500 })
  }
}
