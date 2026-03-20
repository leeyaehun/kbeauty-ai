import { fetchGlobalProductCategoryPath } from './global-oliveyoung-detail'
import { supabase } from './oliveyoung-shared'

type ProductRow = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  id: string
  name: string | null
}

const PAGE_SIZE = 500
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.FIX_GLOBAL_SERUM_CONCURRENCY ?? '8', 10) || 8)

async function loadGlobalSerumProducts() {
  const products: ProductRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category, affiliate_url')
      .like('affiliate_url', '%global.oliveyoung.com%')
      .eq('category', 'serum')
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load global serum products: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    products.push(
      ...data.map((row) => ({
        affiliate_url: typeof row.affiliate_url === 'string' ? row.affiliate_url : null,
        brand: typeof row.brand === 'string' ? row.brand : null,
        category: typeof row.category === 'string' ? row.category : null,
        id: String(row.id),
        name: typeof row.name === 'string' ? row.name : null,
      }))
    )

    if (data.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return products
}

async function updateCategory(productId: string, category: string) {
  const { error } = await supabase
    .from('products')
    .update({ category })
    .eq('id', productId)

  if (error) {
    throw new Error(`Failed to update ${productId}: ${error.message}`)
  }
}

async function main() {
  console.log('글로벌 serum 카테고리 정리 시작...')

  const products = await loadGlobalSerumProducts()
  console.log(`현재 global serum 상품 수: ${products.length}`)

  let cursor = 0
  let inspectedCount = 0
  let failedCount = 0
  const fixTargets: Array<ProductRow & { categoryPathEn: string, nextCategory: string }> = []

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, products.length) }, async () => {
      while (true) {
        const index = cursor
        cursor += 1

        if (index >= products.length) {
          return
        }

        const product = products[index]
        let detail: Awaited<ReturnType<typeof fetchGlobalProductCategoryPath>>

        try {
          detail = await fetchGlobalProductCategoryPath(product.affiliate_url)
        } catch (error) {
          failedCount += 1
          inspectedCount += 1
          console.warn(
            `[inspect ${inspectedCount}/${products.length}] detail lookup failed for ${product.name ?? ''}: ${String(error)}`
          )
          continue
        }

        inspectedCount += 1

        if (!detail.categoryPathEn || !detail.category || detail.category === 'serum') {
          continue
        }

        fixTargets.push({
          ...product,
          categoryPathEn: detail.categoryPathEn,
          nextCategory: detail.category,
        })

        console.log(
          `[inspect ${inspectedCount}/${products.length}] ${product.name ?? ''} => ${detail.categoryPathEn} -> ${detail.category}`
        )
      }
    })
  )

  console.log(`serum 재분류 대상: ${fixTargets.length}`)
  console.log(`detail lookup 실패: ${failedCount}`)

  let updatedCount = 0

  for (const product of fixTargets) {
    await updateCategory(product.id, product.nextCategory)
    updatedCount += 1
    console.log(
      `[update ${updatedCount}/${fixTargets.length}] ${product.brand ?? ''} ${product.name ?? ''} -> ${product.nextCategory}`
    )
  }

  const distribution = Object.fromEntries(
    [...new Set(fixTargets.map((product) => product.nextCategory))]
      .sort()
      .map((category) => [
        category,
        fixTargets.filter((product) => product.nextCategory === category).length,
      ])
  )

  console.log(`완료! global serum 재분류 ${updatedCount}건`)
  console.log(`이동 카테고리 분포: ${JSON.stringify(distribution)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
