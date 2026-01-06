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
    },
    NativeBiometric: {
      faceidPermission: "Use Face ID to quickly sign in to Birdies"
    }
  }
};

export default config;
