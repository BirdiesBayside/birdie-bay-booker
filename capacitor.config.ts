import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.2dd031ea6dc948178f32786da51fac0d',
  appName: 'Birdies Hub',
  webDir: 'dist',
  server: {
    url: 'https://2dd031ea-6dc9-4817-8f32-786da51fac0d.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
