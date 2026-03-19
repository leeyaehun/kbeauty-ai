const GLOBAL_CATEGORY_KEYS = new Set([
  'serum',
  'cream',
  'toner',
  'cleanser',
  'sun_care',
  'mask',
  'eye_cream',
  'lip',
  'foundation',
  'blush',
  'eyeshadow',
  'mascara',
  'body_hair',
])

export type PriceCurrencyCode = 'KRW' | 'USD'

export type ProductPricePresentation = {
  currencyCode: PriceCurrencyCode
  displayPrice: string | null
  priceMinorUnit: boolean
}

export function isGlobalCategoryKey(category: string | null | undefined) {
  return typeof category === 'string' && GLOBAL_CATEGORY_KEYS.has(category)
}

export function getProductPricePresentation(
  price: number | null | undefined,
  category: string | null | undefined
): ProductPricePresentation {
  if (isGlobalCategoryKey(category)) {
    return {
      currencyCode: 'USD',
      displayPrice:
        typeof price === 'number'
          ? new Intl.NumberFormat('en-US', {
              currency: 'USD',
              style: 'currency',
            }).format(price / 100)
          : null,
      priceMinorUnit: true,
    }
  }

  return {
    currencyCode: 'KRW',
    displayPrice:
      typeof price === 'number'
        ? new Intl.NumberFormat('ko-KR', {
            currency: 'KRW',
            maximumFractionDigits: 0,
            style: 'currency',
          }).format(price)
        : null,
    priceMinorUnit: false,
  }
}
