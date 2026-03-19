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

export type PersonalColorCanvasHandle = {
  exportImage: () => string | null
}

type PersonalColorCanvasProps = {
  backgroundHex: string
  bestColors: PersonalColorSwatch[]
  imageData: string
  onSelectColor: (swatch: PersonalColorSwatch) => void
  selectedHex: string | null
  seasonLabel: string
  avoidColors: PersonalColorSwatch[]
}

type CropFocus = {
  centerX: number
  centerY: number
  radius: number
}

type PatchLayout = {
  color: PersonalColorSwatch
  x: number
  y: number
  radius: number
  labelY: number
}

const CANVAS_ASPECT_RATIO = 1.12
const PATCH_RADIUS = 25
const LABEL_FONT = '500 12px "Avenir Next", "Avenir", "Noto Sans KR", sans-serif'
const TITLE_FONT = '700 14px "Avenir Next", "Avenir", "Noto Sans KR", sans-serif'
const BODY_FONT = '500 13px "Avenir Next", "Avenir", "Noto Sans KR", sans-serif'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')

  if (normalized.length !== 6) {
    return null
  }

  const value = Number.parseInt(normalized, 16)

  if (Number.isNaN(value)) {
    return null
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function mixWithWhite(hex: string, weight: number) {
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.closePath()
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
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

    const centerX = sumX / points.length
    const centerY = sumY / points.length
    const width = maxX - minX
    const height = maxY - minY

    return {
      centerX,
      centerY,
      radius: Math.max(width, height) * 0.52,
    }
  } catch {
    return fallback
  }
}

function getPatchLayouts(
  width: number,
  height: number,
  colors: PersonalColorSwatch[]
): PatchLayout[] {
  const featured = colors.slice(0, 8)
  const centerX = width / 2
  const centerY = height * 0.38
  const orbitRadius = Math.min(width, height) * 0.34
  const startAngle = -Math.PI / 2

  return featured.map((color, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / featured.length
    const x = centerX + Math.cos(angle) * orbitRadius
    const y = centerY + Math.sin(angle) * orbitRadius * 0.88

    return {
      color,
      labelY: y + PATCH_RADIUS + 20,
      radius: PATCH_RADIUS,
      x,
      y,
    }
  })
}

