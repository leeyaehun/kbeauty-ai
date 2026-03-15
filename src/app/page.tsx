export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-8">
      <h1 className="text-4xl font-bold mb-4">K-Beauty AI</h1>
      <a href="/analyze" className="bg-white text-black px-8 py-3 rounded-full">
        Analyze My Skin
      </a>
    </main>
  )
}
