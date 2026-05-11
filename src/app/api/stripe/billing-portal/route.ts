import { NextResponse } from 'next/server'
import Stripe from 'stripe'

import { createServerSupabaseClient } from '@/lib/supabase'

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  return new Stripe(secretKey, {
    apiVersion: '2026-02-25.clover',
  })
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to manage Membership.' }, { status: 401 })
    }

    const { data: planData, error: planError } = await supabase
      .from('user_plans')
      .select('plan, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (planError) {
      throw planError
    }

    if (planData?.plan !== 'membership' || !planData.stripe_customer_id) {
      return NextResponse.json({ error: 'No active Membership billing record was found.' }, { status: 404 })
    }

    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: planData.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/profile`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Stripe billing portal error:', error)
    return NextResponse.json({ error: error.message || 'Unable to open billing portal.' }, { status: 500 })
  }
}
