'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const MEDIAPIPE_CPU_INFO_LOG = 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'
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

export default function AnalyzePage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'detected' | 'captured'>('loading')
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const router = useRouter()

  // 카메라 시작
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

  // MediaPipe 얼굴 감지
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

      // 실시간 감지 루프
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

    loadFaceDetector()
      .catch(error => {
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

  // 사진 촬영
  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)

    const imageData = canvas.toDataURL('image/jpeg', 0.8)

    // 분석 페이지로 이미지 전달
    sessionStorage.setItem('capturedImage', imageData)
    router.push('/survey')
  }, [router])

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <h1 className="text-white text-2xl font-bold mb-2">피부 분석</h1>
      <p className="text-gray-400 text-sm mb-6">얼굴이 화면 중앙에 오도록 맞춰주세요</p>

      <div className="relative w-80 h-80 rounded-full overflow-hidden border-4 border-white/20">
        <video
          ref={videoRef}
          className="w-full h-full object-cover scale-x-[-1]"
          playsInline
          muted
        />

        {/* 얼굴 감지 표시 */}
        <div className={`absolute inset-0 rounded-full border-4 transition-colors duration-300 ${
          faceDetected ? 'border-green-400' : 'border-white/20'
        }`} />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* 상태 메시지 */}
      <div className="mt-6 text-center">
        {status === 'loading' && (
          <p className="text-gray-400">카메라 시작 중...</p>
        )}
        {status === 'ready' && (
          <div className="space-y-2">
            <p className="text-gray-400">얼굴을 화면에 맞춰주세요</p>
            <p className="text-gray-500 text-sm">밝은 곳에서 정면을 바라봐주세요</p>
          </div>
        )}
        {status === 'detected' && (
          <p className="text-green-400">얼굴이 감지됐어요!</p>
        )}
      </div>

      {/* 촬영 버튼 */}
      <button
        onClick={capture}
        disabled={!faceDetected}
        className={`mt-8 w-20 h-20 rounded-full border-4 transition-all duration-300 ${
          faceDetected
            ? 'bg-white border-white scale-100 cursor-pointer hover:scale-105'
            : 'bg-transparent border-white/30 scale-95 cursor-not-allowed'
        }`}
      />

      <p className="text-gray-500 text-xs mt-4">
        {faceDetected ? '버튼을 눌러 촬영하세요' : '밝은 곳에서 시도해보세요'}
      </p>
    </main>
  )
}
