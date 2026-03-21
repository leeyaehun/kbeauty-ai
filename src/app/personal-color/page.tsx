'use client'

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImageUp, RotateCcw } from 'lucide-react'

import LiveColorCamera from '@/components/LiveColorCamera'
import PersonalColorCanvas, {
  type PersonalColorCanvasHandle,
  type PersonalColorSeason,
  type PersonalColorSwatch,
  SEASON_COLOR_SWATCHES,
} from '@/components/PersonalColorCanvas'
import UpgradeModal from '@/components/UpgradeModal'
import { createClient } from '@/lib/supabase'

type MakeupProduct = {
  brand: string
  image_url: string | null
  link_type: 'oliveyoung_global' | 'brand_site' | 'search'
  name: string
  reason: string
  shade: string
  product_url: string
}

type MakeupProductSection = {
  tip: string
  products: MakeupProduct[]
}

type CameraPreviewState = 'idle' | 'requesting' | 'ready' | 'error'

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
  product_recommendations?: Record<'foundation' | 'lip' | 'blush' | 'eyeshadow', MakeupProductSection>
}

const SEASON_META: Record<
  PersonalColorSeason,
  {
    background: string
    badgeClassName: string
    description: string
    title: string
  }
> = {
  autumn_warm: {
    background: '#FFF5E6',
    badgeClassName: 'bg-[#FFE8C2] text-[#8B6914]',
    description: 'Autumn Warm looks best in rich, earthy, and softly warm shades with natural depth.',
    title: 'AUTUMN WARM',
  },
  spring_warm: {
    background: '#FFF0E6',
    badgeClassName: 'bg-[#FFE4C4] text-[#8B4513]',
    description: 'Spring Warm shines in bright, fresh, and golden shades that feel light and lively.',
    title: 'SPRING WARM',
  },
  summer_cool: {
    background: '#F0E6FF',
    badgeClassName: 'bg-[#E6E6FA] text-[#483D8B]',
    description: 'Summer Cool suits soft, muted, and cool-toned colors that feel calm and elegant.',
    title: 'SUMMER COOL',
  },
  winter_cool: {
    background: '#E6F0FF',
    badgeClassName: 'bg-[#E0F0FF] text-[#1A3A5C]',
    description: 'Winter Cool stands out in clear, cool, and high-contrast colors with crisp definition.',
    title: 'WINTER COOL',
  },
}

const MAX_CAPTURE_BYTES = 1024 * 1024
const PERSONAL_COLOR_CAPTURED_IMAGE_KEY = 'personalColorCapturedImage'
const PERSONAL_COLOR_RESULT_KEY = 'personalColorResult'

function buildPageBackground(hex: string) {
  return `
    radial-gradient(circle at top left, rgba(255,255,255,0.65), transparent 28%),
    radial-gradient(circle at top right, rgba(255,255,255,0.38), transparent 24%),
    linear-gradient(180deg, ${hex} 0%, rgba(255,255,255,0.94) 58%, #ffffff 100%)
  `
}

function buildCanvasColors(bestColors: PersonalColorSwatch[], season: PersonalColorSeason) {
  const seen = new Set<string>()
  const seasonColors = SEASON_COLOR_SWATCHES[season] ?? []

  return [...bestColors, ...seasonColors].filter((color) => {
    const normalizedHex = color.hex?.toUpperCase()

    if (!normalizedHex || seen.has(normalizedHex)) {
      return false
    }

    seen.add(normalizedHex)
    return true
  }).map((color) => ({
    hex: color.hex.toUpperCase(),
    name: color.name?.trim() || color.hex.toUpperCase(),
  }))
}

function withHexOpacity(hex: string, alphaHex: string) {
  return /^#[0-9A-F]{6}$/i.test(hex) ? `${hex}${alphaHex}` : 'rgba(255,255,255,0.82)'
}

