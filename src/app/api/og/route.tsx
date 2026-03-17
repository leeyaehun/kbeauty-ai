import { ImageResponse } from 'next/og'

export const runtime = 'edge'

const SKIN_TYPE_KO: Record<string, string> = {
  dry: '건성',
  oily: '지성',
  combination: '복합성',
  sensitive: '민감성',
  normal: '중성',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const skinType = searchParams.get('skin_type') || 'normal'
  const hydration = searchParams.get('hydration') || '50'
  const oiliness = searchParams.get('oiliness') || '50'
  const sensitivity = searchParams.get('sensitivity') || '50'

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: 'black',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        <div style={{ fontSize: '24px', color: '#9ca3af', marginBottom: '16px' }}>
          K-Beauty AI 피부 분석 결과
        </div>

        <div style={{
          fontSize: '80px',
          fontWeight: 'bold',
          marginBottom: '40px',
        }}>
          {SKIN_TYPE_KO[skinType] || skinType} 피부
        </div>

        <div style={{ display: 'flex', gap: '40px', marginBottom: '48px' }}>
          {[
            { label: '수분도', value: hydration, color: '#60a5fa' },
            { label: '유분도', value: oiliness, color: '#facc15' },
            { label: '민감도', value: sensitivity, color: '#f87171' },
          ].map(item => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                border: `4px solid ${item.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 'bold',
                color: item.color,
              }}>
                {item.value}
              </div>
              <div style={{ fontSize: '16px', color: '#9ca3af' }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          fontSize: '20px',
          color: '#6b7280',
          borderTop: '1px solid #374151',
          paddingTop: '24px',
          width: '80%',
          textAlign: 'center',
        }}>
          kbeauty-ai.vercel.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
