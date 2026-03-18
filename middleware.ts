import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function createMiddlewareSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createMiddlewareSupabaseClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: userPlan } = await supabase
    .from('user_plans')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle()

  const isProUser = userPlan?.plan === 'pro'
  const wantsUpgrade = request.nextUrl.searchParams.get('upgrade') === '1'

  if (isProUser && wantsUpgrade) {
    const cleanUrl = request.nextUrl.clone()
    cleanUrl.searchParams.delete('upgrade')
    return NextResponse.redirect(cleanUrl)
  }

  if (!isProUser && !wantsUpgrade) {
    const upgradeUrl = request.nextUrl.clone()
    upgradeUrl.searchParams.set('upgrade', '1')
    return NextResponse.redirect(upgradeUrl)
  }

  return response
}

export const config = {
  matcher: ['/personal-color'],
}
