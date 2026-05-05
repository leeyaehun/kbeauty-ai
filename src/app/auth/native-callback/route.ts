import { NextRequest, NextResponse } from 'next/server'

import { NATIVE_AUTH_CALLBACK_URL } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const sourceUrl = new URL(req.url)
  const callbackUrl = new URL(NATIVE_AUTH_CALLBACK_URL)

  for (const key of ['code', 'redirect', 'error', 'error_description']) {
    const value = sourceUrl.searchParams.get(key)
    if (value) {
      callbackUrl.searchParams.set(key, value)
    }
  }

  return NextResponse.redirect(callbackUrl)
}
