'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export type PersonalColorSwatch = {
  name: string
  hex: string
}

export type PersonalColorSeason = 'spring_warm' | 'summer_cool' | 'autumn_warm' | 'winter_cool'

export const SEASON_COLORS: Record<PersonalColorSeason, string[]> = {
  autumn_warm: [
    '#8B4513', '#A0522D', '#CD853F', '#D2691E', '#B8860B',
    '#DAA520', '#808000', '#556B2F', '#6B8E23', '#8FBC8F',
    '#BDB76B', '#F4A460', '#DEB887', '#D2B48C', '#BC8F8F',
    '#C19A6B', '#A0785A', '#8B7355', '#996633', '#CC7722',
  ],
  spring_warm: [
    '#FF6B6B', '#FF8E53', '#FFAB76', '#FFD700', '#FFF176',
    '#C8E6C9', '#A5D6A7', '#FFB347', '#FF7043', '#FFCC02',
    '#F4A460', '#DEB887', '#CD853F', '#FFA07A', '#FA8072',
    '#FF6347', '#FF4500', '#FFD700', '#FFDAB9', '#FFEAA7',
  ],
  summer_cool: [
    '#B39DDB', '#9575CD', '#CE93D8', '#F48FB1', '#F06292',
    '#80DEEA', '#4DD0E1', '#80CBC4', '#A5D6A7', '#C5CAE9',
    '#7986CB', '#64B5F6', '#4FC3F7', '#E1BEE7', '#D1C4E9',
    '#F8BBD0', '#FCE4EC', '#EDE7F6', '#E3F2FD', '#B2EBF2',
  ],
  winter_cool: [
    '#1A1A2E', '#16213E', '#0F3460', '#533483', '#E94560',
    '#00B4D8', '#0077B6', '#023E8A', '#6A0572', '#9B2226',
    '#AE2012', '#BB3E03', '#CA6702', '#FFFFFF', '#F8F9FA',
    '#E9ECEF', '#DEE2E6', '#000000', '#212529', '#495057',
  ],
}

export type PersonalColorCanvasHandle = {
  exportImage: () => string | null
}

type PersonalColorCanvasProps = {
  avoidColors: PersonalColorSwatch[]
  backgroundHex: string
  bestColors: PersonalColorSwatch[]
  imageData: string
  season: PersonalColorSeason
}

type CropFocus = {
  centerX: number
  centerY: number
  radius: number
}

type WheelSlice = {
  hex: string
  isAvoid: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
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

function toGrayscale(hex: string) {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return '#9CA3AF'
  }

  const luminance = Math.round(rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114)
  const softened = Math.round(luminance * 0.78 + 36)

  return `rgb(${softened}, ${softened}, ${softened})`
}

function createDefaultCrop(image: HTMLImageElement): CropFocus {
  return {
    centerX: image.naturalWidth / 2,
    centerY: image.naturalHeight / 2,
    radius: Math.min(image.naturalWidth, image.naturalHeight) * 0.28,
  }
}

async function detectFaceCrop(image: HTMLImageElement): Promise<CropFocus> {
  const fallback = createDefaultCrop(image)

  try {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    )

    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        delegate: 'CPU',
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      },
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: 'IMAGE',
    })

    const result = faceLandmarker.detect(image)
    faceLandmarker.close()

    const points = result.faceLandmarks?.[0]

    if (!points || points.length === 0) {
      return fallback
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let sumX = 0
    let sumY = 0

    for (const point of points) {
      const x = point.x * image.naturalWidth
      const y = point.y * image.naturalHeight

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      sumX += x
      sumY += y
    }

    return {
      centerX: sumX / points.length,
      centerY: sumY / points.length,
      radius: Math.max(maxX - minX, maxY - minY) * 0.52,
    }
  } catch {
    return fallback
  }
}

function uniqueHexes(hexes: string[]) {
  return [...new Set(hexes.filter(Boolean).map((hex) => hex.toUpperCase()))]
}

function buildWheelSlices(
  season: PersonalColorSeason,
  bestColors: PersonalColorSwatch[],
  avoidColors: PersonalColorSwatch[]
): WheelSlice[] {
  const preferredHexes = uniqueHexes([
    ...bestColors.map((color) => color.hex),
    ...SEASON_COLORS[season],
  ]).slice(0, 20)
  const avoidHexes = uniqueHexes(avoidColors.map((color) => color.hex)).slice(0, 4)
  const slices: WheelSlice[] = preferredHexes.map((hex) => ({ hex, isAvoid: false }))

  if (avoidHexes.length === 0) {
    return slices
  }

  for (let index = 0; index < avoidHexes.length; index += 1) {
    const insertAt = Math.min(
      slices.length,
      Math.round(((preferredHexes.length + index) / avoidHexes.length) * (index + 1))
    )

    slices.splice(insertAt, 0, {
      hex: avoidHexes[index],
      isAvoid: true,
    })
  }

  return slices
}

