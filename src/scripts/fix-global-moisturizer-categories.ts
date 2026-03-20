import { extractPrimaryProductName, resolveGlobalSkincareCategory } from './category-utils'
import { supabase } from './oliveyoung-shared'

type ProductRow = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  id: string
  name: string | null
}

const PAGE_SIZE = 1000
const TRACKED_CATEGORIES = new Set(['serum', 'cream', 'body_hair', 'sun_care', 'moisturizer'])

async function loadGlobalProducts() {
  const products: ProductRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category, affiliate_url')
      .like('affiliate_url', '%global.oliveyoung%')
      .range(from, to)

    if (error) {
      throw new Error(`Failed to load global products: ${error.message}`)
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

function buildFixTargets(products: ProductRow[]) {
  return products
    .map((product) => {
      if (
        typeof product.name !== 'string' ||
        typeof product.category !== 'string' ||
        !TRACKED_CATEGORIES.has(product.category)
      ) {
        return null
      }

      const nextCategory = resolveGlobalSkincareCategory(product.name, product.category)

      if (nextCategory === product.category) {
        return null
      }

      return {
        ...product,
        nextCategory,
        primaryName: extractPrimaryProductName(product.name),
      }
    })
    .filter(
      (
        product
      ): product is ProductRow & {
        nextCategory: string
        primaryName: string
      } => product !== null
    )
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

function countByCategory(products: Array<{ category: string | null }>) {
  return Object.fromEntries(
    [...new Set(products.map((product) => product.category ?? 'null'))]
      .sort()
      .map((category) => [
        category,
        products.filter((product) => (product.category ?? 'null') === category).length,
      ])
  )
}

async function main() {
  console.log('글로벌 스킨케어 카테고리 재분류 시작...')

  const products = await loadGlobalProducts()
  const fixTargets = buildFixTargets(products)

  console.log(`글로벌 상품 수: ${products.length}`)
  console.log(`재분류 대상: ${fixTargets.length}`)
  console.log(`현재 카테고리 분포: ${JSON.stringify(countByCategory(fixTargets))}`)

  let updatedCount = 0

  for (const product of fixTargets) {
    await updateCategory(product.id, product.nextCategory)
    updatedCount += 1
    console.log(
      `[${updatedCount}/${fixTargets.length}] ${product.brand ?? ''} ${product.name ?? ''} -> ${product.nextCategory}`
    )
  }

  const refreshedProducts = await loadGlobalProducts()
  const moisturizerCount = refreshedProducts.filter((product) => product.category === 'moisturizer').length

  console.log(`완료! 글로벌 스킨케어 재분류 ${updatedCount}건`)
  console.log(`현재 global moisturizer 총 개수: ${moisturizerCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
