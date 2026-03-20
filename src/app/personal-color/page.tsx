'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import PersonalColorCanvas, {
  type PersonalColorCanvasHandle,
  type PersonalColorSeason,
  type PersonalColorSwatch,
} from '@/components/PersonalColorCanvas'
import UpgradeModal from '@/components/UpgradeModal'
import { createClient } from '@/lib/supabase'

type MakeupCategoryKey = 'foundation' | 'lip' | 'blush' | 'eyeshadow'
type ProductLinkType = 'oliveyoung_global' | 'brand_site' | 'search'

type MakeupProduct = {
  brand: string
  name: string
  reason: string
  shade: string
  product_url: string
  link_type: ProductLinkType
}

type MakeupProductSection = {
  tip: string
  products: MakeupProduct[]
}

type PersonalColorResult = {
  season: PersonalColorSeason
  tone: 'warm' | 'cool'
  description: string
  characteristics: string[]
  best_colors: PersonalColorSwatch[]
  avoid_colors: PersonalColorSwatch[]
  makeup_recommendations: {
    foundation: string
    lip: string
    blush: string
    eyeshadow: string
  }
  celebrity_examples: string[]
  product_recommendations: Record<MakeupCategoryKey, MakeupProductSection>
}

const SEASON_META: Record<
  PersonalColorSeason,
  {
    background: string
    badgeClassName: string
    subtitle: string
    title: string
  }
> = {
  autumn_warm: {
    background: '#FFF5E6',
    badgeClassName: 'bg-[#FFE8C2] text-[#8B6914]',
    subtitle: 'Earth-led and golden shades create depth when your coloring prefers warmth over contrast.',
    title: 'AUTUMN WARM',
  },
  spring_warm: {
    background: '#FFF0E6',
    badgeClassName: 'bg-[#FFE4C4] text-[#8B4513]',
    subtitle: 'Lively peach, coral, and sunlit yellows tend to brighten your complexion immediately.',
    title: 'SPRING WARM',
  },
  summer_cool: {
    background: '#F0E6FF',
    badgeClassName: 'bg-[#E6E6FA] text-[#483D8B]',
    subtitle: 'Powdery mauves, cool pinks, and airy blues bring softness without washing you out.',
    title: 'SUMMER COOL',
  },
  winter_cool: {
    background: '#E6F0FF',
    badgeClassName: 'bg-[#E0F0FF] text-[#1A3A5C]',
    subtitle: 'High-contrast cool tones, from icy neutrals to sharp brights, amplify your definition.',
    title: 'WINTER COOL',
  },
}

const MAKEUP_TABS: Array<{ key: MakeupCategoryKey, label: string }> = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'lip', label: 'Lip' },
  { key: 'blush', label: 'Blush' },
  { key: 'eyeshadow', label: 'Eyeshadow' },
]

function buildOliveYoungSearchUrl(brand: string, name: string) {
  const url = new URL('https://global.oliveyoung.com/display/search')
  url.searchParams.set('query', `${brand} ${name}`.trim())
  return url.toString()
}

function getProductButtonMeta(linkType: ProductLinkType) {
  switch (linkType) {
    case 'oliveyoung_global':
      return {
        className: 'bg-[#1a4660] text-white hover:bg-[#14354a]',
        label: 'Shop on Olive Young Global',
      }
    case 'brand_site':
      return {
        className: 'bg-[#9e5746] text-white hover:bg-[#824636]',
        label: 'Shop on Brand Site',
      }
    default:
      return {
        className: 'bg-[#edf1f5] text-[#445267] hover:bg-[#dce4ed]',
        label: 'Search on Olive Young',
      }
  }
}

function buildPageBackground(hex: string) {
  return `
    radial-gradient(circle at top left, rgba(255,255,255,0.65), transparent 28%),
    radial-gradient(circle at top right, rgba(255,255,255,0.38), transparent 24%),
    linear-gradient(180deg, ${hex} 0%, rgba(255,255,255,0.94) 58%, #ffffff 100%)
  `
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: blob.type || 'image/png' })
}

