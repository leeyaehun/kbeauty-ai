import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

function buildProductText(product: any) {
  // 제품 정보를 텍스트로 변환 (임베딩용)
  const parts = [
    `브랜드: ${product.brand}`,
    `제품명: ${product.name}`,
    `카테고리: ${product.category}`,
    `성분: ${(product.ingredient_names || []).slice(0, 20).join(', ')}`,
  ]

  if (product.skin_profile) {
    const p = product.skin_profile
    parts.push(`피부타입 적합성: 건성${p.dry} 지성${p.oily} 복합성${p.combination} 민감성${p.sensitive}`)
  }

  return parts.join(' | ')
}

async function buildSkinProfile(ingredientNames: string[]) {
  if (!ingredientNames || ingredientNames.length === 0) return null

  // 성분명으로 DB에서 점수 조회
  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('skin_dry, skin_oily, skin_combination, skin_sensitive, skin_normal')
    .in('name_ko', ingredientNames)

  if (!ingredients || ingredients.length === 0) return null

  // 성분별 점수 평균 계산
  const avg = (key: string) => {
    const scores = ingredients
      .map((i: any) => i[key])
      .filter((v: any) => v !== null && v !== undefined)
    return scores.length > 0
      ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
      : 3.0
  }

  return {
    dry: avg('skin_dry'),
    oily: avg('skin_oily'),
    combination: avg('skin_combination'),
    sensitive: avg('skin_sensitive'),
    normal: avg('skin_normal'),
  }
}

async function main() {
  console.log('제품 임베딩 생성 시작...')

  // 임베딩 없는 제품만 가져오기
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, brand, category, ingredient_names, skin_profile')
    .is('embedding', null)

  if (error) {
    console.error('제품 조회 실패:', error.message)
    return
  }

  console.log(`임베딩 생성할 제품 ${products.length}개`)

  let success = 0
  let failed = 0

  for (const product of products) {
    try {
      // 1. 피부 프로파일 계산
      const skinProfile = await buildSkinProfile(product.ingredient_names || [])

      // 2. 제품 텍스트 생성
      const productWithProfile = { ...product, skin_profile: skinProfile }
      const text = buildProductText(productWithProfile)

      // 3. 임베딩 생성
      const embedding = await generateEmbedding(text)

      // 4. DB 업데이트
      const { error: updateError } = await supabase
        .from('products')
        .update({
          skin_profile: skinProfile,
          embedding: embedding,
        })
        .eq('id', product.id)

      if (updateError) {
        failed++
        console.error(`실패: ${product.name}`, updateError.message)
      } else {
        success++
        console.log(`[${success}/${products.length}] ${product.brand} - ${product.name}`)
      }

      // API 과호출 방지
      await new Promise(r => setTimeout(r, 200))

    } catch (e) {
      failed++
      console.error(`오류: ${product.name}`, e)
    }
  }

  console.log(`\n완료! 성공 ${success}개, 실패 ${failed}개`)
}

main().catch(console.error)