const PRIVACY_SECTIONS = [
  {
    title: '1. Information We Collect',
    items: [
      'Photos/selfies (processed for skin analysis, not stored permanently)',
      'Email address (via Google Sign-in)',
      'Skin analysis results',
      'Wishlist and product preferences',
      'Usage data',
    ],
  },
  {
    title: '2. How We Use Your Information',
    items: [
      'To provide personalized skin analysis',
      'To recommend K-beauty products',
      'To save your analysis history',
      'To improve our AI models',
    ],
  },
  {
    title: '3. Data Storage',
    items: [
      'Photos are processed in real-time and not permanently stored on our servers',
      'Analysis results are stored securely in Supabase',
      'We use industry-standard encryption',
    ],
  },
  {
    title: '4. Third-Party Services',
    items: [
      'Google Sign-in (authentication)',
      'OpenAI (skin analysis AI)',
      'Anthropic Claude (product recommendations)',
      'Stripe (payment processing)',
      'Supabase (database)',
      'Vercel (hosting)',
    ],
  },
  {
    title: '5. Data Sharing',
    items: [
      'We do not sell your personal data',
      'We do not share your photos with third parties',
      'Aggregated, anonymized data may be used to improve our service',
    ],
  },
  {
    title: '6. Your Rights',
    items: [
      'Access your data anytime in Profile',
      'Delete your account and data by contacting us',
      'Opt out of data collection',
    ],
  },
  {
    title: '7. Camera Access',
    items: [
      'Camera is used only for real-time skin analysis',
      'Photos are not saved to our servers without your consent',
      'You can revoke camera access in device settings',
    ],
  },
  {
    title: "8. Children's Privacy",
    items: [
      'Our service is not directed to children under 13',
      'We do not knowingly collect data from children',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="brand-page brand-grid px-6 py-8 md:px-8 md:py-10">
      <div className="brand-shell max-w-4xl">
        <section className="brand-card p-7 md:p-10">
          <div className="inline-flex rounded-full bg-[linear-gradient(135deg,rgba(255,107,157,0.16),rgba(246,222,177,0.34))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d94d82]">
            Privacy
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
            K-Beauty AI - Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">Last updated: March 2026</p>
          <p className="mt-6 text-base leading-7 text-[var(--muted)]">
            Your trust matters to us. This Privacy Policy explains what information we collect, how we use it,
            and how we protect it while delivering AI-powered skincare and K-beauty recommendations.
          </p>
        </section>

        <div className="mt-6 space-y-4">
          {PRIVACY_SECTIONS.map((section) => (
            <section
              key={section.title}
              className="brand-card p-6 md:p-7"
            >
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                {section.title}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
                {section.items.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </section>
          ))}

          <section className="brand-card p-6 md:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">9. Contact Us</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
              <p>- Email: <a className="font-medium text-[#d94d82]" href="mailto:privacy@kbeauty-ai.com">privacy@kbeauty-ai.com</a></p>
              <p>- Website: <a className="font-medium text-[#d94d82]" href="https://kbeauty-ai.vercel.app" target="_blank" rel="noopener noreferrer">https://kbeauty-ai.vercel.app</a></p>
            </div>
          </section>

          <section className="brand-card p-6 md:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">10. Changes to This Policy</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
              <li>- We will notify users of significant changes</li>
              <li>- Continued use constitutes acceptance</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
