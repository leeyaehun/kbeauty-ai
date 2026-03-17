import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001'
const DEBUG_ONE = process.env.MAP_INGREDIENTS_DEBUG_ONE === '1'
const LOAD_BATCH_SIZE = 1000
const PROGRESS_INTERVAL = 100

type IngredientRow = {
  id: string
  name_ko: string
  name_en: string | null
}

function extractTextContent(content: Anthropic.Message['content']) {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function parseJsonResponse(text: string) {
  const trimmed = text.trim()
  const unfenced = trimmed
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  const objectMatch = unfenced.match(/\{[\s\S]*\}/)
  const jsonCandidate = objectMatch?.[0]?.trim() ?? unfenced

  try {
    return JSON.parse(jsonCandidate)
  } catch (error) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)

    if (fenced?.[1]) {
      const fencedObjectMatch = fenced[1].match(/\{[\s\S]*\}/)
      return JSON.parse(fencedObjectMatch?.[0]?.trim() ?? fenced[1].trim())
    }

    throw error
  }
}

async function loadIngredientsToMap() {
  const countQuery = await supabase
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .is('skin_dry', null)

  if (countQuery.error) {
    throw new Error(`성분 개수 조회 실패: ${countQuery.error.message}`)
  }

  const total = DEBUG_ONE ? Math.min(countQuery.count ?? 0, 1) : (countQuery.count ?? 0)
  const ingredients: IngredientRow[] = []

  for (let from = 0; from < total; from += LOAD_BATCH_SIZE) {
    const to = Math.min(from + LOAD_BATCH_SIZE - 1, total - 1)
    const batchQuery = await supabase
      .from('ingredients')
      .select('id, name_ko, name_en')
      .is('skin_dry', null)
      .range(from, to)

    if (batchQuery.error) {
      throw new Error(`성분 로드 실패 (${from}-${to}): ${batchQuery.error.message}`)
    }

    ingredients.push(...((batchQuery.data ?? []) as IngredientRow[]))
  }

  return ingredients
}

async function mapIngredient(nameKo: string, nameEn: string) {
  console.log(`Anthropic 요청 시작: ${nameKo} / model=${MODEL}`)

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `화장품 성분 "${nameKo}" (${nameEn || 'N/A'})에 대해 피부 타입별 적합성을 JSON으로만 답해줘. 다른 텍스트 없이 JSON만 반환해.

{
  "skin_dry": 1-5,
  "skin_oily": 1-5,
  "skin_combination": 1-5,
  "skin_sensitive": 1-5,
  "skin_normal": 1-5,
  "benefits": ["효능1", "효능2"],
  "concerns": ["주의사항1"],
  "kbeauty_note": "K뷰티에서의 역할 한 줄 설명"
}

점수 기준: 5=매우 적합, 3=보통, 1=적합하지 않음`
        }
      ]
    })

    const text = extractTextContent(message.content)

    if (DEBUG_ONE) {
      console.log('Anthropic raw response:')
      console.log(text)
    }

    const parsed = parseJsonResponse(text)

    if (DEBUG_ONE) {
      console.log('JSON parse success')
    }

    return parsed
  } catch (error) {
    console.error(`Anthropic 처리 실패: ${nameKo}`)

    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(error)
    }

    if (DEBUG_ONE) {
      console.error('상세 오류 객체:', error)
    }

    return null
  }
}

async function main() {
  console.log('성분 피부 타입 매핑 시작...')
  console.log(
    `ANTHROPIC_API_KEY loaded=${Boolean(process.env.ANTHROPIC_API_KEY)} length=${process.env.ANTHROPIC_API_KEY?.length ?? 0}`
  )
  console.log(`디버그 1건 모드=${DEBUG_ONE}`)

  const ingredients = await loadIngredientsToMap()

  if (!ingredients || ingredients.length === 0) {
    console.error('매핑할 성분이 없습니다.')
    return
  }

  const total = ingredients.length

  console.log(`매핑할 성분 ${total}개`)

  let success = 0
  let failed = 0
  let processed = 0

  for (const ingredient of ingredients) {
    try {
      const mapping = await mapIngredient(ingredient.name_ko, ingredient.name_en || '')

      if (!mapping) {
        failed++
        processed++

        if (!DEBUG_ONE && (processed % PROGRESS_INTERVAL === 0 || processed === total)) {
          console.log(`[${processed}/${total}] 완료 (성공 ${success}, 실패 ${failed})`)
        }

        if (DEBUG_ONE) {
          console.error(`디버그 모드에서 ${ingredient.name_ko} 처리 실패 후 종료합니다.`)
          break
        }

        continue
      }

      const { error: updateError } = await supabase
        .from('ingredients')
        .update({
          skin_dry: mapping.skin_dry,
          skin_oily: mapping.skin_oily,
          skin_combination: mapping.skin_combination,
          skin_sensitive: mapping.skin_sensitive,
          skin_normal: mapping.skin_normal,
          benefits: mapping.benefits,
          concerns: mapping.concerns,
          kbeauty_note: mapping.kbeauty_note,
        })
        .eq('id', ingredient.id)

      if (updateError) {
        failed++
        console.error(`업데이트 실패: ${ingredient.name_ko}`, updateError.message)
      } else {
        success++

        if (DEBUG_ONE) {
          console.log(
            `[${success}] ${ingredient.name_ko} → dry:${mapping.skin_dry} oily:${mapping.skin_oily} sensitive:${mapping.skin_sensitive}`
          )
        }
      }

      processed++

      if (!DEBUG_ONE && (processed % PROGRESS_INTERVAL === 0 || processed === total)) {
        console.log(`[${processed}/${total}] 완료 (성공 ${success}, 실패 ${failed})`)
      }

      // API 과호출 방지
      await new Promise(r => setTimeout(r, 300))

    } catch (e) {
      failed++
      processed++
      console.error(`오류: ${ingredient.name_ko}`, e)

      if (!DEBUG_ONE && (processed % PROGRESS_INTERVAL === 0 || processed === total)) {
        console.log(`[${processed}/${total}] 완료 (성공 ${success}, 실패 ${failed})`)
      }

      if (DEBUG_ONE) {
        break
      }
    }
  }

  console.log(`\n완료! 성공 ${success}개, 실패 ${failed}개`)
}

main().catch(console.error)
