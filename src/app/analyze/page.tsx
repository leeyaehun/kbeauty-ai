'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const MEDIAPIPE_CPU_INFO_LOG = 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'
const MAX_CAPTURE_BYTES = 1024 * 1024
const MEDIAPIPE_GPU_FALLBACK_LOG_PATTERNS = [
  'StartGraph failed: INTERNAL: Service "kGpuService"',
  'emscripten_webgl_create_context() returned error 0',
  'gl_graph_runner_internal.cc',
]

function shouldMuteMediapipeLog(args: unknown[]) {
  return args.some(
    arg =>
      typeof arg === 'string' &&
      (
        arg.includes(MEDIAPIPE_CPU_INFO_LOG) ||
        MEDIAPIPE_GPU_FALLBACK_LOG_PATTERNS.some(pattern => arg.includes(pattern))
      )
  )
}

function canUseWebGL() {
  const canvas = document.createElement('canvas')
  return Boolean(
    canvas.getContext('webgl2') ||
    canvas.getContext('webgl') ||
    canvas.getContext('experimental-webgl')
  )
}

async function withMutedMediapipeLogs<T>(operation: () => Promise<T> | T): Promise<T> {
  const originalConsoleError = console.error

  console.error = (...args: unknown[]) => {
    if (shouldMuteMediapipeLog(args)) {
      return
    }
    originalConsoleError(...args)
  }

  try {
    return await operation()
  } finally {
    console.error = originalConsoleError
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('이미지 변환에 실패했어요. 다시 시도해주세요.'))
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

      reject(new Error('이미지 저장 형식 변환에 실패했어요.'))
    }

    reader.onerror = () => {
      reject(new Error('이미지 저장 중 읽기 오류가 발생했어요.'))
    }

    reader.readAsDataURL(blob)
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
      throw new Error('이미지 압축 준비에 실패했어요.')
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
    throw new Error('이미지 압축에 실패했어요.')
  }

  if (smallestBlob.size > MAX_CAPTURE_BYTES) {
    throw new Error('촬영 이미지가 너무 커서 저장할 수 없어요. 조금 더 가까이서 다시 촬영해주세요.')
  }

  return blobToDataUrl(smallestBlob)
}

