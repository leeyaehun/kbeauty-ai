import { NextRequest, NextResponse } from 'next/server'

import { createServerSupabaseClient } from '@/lib/supabase'

function getSafeRedirectPath(redirect: string | null) {
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/analyze'
  }

  return redirect
}

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

  return NextResponse.redirect(`${origin}${getSafeRedirectPath(redirect)}`)
}
