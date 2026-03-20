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
  animateVersion: number
  avoidColors: PersonalColorSwatch[]
  backgroundHex: string
  colors: PersonalColorSwatch[]
  imageData: string
  onColorSelect?: (color: PersonalColorSwatch) => void
  selectedHex: string | null
  season: PersonalColorSeason
}

type CropFocus = {
  centerX: number
  centerY: number
  radius: number
}

type WheelSlice = {
  color: PersonalColorSwatch
  isAvoid: boolean
}

const HEX_COLOR_PATTERN = /^#([0-9A-F]{6})$/i
const WHEEL_SLICE_COUNT = 20
const PORTRAIT_CANVAS_HEIGHT_RATIO = 4 / 3

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function isValidHexColor(hex: string | null | undefined): hex is string {
  return typeof hex === 'string' && HEX_COLOR_PATTERN.test(hex.trim())
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

function mixHexWithBlack(hex: string, weight: number) {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return hex
  }

  const safeWeight = clamp(weight, 0, 1)
  const r = Math.round(rgb.r * (1 - safeWeight))
  const g = Math.round(rgb.g * (1 - safeWeight))
  const b = Math.round(rgb.b * (1 - safeWeight))

  return `rgb(${r}, ${g}, ${b})`
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const safeHue = ((hue % 360) + 360) % 360
  const safeSaturation = clamp(saturation, 0, 100) / 100
  const safeLightness = clamp(lightness, 0, 100) / 100

  const chroma = (1 - Math.abs(2 * safeLightness - 1)) * safeSaturation
  const hueSegment = safeHue / 60
  const intermediate = chroma * (1 - Math.abs((hueSegment % 2) - 1))

  let red = 0
  let green = 0
  let blue = 0

  if (hueSegment >= 0 && hueSegment < 1) {
    red = chroma
    green = intermediate
  } else if (hueSegment < 2) {
    red = intermediate
    green = chroma
  } else if (hueSegment < 3) {
    green = chroma
    blue = intermediate
  } else if (hueSegment < 4) {
    green = intermediate
    blue = chroma
  } else if (hueSegment < 5) {
    red = intermediate
    blue = chroma
  } else {
    red = chroma
    blue = intermediate
  }

  const matchLightness = safeLightness - chroma / 2

  return rgbToHex(
    (red + matchLightness) * 255,
    (green + matchLightness) * 255,
    (blue + matchLightness) * 255
  )
}

function hexToHsl(hex: string) {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return null
  }

  const red = rgb.r / 255
  const green = rgb.g / 255
  const blue = rgb.b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { h: 0, l: lightness * 100, s: 0 }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0

  switch (max) {
    case red:
      hue = 60 * (((green - blue) / delta) % 6)
      break
    case green:
      hue = 60 * ((blue - red) / delta + 2)
      break
    default:
      hue = 60 * ((red - green) / delta + 4)
      break
  }

  return {
    h: hue < 0 ? hue + 360 : hue,
    l: lightness * 100,
    s: saturation * 100,
  }
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
  return [...new Set(hexes.filter(isValidHexColor).map((hex) => hex.toUpperCase()))]
}

function normalizeSwatches(colors: PersonalColorSwatch[]) {
  const seen = new Set<string>()

  return colors.filter((color) => {
    if (!isValidHexColor(color.hex)) {
      return false
    }

    const normalizedHex = color.hex.toUpperCase()

    if (seen.has(normalizedHex)) {
      return false
    }

    seen.add(normalizedHex)
    return true
  }).map((color) => ({
    hex: color.hex.toUpperCase(),
    name: color.name?.trim() || color.hex.toUpperCase(),
  }))
}

function normalizeSeasonPalette(season: PersonalColorSeason) {
  const validSeasonColors = uniqueHexes(SEASON_COLORS[season] ?? [])

  if (validSeasonColors.length === 0) {
    return Array.from({ length: WHEEL_SLICE_COUNT }, (_, index) => ({
      hex: '#D94D82',
      name: `Season shade ${String(index + 1).padStart(2, '0')}`,
    }))
  }

  return Array.from(
    { length: WHEEL_SLICE_COUNT },
    (_, index) => ({
      hex: validSeasonColors[index % validSeasonColors.length],
      name: `Season shade ${String(index + 1).padStart(2, '0')}`,
    })
  )
}

function buildWheelSlices(
  season: PersonalColorSeason,
  colors: PersonalColorSwatch[],
  avoidColors: PersonalColorSwatch[],
  selectedHex: string | null
): WheelSlice[] {
  const seasonPalette = normalizeSeasonPalette(season)
  const preferredColors = selectedHex
    ? buildSelectedFamily(selectedHex, season)
    : normalizeSwatches([
        ...colors,
        ...seasonPalette,
      ]).slice(0, WHEEL_SLICE_COUNT)
  const safePreferredColors = preferredColors.length > 0 ? preferredColors : seasonPalette
  const avoidPalette = normalizeSwatches(avoidColors).slice(0, 4)
  const slices: WheelSlice[] = safePreferredColors.map((color) => ({ color, isAvoid: false }))

  if (avoidPalette.length === 0) {
    return slices
  }

  for (let index = 0; index < avoidPalette.length; index += 1) {
    const insertAt = Math.min(
      slices.length,
      Math.round(((safePreferredColors.length + index) / avoidPalette.length) * (index + 1))
    )

    slices.splice(insertAt, 0, {
      color: avoidPalette[index],
      isAvoid: true,
    })
  }

  return slices
}

