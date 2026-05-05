import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kbeautyai.app',
  appName: 'K-Beauty AI',
  webDir: 'out',
  server: {
    url: 'https://kbeauty-ai.vercel.app',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
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
