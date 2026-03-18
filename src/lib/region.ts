export const REGION_STORAGE_KEY = 'region'

export type ShoppingRegion = 'korea' | 'global'

export function isShoppingRegion(value: unknown): value is ShoppingRegion {
  return value === 'korea' || value === 'global'
}
