import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Region = 'korea' | 'global'

function resolveRegion(countryCode: string | null): Region {
  return countryCode?.toUpperCase() === 'KR' ? 'korea' : 'global'
}

export async function GET() {
  const headerList = await headers()
  const countryCode =
    headerList.get('x-vercel-ip-country') ??
    headerList.get('cf-ipcountry') ??
    headerList.get('x-country-code')

  return NextResponse.json(
    { region: resolveRegion(countryCode) },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
