import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

export type ProductPayload = {
  affiliate_url: string
  global_affiliate_url?: string | null
  brand: string
  category: string
  image_url: string
  ingredient_names: string[]
  name: string
  price: number
}

export type ExistingProductRecord = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  global_affiliate_url: string | null
  id: string
  image_url: string | null
  ingredient_names: string[]
  name: string | null
  price: number
}

export type ExistingProductRefs = {
  byAffiliateUrl: Map<string, ExistingProductRecord>
  byGlobalUrl: Map<string, ExistingProductRecord>
  byName: Map<string, ExistingProductRecord>
}

export type UpsertMode = 'domestic' | 'global'
type ProductRegion = 'korea' | 'global'

export function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is missing. Check ${envPath}.`)
  }

  return value
}

export const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
)

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableSupabaseError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const message = 'message' in error ? String(error.message ?? '') : ''
  const details = 'details' in error ? String(error.details ?? '') : ''
  const combined = `${message} ${details}`.toLowerCase()

  return (
    combined.includes('502') ||
    combined.includes('503') ||
    combined.includes('504') ||
    combined.includes('bad gateway') ||
    combined.includes('gateway timeout') ||
    combined.includes('temporarily unavailable') ||
    combined.includes('fetch failed') ||
    combined.includes('network') ||
    combined.includes('cloudflare')
  )
}

async function withSupabaseRetry<T>(label: string, operation: () => PromiseLike<T> | T) {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!isRetryableSupabaseError(error) || attempt === 5) {
        throw error
      }

      const waitMs = attempt * 2000
      console.warn(`${label} 재시도 ${attempt}/5: ${String(error)}`)
      await sleep(waitMs)
    }
  }

  throw lastError
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function parsePrice(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number.parseInt(digits, 10) : 0
}

export function normalizeDomesticProductUrl(url: string) {
  try {
    const parsed = new URL(url)
    const goodsNo = parsed.searchParams.get('goodsNo')
    const dispCatNo = parsed.searchParams.get('dispCatNo')

    if (!goodsNo) {
      return parsed.toString()
    }

    const normalized = new URL('https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do')
    normalized.searchParams.set('goodsNo', goodsNo)

    if (dispCatNo) {
      normalized.searchParams.set('dispCatNo', dispCatNo)
    }

    return normalized.toString()
  } catch {
    return url
  }
}

export function normalizeGlobalProductUrl(url: string) {
  try {
    const parsed = new URL(url)
    const prdtNo = parsed.searchParams.get('prdtNo')

    if (!prdtNo) {
      return parsed.toString()
    }

    const normalized = new URL('https://global.oliveyoung.com/product/detail')
    normalized.searchParams.set('prdtNo', prdtNo)
    return normalized.toString()
  } catch {
    return url
  }
}

function isMissingColumn(error: unknown, columnName: string) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return (
    (code === '42703' && typeof message === 'string' && message.includes(columnName)) ||
    (typeof message === 'string' && message.includes(columnName))
  )
}

export function isMissingGlobalAffiliateUrlColumn(error: unknown) {
  return isMissingColumn(error, 'global_affiliate_url')
}

function isMissingRegionColumn(error: unknown) {
  return isMissingColumn(error, 'region')
}

function resolveProductRegion(payload: ProductPayload): ProductRegion {
  const candidateUrl = payload.global_affiliate_url ?? payload.affiliate_url

  return typeof candidateUrl === 'string' && candidateUrl.includes('global.oliveyoung.com')
    ? 'global'
    : 'korea'
}

function removeUnsupportedProductColumns<T extends Record<string, unknown>>(payload: T, error: unknown) {
  const nextPayload = { ...payload }
  let changed = false

  if (isMissingGlobalAffiliateUrlColumn(error) && 'global_affiliate_url' in nextPayload) {
    delete nextPayload.global_affiliate_url
    changed = true
  }

  if (isMissingRegionColumn(error) && 'region' in nextPayload) {
    delete nextPayload.region
    changed = true
  }

  return changed ? nextPayload : null
}

function isDuplicateProductNameError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const message = 'message' in error ? error.message : null
  return typeof message === 'string' && message.includes('products_name_unique')
}

function toExistingProductRecord(row: Record<string, unknown>) {
  return {
    affiliate_url: typeof row.affiliate_url === 'string' ? row.affiliate_url : null,
    brand: typeof row.brand === 'string' ? row.brand : null,
    category: typeof row.category === 'string' ? row.category : null,
    global_affiliate_url: typeof row.global_affiliate_url === 'string' ? row.global_affiliate_url : null,
    id: String(row.id),
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    ingredient_names: Array.isArray(row.ingredient_names)
      ? row.ingredient_names.map((value) => String(value)).filter(Boolean)
      : [],
    name: typeof row.name === 'string' ? row.name : null,
    price: typeof row.price === 'number' ? row.price : Number(row.price ?? 0) || 0,
  } satisfies ExistingProductRecord
}

function applyRecordToRefs(refs: ExistingProductRefs, record: ExistingProductRecord) {
  if (record.affiliate_url) {
    refs.byAffiliateUrl.set(record.affiliate_url, record)
  }

  if (record.global_affiliate_url) {
    refs.byGlobalUrl.set(record.global_affiliate_url, record)
  }

  if (record.name) {
    refs.byName.set(record.name, record)
  }
}

function removeRecordFromRefs(refs: ExistingProductRefs, record: ExistingProductRecord) {
  if (record.affiliate_url) {
    refs.byAffiliateUrl.delete(record.affiliate_url)
  }

  if (record.global_affiliate_url) {
    refs.byGlobalUrl.delete(record.global_affiliate_url)
  }

  if (record.name) {
    refs.byName.delete(record.name)
  }
}

function getExistingMatch(
  refs: ExistingProductRefs,
  payload: ProductPayload,
  mode: UpsertMode
) {
  if (mode === 'global' && payload.global_affiliate_url && refs.byGlobalUrl.has(payload.global_affiliate_url)) {
    return refs.byGlobalUrl.get(payload.global_affiliate_url) ?? null
  }

  if (refs.byAffiliateUrl.has(payload.affiliate_url)) {
    return refs.byAffiliateUrl.get(payload.affiliate_url) ?? null
  }

  if (payload.name && refs.byName.has(payload.name)) {
    return refs.byName.get(payload.name) ?? null
  }

  return null
}

function buildUpdatePayload(
  existing: ExistingProductRecord,
  payload: ProductPayload,
  mode: UpsertMode
) {
  if (mode === 'global') {
    const hasDomesticAffiliate =
      typeof existing.affiliate_url === 'string' &&
      existing.affiliate_url.length > 0 &&
      !existing.affiliate_url.includes('global.oliveyoung.com')
    const isSameGlobalProduct =
      (typeof payload.global_affiliate_url === 'string' &&
        payload.global_affiliate_url.length > 0 &&
        existing.global_affiliate_url === payload.global_affiliate_url) ||
      existing.affiliate_url === payload.affiliate_url

    return {
      affiliate_url: hasDomesticAffiliate ? existing.affiliate_url : payload.affiliate_url,
      brand: payload.brand || existing.brand || '',
      category: isSameGlobalProduct ? payload.category : existing.category || payload.category,
      global_affiliate_url: payload.global_affiliate_url ?? existing.global_affiliate_url ?? payload.affiliate_url,
      image_url: payload.image_url || existing.image_url || '',
      ingredient_names: existing.ingredient_names.length > 0 ? existing.ingredient_names : payload.ingredient_names,
      name: payload.name,
      price: payload.price > 0 ? payload.price : existing.price,
      region: resolveProductRegion(payload),
    }
  }

  return {
    affiliate_url: payload.affiliate_url,
    brand: payload.brand,
    category: payload.category,
    global_affiliate_url: existing.global_affiliate_url,
    image_url: payload.image_url || existing.image_url || '',
    ingredient_names: payload.ingredient_names.length > 0 ? payload.ingredient_names : existing.ingredient_names,
    name: payload.name,
    price: payload.price > 0 ? payload.price : existing.price,
    region: resolveProductRegion(payload),
  }
}

async function writeProductUpdate(id: string, updatePayload: Record<string, unknown>) {
  let nextPayload = updatePayload

  while (true) {
    const updateResult = await withSupabaseRetry(`update:${id}`, () =>
      supabase.from('products').update(nextPayload).eq('id', id)
    )

    if (!updateResult.error) {
      return
    }

    const fallbackPayload = removeUnsupportedProductColumns(nextPayload, updateResult.error)

    if (!fallbackPayload) {
      throw new Error(`Failed to update ${id}: ${updateResult.error.message}`)
    }

    nextPayload = fallbackPayload
  }
}

async function fetchInsertedProduct(payload: ProductPayload) {
  const fullAffiliateQuery = await withSupabaseRetry(`fetch-affiliate:${payload.affiliate_url}`, () =>
    supabase
      .from('products')
      .select('id, affiliate_url, global_affiliate_url, name, brand, category, image_url, ingredient_names, price')
      .eq('affiliate_url', payload.affiliate_url)
      .maybeSingle()
  )

  let byAffiliateUrl = fullAffiliateQuery

  if (fullAffiliateQuery.error && isMissingGlobalAffiliateUrlColumn(fullAffiliateQuery.error)) {
    byAffiliateUrl = await withSupabaseRetry(`fetch-affiliate-fallback:${payload.affiliate_url}`, () =>
      supabase
        .from('products')
        .select('id, affiliate_url, name, brand, category, image_url, ingredient_names, price')
        .eq('affiliate_url', payload.affiliate_url)
        .maybeSingle()
    )
  }

  if (!byAffiliateUrl.error && byAffiliateUrl.data) {
    return toExistingProductRecord({
      ...byAffiliateUrl.data,
      global_affiliate_url: 'global_affiliate_url' in byAffiliateUrl.data
        ? byAffiliateUrl.data.global_affiliate_url
        : payload.global_affiliate_url ?? null,
    })
  }

  const fullNameQuery = await withSupabaseRetry(`fetch-name:${payload.name}`, () =>
    supabase
      .from('products')
      .select('id, affiliate_url, global_affiliate_url, name, brand, category, image_url, ingredient_names, price')
      .eq('name', payload.name)
      .maybeSingle()
  )

  let byName = fullNameQuery

  if (fullNameQuery.error && isMissingGlobalAffiliateUrlColumn(fullNameQuery.error)) {
    byName = await withSupabaseRetry(`fetch-name-fallback:${payload.name}`, () =>
      supabase
        .from('products')
        .select('id, affiliate_url, name, brand, category, image_url, ingredient_names, price')
        .eq('name', payload.name)
        .maybeSingle()
    )
  }

  if (byName.error || !byName.data) {
    throw new Error(`Inserted product could not be reloaded: ${payload.name}`)
  }

  return toExistingProductRecord({
    ...byName.data,
    global_affiliate_url: 'global_affiliate_url' in byName.data ? byName.data.global_affiliate_url : payload.global_affiliate_url ?? null,
  })
}

async function writeProductInsert(payload: ProductPayload) {
  let nextPayload: Record<string, unknown> = {
    ...payload,
    region: resolveProductRegion(payload),
  }

  while (true) {
    const insertResult = await withSupabaseRetry(`insert:${payload.name}`, () =>
      supabase
        .from('products')
        .insert(nextPayload)
        .select('id, affiliate_url, global_affiliate_url, name, brand, category, image_url, ingredient_names, price')
        .maybeSingle()
    )

    if (!insertResult.error) {
      return insertResult.data ? toExistingProductRecord(insertResult.data) : fetchInsertedProduct(payload)
    }

    const fallbackPayload = removeUnsupportedProductColumns(nextPayload, insertResult.error)

    if (!fallbackPayload) {
      throw insertResult.error
    }

    nextPayload = fallbackPayload
  }
}

export async function loadExistingProducts() {
  const refs: ExistingProductRefs = {
    byAffiliateUrl: new Map<string, ExistingProductRecord>(),
    byGlobalUrl: new Map<string, ExistingProductRecord>(),
    byName: new Map<string, ExistingProductRecord>(),
  }
  let from = 0
  const pageSize = 1000

  while (true) {
    const to = from + pageSize - 1
    const fullQuery = await supabase
      .from('products')
      .select('id, affiliate_url, global_affiliate_url, name, brand, category, image_url, ingredient_names, price')
      .range(from, to)

    let rows = fullQuery.data as Array<Record<string, unknown>> | null

    if (fullQuery.error) {
      if (!isMissingGlobalAffiliateUrlColumn(fullQuery.error)) {
        throw new Error(`Failed to load existing products: ${fullQuery.error.message}`)
      }

      const fallbackQuery = await supabase
        .from('products')
        .select('id, affiliate_url, name, brand, category, image_url, ingredient_names, price')
        .range(from, to)

      if (fallbackQuery.error) {
        throw new Error(`Failed to load existing products: ${fallbackQuery.error.message}`)
      }

      rows = (fallbackQuery.data ?? []).map((row) => ({
        ...row,
        global_affiliate_url: null,
      }))
    }

    if (!rows || rows.length === 0) {
      break
    }

    for (const row of rows) {
      applyRecordToRefs(refs, toExistingProductRecord(row))
    }

    if (rows.length < pageSize) {
      break
    }

    from += pageSize
  }

  return refs
}

export async function countProductsByCategory(categories: readonly string[]) {
  const counts = new Map<string, number>()

  for (const category of categories) {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category', category)

    if (error) {
      throw new Error(`Failed to count ${category}: ${error.message}`)
    }

    counts.set(category, count ?? 0)
  }

  return counts
}

export async function upsertProduct(
  refs: ExistingProductRefs,
  payload: ProductPayload,
  mode: UpsertMode
) {
  const existing = getExistingMatch(refs, payload, mode)

  if (existing) {
    const updatePayload = buildUpdatePayload(existing, payload, mode)
    await writeProductUpdate(existing.id, updatePayload)

    const nextRecord: ExistingProductRecord = {
      ...existing,
      ...updatePayload,
      global_affiliate_url:
        typeof updatePayload.global_affiliate_url === 'string'
          ? updatePayload.global_affiliate_url
          : existing.global_affiliate_url,
    }

    removeRecordFromRefs(refs, existing)
    applyRecordToRefs(refs, nextRecord)

    return 'updated' as const
  }

  try {
    const insertedRecord = await writeProductInsert(payload)
    applyRecordToRefs(refs, insertedRecord)
    return 'inserted' as const
  } catch (error) {
    if (!isDuplicateProductNameError(error) || !payload.name) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to insert ${payload.name}: ${message}`)
    }

    const existingByName = refs.byName.get(payload.name)

    if (!existingByName) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Duplicate product name without local match for ${payload.name}: ${message}`)
    }

    const updatePayload = buildUpdatePayload(existingByName, payload, mode)
    await writeProductUpdate(existingByName.id, updatePayload)

    const nextRecord: ExistingProductRecord = {
      ...existingByName,
      ...updatePayload,
      global_affiliate_url:
        typeof updatePayload.global_affiliate_url === 'string'
          ? updatePayload.global_affiliate_url
          : existingByName.global_affiliate_url,
    }

    removeRecordFromRefs(refs, existingByName)
    applyRecordToRefs(refs, nextRecord)

    return 'updated' as const
  }
}
