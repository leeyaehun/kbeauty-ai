import { NextRequest, NextResponse } from 'next/server'

import { createServerSupabaseClient } from '@/lib/supabase'

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
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to view your wishlist.' }, { status: 401 })
    }

    const { data, error } = await supabase
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
      throw new Error(error.message)
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
      { error: error instanceof Error ? error.message : 'Failed to load wishlist.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to save products.' }, { status: 401 })
    }

    const { productId } = await req.json()

    if (typeof productId !== 'string' || productId.length === 0) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }

    const { error } = await supabase
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
      throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save wishlist item.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Please sign in to update your wishlist.' }, { status: 401 })
    }

    const { productId } = await req.json()

    if (typeof productId !== 'string' || productId.length === 0) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('wishlists')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId)

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove wishlist item.' },
      { status: 500 }
    )
  }
}
