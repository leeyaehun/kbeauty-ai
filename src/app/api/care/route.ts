import { NextRequest, NextResponse } from 'next/server'

import {
  deriveCareCategory,
  deriveCareSubcategory,
  getCareSourceCategories,
  isCareSubcategory,
  normalizeCareCategory,
  type CareCategory,
} from '@/lib/care'
import { isShoppingRegion, type ShoppingRegion } from '@/lib/region'
import { createServiceRoleSupabaseClient } from '@/lib/supabase'

type CareRow = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  global_affiliate_url: string | null
  id: string
  image_url: string | null
  name: string | null
  price: number | null
  subcategory?: string | null
}

const DEFAULT_REGION: ShoppingRegion = 'korea'
const QUERY_LIMIT = 240

function isMissingColumn(error: unknown, columnName: string) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return code === '42703' && typeof message === 'string' && message.includes(columnName)
}

function normalizeRegion(value: string | null): ShoppingRegion {
  return isShoppingRegion(value) ? value : DEFAULT_REGION
}

function applyRegionFilter<T extends { like: (column: string, pattern: string) => T }>(
  query: T,
  region: ShoppingRegion
) {
  return region === 'global'
    ? query.like('affiliate_url', '%global.oliveyoung%')
    : query.like('affiliate_url', '%oliveyoung.co.kr%')
}

async function loadCareRows(careCategory: CareCategory, region: ShoppingRegion) {
  const supabase = createServiceRoleSupabaseClient()
  const sourceCategories = getCareSourceCategories(careCategory)
  const selectVariants = [
    'id, name, brand, price, category, subcategory, image_url, affiliate_url, global_affiliate_url',
    'id, name, brand, price, category, subcategory, image_url, affiliate_url',
    'id, name, brand, price, category, image_url, affiliate_url, global_affiliate_url',
    'id, name, brand, price, category, image_url, affiliate_url',
  ]

  let lastError: unknown = null

  for (const selectClause of selectVariants) {
    const result = await applyRegionFilter(
      supabase
        .from('products')
        .select(selectClause)
        .in('category', sourceCategories)
        .gt('price', 0)
        .limit(QUERY_LIMIT),
      region
    )

    if (!result.error) {
      return (((result.data ?? []) as unknown) as CareRow[]).map((row) => ({
        ...row,
        global_affiliate_url: 'global_affiliate_url' in row ? row.global_affiliate_url ?? null : null,
        subcategory: 'subcategory' in row ? row.subcategory ?? null : null,
      }))
    }

    lastError = result.error

    if (!isMissingColumn(result.error, 'subcategory') && !isMissingColumn(result.error, 'global_affiliate_url')) {
      throw result.error
    }
  }

  throw lastError
}

function shuffle<T>(items: T[]) {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const temp = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = temp
  }

  return next
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const careCategory = normalizeCareCategory(searchParams.get('category'))

    if (!careCategory) {
      return NextResponse.json({ error: 'Invalid care category.' }, { status: 400 })
    }

    const requestedSubcategory = searchParams.get('subcategory')

    if (!isCareSubcategory(careCategory, requestedSubcategory)) {
      return NextResponse.json({ error: 'Invalid care subcategory.' }, { status: 400 })
    }

    const region = normalizeRegion(searchParams.get('region'))
    const rows = await loadCareRows(careCategory, region)

    const products = shuffle(
      rows.filter((row) => {
        if (!row.image_url || !row.name) {
          return false
        }

        const derivedCategory = deriveCareCategory(row.name, row.category)

        if (derivedCategory !== careCategory) {
          return false
        }

        const effectiveSubcategory =
          isCareSubcategory(careCategory, row.subcategory) ? row.subcategory : deriveCareSubcategory(row.name, careCategory)

        return effectiveSubcategory === requestedSubcategory
      })
    )
      .slice(0, 6)
      .map((row) => ({
        affiliate_url: row.affiliate_url,
        brand: row.brand,
        category: row.category ?? careCategory,
        global_affiliate_url: row.global_affiliate_url ?? null,
        id: row.id,
        image_url: row.image_url,
        name: row.name,
        price: row.price,
        subcategory:
          isCareSubcategory(careCategory, row.subcategory) ? row.subcategory : deriveCareSubcategory(row.name, careCategory),
      }))

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Care GET failed:', error)
    return NextResponse.json(
      {
        error:
          typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Failed to load care products.',
      },
      { status: 500 }
    )
  }
}