function safeParse<T>(value: string | null, fallback: T) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: blob.type || 'image/png' })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('We couldn’t process your photo. Please try again.'))
        return
      }

      resolve(blob)
    }, 'image/jpeg', quality)
  })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('We couldn’t prepare your photo for upload.'))
    }

    reader.onerror = () => {
      reject(new Error('A photo read error occurred while saving your image.'))
    }

    reader.readAsDataURL(blob)
  })
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('We couldn’t open that image. Please choose another photo.'))
    image.src = dataUrl
  })
}

async function compressCanvasForUpload(sourceCanvas: HTMLCanvasElement) {
  const scales = [1, 0.9, 0.8, 0.7, 0.6]
  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42]
  let smallestBlob: Blob | null = null

  for (const scale of scales) {
    const targetCanvas = document.createElement('canvas')
    targetCanvas.width = Math.max(320, Math.round(sourceCanvas.width * scale))
    targetCanvas.height = Math.max(320, Math.round(sourceCanvas.height * scale))

    const targetContext = targetCanvas.getContext('2d')

    if (!targetContext) {
      throw new Error('We couldn’t prepare your image for compression.')
    }

    targetContext.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height)

    for (const quality of qualities) {
      const blob = await canvasToBlob(targetCanvas, quality)

      if (!smallestBlob || blob.size < smallestBlob.size) {
        smallestBlob = blob
      }

      if (blob.size <= MAX_CAPTURE_BYTES) {
        return blobToDataUrl(blob)
      }
    }
  }

  if (!smallestBlob) {
    throw new Error('We couldn’t compress your image.')
  }

  if (smallestBlob.size > MAX_CAPTURE_BYTES) {
    throw new Error('Your photo is still too large to upload. Please try another image.')
  }

  return blobToDataUrl(smallestBlob)
}

async function compressUploadedFile(file: File) {
  const rawDataUrl = await blobToDataUrl(file)
  const image = await loadImageFromDataUrl(rawDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('We couldn’t prepare your uploaded photo.')
  }

  context.drawImage(image, 0, 0)
  return compressCanvasForUpload(canvas)
}