const PersonalColorCanvas = forwardRef<PersonalColorCanvasHandle, PersonalColorCanvasProps>(
  function PersonalColorCanvas(
    {
      backgroundHex,
      bestColors,
      imageData,
      onSelectColor,
      selectedHex,
      seasonLabel,
      avoidColors,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const cropRef = useRef<CropFocus | null>(null)
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
        setCanvasWidth(Math.max(320, Math.round(nextWidth)))
      })

      observer.observe(containerRef.current)

      return () => observer.disconnect()
    }, [])

    useEffect(() => {
      let isActive = true
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

      if (!canvas || !image || !crop || !canvasWidth || !imageReady) {
        return
      }

      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      const dpr = window.devicePixelRatio || 1
      const width = canvasWidth
      const height = Math.round(width * CANVAS_ASPECT_RATIO)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const patchLayouts = getPatchLayouts(width, height, bestColors)
      const avoidLayouts = avoidColors.slice(0, 4)
      let animationFrameId = 0

      const draw = (elapsedMs: number) => {
        context.clearRect(0, 0, width, height)

        const panelFill = context.createLinearGradient(0, 0, width, height)
        panelFill.addColorStop(0, mixWithWhite(backgroundHex, 0.12))
        panelFill.addColorStop(1, mixWithWhite(backgroundHex, 0.52))
        drawRoundedRect(context, 0, 0, width, height, 32)
        context.fillStyle = panelFill
        context.fill()

        const glow = context.createRadialGradient(width / 2, height * 0.28, 40, width / 2, height * 0.28, width * 0.46)
        glow.addColorStop(0, 'rgba(255,255,255,0.95)')
        glow.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = glow
        context.fillRect(0, 0, width, height)

        context.fillStyle = 'rgba(45,27,47,0.64)'
        context.font = TITLE_FONT
        context.letterSpacing = '0.18em'
        context.fillText(seasonLabel, 26, 34)

        context.font = BODY_FONT
        context.fillStyle = 'rgba(45,27,47,0.72)'
        context.fillText('Your most flattering shades orbit your portrait.', 26, 56)

        const faceCenterX = width / 2
        const faceCenterY = height * 0.38
        const faceRadius = Math.min(width, height) * 0.18

        context.save()
        context.beginPath()
        context.arc(faceCenterX, faceCenterY, faceRadius, 0, Math.PI * 2)
        context.closePath()
        context.clip()

        const sourceSize = crop.radius * 2.4
        const sourceX = clamp(crop.centerX - sourceSize / 2, 0, image.naturalWidth - sourceSize)
        const sourceY = clamp(crop.centerY - sourceSize / 2, 0, image.naturalHeight - sourceSize)

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          faceCenterX - faceRadius,
          faceCenterY - faceRadius,
          faceRadius * 2,
          faceRadius * 2
        )
        context.restore()

        context.lineWidth = 8
        context.strokeStyle = 'rgba(255,255,255,0.92)'
        context.beginPath()
        context.arc(faceCenterX, faceCenterY, faceRadius + 4, 0, Math.PI * 2)
        context.stroke()

        context.lineWidth = 1
        context.strokeStyle = 'rgba(255,255,255,0.34)'
        context.beginPath()
        context.arc(faceCenterX, faceCenterY, faceRadius + 54, 0, Math.PI * 2)
        context.stroke()

        context.beginPath()
        context.arc(faceCenterX, faceCenterY, faceRadius + 104, 0, Math.PI * 2)
        context.strokeStyle = 'rgba(45,27,47,0.06)'
        context.stroke()

        patchLayouts.forEach((patch, index) => {
          const delay = index * 100
          const duration = 650
          const rawProgress = clamp((elapsedMs - delay) / duration, 0, 1)
          const progress = easeOutCubic(rawProgress)
          const startX = faceCenterX
          const startY = faceCenterY
          const x = startX + (patch.x - startX) * progress
          const y = startY + (patch.y - startY) * progress
          const scale = 0.35 + progress * 0.65

          context.save()
          context.globalAlpha = rawProgress
          context.translate(x, y)
          context.scale(scale, scale)

          context.shadowBlur = 26
          context.shadowColor = 'rgba(45,27,47,0.18)'
          context.fillStyle = patch.color.hex
          context.beginPath()
          context.arc(0, 0, patch.radius, 0, Math.PI * 2)
          context.fill()

          if (selectedHex === patch.color.hex) {
            context.lineWidth = 4
            context.strokeStyle = '#ffffff'
            context.stroke()
          }

          context.restore()

          context.save()
          context.globalAlpha = rawProgress
          context.textAlign = 'center'
          context.font = LABEL_FONT
          context.fillStyle = 'rgba(45,27,47,0.72)'
          context.fillText(patch.color.name, x, y + patch.radius + 18)
          context.restore()
        })

        const avoidTrayY = height - 142
        drawRoundedRect(context, 20, avoidTrayY, width - 40, 104, 28)
        context.fillStyle = 'rgba(104,116,139,0.12)'
        context.fill()
        context.strokeStyle = 'rgba(104,116,139,0.14)'
        context.stroke()

        context.font = TITLE_FONT
        context.fillStyle = 'rgba(79,94,113,0.84)'
        context.textAlign = 'left'
        context.fillText('Colors to avoid', 40, avoidTrayY + 24)

        avoidLayouts.forEach((color, index) => {
          const spacing = (width - 110) / Math.max(avoidLayouts.length - 1, 1)
          const x = 56 + index * spacing
          const y = avoidTrayY + 62

          context.fillStyle = color.hex
          context.beginPath()
          context.arc(x, y, 18, 0, Math.PI * 2)
          context.fill()

          context.lineWidth = 2
          context.strokeStyle = 'rgba(255,255,255,0.8)'
          context.beginPath()
          context.arc(x, y, 18, 0, Math.PI * 2)
          context.stroke()

          context.strokeStyle = 'rgba(79,94,113,0.72)'
          context.lineWidth = 2.5
          context.beginPath()
          context.moveTo(x - 10, y - 10)
          context.lineTo(x + 10, y + 10)
          context.moveTo(x + 10, y - 10)
          context.lineTo(x - 10, y + 10)
          context.stroke()
        })

        context.textAlign = 'left'
        context.font = '700 11px "Avenir Next", "Avenir", "Noto Sans KR", sans-serif'
        context.fillStyle = 'rgba(45,27,47,0.72)'
        context.fillText('K-BEAUTY AI', 26, height - 16)
        context.textAlign = 'right'
        context.fillStyle = 'rgba(79,94,113,0.82)'
        context.fillText('kbeauty-ai.vercel.app', width - 26, height - 16)
      }

      if (hasAnimatedRef.current) {
        draw(Number.POSITIVE_INFINITY)
        return
      }

      const startAt = performance.now()

      const animate = (now: number) => {
        const elapsed = now - startAt
        draw(elapsed)

        if (elapsed < 1800) {
          animationFrameId = window.requestAnimationFrame(animate)
          return
        }

        hasAnimatedRef.current = true
        draw(Number.POSITIVE_INFINITY)
      }

      animationFrameId = window.requestAnimationFrame(animate)

      return () => window.cancelAnimationFrame(animationFrameId)
    }, [avoidColors, backgroundHex, bestColors, canvasWidth, imageReady, seasonLabel, selectedHex])

    function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
      if (!canvasRef.current || !canvasWidth) {
        return
      }

      const rect = canvasRef.current.getBoundingClientRect()
      const scaleX = canvasWidth / rect.width
      const scaleY = Math.round(canvasWidth * CANVAS_ASPECT_RATIO) / rect.height
      const x = (event.clientX - rect.left) * scaleX
      const y = (event.clientY - rect.top) * scaleY

      const patch = getPatchLayouts(canvasWidth, Math.round(canvasWidth * CANVAS_ASPECT_RATIO), bestColors)
        .find((layout) => Math.hypot(layout.x - x, layout.y - y) <= layout.radius)

      if (patch) {
        onSelectColor(patch.color)
      }
    }

    return (
      <div ref={containerRef} className="w-full">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full cursor-pointer rounded-[32px] shadow-[0_28px_60px_rgba(45,27,47,0.16)]"
        />
      </div>
    )
  }
)

export default PersonalColorCanvas
