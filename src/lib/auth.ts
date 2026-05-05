export function getGoogleOAuthOptions(redirectTo: string, email?: string) {
  const trimmedEmail = email?.trim()

  return {
    redirectTo,
    queryParams: {
      prompt: 'select_account',
      ...(trimmedEmail ? { login_hint: trimmedEmail } : {}),
    },
  }
}

export const NATIVE_AUTH_CALLBACK_URL = 'kbeautyai://auth/callback'

export function getSafeAuthRedirectPath(redirect: string | null) {
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/analyze'
  }

  return redirect
}
