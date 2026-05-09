export const LAUNCH_TIMEOUT_MS = 6500
export const LAUNCH_PLAN_TIMEOUT_MS = 3500

export class LaunchTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`)
    this.name = 'LaunchTimeoutError'
  }
}

export async function withLaunchTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = LAUNCH_TIMEOUT_MS
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new LaunchTimeoutError(label, timeoutMs))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export function getLaunchErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export function getLaunchEnvironmentSummary() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'window.location.origin'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '<missing>'

  return {
    siteUrl,
    supabaseOrigin: safeOrigin(supabaseUrl),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  }
}

function safeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return value || '<missing>'
  }
}
