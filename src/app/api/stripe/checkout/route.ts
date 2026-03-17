import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripeClient()
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        }
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pro/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/analyze`,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
      }
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Stripe 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
