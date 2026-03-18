import { config as loadEnv } from 'dotenv'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type SkinProfile = {
  combination: number
  dry: number
  normal: number
  oily: number
  sensitive: number
} | null

type ProductForEmbedding = {
  brand: string | null
  category: string | null
  id: string
  ingredient_names: string[] | null
  name: string | null
  skin_profile: SkinProfile
}

type IngredientScoreRow = {
  skin_combination: number | null
  skin_dry: number | null
  skin_normal: number | null
  skin_oily: number | null
  skin_sensitive: number | null
}

const EMBED_BATCH_SIZE = 1000
const EMBED_RETRY_COUNT = 3

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env.local')

loadEnv({ path: envPath })

let openai: OpenAI | null = null
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(`OPENAI_API_KEY is missing. Check ${envPath}.`)
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  return openai
}

async function generateEmbedding(text: string) {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

function buildProductText(product: ProductForEmbedding) {
  const parts = [
    `브랜드: ${product.brand ?? ''}`,
    `제품명: ${product.name ?? ''}`,
    `카테고리: ${product.category ?? ''}`,
    `성분: ${(product.ingredient_names ?? []).slice(0, 20).join(', ')}`,
  ]

  if (product.skin_profile) {
    const profile = product.skin_profile
    parts.push(
      `피부타입 적합성: 건성${profile.dry} 지성${profile.oily} 복합성${profile.combination} 민감성${profile.sensitive}`
    )
  }

  return parts.join(' | ')
}

async function buildSkinProfile(ingredientNames: string[]) {
  if (!ingredientNames || ingredientNames.length === 0) {
    return null
  }

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('skin_dry, skin_oily, skin_combination, skin_sensitive, skin_normal')
    .in('name_ko', ingredientNames)

  if (!ingredients || ingredients.length === 0) {
    return null
  }

  const rows = ingredients as IngredientScoreRow[]
  const avg = (key: keyof IngredientScoreRow) => {
    const scores = rows.map((row) => row[key]).filter((value): value is number => value !== null)

    return scores.length > 0
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
      : 3.0
  }

  return {
    combination: avg('skin_combination'),
    dry: avg('skin_dry'),
    normal: avg('skin_normal'),
    oily: avg('skin_oily'),
    sensitive: avg('skin_sensitive'),
  }
}

async function fetchEmbeddingBatch() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, brand, category, ingredient_names, skin_profile')
    .is('embedding', null)
    .order('id', { ascending: true })
    .limit(EMBED_BATCH_SIZE)

  if (error) {
    throw new Error(`제품 조회 실패: ${error.message}`)
  }

  return (products ?? []) as ProductForEmbedding[]
}

async function embedSingleProduct(product: ProductForEmbedding) {
  const skinProfile = await buildSkinProfile(product.ingredient_names ?? [])
  const text = buildProductText({
    ...product,
    skin_profile: skinProfile,
  })
  const embedding = await generateEmbedding(text)

  const { error: updateError } = await supabase
    .from('products')
    .update({
      embedding,
      skin_profile: skinProfile,
    })
    .eq('id', product.id)

  if (updateError) {
    throw new Error(updateError.message)
  }
}

export async function embedMissingProducts() {
  console.log('제품 임베딩 생성 시작...')

  let success = 0
  let failed = 0

  while (true) {
    const rows = await fetchEmbeddingBatch()

    if (rows.length === 0) {
      break
    }

    console.log(`배치 임베딩 대상 ${rows.length}개`)

    let batchSuccess = 0
    let batchFailed = 0

    for (const product of rows) {
      let lastError: unknown = null

      for (let attempt = 1; attempt <= EMBED_RETRY_COUNT; attempt += 1) {
        try {
          await embedSingleProduct(product)
          success += 1
          batchSuccess += 1
          console.log(
            `[success ${success}] ${product.brand ?? ''} - ${product.name ?? product.id}`
          )
          lastError = null
          break
        } catch (error) {
          lastError = error

          if (attempt < EMBED_RETRY_COUNT) {
            console.warn(
              `재시도 ${attempt}/${EMBED_RETRY_COUNT - 1}: ${product.name ?? product.id}`
            )
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      }

      if (lastError) {
        failed += 1
        batchFailed += 1
        console.error(`오류: ${product.name ?? product.id}`, lastError)
      }

      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    console.log(
      `배치 완료: 성공 ${batchSuccess}개, 실패 ${batchFailed}개, 누적 성공 ${success}개, 누적 실패 ${failed}개`
    )

    if (batchSuccess === 0 && batchFailed > 0) {
      console.error('현재 배치에서 임베딩을 전혀 저장하지 못해 종료합니다.')
      break
    }
  }

  console.log(`\n임베딩 완료: 성공 ${success}개, 실패 ${failed}개`)
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false

if (isMain) {
  embedMissingProducts().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
