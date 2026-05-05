'use client'

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { getSafeAuthRedirectPath, NATIVE_AUTH_CALLBACK_URL } from '@/lib/auth'
import { createClient } from '@/lib/supabase'

function isNativeAuthCallback(url: URL) {
  const callbackUrl = new URL(NATIVE_AUTH_CALLBACK_URL)
  return url.protocol === callbackUrl.protocol && url.hostname === callbackUrl.hostname && url.pathname === callbackUrl.pathname
}

export default function NativeAuthCallback() {
  const router = useRouter()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    let isMounted = true
    const supabase = createClient()

    const handleAuthUrl = async (urlValue?: string) => {
      if (!urlValue || !isMounted) {
        return
      }

      let url: URL
      try {
        url = new URL(urlValue)
      } catch {
        return
      }

      if (!isNativeAuthCallback(url)) {
        return
      }

      const code = url.searchParams.get('code')
      const redirect = url.searchParams.get('redirect')
      const authError = url.searchParams.get('error') || url.searchParams.get('error_description')

      if (authError) {
        router.replace(`/login?redirect=${encodeURIComponent(getSafeAuthRedirectPath(redirect))}`)
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          router.replace(`/login?redirect=${encodeURIComponent(getSafeAuthRedirectPath(redirect))}`)
          return
        }
      }

      if (redirect === 'checkout') {
        window.location.href = '/api/stripe/checkout-redirect'
        return
      }

      router.replace(getSafeAuthRedirectPath(redirect))
      router.refresh()
    }

    App.getLaunchUrl().then((launchUrl) => {
      void handleAuthUrl(launchUrl?.url)
    })

    const listener = App.addListener('appUrlOpen', (event) => {
      void handleAuthUrl(event.url)
    })

    return () => {
      isMounted = false
      void listener.then((handle) => handle.remove())
    }
  }, [router])

  return null
}