function buildSelectedFamily(selectedHex: string, season: PersonalColorSeason) {
  if (!isValidHexColor(selectedHex)) {
    return normalizeSeasonPalette(season)
  }

  const hsl = hexToHsl(selectedHex)

  if (!hsl) {
    return normalizeSeasonPalette(season)
  }

  return Array.from({ length: WHEEL_SLICE_COUNT }, (_, index) => {
    const position = index / (WHEEL_SLICE_COUNT - 1)
    const hueShift = (position - 0.5) * 26
    const saturation = clamp(hsl.s + 12 - position * 18, 38, 96)
    const lightness = clamp(30 + position * 42, 22, 82)
    return {
      hex: hslToHex(hsl.h + hueShift, saturation, lightness),
      name: `Selected shade ${String(index + 1).padStart(2, '0')}`,
    }
  })
}

const PersonalColorCanvas = forwardRef<PersonalColorCanvasHandle, PersonalColorCanvasProps>(
  function PersonalColorCanvas(
    {
      animateVersion,
      avoidColors,
      backgroundHex,
      colors,
      imageData,
      onColorSelect,
      selectedHex,
      season,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const cropRef = useRef<CropFocus | null>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const hasAnimatedRef = useRef(false)
    const [canvasWidth, setCanvasWidth] = useState(0)
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
        setCanvasWidth(Math.max(280, Math.round(nextWidth)))
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
      hasAnimatedRef.current = false
    }, [animateVersion])

    useEffect(() => {
      const canvas = canvasRef.current

      if (!canvas || !canvasWidth || !onColorSelect) {
        return
      }

      const width = canvasWidth
      const height = Math.round(canvasWidth * PORTRAIT_CANVAS_HEIGHT_RATIO)
      const centerX = width / 2
      const centerY = height / 2
      const outerRadius = Math.max(width, height) * 0.82
      const faceRadius = width * 0.19
      const slices = buildWheelSlices(season, colors, avoidColors, selectedHex)
      const sliceAngle = (Math.PI * 2) / slices.length

      const handleCanvasClick = (event: MouseEvent) => {
        const bounds = canvas.getBoundingClientRect()
        const offsetX = event.clientX - bounds.left
        const offsetY = event.clientY - bounds.top
        const distance = Math.hypot(offsetX - centerX, offsetY - centerY)

        if (distance < faceRadius || distance > outerRadius || slices.length === 0) {
          return
        }

        const angle = (Math.atan2(offsetY - centerY, offsetX - centerX) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
        const sliceIndex = Math.min(slices.length - 1, Math.floor(angle / sliceAngle))
        const selectedSlice = slices[sliceIndex]

        if (selectedSlice) {
          onColorSelect(selectedSlice.color)
        }
      }

      canvas.addEventListener('click', handleCanvasClick)

      return () => {
        canvas.removeEventListener('click', handleCanvasClick)
      }
    }, [avoidColors, canvasWidth, colors, onColorSelect, season, selectedHex])

    useEffect(() => {
      const canvas = canvasRef.current
      const image = imageRef.current
      const crop = cropRef.current

      if (!canvas || !image || !crop || !canvasWidth || !imageReady) {
        return
      }

      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      const dpr = window.devicePixelRatio || 1
      const width = canvasWidth
      const height = Math.round(canvasWidth * PORTRAIT_CANVAS_HEIGHT_RATIO)
      const slices = buildWheelSlices(season, colors, avoidColors, selectedHex)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const centerX = width / 2
      const centerY = height / 2
      const outerRadius = Math.max(width, height) * 0.82
      const faceRadius = width * 0.19
      const totalSlices = slices.length
      const sliceAngle = (Math.PI * 2) / totalSlices
      let animationFrameId = 0

      const draw = (elapsedMs: number) => {
        context.clearRect(0, 0, width, height)

        const background = context.createLinearGradient(0, 0, width, height)
        background.addColorStop(0, mixHexWithWhite(backgroundHex, 0.1))
        background.addColorStop(1, mixHexWithBlack(backgroundHex, 0.08))
        context.fillStyle = background
        context.fillRect(0, 0, width, height)

        const glow = context.createRadialGradient(centerX, centerY, faceRadius * 0.82, centerX, centerY, outerRadius)
        glow.addColorStop(0, 'rgba(255,255,255,0.08)')
        glow.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = glow
        context.fillRect(0, 0, width, height)

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
          context.fillStyle = slice.color.hex
          context.fill()
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

        context.strokeStyle = 'rgba(255,255,255,0.98)'
        context.lineWidth = 5
        context.beginPath()
        context.arc(centerX, centerY, faceRadius + 3, 0, Math.PI * 2)
        context.stroke()

        context.strokeStyle = 'rgba(45,27,47,0.06)'
        context.lineWidth = 1
        context.beginPath()
        context.arc(centerX, centerY, width * 0.47, 0, Math.PI * 2)
        context.stroke()
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
    }, [animateVersion, avoidColors, backgroundHex, canvasWidth, colors, imageReady, season, selectedHex])

    return (
      <div ref={containerRef} className="mx-auto w-[84vw] max-w-[500px] md:w-full md:max-w-[560px]">
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer rounded-[28px] shadow-[0_22px_52px_rgba(45,27,47,0.16)]"
          style={{ aspectRatio: '3 / 4' }}
        />
      </div>
    )
  }
)

export default PersonalColorCanvas
