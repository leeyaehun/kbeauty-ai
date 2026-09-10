# K-Beauty AI

AI-powered K-beauty recommendation platform that combines selfie-based skin analysis, personal colour analysis, product data pipelines, and personalised product recommendations.

Built as a full-stack web application with mobile wrappers for iOS and Android.

## Overview

K-Beauty AI helps users discover skincare and makeup products that better match their skin profile and preferences.

The application includes:

- selfie-based skin analysis using an AI vision model
- personal colour analysis with camera-based tooling
- personalised skincare and makeup recommendations
- vector-based product matching with fallback ranking logic
- regional product discovery for Korean and global catalogues
- wishlist, saved results, profile, and authentication flows
- App Store membership entitlement support
- iOS and Android packaging with Capacitor
- product ingestion, categorisation, matching, pricing, and embedding scripts

## Tech Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS

### Backend and Data

- Next.js Route Handlers
- Supabase Auth
- Supabase PostgreSQL
- Supabase RPC / vector matching

### AI and Computer Vision

- OpenAI vision models for skin analysis
- OpenAI embeddings for recommendation matching
- Anthropic Claude for short-form product explanations
- MediaPipe Tasks Vision for camera-based personal colour features

### Mobile

- Capacitor
- iOS native wrapper
- Android native wrapper

### Tooling

- Playwright
- ESLint
- TypeScript
- custom data-ingestion and catalogue-maintenance scripts

## How It Works

### 1. Skin analysis

Users can submit a selfie together with survey answers. The server validates the image payload and sends it to an AI vision model to estimate a skin type, hydration, oiliness, sensitivity, pigmentation, and common concerns.

Survey responses are blended with the model output to produce the final profile used by the recommendation system.

### 2. Recommendation pipeline

The recommendation API converts the user's skin profile into an embedding and searches the product catalogue for relevant candidates.

The ranking pipeline combines:

- vector similarity
- skin-type fit
- concern fit
- hydration / oil / sensitivity profile fit
- category filters
- regional availability
- fallback ranking when vector search is unavailable

### 3. Product data pipeline

The repository contains scripts used to build and maintain the product catalogue, including workflows for:

- product crawling
- Korean / global catalogue matching
- category normalisation
- ingredient mapping
- price cleanup
- product embeddings
- affiliate URL maintenance

Examples:

```bash
npm run crawl:oliveyoung
npm run crawl:global-full
npm run match:global-oliveyoung
npm run map:ingredients
npm run embed:products
```

## Project Structure

```text
src/
├── app/
│   ├── api/              # API routes for analysis, recommendations, wishlists, etc.
│   ├── analyze/          # selfie skin-analysis flow
│   ├── personal-color/   # personal colour analysis
│   ├── recommend/        # recommendation experience
│   ├── results/          # analysis results
│   ├── wishlist/         # saved products
│   └── ...
├── components/           # shared UI and camera components
├── lib/                  # auth, Supabase, pricing, membership and domain logic
└── scripts/              # product ingestion and catalogue maintenance

supabase/
└── migrations/           # database migrations and matching-related changes

android/                  # Capacitor Android project
ios/                      # Capacitor iOS project
```

## Local Development

### Prerequisites

- Node.js 20+
- npm
- a Supabase project
- API credentials for the AI services used by the application

### Setup

```bash
git clone https://github.com/leeyaehun/kbeauty-ai.git
cd kbeauty-ai
npm install
cp .env.example .env.local
```

Add your local credentials to `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Then start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment and Security

Secrets must never be committed to the repository.

Server-only credentials such as the Supabase service-role key and AI API keys belong in environment variables. Signing keys and platform credential files are excluded through `.gitignore`.

If you fork this project, generate and manage your own mobile signing credentials outside Git.

## Mobile Development

The application is configured with Capacitor for iOS and Android.

The production server URL is read from `NEXT_PUBLIC_SITE_URL`, with the hosted application used as a fallback by the Capacitor configuration.

Native project files are located in:

```text
android/
ios/
```

## Database

Supabase migrations are stored in `supabase/migrations`.

The application uses Supabase for authentication, user data, product catalogue access, wishlists, membership state, and recommendation-related database operations.

## Current Status

This is an actively developed personal software-engineering project. The repository reflects ongoing work across product design, full-stack development, data engineering, AI integration, and mobile deployment.

## Author

**Yaehun Lee**

GitHub: [@leeyaehun](https://github.com/leeyaehun)
