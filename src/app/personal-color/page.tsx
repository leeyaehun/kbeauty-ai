'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import PersonalColorCanvas, {
  type PersonalColorCanvasHandle,
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
  season: 'spring_warm' | 'summer_cool' | 'autumn_warm' | 'winter_cool'
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
  PersonalColorResult['season'],
  {
    accent: string
    badgeClassName: string
    background: string
    eyebrow: string
    subtitle: string
    title: string
  }
> = {
  spring_warm: {
    accent: '#CC6C3A',
    badgeClassName: 'bg-[#FFE4C4] text-[#8B4513]',
    background: '#FFF0E6',
    eyebrow: 'Light-filled palette',
    subtitle: 'Peach, apricot, and fresh coral shades make your complexion look vivid and awake.',
    title: 'SPRING WARM',
  },
  summer_cool: {
    accent: '#6C63B8',
    badgeClassName: 'bg-[#E6E6FA] text-[#483D8B]',
    background: '#F0E6FF',
    eyebrow: 'Soft cool harmony',
    subtitle: 'Dusty rose, lavender, and delicate blue-toned colors refine your overall balance.',
    title: 'SUMMER COOL',
  },
  autumn_warm: {
    accent: '#A96A18',
    badgeClassName: 'bg-[#FFE8C2] text-[#8B6914]',
    background: '#FFF5E6',
    eyebrow: 'Deep golden richness',
    subtitle: 'Muted ochre, terracotta, and olive-led tones add depth without draining your skin.',
    title: 'AUTUMN WARM',
  },
  winter_cool: {
    accent: '#3B67B8',
    badgeClassName: 'bg-[#E0F0FF] text-[#1A3A5C]',
    background: '#E6F0FF',
    eyebrow: 'Clear cool contrast',
    subtitle: 'Icy blue, fuchsia, and crisp jewel tones sharpen your features beautifully.',
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
  const url = new URL('https://global.oliveyoung.com/search')
  url.searchParams.set('query', `${brand} ${name}`.trim())
  return url.toString()
}

function getProductButtonMeta(linkType: ProductLinkType) {
  switch (linkType) {
    case 'oliveyoung_global':
      return {
        className: 'bg-[#184f6d] text-white hover:bg-[#123d56]',
        label: 'Shop on Olive Young Global',
      }
    case 'brand_site':
      return {
        className: 'bg-[#b85b53] text-white hover:bg-[#96473f]',
        label: 'Shop on Brand Site',
      }
    default:
      return {
        className: 'bg-[#eef1f6] text-[#445267] hover:bg-[#dde4ef]',
        label: 'Search on Olive Young',
      }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')

  if (normalized.length !== 6) {
    return null
  }

  const numeric = Number.parseInt(normalized, 16)

  if (Number.isNaN(numeric)) {
    return null
  }

  return {
    b: numeric & 255,
    g: (numeric >> 8) & 255,
    r: (numeric >> 16) & 255,
  }
}

function mixHexWithWhite(hex: string, weight: number) {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return hex
  }

  const safeWeight = clamp(weight, 0, 1)
  const r = Math.round(rgb.r + (255 - rgb.r) * safeWeight)
  const g = Math.round(rgb.g + (255 - rgb.g) * safeWeight)
  const b = Math.round(rgb.b + (255 - rgb.b) * safeWeight)

  return `rgb(${r}, ${g}, ${b})`
}

function buildPageBackground(hex: string) {
  return `
    radial-gradient(circle at top left, ${mixHexWithWhite(hex, 0.08)}, transparent 28%),
    radial-gradient(circle at top right, ${mixHexWithWhite(hex, 0.22)}, transparent 22%),
    linear-gradient(180deg, ${mixHexWithWhite(hex, 0.36)} 0%, ${mixHexWithWhite(hex, 0.62)} 52%, #ffffff 100%)
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
  const [selectedColor, setSelectedColor] = useState<PersonalColorSwatch | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

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
  const pageBackground = seasonMeta
    ? buildPageBackground(selectedColor ? mixHexWithWhite(selectedColor.hex, 0.68) : seasonMeta.background)
    : buildPageBackground('#FFF6FB')

  async function handleShareColors() {
    const exported = canvasRef.current?.exportImage()

    if (!exported) {
      return
    }

    setIsSharing(true)

    try {
      const file = await dataUrlToFile(exported, 'kbeauty-ai-personal-color.png')

      if (
        navigator.share &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          text: 'My personal color edit from K-Beauty AI.',
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
            <p className="text-sm font-semibold text-[#8f5060]">Preparing your personal color edit</p>
            <p className="text-sm text-[var(--muted)]">Building a visual palette around your portrait.</p>
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
        background: pageBackground,
        color: 'var(--ink)',
        transition: 'background 500ms ease',
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark bg-white/72">K-Beauty AI</div>
        </div>

        <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="space-y-6">
            <div className="rounded-[34px] border border-white/60 bg-white/55 p-6 shadow-[0_26px_70px_rgba(60,43,57,0.12)] backdrop-blur-xl md:p-8">
              <div className="inline-flex rounded-full border border-white/70 bg-white/82 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7f677b]">
                {seasonMeta.eyebrow}
              </div>
              <div className={`mt-5 inline-flex rounded-full px-5 py-3 text-sm font-semibold tracking-[0.16em] ${seasonMeta.badgeClassName}`}>
                {seasonMeta.title}
              </div>
              <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-[-0.05em] text-[#2d1b2f] md:text-[3.4rem]">
                Your palette sits around your face, not beside it.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5f4a61] md:text-base">
                {seasonMeta.subtitle}
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f5b70]">
                {result.description}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {result.characteristics.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/70 bg-white/76 px-4 py-2 text-sm font-medium text-[#5b4860] shadow-[0_12px_20px_rgba(60,43,57,0.08)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-white/60 bg-white/50 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7f677b]">Palette cues</p>
                  <p className="mt-2 text-base font-semibold text-[#2d1b2f]">Faces with similar harmony</p>
                </div>
                <div
                  className="h-10 w-10 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${mixHexWithWhite(selectedColor?.hex ?? seasonMeta.accent, 0.12)}, ${mixHexWithWhite(selectedColor?.hex ?? seasonMeta.accent, 0.58)})`,
                  }}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {result.celebrity_examples.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-white/70 bg-white/78 px-4 py-2 text-sm font-semibold text-[#53455a]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[38px] border border-white/70 bg-white/48 p-4 shadow-[0_34px_80px_rgba(60,43,57,0.14)] backdrop-blur-xl md:p-5">
              <PersonalColorCanvas
                ref={canvasRef}
                avoidColors={result.avoid_colors}
                backgroundHex={selectedColor?.hex ?? seasonMeta.background}
                bestColors={result.best_colors}
                imageData={capturedImage}
                onSelectColor={setSelectedColor}
                seasonLabel={seasonMeta.title}
                selectedHex={selectedColor?.hex ?? null}
              />
              <div className="mt-5 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/72 px-4 py-4 shadow-[0_18px_42px_rgba(60,43,57,0.08)] md:flex-row md:items-center md:justify-between md:px-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Interactive canvas</p>
                  <p className="mt-2 text-sm leading-6 text-[#5f4a61]">
                    Tap any shade orbiting your portrait to see how the atmosphere shifts around you.
                  </p>
                </div>
                <button
                  onClick={handleShareColors}
                  disabled={isSharing}
                  className="rounded-full border border-[#2d1b2f]/10 bg-[#2d1b2f] px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-[#201421] disabled:opacity-60"
                >
                  {isSharing ? 'Preparing image...' : 'Share My Colors'}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-[34px] border border-white/60 bg-white/52 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Your Best Colors</p>
                    <p className="mt-2 text-sm text-[#5f4a61]">Choose a tone to tint the page.</p>
                  </div>
                  {selectedColor && (
                    <button
                      onClick={() => setSelectedColor(null)}
                      className="rounded-full border border-[#2d1b2f]/10 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#5f4a61]"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {result.best_colors.map((color) => {
                    const isActive = selectedColor?.hex === color.hex

                    return (
                      <button
                        key={`${color.name}-${color.hex}`}
                        onClick={() => setSelectedColor(color)}
                        className={`rounded-[26px] border p-3 text-left transition ${
                          isActive
                            ? 'border-white bg-[#2d1b2f]/80 text-white shadow-[0_18px_42px_rgba(45,27,47,0.22)]'
                            : 'border-white/70 bg-white/82 text-[#2d1b2f] shadow-[0_14px_28px_rgba(60,43,57,0.08)]'
                        }`}
                      >
                        <div
                          className={`h-14 w-14 rounded-full shadow-[0_12px_24px_rgba(45,27,47,0.18)] ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-[#2d1b2f]/10' : ''}`}
                          style={{ backgroundColor: color.hex }}
                        />
                        <p className="mt-3 text-sm font-semibold">{color.name}</p>
                        <p className={`mt-1 text-xs ${isActive ? 'text-white/75' : 'text-[#6f5b70]'}`}>{color.hex}</p>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-[34px] border border-white/60 bg-white/52 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Colors to Avoid</p>
                <p className="mt-2 text-sm text-[#5f4a61]">These shades tend to mute your contrast or flatten your undertone.</p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {result.avoid_colors.map((color) => (
                    <div
                      key={`${color.name}-${color.hex}`}
                      className="relative overflow-hidden rounded-[26px] border border-[#ced5df] bg-[linear-gradient(180deg,rgba(244,246,250,0.98),rgba(232,236,242,0.98))] p-3 shadow-[0_14px_24px_rgba(100,116,139,0.08)]"
                    >
                      <div
                        className="h-14 w-14 rounded-full shadow-[0_12px_24px_rgba(45,27,47,0.08)]"
                        style={{ backgroundColor: color.hex, filter: 'saturate(0.72) brightness(0.94)' }}
                      />
                      <p className="mt-3 text-sm font-semibold text-[#3b4452]">{color.name}</p>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="rounded-full border border-white/70 bg-white/40 px-3 py-1 text-lg font-semibold text-[#677487]">
                          ×
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[38px] border border-white/65 bg-white/56 p-6 shadow-[0_28px_70px_rgba(60,43,57,0.12)] backdrop-blur-xl md:p-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Makeup Recommendations</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#2d1b2f]">Shape the palette into products.</h2>
            <p className="mt-3 text-sm leading-7 text-[#5f4a61]">
              The visual palette stays expressive, while the product suggestions below remain grounded in the same color logic.
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
      </div>
    </main>
  )
}
