import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const SKIN_TYPE_LABEL: Record<string, string> = {
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
  normal: 'Normal',
}

type ScoreSet = {
  hydration: number
  oiliness: number
  sensitivity: number
}

type HistoryEntry = {
  id: string
  created_at: string
  skin_type: string
  image_url: string | null
  scores: ScoreSet
}

type ChangeMeta = {
  arrow: string
  colorClass: string
  deltaLabel: string
  improved: boolean
}

function normalizeScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(parsed)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeScores(value: unknown): ScoreSet {
  const scores = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    hydration: normalizeScore(scores.hydration),
    oiliness: normalizeScore(scores.oiliness),
    sensitivity: normalizeScore(scores.sensitivity),
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getChangeMeta(label: keyof ScoreSet, beforeValue: number, afterValue: number): ChangeMeta {
  const delta = afterValue - beforeValue

  if (delta === 0) {
    return {
      arrow: '->',
      colorClass: 'text-gray-400',
      deltaLabel: 'No change',
      improved: false,
    }
  }

  const isSensitivity = label === 'sensitivity'
  const improved = isSensitivity ? delta < 0 : delta > 0

  return {
    arrow: delta > 0 ? '▲' : '▼',
    colorClass: improved ? 'text-[#16a34a]' : 'text-[#ef4444]',
    deltaLabel: `${Math.abs(delta)} pts`,
    improved,
  }
}

function HistorySnapshot({ label, entry }: { label: string, entry: HistoryEntry }) {
  return (
    <div className="rounded-[28px] border border-[rgba(255,107,157,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,240,245,0.92))] p-5 shadow-[0_16px_28px_rgba(149,64,109,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <span className="brand-chip px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
          {label}
        </span>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          {formatDate(entry.created_at)}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        {entry.image_url ? (
          <img
            src={entry.image_url}
            alt={`${label} skin snapshot`}
            className="h-24 w-24 rounded-[24px] object-cover shadow-[0_14px_24px_rgba(149,64,109,0.12)]"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#fff3eb,#ffe4ef)] text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            No Photo
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Skin type</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            {SKIN_TYPE_LABEL[entry.skin_type] || entry.skin_type}
          </p>
        </div>
      </div>
    </div>
  )
}

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data, error } = await supabase
    .from('analyses')
    .select('id, created_at, skin_type, scores, image_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load history: ${error.message}`)
  }

  const analyses: HistoryEntry[] = (data ?? []).map((entry) => ({
    id: entry.id,
    created_at: entry.created_at,
    skin_type: entry.skin_type,
    image_url: entry.image_url,
    scores: normalizeScores(entry.scores),
  }))

  const latestEntry = analyses[0] ?? null
  const firstEntry = analyses.length >= 2 ? analyses[analyses.length - 1] : null
  const comparisonMetrics = firstEntry && latestEntry
    ? (['hydration', 'oiliness', 'sensitivity'] as const).map((key) => ({
        key,
        label: key === 'oiliness' ? 'Oil Level' : key[0].toUpperCase() + key.slice(1),
        before: firstEntry.scores[key],
        after: latestEntry.scores[key],
        meta: getChangeMeta(key, firstEntry.scores[key], latestEntry.scores[key]),
      }))
    : []
  const improvedCount = comparisonMetrics.filter((metric) => metric.meta.improved).length
  const worsenedCount = comparisonMetrics.filter((metric) => !metric.meta.improved && metric.meta.deltaLabel !== 'No change').length
  const showImprovementMessage = comparisonMetrics.length > 0 && improvedCount > worsenedCount

  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell">
        <div className="mb-8 flex justify-center md:justify-start">
          <div className="brand-mark">K-Beauty AI</div>
        </div>

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="brand-chip px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
              Progress tracking
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              My skin history
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              Revisit past analyses, compare your latest skin snapshot, and watch your glow evolve over time.
            </p>
          </div>
          <a
            href="/analyze"
            className="brand-button-secondary px-6 py-4 text-center font-semibold"
          >
            New Analysis
          </a>
        </div>

        {comparisonMetrics.length > 0 && firstEntry && latestEntry && (
          <section className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="brand-card p-7 md:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Before / After</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                    Your progress snapshot
                  </h2>
                </div>
                {showImprovementMessage && (
                  <div className="rounded-full bg-[linear-gradient(135deg,rgba(134,239,172,0.28),rgba(255,255,255,0.92))] px-4 py-2 text-sm font-semibold text-[#15803d]">
                    Your skin is improving! 🎉
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <HistorySnapshot label="Before" entry={firstEntry} />
                <HistorySnapshot label="Latest" entry={latestEntry} />
              </div>
            </div>

            <div className="brand-card p-7 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Score changes</p>
              <div className="mt-5 space-y-4">
                {comparisonMetrics.map((metric) => (
                  <div
                    key={metric.key}
                    className="rounded-[24px] border border-[rgba(255,107,157,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,240,245,0.92))] p-5 shadow-[0_14px_24px_rgba(149,64,109,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">{metric.label}</p>
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          {metric.before} &rarr; {metric.after}
                        </p>
                      </div>
                      <div className={`text-right text-lg font-semibold ${metric.meta.colorClass}`}>
                        <span>{metric.meta.arrow}</span>
                        <span className="ml-2">{metric.meta.deltaLabel}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">Saved analyses</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                Your analysis timeline
              </h2>
            </div>
            <div className="rounded-full border border-[rgba(200,155,60,0.24)] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(246,222,177,0.45))] px-5 py-3 text-sm font-semibold text-[#c89b3c] shadow-[0_14px_24px_rgba(149,64,109,0.08)]">
              {analyses.length} saved entries
            </div>
          </div>

          {analyses.length === 0 ? (
            <div className="brand-card p-8 text-center">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                No analyses yet
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Run your first skin scan to start tracking progress here.
              </p>
              <a
                href="/analyze"
                className="brand-button-primary mt-6 inline-block px-8 py-4 font-semibold"
              >
                Start Skin Analysis
              </a>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {analyses.map((entry) => (
                <article
                  key={entry.id}
                  className="brand-card overflow-hidden p-6 md:p-7"
                >
                  <div className="flex items-start gap-4">
                    {entry.image_url ? (
                      <img
                        src={entry.image_url}
                        alt={`${formatDate(entry.created_at)} skin analysis`}
                        className="h-24 w-24 shrink-0 rounded-[24px] object-cover shadow-[0_14px_24px_rgba(149,64,109,0.12)]"
                      />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#fff3eb,#ffe4ef)] text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                        No Photo
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
                        {formatDate(entry.created_at)}
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        {SKIN_TYPE_LABEL[entry.skin_type] || entry.skin_type}
                      </h3>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[20px] bg-[#fff0f5] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d94d82]">Hydration</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{entry.scores.hydration}</p>
                        </div>
                        <div className="rounded-[20px] bg-white px-4 py-3 shadow-[0_12px_22px_rgba(149,64,109,0.06)]">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c89b3c]">Oil Level</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{entry.scores.oiliness}</p>
                        </div>
                        <div className="rounded-[20px] bg-white px-4 py-3 shadow-[0_12px_22px_rgba(149,64,109,0.06)]">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f87171]">Sensitivity</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{entry.scores.sensitivity}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
