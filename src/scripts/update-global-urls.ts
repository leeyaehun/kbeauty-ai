import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

const GLOBAL_OLIVEYOUNG_SEARCH_URL = 'https://global.oliveyoung.com/search'

const GLOBAL_BRANDS = [
  { searchName: 'COSRX', aliases: ['COSRX', '코스알엑스'] },
  { searchName: 'Innisfree', aliases: ['Innisfree', '이니스프리'] },
  { searchName: 'Some By Mi', aliases: ['Some By Mi', '섬바이미'] },
  { searchName: 'Laneige', aliases: ['Laneige', '라네즈'] },
  { searchName: 'Anua', aliases: ['Anua', '아누아'] },
  { searchName: 'Skin1004', aliases: ['Skin1004', '스킨1004'] },
  { searchName: 'Torriden', aliases: ['Torriden', '토리든'] },
  { searchName: 'Numbuzin', aliases: ['Numbuzin', '넘버즈인'] },
  { searchName: 'Beauty of Joseon', aliases: ['Beauty of Joseon', '조선미녀'] },
  { searchName: 'Medicube', aliases: ['Medicube', '메디큐브'] },
  { searchName: 'Dr.Jart+', aliases: ['Dr.Jart+', '닥터자르트'] },
  { searchName: 'Etude', aliases: ['Etude', '에뛰드'] },
  { searchName: 'Missha', aliases: ['Missha', '미샤'] },
  { searchName: 'The Face Shop', aliases: ['The Face Shop', '더페이스샵'] },
  { searchName: 'Klairs', aliases: ['Klairs', '클레어스'] },
] as const

type ProductRow = {
  id: string
  brand: string | null
  name: string | null
  global_affiliate_url: string | null
}

function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is missing. Check ${envPath}.`)
  }

  return value
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
)

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeForMatch(value: string) {
  return normalizeWhitespace(value).toLowerCase()
}

function findGlobalBrand(product: ProductRow) {
  const haystack = normalizeForMatch(`${product.brand ?? ''} ${product.name ?? ''}`)

  return GLOBAL_BRANDS.find((brand) =>
    brand.aliases.some((alias) => haystack.includes(normalizeForMatch(alias)))
  ) ?? null
}

function buildSearchUrl(brandName: string, productName: string) {
  const url = new URL(GLOBAL_OLIVEYOUNG_SEARCH_URL)
  url.searchParams.set('query', normalizeWhitespace(`${brandName} ${productName}`))
  return url.toString()
}

async function loadProducts() {
  const products: ProductRow[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('products')
      .select('id, brand, name, global_affiliate_url')
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load products: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    products.push(...data)

    if (data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return products
}

async function main() {
  console.log('글로벌 브랜드 기반 URL 업데이트 시작...')

  const products = await loadProducts()
  let updatedCount = 0

  for (const product of products) {
    if (!product.name) {
      continue
    }

    const matchedBrand = findGlobalBrand(product)

    if (!matchedBrand) {
      continue
    }

    const nextUrl = buildSearchUrl(matchedBrand.searchName, product.name)

    if (product.global_affiliate_url === nextUrl) {
      continue
    }

    const { error } = await supabase
      .from('products')
      .update({ global_affiliate_url: nextUrl })
      .eq('id', product.id)

    if (error) {
      throw new Error(`Failed to update ${product.id}: ${error.message}`)
    }

    updatedCount += 1
  }

  console.log(`완료! 업데이트된 제품 ${updatedCount}개`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
