import { NextRequest, NextResponse } from 'next/server'

import { NATIVE_AUTH_CALLBACK_URL } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sourceUrl = new URL(req.url)
  const callbackUrl = new URL(NATIVE_AUTH_CALLBACK_URL)
  const code = sourceUrl.searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    const session = data.session

    if (!error && session) {
      callbackUrl.searchParams.set('access_token', session.access_token)
      callbackUrl.searchParams.set('refresh_token', session.refresh_token)
    } else {
      callbackUrl.searchParams.set('code', code)
    }
  }

  for (const key of ['redirect', 'error', 'error_description']) {
    const value = sourceUrl.searchParams.get(key)
    if (value) {
      callbackUrl.searchParams.set(key, value)
    }
  }

  return NextResponse.redirect(callbackUrl)
}
