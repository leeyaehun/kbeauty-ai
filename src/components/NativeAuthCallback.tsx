'use client'

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { getSafeAuthRedirectPath, NATIVE_AUTH_CALLBACK_URL } from '@/lib/auth'
import { LAUNCH_TIMEOUT_MS, withLaunchTimeout } from '@/lib/launch'
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

      console.info('[launch] handling native auth callback')

      const code = url.searchParams.get('code')
      const accessToken = url.searchParams.get('access_token')
      const refreshToken = url.searchParams.get('refresh_token')
      const redirect = url.searchParams.get('redirect')
      const authError = url.searchParams.get('error') || url.searchParams.get('error_description')

      if (authError) {
        console.warn('[launch] native auth callback returned an error', authError)
        router.replace(`/login?redirect=${encodeURIComponent(getSafeAuthRedirectPath(redirect))}`)
        return
      }

      if (accessToken && refreshToken) {
        const { error } = await withLaunchTimeout(
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }),
          'Native auth setSession',
          LAUNCH_TIMEOUT_MS
        )
        if (error) {
          console.error('[launch] native auth setSession failed', error)
          router.replace(`/login?redirect=${encodeURIComponent(getSafeAuthRedirectPath(redirect))}`)
          return
        }
      } else if (code) {
        const { error } = await withLaunchTimeout(
          supabase.auth.exchangeCodeForSession(code),
          'Native auth exchangeCodeForSession',
          LAUNCH_TIMEOUT_MS
        )
        if (error) {
          console.error('[launch] native auth exchange failed', error)
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

    App.getLaunchUrl()
      .then((launchUrl) => {
        void handleAuthUrl(launchUrl?.url).catch((error) => {
          console.error('[launch] native launch URL handling failed', error)
          router.replace('/login')
        })
      })
      .catch((error) => {
        console.error('[launch] App.getLaunchUrl failed', error)
      })

    const listener = App.addListener('appUrlOpen', (event) => {
      void handleAuthUrl(event.url).catch((error) => {
        console.error('[launch] appUrlOpen handling failed', error)
        router.replace('/login')
      })
    })

    return () => {
      isMounted = false
      void listener.then((handle) => handle.remove())
    }
  }, [router])

  return null
}