const PersonalColorCanvas = forwardRef<PersonalColorCanvasHandle, PersonalColorCanvasProps>(
  function PersonalColorCanvas(
    {
      avoidColors,
      backgroundHex,
      bestColors,
      imageData,
      season,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const cropRef = useRef<CropFocus | null>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const hasAnimatedRef = useRef(false)
    const [canvasSize, setCanvasSize] = useState(0)
    const [imageReady, setImageReady] = useState(false)

    useImperativeHandle(ref, () => ({
      exportImage: () => canvasRef.current?.toDataURL('image/png') ?? null,
    }))

    useEffect(() => {
      if (!containerRef.current) {
        return
      }

      const observer = new ResizeObserver((entries) => {
        const nextWidth = entries[0]?.contentRect.width ?? 0
        setCanvasSize(Math.max(280, Math.round(nextWidth)))
      })

      observer.observe(containerRef.current)

      return () => observer.disconnect()
    }, [])

    useEffect(() => {
      let isActive = true
      setImageReady(false)

      const image = new Image()

      image.onload = async () => {
        if (!isActive) {
          return
        }

        imageRef.current = image
        cropRef.current = await detectFaceCrop(image)
        hasAnimatedRef.current = false

        if (isActive) {
          setImageReady(true)
        }
      }

      image.src = imageData

      return () => {
        isActive = false
      }
    }, [imageData])

    useEffect(() => {
      const canvas = canvasRef.current
      const image = imageRef.current
      const crop = cropRef.current

      if (!canvas || !image || !crop || !canvasSize || !imageReady) {
        return
      }

      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      const dpr = window.devicePixelRatio || 1
      const size = canvasSize
      const slices = buildWheelSlices(season, bestColors, avoidColors)

      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const centerX = size / 2
      const centerY = size / 2
      const outerRadius = size * 0.48
      const faceRadius = size * 0.22
      const totalSlices = slices.length
      const sliceAngle = (Math.PI * 2) / totalSlices
      let animationFrameId = 0

      const draw = (elapsedMs: number) => {
        context.clearRect(0, 0, size, size)

        const background = context.createLinearGradient(0, 0, size, size)
        background.addColorStop(0, mixHexWithWhite(backgroundHex, 0.14))
        background.addColorStop(1, mixHexWithWhite(backgroundHex, 0.54))
        context.fillStyle = background
        context.fillRect(0, 0, size, size)

        const glow = context.createRadialGradient(centerX, centerY, faceRadius * 0.8, centerX, centerY, outerRadius)
        glow.addColorStop(0, 'rgba(255,255,255,0.12)')
        glow.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = glow
        context.fillRect(0, 0, size, size)

        const animationProgress = clamp(elapsedMs / 1000, 0, 1)
        const radiusProgress = easeOutCubic(animationProgress)
        const activeRadius = faceRadius + (outerRadius - faceRadius) * radiusProgress

        for (let index = 0; index < totalSlices; index += 1) {
          const slice = slices[index]
          const startAngle = index * sliceAngle - Math.PI / 2
          const endAngle = startAngle + sliceAngle

          context.beginPath()
          context.moveTo(centerX, centerY)
          context.arc(centerX, centerY, activeRadius, startAngle, endAngle)
          context.closePath()
          context.fillStyle = slice.isAvoid ? toGrayscale(slice.hex) : slice.hex
          context.fill()
          context.strokeStyle = 'rgba(255,255,255,0.92)'
          context.lineWidth = 2
          context.stroke()
        }

        context.save()
        context.beginPath()
        context.arc(centerX, centerY, faceRadius, 0, Math.PI * 2)
        context.closePath()
        context.clip()

        const sourceSize = Math.min(Math.min(image.naturalWidth, image.naturalHeight), crop.radius * 2.45)
        const sourceX = clamp(crop.centerX - sourceSize / 2, 0, Math.max(0, image.naturalWidth - sourceSize))
        const sourceY = clamp(crop.centerY - sourceSize / 2, 0, Math.max(0, image.naturalHeight - sourceSize))

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          centerX - faceRadius,
          centerY - faceRadius,
          faceRadius * 2,
          faceRadius * 2
        )
        context.restore()

        context.strokeStyle = 'rgba(255,255,255,0.96)'
        context.lineWidth = 6
        context.beginPath()
        context.arc(centerX, centerY, faceRadius + 3, 0, Math.PI * 2)
        context.stroke()

        context.strokeStyle = 'rgba(45,27,47,0.06)'
        context.lineWidth = 1
        context.beginPath()
        context.arc(centerX, centerY, outerRadius - 2, 0, Math.PI * 2)
        context.stroke()

        context.fillStyle = 'rgba(255,255,255,0.88)'
        context.fillRect(0, size - 24, size, 24)
        context.fillStyle = 'rgba(45,27,47,0.72)'
        context.font = '700 11px "Avenir Next", "Avenir", "Noto Sans KR", sans-serif'
        context.textAlign = 'left'
        context.fillText('K-BEAUTY AI', 12, size - 8)
        context.textAlign = 'right'
        context.fillStyle = 'rgba(79,94,113,0.82)'
        context.fillText('kbeauty-ai.vercel.app', size - 12, size - 8)
      }

      if (hasAnimatedRef.current) {
        draw(Number.POSITIVE_INFINITY)
        return
      }

      const startAt = performance.now()

      const animate = (now: number) => {
        const elapsed = now - startAt
        draw(elapsed)

        if (elapsed < 1000) {
          animationFrameId = window.requestAnimationFrame(animate)
          return
        }

        hasAnimatedRef.current = true
        draw(Number.POSITIVE_INFINITY)
      }

      animationFrameId = window.requestAnimationFrame(animate)

      return () => window.cancelAnimationFrame(animationFrameId)
    }, [avoidColors, backgroundHex, bestColors, canvasSize, imageReady, season])

    return (
      <div ref={containerRef} className="mx-auto w-[90vw] max-w-[720px]">
        <canvas
          ref={canvasRef}
          className="aspect-square w-full rounded-[28px] shadow-[0_28px_70px_rgba(45,27,47,0.18)]"
        />
      </div>
    )
  }
)

export default PersonalColorCanvas
