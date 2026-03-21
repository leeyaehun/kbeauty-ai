import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kbeautyai.app',
  appName: 'K-Beauty AI',
  webDir: 'out',
  server: {
    url: 'https://kbeauty-ai.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
}

export default config
