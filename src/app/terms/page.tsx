const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By using K-Beauty AI, you agree to these terms.',
  },
  {
    title: '2. Service Description',
    body: 'K-Beauty AI provides AI-powered skin analysis and K-beauty product recommendations.',
  },
  {
    title: '3. User Accounts',
    items: [
      'You must provide accurate information',
      'You are responsible for account security',
      'One account per person',
    ],
  },
  {
    title: '4. Membership',
    items: [
      'Membership is billed at $9/month',
      'Cancel anytime from your profile',
      'No refunds for partial months',
    ],
  },
  {
    title: '5. Acceptable Use',
    items: [
      'Personal use only',
      'No automated access or scraping',
      'No misuse of AI features',
    ],
  },
  {
    title: '6. Intellectual Property',
    items: [
      'K-Beauty AI content is our property',
      'User photos remain your property',
    ],
  },
  {
    title: '7. Disclaimer',
    items: [
      'AI analysis is for informational purposes only',
      'Not a substitute for professional dermatological advice',
      'Results may vary',
    ],
  },
  {
    title: '8. Limitation of Liability',
    items: [
      'We are not liable for skin reactions to recommended products',
      'Always patch test new products',
    ],
  },
  {
    title: '9. Termination',
    items: [
      'We may terminate accounts for violations',
      'You may delete your account anytime',
    ],
  },
]

export default function TermsPage() {
  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell max-w-4xl">
        <section className="brand-card p-7 md:p-10">
          <div className="inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.16),rgba(246,222,177,0.34))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            Terms
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
            K-Beauty AI - Terms of Service
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">Last updated: March 2026</p>
          <p className="mt-6 text-base leading-7 text-[var(--muted)]">
            These Terms of Service govern your access to and use of K-Beauty AI, including our AI analysis,
            recommendations, and membership features.
          </p>
        </section>

        <div className="mt-6 space-y-4">
          {TERMS_SECTIONS.map((section) => (
            <section
              key={section.title}
              className="brand-card p-6 md:p-7"
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                {section.title}
              </h2>
              {'body' in section ? (
                <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{section.body}</p>
              ) : (
                <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
                  {section.items.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="brand-card p-6 md:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">10. Contact</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              - Email: <a className="font-medium text-[#d94d82]" href="mailto:support@kbeauty-ai.com">support@kbeauty-ai.com</a>
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