export default function PersonalColorPage() {
  const router = useRouter()
  const canvasRef = useRef<PersonalColorCanvasHandle | null>(null)
  const [activeTab, setActiveTab] = useState<MakeupCategoryKey>('foundation')
  const [capturedImage, setCapturedImage] = useState('')
  const [error, setError] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paramsReady, setParamsReady] = useState(false)
  const [result, setResult] = useState<PersonalColorResult | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [wheelAnimationVersion, setWheelAnimationVersion] = useState(0)

  useEffect(() => {
    let isActive = true

    async function loadMembershipAccess() {
      const searchParams = new URLSearchParams(window.location.search)
      const requestedUpgrade = searchParams.get('upgrade') === '1'

      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          if (isActive) {
            setShowUpgrade(requestedUpgrade)
          }
          return
        }

        const { data: planData } = await supabase
          .from('user_plans')
          .select('plan')
          .eq('user_id', user.id)
          .single()

        console.log('Current plan:', planData?.plan)

        const hasMembership = planData?.plan === 'membership'

        if (isActive) {
          setShowUpgrade(requestedUpgrade && !hasMembership)
        }
      } catch {
        if (isActive) {
          setShowUpgrade(requestedUpgrade)
        }
      } finally {
        if (isActive) {
          setParamsReady(true)
        }
      }
    }

    loadMembershipAccess()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (!paramsReady) {
      return
    }

    if (showUpgrade) {
      setLoading(false)
      return
    }

    async function analyzePersonalColor() {
      const imageData = sessionStorage.getItem('capturedImage')

      if (!imageData) {
        router.push('/analyze')
        return
      }

      setCapturedImage(imageData)

      try {
        const response = await fetch('/api/personal-color', {
          body: JSON.stringify({ imageBase64: imageData }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Personal color analysis failed.')
          return
        }

        setResult(data)
      } catch {
        setError('A network error occurred while analyzing your personal color.')
      } finally {
        setLoading(false)
      }
    }

    analyzePersonalColor()
  }, [paramsReady, router, showUpgrade])

  const seasonMeta = result ? SEASON_META[result.season] : null
  const activeRecommendation = useMemo(
    () => (result ? result.product_recommendations[activeTab] : null),
    [activeTab, result]
  )
  const canvasBackground = selectedColor ?? seasonMeta?.background ?? '#FFF6FB'

  async function handleShareColors() {
    const exported = canvasRef.current?.exportImage()

    if (!exported) {
      return
    }

    setIsSharing(true)

    try {
      const file = await dataUrlToFile(exported, 'kbeauty-ai-personal-color-wheel.png')

      if (
        navigator.share &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          text: 'My personal color wheel from K-Beauty AI.',
          title: 'K-Beauty AI Personal Color',
        })
        return
      }

      const link = document.createElement('a')
      link.href = exported
      link.download = file.name
      link.click()
    } finally {
      setIsSharing(false)
    }
  }

  if (loading) {
    return (
      <main className="brand-page flex items-center justify-center px-6">
        <div className="brand-card flex max-w-md items-center gap-4 px-6 py-5">
          <div className="h-10 w-10 rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#7c5d67]">Preparing your color wheel</p>
            <p className="text-sm text-[var(--muted)]">Building the palette around your portrait.</p>
          </div>
        </div>
      </main>
    )
  }

  if (showUpgrade) {
    return (
      <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
        <div className="brand-shell max-w-3xl">
          <div className="mb-8 flex justify-center md:justify-start">
            <div className="brand-mark">K-Beauty AI</div>
          </div>
          <UpgradeModal inline />
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="brand-page flex items-center justify-center px-6 py-10">
        <div className="brand-card max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">K-Beauty AI</div>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">Personal color is unavailable</h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">{error}</p>
          <button
            onClick={() => router.push('/results')}
            className="brand-button-primary mt-8 px-8 py-4 font-semibold"
          >
            Back to Results
          </button>
        </div>
      </main>
    )
  }

  if (!result || !seasonMeta || !activeRecommendation || !capturedImage) {
    return null
  }

  return (
    <main
      className="min-h-screen px-5 py-6 md:px-8 md:py-10"
      style={{
        background: buildPageBackground(selectedColor ?? seasonMeta.background),
        color: 'var(--ink)',
        transition: 'background 500ms ease',
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark bg-white/75">K-Beauty AI</div>
        </div>

        <section className="rounded-[36px] border border-white/70 bg-white/58 p-5 shadow-[0_28px_80px_rgba(60,43,57,0.12)] backdrop-blur-xl md:p-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className={`inline-flex rounded-full px-5 py-3 text-sm font-semibold tracking-[0.16em] ${seasonMeta.badgeClassName}`}>
              {seasonMeta.title}
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#5f4a61] md:text-base">
              {seasonMeta.subtitle}
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#6b5967]">
              {result.description}
            </p>
          </div>

          <div className="mt-6">
            <PersonalColorCanvas
              animateVersion={wheelAnimationVersion}
              ref={canvasRef}
              avoidColors={result.avoid_colors}
              backgroundHex={canvasBackground}
              bestColors={result.best_colors}
              imageData={capturedImage}
              onColorSelect={setSelectedColor}
              selectedHex={selectedColor}
              season={result.season}
            />

            <button
              onClick={() => {
                setSelectedColor(null)
                setWheelAnimationVersion((value) => value + 1)
              }}
              className="mt-5 w-full rounded-full bg-[#FF6B9D] px-5 py-4 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-[#e8588a]"
            >
              Reset to my colors
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-[34px] border border-white/70 bg-white/62 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Colors to Avoid</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {result.avoid_colors.map((color) => (
              <div
                key={`${color.name}-${color.hex}`}
                className="h-11 w-11 rounded-full border border-white/70 shadow-[0_12px_22px_rgba(100,116,139,0.14)]"
                style={{
                  backgroundColor: color.hex,
                  filter: 'grayscale(1)',
                }}
                aria-label={`Avoid color ${color.hex}`}
              />
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-[34px] border border-white/70 bg-white/62 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl md:p-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Makeup Recommendations</p>
            <p className="mt-3 text-sm leading-7 text-[#5f4a61]">
              Keep the visual wheel expressive, then translate the same color logic into product choices below.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {MAKEUP_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-[#2d1b2f] text-white shadow-[0_18px_32px_rgba(45,27,47,0.22)]'
                    : 'border border-white/70 bg-white/82 text-[#5a4a5d] shadow-[0_12px_24px_rgba(60,43,57,0.08)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,245,250,0.88))] p-5 shadow-[0_18px_34px_rgba(60,43,57,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Color direction</p>
            <p className="mt-3 text-sm leading-7 text-[#2d1b2f]">{activeRecommendation.tip}</p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {activeRecommendation.products.map((product) => (
              <article
                key={`${activeTab}-${product.brand}-${product.name}-${product.shade}`}
                className="rounded-[30px] border border-white/70 bg-white/84 p-5 shadow-[0_18px_38px_rgba(60,43,57,0.08)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">{product.brand}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-[#2d1b2f]">{product.name}</h3>
                <div className="mt-4 inline-flex rounded-full bg-[#f7edf2] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b5061]">
                  {product.shade}
                </div>
                <p className="mt-4 text-sm leading-7 text-[#5f4a61]">{product.reason}</p>
                <a
                  href={product.product_url || buildOliveYoungSearchUrl(product.brand, product.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-5 inline-flex rounded-full px-5 py-3 text-center text-sm font-semibold transition ${getProductButtonMeta(product.link_type).className}`}
                >
                  {getProductButtonMeta(product.link_type).label}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-[34px] border border-white/70 bg-white/62 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Share</p>
              <p className="mt-2 text-sm text-[#5f4a61]">Save or share the color wheel as an image.</p>
            </div>
            <button
              onClick={handleShareColors}
              disabled={isSharing}
              className="rounded-full border border-[#2d1b2f]/10 bg-[#2d1b2f] px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-[#201421] disabled:opacity-60"
            >
              {isSharing ? 'Preparing image...' : 'Share My Colors'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
