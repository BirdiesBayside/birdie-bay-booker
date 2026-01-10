import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.birdiesbayside.hub',
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
  android: {
    allowMixedContent: false
  }
};

export default config;
