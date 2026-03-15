import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const API_KEY = process.env.MFDS_API_KEY!
const BASE_URL = 'http://apis.data.go.kr/1471000/CosmeticIngredientInfoService01/getCosmeticIngredientList01'

async function fetchIngredients(pageNo: number) {
  const url = `${BASE_URL}?serviceKey=${API_KEY}&type=json&pageNo=${pageNo}&numOfRows=100`
  const res = await fetch(url)
  const json = await res.json()
  return json.body
}

async function main() {
  console.log('식약처 성분 데이터 수집 시작...')

  // 1페이지 먼저 받아서 총 개수 확인
  const first = await fetchIngredients(1)
  const totalCount = first.totalCount
  const totalPages = Math.ceil(totalCount / 100)

  console.log(`총 ${totalCount}개 성분, ${totalPages}페이지`)

  let inserted = 0

  for (let page = 1; page <= totalPages; page++) {
    const body = await fetchIngredients(page)
    const items = body.items

    if (!items || items.length === 0) break

    const rows = items.map((item: any) => ({
      name_ko: item.ingdKorName || '',
      name_en: item.ingdEngName || '',
      cas_no: item.casNo || '',
      definition: item.ingdDfnt || '',
    }))

    const { error } = await supabase
      .from('ingredients')
      .upsert(rows, { onConflict: 'name_ko' })

    if (error) {
      console.error(`페이지 ${page} 오류:`, error.message)
    } else {
      inserted += rows.length
      console.log(`페이지 ${page}/${totalPages} 완료 — 누적 ${inserted}개`)
    }

    // API 과호출 방지
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`완료! 총 ${inserted}개 성분 저장됨`)
}

main().catch(console.error)