export default function AnalyzePage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'detected' | 'captured'>('loading')
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [captureError, setCaptureError] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setCameraReady(true)
          setStatus('ready')
        }
      } catch (e) {
        console.error('카메라 접근 실패:', e)
      }
    }
    startCamera()

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(t => t.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (!cameraReady) return

    type Detection = {
      categories?: Array<{ score?: number }>
    }

    type DetectionResult = {
      detections: Detection[]
    }

    type Delegate = 'GPU' | 'CPU'

    let faceDetector: { detectForVideo: (video: HTMLVideoElement, timestamp: number) => DetectionResult, close: () => void } | null = null
    let activeDelegate: Delegate | null = null
    let animationFrameId: number | null = null
    let isCancelled = false
    let isRecovering = false

    const closeFaceDetector = async () => {
      if (!faceDetector) return

      const detectorToClose = faceDetector
      faceDetector = null
      activeDelegate = null

      await withMutedMediapipeLogs(() => {
        detectorToClose.close()
      })
    }

    async function loadFaceDetector() {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      )

      const createFaceDetector = async (delegate: Delegate) => {
        return withMutedMediapipeLogs(() =>
          FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
              delegate
            },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.3,
          })
        )
      }

      const createFaceDetectorWithFallback = async (preferredDelegate: Delegate) => {
        if (preferredDelegate === 'GPU' && !canUseWebGL()) {
          console.warn('WebGL 컨텍스트를 만들 수 없어 CPU delegate로 폴백합니다.')
          const detector = await createFaceDetector('CPU')
          return { detector, delegate: 'CPU' as const }
        }

        try {
          const detector = await createFaceDetector(preferredDelegate)
          return { detector, delegate: preferredDelegate }
        } catch (error) {
          if (preferredDelegate === 'CPU') {
            throw error
          }

          console.warn('GPU delegate 초기화 실패, CPU delegate로 폴백합니다.', error)
          const detector = await createFaceDetector('CPU')
          return { detector, delegate: 'CPU' as const }
        }
      }

      const scheduleDetect = () => {
        animationFrameId = requestAnimationFrame(() => {
          void detect()
        })
      }

      const initializeDetector = async (preferredDelegate: Delegate = 'GPU') => {
        await closeFaceDetector()
        const created = await createFaceDetectorWithFallback(preferredDelegate)
        faceDetector = created.detector
        activeDelegate = created.delegate
        console.info(`FaceDetector initialized with ${activeDelegate} delegate`)

        if (isCancelled || !faceDetector) {
          await closeFaceDetector()
          return false
        }

        return true
      }

      const recoverDetector = async (error: unknown) => {
        if (isCancelled || isRecovering) return

        isRecovering = true
        const fallbackDelegate: Delegate = activeDelegate === 'GPU' ? 'CPU' : 'CPU'
        console.warn(`FaceDetector 추론 실패, ${fallbackDelegate} delegate로 다시 초기화합니다.`, error)

        try {
          const initialized = await initializeDetector(fallbackDelegate)
          if (initialized && !isCancelled) {
            scheduleDetect()
          }
        } catch (recoveryError) {
          console.error('FaceDetector 재초기화 실패:', recoveryError)
        } finally {
          isRecovering = false
        }
      }

      const detect = async () => {
        if (isCancelled) return

        const video = videoRef.current
        const detector = faceDetector

        if (!video || video.readyState < 2 || !detector) {
          if (!isRecovering) {
            scheduleDetect()
          }
          return
        }

        try {
          const results = detector.detectForVideo(video, Date.now())
          const confidence = results.detections[0]?.categories?.[0]?.score ?? 0
          console.debug('Face detection confidence:', confidence)
          const detected = results.detections.length > 0
          setFaceDetected(detected)
          if (detected) setStatus('detected')
          else setStatus('ready')
        } catch (error) {
          setFaceDetected(false)
          setStatus('ready')
          await recoverDetector(error)
          return
        }

        scheduleDetect()
      }

      const initialized = await initializeDetector()
      if (!initialized) return

      await detect()
    }

    loadFaceDetector().catch(error => {
      console.error('FaceDetector 초기화 실패:', error)
    })

    return () => {
      isCancelled = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      void closeFaceDetector()
    }
  }, [cameraReady])

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return

    try {
      setCaptureError('')
      setIsCapturing(true)

      const canvas = canvasRef.current
      const video = videoRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('카메라 프레임을 읽지 못했어요. 다시 시도해주세요.')
      }

      ctx.drawImage(video, 0, 0)

      const imageData = await compressCanvasForUpload(canvas)
      sessionStorage.setItem('capturedImage', imageData)

      const storedImage = sessionStorage.getItem('capturedImage')

      if (!storedImage) {
        throw new Error('촬영 이미지를 저장하지 못했어요. 브라우저 저장 공간을 확인해주세요.')
      }

      setStatus('captured')
      router.push('/survey')
    } catch (error) {
      console.error('촬영 저장 실패:', error)
      setCaptureError(error instanceof Error ? error.message : '촬영 이미지를 저장하지 못했어요.')
    } finally {
      setIsCapturing(false)
    }
  }, [router])

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <aside className="brand-card p-7 md:p-8">
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Live camera scan
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              Frame your face in soft light
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              Keep your face centered, face forward, and let the camera capture your natural skin texture for a more refined K-beauty analysis.
            </p>

            <div className="mt-8 space-y-4">
              <div className="brand-card-soft p-5">
                <p className="text-sm font-semibold text-[#d94d82]">Best capture setup</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Bright daylight, clean lens, and a calm front-facing angle create the clearest read.</p>
              </div>
              <div className="brand-card-soft p-5">
                <p className="text-sm font-semibold text-[#d94d82]">What we read</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Hydration clues, surface shine, sensitivity signs, and overall balance.</p>
              </div>
            </div>
          </aside>

          <section className="brand-card p-6 md:p-8">
            <div className="relative mx-auto mb-6 h-80 w-80 overflow-hidden rounded-[44px] border border-[rgba(255,107,157,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(255,240,245,0.9))] p-3 shadow-[0_28px_60px_rgba(149,64,109,0.14)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,179,209,0.28),transparent_58%)]" />
              <div className="relative h-full overflow-hidden rounded-[36px] bg-[#fde8f1]">
                <video
                  ref={videoRef}
                  className="h-full w-full scale-x-[-1] object-cover"
                  playsInline
                  muted
                />
                <div className={`absolute inset-4 rounded-[30px] border-[3px] transition-colors duration-300 ${
                  faceDetected ? 'border-[#ff6b9d]' : 'border-white/60'
                }`} />
              </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c89b3c]">
                {status === 'detected' ? 'Face confirmed' : status === 'loading' ? 'Preparing camera' : 'Positioning guidance'}
              </p>
              {status === 'loading' && (
                <p className="mt-3 text-base text-[var(--muted)]">카메라를 준비하고 있어요.</p>
              )}
              {status === 'ready' && (
                <div className="mt-3 space-y-2">
                  <p className="text-lg font-semibold text-[var(--ink)]">얼굴을 프레임 중앙에 맞춰주세요</p>
                  <p className="text-sm text-[var(--muted)]">밝은 곳에서 정면을 바라보면 더 정확해져요.</p>
                </div>
              )}
              {status === 'detected' && (
                <div className="mt-3 space-y-2">
                  <p className="text-lg font-semibold text-[#d94d82]">완벽해요. 피부를 읽을 준비가 됐어요.</p>
                  <p className="text-sm text-[var(--muted)]">Capture를 눌러 다음 단계로 이동하세요.</p>
                </div>
              )}
            </div>

            <button
              onClick={capture}
              disabled={!faceDetected || isCapturing}
              className={`mt-8 w-full py-4 font-semibold ${
                faceDetected && !isCapturing
                  ? 'brand-button-primary'
                  : 'cursor-not-allowed rounded-full bg-[rgba(255,179,209,0.45)] text-white/70'
              }`}
            >
              {isCapturing ? 'Saving your photo...' : 'Capture My Skin'}
            </button>

            <p className="mt-4 text-center text-sm text-[var(--muted)]">
              {faceDetected ? 'You are all set for your skin survey.' : 'If detection feels slow, step closer and avoid backlight.'}
            </p>
            {captureError && (
              <p className="mt-3 text-center text-sm text-[#d94d82]">{captureError}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
