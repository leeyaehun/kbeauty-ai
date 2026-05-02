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
