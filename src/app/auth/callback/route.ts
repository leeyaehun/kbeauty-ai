import { NextRequest, NextResponse } from 'next/server'

import { createServerSupabaseClient } from '@/lib/supabase'
import { getSafeAuthRedirectPath } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect')

  if (code) {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  if (redirect === 'checkout') {
    return NextResponse.redirect(`${origin}/api/stripe/checkout-redirect`)
  }

  return NextResponse.redirect(`${origin}${getSafeAuthRedirectPath(redirect)}`)
}
