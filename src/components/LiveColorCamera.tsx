'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

import type { PersonalColorSwatch } from '@/components/PersonalColorCanvas'

type LiveColorCameraProps = {
  backgroundHex: string
  colors: PersonalColorSwatch[]
  onClose: () => void
  onColorSelect: (color: PersonalColorSwatch) => void
  selectedColor: PersonalColorSwatch | null
}

const CANVAS_ASPECT_RATIO = 4 / 3
const FACE_DETECTION_CONFIDENCE = 0.6
const MAX_MISSED_DETECTION_FRAMES = 18

type FaceCrop = {
  centerX: number
  centerY: number
  radius: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createDefaultVideoCrop(video: HTMLVideoElement): FaceCrop {
  const sourceSize = Math.min(video.videoWidth, video.videoHeight) * 0.72

  return {
    centerX: video.videoWidth / 2,
    centerY: video.videoHeight / 2,
    radius: sourceSize / 2,
  }
}

export default function LiveColorCamera({
  backgroundHex,
  colors,
  onClose,
  onColorSelect,
  selectedColor,
}: LiveColorCameraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const detectorRef = useRef<{ detectForVideo: (video: HTMLVideoElement, timestamp: number) => { detections?: Array<{ boundingBox?: { originX?: number, originY?: number, width?: number, height?: number } }> }, close: () => void } | null>(null)
  const cropRef = useRef<FaceCrop | null>(null)
  const missedDetectionFramesRef = useRef(0)
  const [cameraState, setCameraState] = useState<'requesting' | 'ready' | 'error'>('requesting')
  const [errorMessage, setErrorMessage] = useState('')
  const [faceHint, setFaceHint] = useState('')

  useEffect(() => {
    let isActive = true

    async function startCameraAndDetector() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('error')
        setErrorMessage('Camera access required')
        return
      }

      try {
        setCameraState('requesting')
        setErrorMessage('')

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            height: { ideal: 480 },
            width: { ideal: 640 },
          },
        })

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          cropRef.current = createDefaultVideoCrop(videoRef.current)
        }

        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        )

        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            delegate: 'CPU',
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          },
          minDetectionConfidence: FACE_DETECTION_CONFIDENCE,
          runningMode: 'VIDEO',
        })

        if (!isActive) {
          detector.close()
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        detectorRef.current = detector

        if (isActive) {
          setCameraState('ready')
          setFaceHint('')
        }
      } catch {
        if (isActive) {
          setCameraState('error')
          setErrorMessage('Camera access required')
        }
      }
    }

    void startCameraAndDetector()

    return () => {
      isActive = false

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }

      detectorRef.current?.close()
      detectorRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    void startCameraAndDetector()
  }, [])

  useEffect(() => {
    if (cameraState !== 'ready') {
      return
    }

    const canvas = canvasRef.current
    const video = videoRef.current

    if (!canvas || !video) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const updateFaceCrop = () => {
      const detector = detectorRef.current

      if (!detector || video.videoWidth <= 0 || video.videoHeight <= 0) {
        return
      }

      try {
        const result = detector.detectForVideo(video, performance.now())
        const detection = result.detections?.[0]
        const box = detection?.boundingBox

        if (!box) {
          missedDetectionFramesRef.current += 1

          if (missedDetectionFramesRef.current > MAX_MISSED_DETECTION_FRAMES) {
            cropRef.current = createDefaultVideoCrop(video)
            setFaceHint('Move a little closer so we can match your color live.')
          }

          return
        }

        const width = box.width ?? 0
        const height = box.height ?? 0
        const centerX = (box.originX ?? 0) + width / 2
        const centerY = (box.originY ?? 0) + height / 2
        const paddedRadius = Math.max(width, height) * 1.15
        const minRadius = Math.min(video.videoWidth, video.videoHeight) * 0.18
        const maxRadius = Math.min(video.videoWidth, video.videoHeight) * 0.42

        cropRef.current = {
          centerX: clamp(centerX, paddedRadius, video.videoWidth - paddedRadius),
          centerY: clamp(centerY, paddedRadius, video.videoHeight - paddedRadius),
          radius: clamp(paddedRadius, minRadius, maxRadius),
        }

        missedDetectionFramesRef.current = 0
        setFaceHint('')
      } catch {
        missedDetectionFramesRef.current += 1
      }
    }

    const drawFrame = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(280, Math.round(rect.width))
      const height = Math.round(width * CANVAS_ASPECT_RATIO)
      const dpr = window.devicePixelRatio || 1

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      const centerX = width / 2
      const centerY = height / 2
      const faceRadius = width * 0.19

      context.clearRect(0, 0, width, height)
      context.fillStyle = selectedColor?.hex ?? backgroundHex
      context.fillRect(0, 0, width, height)

      const overlay = context.createLinearGradient(0, 0, width, height)
      overlay.addColorStop(0, 'rgba(255,255,255,0.18)')
      overlay.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = overlay
      context.fillRect(0, 0, width, height)

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        updateFaceCrop()

        const fallbackCrop = createDefaultVideoCrop(video)
        const activeCrop = cropRef.current ?? fallbackCrop
        const sourceSize = clamp(
          activeCrop.radius * 2,
          Math.min(video.videoWidth, video.videoHeight) * 0.35,
          Math.min(video.videoWidth, video.videoHeight) * 0.84
        )
        const sourceX = clamp(
          activeCrop.centerX - sourceSize / 2,
          0,
          Math.max(0, video.videoWidth - sourceSize)
        )
        const sourceY = clamp(
          activeCrop.centerY - sourceSize / 2,
          0,
          Math.max(0, video.videoHeight - sourceSize)
        )

        context.save()
        context.beginPath()
        context.arc(centerX, centerY, faceRadius, 0, Math.PI * 2)
        context.closePath()
        context.clip()
        context.translate(width, 0)
        context.scale(-1, 1)
        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          width - (centerX + faceRadius),
          centerY - faceRadius,
          faceRadius * 2,
          faceRadius * 2
        )
        context.restore()

        context.strokeStyle = 'rgba(255,255,255,0.95)'
        context.lineWidth = 4
        context.beginPath()
        context.arc(centerX, centerY, faceRadius + 2, 0, Math.PI * 2)
        context.stroke()
      }

      frameRef.current = window.requestAnimationFrame(drawFrame)
    }

    frameRef.current = window.requestAnimationFrame(drawFrame)

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [backgroundHex, cameraState, selectedColor])

  return (
    <div className="mt-6">
      <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/60 shadow-[0_22px_52px_rgba(45,27,47,0.16)] backdrop-blur-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/86 px-4 py-2 text-sm font-semibold text-[#5f4a61] shadow-[0_14px_24px_rgba(60,43,57,0.1)]"
        >
          <X className="h-4 w-4" />
          Close Camera
        </button>

        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ aspectRatio: '3 / 4' }}
        />

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="hidden"
        />

        {cameraState === 'requesting' ? (
          <div className="absolute inset-x-6 bottom-24 rounded-[22px] bg-white/82 p-4 text-center text-sm text-[#5f4a61] shadow-[0_16px_28px_rgba(60,43,57,0.12)]">
            Allow camera access to preview your selected color live.
          </div>
        ) : null}

        {cameraState === 'error' ? (
          <div className="absolute inset-x-6 bottom-24 rounded-[22px] bg-white/88 p-4 text-center shadow-[0_16px_28px_rgba(60,43,57,0.12)]">
            <p className="text-sm font-semibold text-[#2d1b2f]">{errorMessage}</p>
            <p className="mt-1 text-xs text-[#6b5967]">Please enable camera permission to use live try-on.</p>
          </div>
        ) : null}

        {cameraState === 'ready' && faceHint ? (
          <div className="absolute inset-x-6 bottom-24 rounded-[22px] bg-white/82 p-4 text-center text-sm text-[#5f4a61] shadow-[0_16px_28px_rgba(60,43,57,0.12)]">
            {faceHint}
          </div>
        ) : null}
      </div>

      <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-2">
        {colors.map((color) => {
          const isActive = selectedColor?.hex === color.hex

          return (
            <button
              key={`${color.name}-${color.hex}`}
              type="button"
              onClick={() => onColorSelect(color)}
              className={`h-12 w-12 shrink-0 rounded-full border transition ${
                isActive
                  ? 'border-white shadow-[0_0_0_4px_rgba(255,107,157,0.24)]'
                  : 'border-white/70 shadow-[0_10px_18px_rgba(60,43,57,0.12)]'
              }`}
              style={{ backgroundColor: color.hex }}
              aria-label={`Select ${color.name}`}
            />
          )
        })}
      </div>
    </div>
  )
}
