import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

const SKIN_TYPE_KO: Record<string, string> = {
  dry: '건성',
  oily: '지성',
  combination: '복합성',
  sensitive: '민감성',
  normal: '중성',
}

function clampScore(value: string | null, fallback: number) {
  const parsed = Number(value)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.max(0, Math.min(100, Math.round(parsed)))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const skinType = searchParams.get('skin_type') || 'normal'
    const hydration = clampScore(searchParams.get('hydration'), 50)
    const oiliness = clampScore(searchParams.get('oiliness'), 50)
    const sensitivity = clampScore(searchParams.get('sensitivity'), 50)

    const metrics = [
      { label: '수분도', value: hydration, color: '#60a5fa' },
      { label: '유분도', value: oiliness, color: '#facc15' },
      { label: '민감도', value: sensitivity, color: '#f87171' },
    ]

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            color: '#ffffff',
            fontFamily: 'sans-serif',
            padding: '48px 64px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#9ca3af',
              marginBottom: 16,
            }}
          >
            K-Beauty AI 피부 분석 결과
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 80,
              fontWeight: 700,
              marginBottom: 40,
            }}
          >
            {SKIN_TYPE_KO[skinType] || skinType} 피부
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 48,
            }}
          >
            {metrics.map((item, index) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginRight: index < metrics.length - 1 ? 40 : 0,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '9999px',
                    border: `4px solid ${item.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 700,
                    color: item.color,
                    marginBottom: 8,
                  }}
                >
                  {String(item.value)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 16,
                    color: '#9ca3af',
                  }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              width: '80%',
              justifyContent: 'center',
              borderTop: '1px solid #374151',
              paddingTop: 24,
              fontSize: 20,
              color: '#6b7280',
            }}
          >
            kbeauty-ai.vercel.app
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (error) {
    console.error('OG image generation failed:', error)
    return new Response('Failed to generate OG image', { status: 500 })
  }
}