export default function PersonalColorPage() {
  const router = useRouter()
  const canvasRef = useRef<PersonalColorCanvasHandle | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const captureVideoRef = useRef<HTMLVideoElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState('')
  const [cameraPreviewState, setCameraPreviewState] = useState<CameraPreviewState>('idle')
  const [cameraMessage, setCameraMessage] = useState('')
  const [error, setError] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paramsReady, setParamsReady] = useState(false)
  const [result, setResult] = useState<PersonalColorResult | null>(null)
  const [selectedColor, setSelectedColor] = useState<PersonalColorSwatch | null>(null)
  const [selectedAvoidColor, setSelectedAvoidColor] = useState<PersonalColorSwatch | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [showLiveCamera, setShowLiveCamera] = useState(false)
  const [wheelAnimationVersion, setWheelAnimationVersion] = useState(0)

  function stopCaptureStream() {
    captureStreamRef.current?.getTracks().forEach((track) => track.stop())
    captureStreamRef.current = null

    if (captureVideoRef.current) {
      captureVideoRef.current.srcObject = null
    }
  }

  async function attachCaptureStreamToVideo() {
    const video = captureVideoRef.current
    const stream = captureStreamRef.current

    if (!video || !stream) {
      return
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }

    try {
      await video.play()
    } catch {
      setCameraPreviewState('error')
      setCameraMessage('Camera preview could not start. Please try again.')
    }
  }

  async function analyzePersonalColor(imageData: string) {
    setLoading(true)
    setError('')
    setCapturedImage(imageData)
    setResult(null)
    setSelectedColor(null)
    setShowLiveCamera(false)
    setWheelAnimationVersion((value) => value + 1)

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
      sessionStorage.setItem(PERSONAL_COLOR_RESULT_KEY, JSON.stringify(data))
    } catch {
      setError('A network error occurred while analyzing your personal color.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePersonalColorImage(imageData: string) {
    sessionStorage.setItem(PERSONAL_COLOR_CAPTURED_IMAGE_KEY, imageData)
    stopCaptureStream()
    setCameraPreviewState('idle')
    setCameraMessage('')
    await analyzePersonalColor(imageData)
  }

  async function handleOpenCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPreviewState('error')
      setCameraMessage('Camera access required')
      return
    }

    try {
      setCameraPreviewState('requesting')
      setCameraMessage('')
      stopCaptureStream()

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          height: { ideal: 960 },
          width: { ideal: 720 },
        },
      })

      captureStreamRef.current = stream
      setCameraPreviewState('ready')
    } catch {
      setCameraPreviewState('error')
      setCameraMessage('Camera access required')
    }
  }

  async function handleCameraCapture() {
    const video = captureVideoRef.current
    const canvas = captureCanvasRef.current

    if (!video || !canvas) {
      return
    }

    try {
      setCameraMessage('')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('We couldn’t read the camera frame. Please try again.')
      }

      context.drawImage(video, 0, 0)
      const imageData = await compressCanvasForUpload(canvas)
      await handlePersonalColorImage(imageData)
    } catch (captureError) {
      setCameraPreviewState('error')
      setCameraMessage(captureError instanceof Error ? captureError.message : 'We couldn’t save your photo.')
    }
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      setCameraMessage('')
      const imageData = await compressUploadedFile(file)
      await handlePersonalColorImage(imageData)
    } catch (uploadError) {
      setCameraPreviewState('error')
      setCameraMessage(uploadError instanceof Error ? uploadError.message : 'We couldn’t use that photo.')
    }
  }

  function resetPersonalColorFlow() {
    stopCaptureStream()
    sessionStorage.removeItem(PERSONAL_COLOR_CAPTURED_IMAGE_KEY)
    sessionStorage.removeItem(PERSONAL_COLOR_RESULT_KEY)
    setCapturedImage('')
    setResult(null)
    setSelectedColor(null)
    setSelectedAvoidColor(null)
    setShowLiveCamera(false)
    setError('')
    setCameraPreviewState('idle')
    setCameraMessage('')
  }

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
    return () => {
      stopCaptureStream()
    }
  }, [])

  useEffect(() => {
    if (cameraPreviewState !== 'ready') {
      return
    }

    void attachCaptureStreamToVideo()
  }, [cameraPreviewState])

  useEffect(() => {
    if (!paramsReady) {
      return
    }

    if (showUpgrade) {
      setLoading(false)
      return
    }

    const imageData = sessionStorage.getItem(PERSONAL_COLOR_CAPTURED_IMAGE_KEY)
    const cachedResult = safeParse<PersonalColorResult | null>(
      sessionStorage.getItem(PERSONAL_COLOR_RESULT_KEY),
      null
    )

    if (!imageData) {
      setLoading(false)
      return
    }

    if (cachedResult) {
      setCapturedImage(imageData)
      setResult(cachedResult)
      setLoading(false)
      return
    }

    void analyzePersonalColor(imageData)
  }, [paramsReady, showUpgrade])

  const seasonMeta = result ? SEASON_META[result.season] : null
  const canvasColors = useMemo(
    () => (result ? buildCanvasColors(result.best_colors, result.season) : []),
    [result]
  )
  const canvasBackground = seasonMeta?.background ?? '#FFF6FB'

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
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={resetPersonalColorFlow}
              className="brand-button-primary px-8 py-4 font-semibold"
            >
              Retake Personal Color Photo
            </button>
            <button
              onClick={() => router.push('/')}
              className="brand-button-secondary px-8 py-4 font-semibold"
            >
              Back to Home
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (!capturedImage) {
    return (
      <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
        <div className="brand-shell max-w-5xl">
          <div className="mb-8 flex justify-center md:justify-start">
            <div className="brand-mark">K-Beauty AI</div>
          </div>

          <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <aside className="brand-card p-7 md:p-8">
              <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                Personal color analysis
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                Take a photo for your personal color
              </h1>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                Personal color uses a separate photo from skincare analysis. Capture your face in soft light or upload a portrait to build your seasonal palette.
              </p>

              <div className="mt-8 space-y-4">
                <div className="brand-card-soft p-5">
                  <p className="text-sm font-semibold text-[#d94d82]">Best photo setup</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Face forward, natural light, minimal shadows, and a neutral background create the clearest color read.</p>
                </div>
                <div className="brand-card-soft p-5">
                  <p className="text-sm font-semibold text-[#d94d82]">What happens next</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">We analyze your own personal color photo first, then let you test shades on that portrait and in live camera mode separately.</p>
                </div>
              </div>
            </aside>

            <section className="brand-card p-6 md:p-8">
              {cameraPreviewState === 'requesting' || cameraPreviewState === 'ready' ? (
                <div>
                  <div className="relative mx-auto overflow-hidden rounded-[36px] border border-[rgba(255,107,157,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(255,240,245,0.9))] p-3 shadow-[0_28px_60px_rgba(149,64,109,0.14)]">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] bg-[#fde8f1]">
                      <video
                        ref={captureVideoRef}
                        className="h-full w-full scale-x-[-1] object-cover"
                        playsInline
                        muted
                      />
                      <div className="pointer-events-none absolute inset-5 rounded-[26px] border-[3px] border-white/70" />
                      {cameraPreviewState === 'requesting' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/78 backdrop-blur-sm">
                          <div className="text-center">
                            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#ffb3d1]/60 border-t-[#ff6b9d]" />
                            <p className="mt-4 text-sm font-semibold text-[#7c5d67]">Opening camera...</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleCameraCapture}
                      disabled={cameraPreviewState !== 'ready'}
                      className="brand-button-primary py-4 font-semibold"
                    >
                      Capture This Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCaptureStream()
                        setCameraPreviewState('idle')
                        setCameraMessage('')
                      }}
                      className="brand-button-secondary py-4 font-semibold"
                    >
                      Cancel Camera
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="mx-auto flex aspect-[3/4] max-w-md items-center justify-center rounded-[36px] border border-[rgba(255,107,157,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,240,245,0.95))] p-8 shadow-[0_28px_60px_rgba(149,64,109,0.1)]">
                    <div>
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#fff0f5] text-[#ff6b9d] shadow-[0_18px_34px_rgba(149,64,109,0.12)]">
                        <Camera className="h-9 w-9" />
                      </div>
                      <h2 className="mt-6 text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                        Your personal color portrait
                      </h2>
                      <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--muted)]">
                        Start the camera for a fresh portrait or upload a photo. This image stays separate from your skincare analysis flow.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      className="brand-button-primary inline-flex items-center justify-center gap-2 py-4 font-semibold"
                    >
                      <Camera className="h-4 w-4" />
                      Open Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      className="brand-button-secondary inline-flex items-center justify-center gap-2 py-4 font-semibold"
                    >
                      <ImageUp className="h-4 w-4" />
                      Upload Photo
                    </button>
                  </div>
                </div>
              )}

              {cameraMessage ? (
                <p className="mt-4 text-center text-sm font-medium text-[#d94d82]">{cameraMessage}</p>
              ) : null}

              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadChange}
              />
              <canvas ref={captureCanvasRef} className="hidden" />
            </section>
          </section>
        </div>
      </main>
    )
  }

  if (!result || !seasonMeta) {
    return null
  }

  return (
    <main
      className="min-h-screen px-5 py-6 md:px-8 md:py-10"
      style={{
        background: buildPageBackground(seasonMeta.background),
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
              {seasonMeta.description}
            </p>
          </div>

          <div className="mt-6">
            {showLiveCamera ? (
              <LiveColorCamera
                backgroundHex={canvasBackground}
                colors={canvasColors}
                onClose={() => setShowLiveCamera(false)}
                onColorSelect={(color) => {
                  setSelectedColor(color)
                  setSelectedAvoidColor(null)
                }}
                selectedColor={selectedColor}
              />
            ) : (
              <PersonalColorCanvas
                animateVersion={wheelAnimationVersion}
                ref={canvasRef}
                avoidColors={result.avoid_colors}
                backgroundHex={canvasBackground}
                colors={canvasColors}
                imageData={capturedImage}
                onColorSelect={(color) => {
                  setSelectedColor(color)
                  setSelectedAvoidColor(null)
                }}
                selectedHex={selectedColor?.hex ?? null}
                season={result.season}
              />
            )}

            <div
              className="mt-4 rounded-[24px] border border-white/70 p-4 shadow-[0_18px_34px_rgba(60,43,57,0.08)] transition-all duration-300"
              style={{
                backgroundColor: selectedColor ? withHexOpacity(selectedColor.hex, '26') : 'rgba(255,255,255,0.82)',
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-5 w-5 shrink-0 rounded-full border border-white/80 shadow-[0_8px_16px_rgba(60,43,57,0.08)]"
                  style={{ backgroundColor: selectedColor?.hex ?? '#D1D5DB' }}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${selectedColor ? 'text-[#2d1b2f]' : 'text-[#7c6a78]'}`}>
                    {selectedColor?.name ?? 'Tap a color to explore'}
                  </p>
                  {selectedColor ? (
                    <p className="mt-1 text-xs text-[#6b7280]">{selectedColor.hex}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <button
                onClick={() => {
                  setSelectedColor(null)
                  setSelectedAvoidColor(null)
                  setWheelAnimationVersion((value) => value + 1)
                }}
                className="rounded-full bg-[#FF6B9D] px-5 py-4 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-[#e8588a]"
              >
                Reset to my colors
              </button>

              <button
                type="button"
                onClick={() => setShowLiveCamera((value) => !value)}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-semibold transition hover:translate-y-[-1px] ${
                  showLiveCamera
                    ? 'bg-[#FF6B9D] text-white'
                    : 'border border-[#FF6B9D] bg-white/84 text-[#FF6B9D]'
                }`}
              >
                <Camera className="h-4 w-4" />
                Live Camera
              </button>

              <button
                type="button"
                onClick={resetPersonalColorFlow}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#2d1b2f]/10 bg-white/84 px-5 py-4 text-sm font-semibold text-[#5f4a61] transition hover:translate-y-[-1px]"
              >
                <RotateCcw className="h-4 w-4" />
                Retake Photo
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[34px] border border-white/70 bg-white/62 p-6 shadow-[0_24px_60px_rgba(60,43,57,0.1)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8c6d72]">Colors to Avoid</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {result.avoid_colors.map((color) => (
              <button
                key={`${color.name}-${color.hex}`}
                type="button"
                onClick={() => setSelectedAvoidColor(color)}
                className={`h-11 w-11 rounded-full border shadow-[0_12px_22px_rgba(100,116,139,0.14)] transition ${
                  selectedAvoidColor?.hex === color.hex
                    ? 'border-[#FF6B9D] shadow-[0_0_0_4px_rgba(255,107,157,0.18)]'
                    : 'border-white/70'
                }`}
                style={{
                  backgroundColor: color.hex,
                  filter: 'grayscale(1)',
                }}
                aria-label={`Select avoid color ${color.name} ${color.hex}`}
              />
            ))}
          </div>

          <div
            className="mt-4 rounded-[24px] border border-white/70 p-4 shadow-[0_18px_34px_rgba(60,43,57,0.08)] transition-all duration-300"
            style={{
              backgroundColor: selectedAvoidColor ? withHexOpacity(selectedAvoidColor.hex, '18') : 'rgba(255,255,255,0.82)',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-white/80 shadow-[0_8px_16px_rgba(60,43,57,0.08)]"
                style={{ backgroundColor: selectedAvoidColor?.hex ?? '#D1D5DB' }}
              />
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${selectedAvoidColor ? 'text-[#2d1b2f]' : 'text-[#7c6a78]'}`}>
                  {selectedAvoidColor?.name ?? 'Tap an avoid color to explore'}
                </p>
                {selectedAvoidColor ? (
                  <p className="mt-1 text-xs text-[#6b7280]">{selectedAvoidColor.hex}</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => router.push('/personal-color/makeup')}
            className="flex w-full items-center justify-between rounded-full border border-pink-200 bg-white/84 px-6 py-4 font-semibold text-pink-500 shadow-[0_18px_34px_rgba(60,43,57,0.08)]"
          >
            <span>Makeup Recommendations</span>
            <span>→</span>
          </button>
        </div>

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
