import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'golf.birdies.hub',
  appName: 'Birdies Hub',
  webDir: 'dist',
  server: {
    url: 'https://hub.birdiesbayside.com.au',
    cleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  },
  // Custom URL scheme for deep linking (Stripe payment return)
  // This enables birdiesbayside:// URLs to open the app
  ios: {
    scheme: 'birdiesbayside'
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
