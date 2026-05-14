const PRIVACY_SECTIONS = [
  {
    title: '1. Information We Collect',
    items: [
      'Photos or face images that you voluntarily upload or capture in the app for beauty, skin, and appearance-related analysis',
      'Email address (via Google or Apple Sign-in)',
      'Analysis results generated from uploaded images, including visible skin or appearance-related observations',
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
      'To provide membership, wishlist, and account features',
    ],
  },
  {
    title: '3. Face Data and Photo Analysis',
    items: [
      'K-Beauty AI may collect photos or images of your face that you voluntarily upload or capture in the app for the purpose of providing AI-powered beauty, skin, and appearance-related analysis and recommendations.',
      'The face data we may collect includes the uploaded face image and analysis results generated from that image, such as visible skin or appearance-related observations.',
      'K-Beauty AI does not use face data for identity verification, facial recognition, authentication, advertising, marketing, tracking, or user profiling.',
      "We use face data only to provide the app's core analysis feature, generate personalized beauty or skincare-related results, and display those results to the user inside the app.",
      "Face data may be processed by our service providers only as necessary to provide the app's analysis functionality. This may include secure backend, storage, authentication, hosting, or AI-processing service providers used by K-Beauty AI.",
      'We do not sell face data and we do not share face data with advertisers or marketing partners.',
      "Face data is stored securely only where necessary to provide the app's functionality. Uploaded face images and related analysis data are retained for as long as necessary to provide the analysis feature and maintain the user's account history, unless the user deletes the data or requests deletion earlier.",
      'Users may request deletion of their face data and account-related information by contacting us at leeyaehun@gmail.com. When a deletion request is received, we will delete the relevant face data unless we are required to retain certain information for legal, security, or compliance reasons.',
      'Users can choose not to upload a face image. However, the AI beauty and skin analysis feature may not work without an image because the image is required to generate the analysis.',
    ],
  },
  {
    title: '4. Data Storage',
    items: [
      'Photos, face images, and analysis results are stored securely only where needed to provide app functionality, account history, and user-requested features',
      'Analysis results and account records may be stored securely in Supabase',
      'We use industry-standard encryption',
    ],
  },
  {
    title: '5. Third-Party Services',
    items: [
      'Google Sign-in and Apple Sign-in (authentication)',
      'OpenAI (skin analysis AI)',
      'Anthropic Claude (product recommendations)',
      'Apple App Store (in-app purchase processing)',
      'Supabase (database)',
      'Vercel (hosting)',
    ],
  },
  {
    title: '6. Data Sharing',
    items: [
      'We do not sell your personal data',
      'We do not sell face data',
      'We do not share face data, photos, or analysis results with advertisers or marketing partners',
      "Service providers may process face data only as necessary to provide the app's analysis, hosting, storage, authentication, in-app purchase, or support functionality",
      'Aggregated, anonymized data may be used to improve our service',
    ],
  },
  {
    title: '7. Your Rights',
    items: [
      'Access your data anytime in Profile',
      'Request deletion of your account, face data, photos, and analysis data by contacting us at leeyaehun@gmail.com',
      'Opt out of data collection',
    ],
  },
  {
    title: '8. Camera Access',
    items: [
      'Camera access is used only when you choose to capture an image for beauty, skin, or appearance-related analysis',
      'You can choose not to upload or capture a face image, but the AI beauty and skin analysis feature may not work without an image',
      'You can revoke camera access in device settings',
    ],
  },
  {
    title: "9. Children's Privacy",
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
          <p className="mt-3 text-sm text-[var(--muted)]">Last updated: May 2026</p>
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
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">10. Contact Us</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
              <p>- Email: <a className="font-medium text-[#d94d82]" href="mailto:leeyaehun@gmail.com">leeyaehun@gmail.com</a></p>
              <p>- Website: <a className="font-medium text-[#d94d82]" href="https://kbeauty-ai.vercel.app" target="_blank" rel="noopener noreferrer">https://kbeauty-ai.vercel.app</a></p>
            </div>
          </section>

          <section className="brand-card p-6 md:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">11. Changes to This Policy</h2>
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
