'use client'

export default function ToastMessage({
  message,
}: {
  message: string
}) {
  if (!message) {
    return null
  }

  return (
    <div
      className="fixed inset-x-0 z-[60] flex justify-center px-6"
      style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
    >
      <div className="rounded-full bg-[rgba(45,27,47,0.92)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(45,27,47,0.28)] backdrop-blur-xl">
        {message}
      </div>
    </div>
  )
}
