const WISHLIST_STORAGE_PREFIX = 'wishlist:'

function getWishlistStorageKey(userId: string) {
  return `${WISHLIST_STORAGE_PREFIX}${userId}`
}

export function readWishlistProductIds(userId: string) {
  if (typeof window === 'undefined') {
    return [] as string[]
  }

  const raw = window.localStorage.getItem(getWishlistStorageKey(userId))

  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function writeWishlistProductIds(userId: string, productIds: string[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(getWishlistStorageKey(userId), JSON.stringify([...new Set(productIds)]))
}

export function addWishlistProductId(userId: string, productId: string) {
  const current = readWishlistProductIds(userId)

  if (current.includes(productId)) {
    return current
  }

  const next = [...current, productId]
  writeWishlistProductIds(userId, next)
  return next
}

export function removeWishlistProductId(userId: string, productId: string) {
  const next = readWishlistProductIds(userId).filter((entry) => entry !== productId)
  writeWishlistProductIds(userId, next)
  return next
}
