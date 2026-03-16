import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

const PAGE_SIZE = 100
const BASE_URL =
  'https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01'

type MfdsIngredientItem = {
  INGR_KOR_NAME?: string | null
  INGR_ENG_NAME?: string | null
  CAS_NO?: string | null
  ORIGIN_MAJOR_KOR_NAME?: string | null
  INGR_SYNONYM?: string | null
}

type MfdsResponse = {
  header?: {
    resultCode?: string
    resultMsg?: string
  }
  body?: {
    pageNo?: number
    totalCount?: number
    numOfRows?: number
    items?: MfdsIngredientItem[]
  }
}

const INGREDIENTS_TABLE = 'ingredients'

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

const apiKey = requireEnv('MFDS_API_KEY')
const maxPages = process.env.MFDS_MAX_PAGES
  ? Number.parseInt(process.env.MFDS_MAX_PAGES, 10)
  : undefined

async function fetchIngredients(pageNo: number) {
  const url = new URL(BASE_URL)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('type', 'json')
  url.searchParams.set('pageNo', String(pageNo))
  url.searchParams.set('numOfRows', String(PAGE_SIZE))

  const res = await fetch(url)
  const text = await res.text()

  if (!res.ok) {
    throw new Error(`MFDS API request failed (${res.status}): ${text}`)
  }

  const json = JSON.parse(text) as MfdsResponse
  const resultCode = json.header?.resultCode

  if (resultCode !== '00') {
    throw new Error(`MFDS API error (${resultCode ?? 'unknown'}): ${json.header?.resultMsg ?? text}`)
  }

  if (!json.body) {
    throw new Error('MFDS API returned no body.')
  }

  return json.body
}

async function loadExistingNames() {
  const existingNames = new Set<string>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from(INGREDIENTS_TABLE)
      .select('name_ko')
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load existing ingredients: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    for (const row of data) {
      if (row.name_ko) {
        existingNames.add(row.name_ko)
      }
    }

    if (data.length < pageSize) {
      break
    }

    from += pageSize
  }

  return existingNames
}

async function main() {
  console.log('식약처 성분 데이터 수집 시작...')

  const existingNames = await loadExistingNames()
  console.log(`기존 ingredients 테이블에서 ${existingNames.size}개 성분명을 확인했습니다.`)

  const first = await fetchIngredients(1)
  const totalCount = first.totalCount ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const pagesToProcess = maxPages ? Math.min(totalPages, maxPages) : totalPages

  console.log(`총 ${totalCount}개 성분, ${totalPages}페이지`)
  if (maxPages) {
    console.log(`테스트 설정으로 ${pagesToProcess}페이지까지만 처리합니다.`)
  }

  let inserted = 0

  for (let page = 1; page <= pagesToProcess; page++) {
    const body = page === 1 ? first : await fetchIngredients(page)
    const items = body.items ?? []

    if (items.length === 0) {
      console.log(`페이지 ${page}에 데이터가 없어 종료합니다.`)
      break
    }

    const rows = items.map((item) => ({
      name_ko: item.INGR_KOR_NAME ?? '',
      name_en: item.INGR_ENG_NAME ?? '',
      cas_no: item.CAS_NO ?? '',
      definition: item.ORIGIN_MAJOR_KOR_NAME ?? '',
    }))

    const newRows = rows.filter((row) => row.name_ko && !existingNames.has(row.name_ko))

    if (newRows.length === 0) {
      console.log(`페이지 ${page}는 신규 성분이 없어 건너뜁니다.`)
      continue
    }

    const { error } = await supabase
      .from(INGREDIENTS_TABLE)
      .insert(newRows)

    if (error) {
      console.error(`페이지 ${page} 오류: ${error.message}`)
      continue
    }

    for (const row of newRows) {
      existingNames.add(row.name_ko)
    }

    inserted += newRows.length
    console.log(`페이지 ${page}/${pagesToProcess} 완료 - 누적 ${inserted}개`)

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.log(`완료! 총 ${inserted}개 성분 저장됨`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
