import { NextRequest, NextResponse } from 'next/server'

import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase'

type WishlistRow = {
  created_at: string
  product:
    | {
        affiliate_url: string | null
        brand: string | null
        category: string | null
        global_affiliate_url: string | null
        id: string
        image_url: string | null
        name: string | null
        price: number | null
      }
    | Array<{
        affiliate_url: string | null
        brand: string | null
        category: string | null
        global_affiliate_url: string | null
        id: string
        image_url: string | null
        name: string | null
        price: number | null
      }>
    | null
  product_id: string
}

function normalizeWishlistProduct(value: WishlistRow['product']) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

type WishlistProduct = {
  affiliate_url: string | null
  brand: string | null
  category: string | null
  global_affiliate_url: string | null
  id: string
  image_url: string | null
  name: string | null
  price: number | null
}

async function getAuthenticatedUser() {
  const authSupabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await authSupabase.auth.getUser()

  return {
    databaseSupabase: createServiceRoleSupabaseClient(),
    user,
  }
}

function isMissingWishlistTable(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error ? error.message : null

  return (
    code === 'PGRST205' ||
    (typeof message === 'string' && message.includes("Could not find the table 'public.wishlists'"))
  )
}

function normalizeProductIdsParam(value: string | null) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  try {
    const { databaseSupabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to view your wishlist.' }, { status: 401 })
    }

    const fallbackProductIds = normalizeProductIdsParam(req.nextUrl.searchParams.get('productIds'))

    if (fallbackProductIds.length > 0) {
      const { data, error } = await databaseSupabase
        .from('products')
        .select(`
          id,
          name,
          brand,
          price,
          category,
          affiliate_url,
          global_affiliate_url,
          image_url
        `)
        .in('id', fallbackProductIds)

      if (error) {
        throw error
      }

      const items = (data ?? []).map((product) => ({
        created_at: '',
        product,
        product_id: product.id,
      }))

      return NextResponse.json({
        items,
        productIds: items.map((entry) => entry.product_id),
      })
    }

    const { data, error } = await databaseSupabase
      .from('wishlists')
      .select(`
        product_id,
        created_at,
        product:products (
          id,
          name,
          brand,
          price,
          category,
          affiliate_url,
          global_affiliate_url,
          image_url
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      if (isMissingWishlistTable(error)) {
        return NextResponse.json(
          { error: 'Wishlist table is not available yet.', error_code: 'wishlist_table_missing' },
          { status: 503 }
        )
      }

      throw error
    }

    const items = ((data ?? []) as unknown as WishlistRow[])
      .map((entry) => ({
        ...entry,
        product: normalizeWishlistProduct(entry.product),
      }))
      .filter((entry): entry is { created_at: string, product: WishlistProduct, product_id: string } => Boolean(entry.product))
      .map((entry) => ({
        created_at: entry.created_at,
        product: entry.product,
        product_id: entry.product_id,
      }))

    return NextResponse.json({
      items,
      productIds: items.map((entry) => entry.product_id),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Failed to load wishlist.',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { databaseSupabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to save products.' }, { status: 401 })
    }

    const { productId } = await req.json()

    if (typeof productId !== 'string' || productId.length === 0) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }

    const { error } = await databaseSupabase
      .from('wishlists')
      .upsert(
        {
          product_id: productId,
          user_id: user.id,
        },
        {
          onConflict: 'user_id,product_id',
        }
      )

    if (error) {
      if (isMissingWishlistTable(error)) {
        return NextResponse.json(
          { error: 'Wishlist table is not available yet.', error_code: 'wishlist_table_missing' },
          { status: 503 }
        )
      }

      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Failed to save wishlist item.',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { databaseSupabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to update your wishlist.' }, { status: 401 })
    }

    const { productId } = await req.json()

    if (typeof productId !== 'string' || productId.length === 0) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }

    const { error } = await databaseSupabase
      .from('wishlists')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId)

    if (error) {
      if (isMissingWishlistTable(error)) {
        return NextResponse.json(
          { error: 'Wishlist table is not available yet.', error_code: 'wishlist_table_missing' },
          { status: 503 }
        )
      }

      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Failed to remove wishlist item.',
      },
      { status: 500 }
    )
  }
}
