'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4 text-center">
        K-Beauty AI
      </h1>
      <p className="text-gray-400 mb-2 text-center max-w-md">
        셀카 한 장으로 피부 타입 분석 후 맞춤 K-뷰티 제품을 추천해드려요
      </p>

      {user && (
        <p className="text-green-400 text-sm mb-8">
          {user.email}
        </p>
      )}
      {!user && <div className="mb-8" />}

      <a
        href="/analyze"
        className="bg-white text-black px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition mb-4"
      >
        Analyze My Skin - Free
      </a>

      {!user && (
        <button
          onClick={() => router.push('/login')}
          className="text-gray-400 text-sm hover:text-white transition"
        >
          로그인하고 히스토리 저장하기
        </button>
      )}

      {user && (
        <button
          onClick={async () => {
            const supabase = createClient()
            await supabase.auth.signOut()
            setUser(null)
          }}
          className="text-gray-400 text-sm hover:text-white transition"
        >
          로그아웃
        </button>
      )}
    </main>
  )
}
