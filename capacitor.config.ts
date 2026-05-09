import type { CapacitorConfig } from '@capacitor/cli'

const productionServerUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kbeauty-ai.vercel.app'

const config: CapacitorConfig = {
  appId: 'com.kbeautyai.app',
  appName: 'K-Beauty AI',
  webDir: 'out',
  server: {
    url: productionServerUrl,
    cleartext: false,
    errorPath: 'app-error.html',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#FFF0F5',
      showSpinner: false,
    },
  },
  ios: {
    contentInset: 'automatic',
  },
}

export default config
