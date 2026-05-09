import Link from 'next/link'

const FAQS = [
  {
    question: 'What does K-Beauty AI do?',
    answer:
      'K-Beauty AI provides AI-powered skin analysis, personal color guidance, and K-beauty product recommendations for informational and shopping support.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'You can use core discovery features without signing in. An account lets you save analysis history, wishlists, and membership status across devices.',
  },
  {
    question: 'Are photos stored?',
    answer:
      'Photos are used to generate analysis results and are not permanently stored on our servers unless a feature explicitly asks for saved history.',
  },
  {
    question: 'How do I cancel membership billing?',
    answer:
      'Subscription and billing issues are handled through the store or payment provider used at purchase. Contact support if you need help identifying the right cancellation path.',
  },
]

const TROUBLESHOOTING_STEPS = [
  'Confirm that your device is connected to Wi-Fi or cellular data.',
  'Close and reopen the app, then try the action again.',
  'Update to the latest App Store version of K-Beauty AI.',
  'Allow camera permission in iOS Settings if skin analysis cannot open the camera.',
  'Sign out and sign in again if saved results, wishlist, or membership status do not appear.',
]

export default function SupportPage() {
  return (
    <main className="brand-page brand-grid px-5 py-8 md:px-8 md:py-12">
      <div className="brand-shell max-w-5xl">
        <section className="rounded-[8px] border border-[rgba(255,107,157,0.18)] bg-white/92 p-6 shadow-[0_18px_40px_rgba(149,64,109,0.1)] md:p-10">
          <div className="brand-mark">K-Beauty AI</div>
          <h1 className="mt-7 text-4xl font-semibold leading-tight text-[var(--ink)] md:text-5xl">
            K-Beauty AI Support
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
            K-Beauty AI helps users understand their skin, explore personal color insights, and discover K-beauty
            recommendations. This page provides support contact details, troubleshooting help, privacy links, and account
            deletion instructions.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <a
              href="mailto:leeyaehun@gmail.com?subject=K-Beauty%20AI%20Support"
              className="rounded-[8px] border border-pink-200 bg-[#fff7fb] p-5 text-left transition hover:border-pink-300 hover:bg-white"
            >
              <p className="text-sm font-semibold uppercase text-[#d94d82]">Contact</p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">leeyaehun@gmail.com</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Include your account email, device model, iOS version, and a short description of the issue.
              </p>
            </a>

            <div className="rounded-[8px] border border-pink-200 bg-[#fff7fb] p-5">
              <p className="text-sm font-semibold uppercase text-[#d94d82]">App</p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">K-Beauty AI</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                AI skin analysis, personal color, wishlist, and product recommendation support for iPhone and iPad.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-[8px] border border-[rgba(255,107,157,0.18)] bg-white/92 p-6 shadow-[0_18px_40px_rgba(149,64,109,0.08)] md:p-8">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">FAQ</h2>
            <div className="mt-5 divide-y divide-pink-100">
              {FAQS.map((item) => (
                <article key={item.question} className="py-5 first:pt-0 last:pb-0">
                  <h3 className="text-base font-semibold text-[var(--ink)]">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[8px] border border-[rgba(255,107,157,0.18)] bg-white/92 p-6 shadow-[0_18px_40px_rgba(149,64,109,0.08)] md:p-8">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">Troubleshooting</h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
              {TROUBLESHOOTING_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff0f5] text-xs font-semibold text-[#d94d82]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="mt-6 rounded-[8px] border border-[rgba(255,107,157,0.18)] bg-white/92 p-6 shadow-[0_18px_40px_rgba(149,64,109,0.08)] md:p-8">
          <h2 className="text-2xl font-semibold text-[var(--ink)]">Account Deletion</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            K-Beauty AI accounts may include an email address, saved analysis history, wishlists, and membership records.
            To request account deletion, email{' '}
            <a className="font-semibold text-[#d94d82]" href="mailto:leeyaehun@gmail.com?subject=Delete%20my%20K-Beauty%20AI%20account">
              leeyaehun@gmail.com
            </a>{' '}
            from the email address used for your account with the subject "Delete my K-Beauty AI account". We will delete
            or anonymize account data unless retention is required for security, legal, or payment records.
          </p>
          <div className="mt-5 flex flex-col gap-3 text-sm font-semibold text-[#d94d82] sm:flex-row">
            <Link href="/privacy" className="rounded-full border border-pink-200 bg-[#fff7fb] px-5 py-3 text-center">
              Privacy Policy
            </Link>
            <Link href="/terms" className="rounded-full border border-pink-200 bg-[#fff7fb] px-5 py-3 text-center">
              Terms of Service
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
