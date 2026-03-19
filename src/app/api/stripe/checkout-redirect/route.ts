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

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const stripe = getStripeClient()
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
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/recommend`,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
      }
    })

    return NextResponse.redirect(session.url!)
  } catch (error: any) {
    console.error('Stripe redirect error:', error)
    return NextResponse.redirect(new URL('/recommend', req.url))
  }
}
