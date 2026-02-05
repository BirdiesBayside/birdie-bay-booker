import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

export const usePushNotifications = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Save token to database
  const saveTokenToDatabase = async (pushToken: string, userId: string) => {
    try {
      console.log('[PUSH] Saving token to database for user:', userId);
      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          { user_id: userId, token: pushToken, platform: 'ios' },
          { onConflict: 'user_id,token' }
        );

      if (error) {
        console.error('Failed to save push token:', error);
      } else {
        console.log('Push token saved to database');
      }
    } catch (err) {
      console.error('Error saving push token:', err);
    }
  };

  // Subscribe to auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[PUSH] Auth state changed:', event, session?.user?.id);
        setUserId(session?.user?.id ?? null);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[PUSH] Initial session user:', session?.user?.id);
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize push notifications on native platform
  useEffect(() => {
    const initPushNotifications = async () => {
      if (!Capacitor.isNativePlatform()) {
        console.log('Push notifications only work on native platforms');
        return;
      }

      console.log('[PUSH] Initializing push notifications on native platform');
      setIsSupported(true);

      // Request permission
      const permStatus = await PushNotifications.requestPermissions();
      console.log('[PUSH] Permission status:', permStatus.receive);
      
      if (permStatus.receive === 'granted') {
        // Register with Apple / Google to receive push
        console.log('[PUSH] Permission granted, registering...');
        await PushNotifications.register();
      } else {
        console.log('[PUSH] Permission denied');
      }

      // Listen for registration success
      PushNotifications.addListener('registration', async (tokenData) => {
        console.log('Push registration success, token:', tokenData.value);
        setToken(tokenData.value);
      });

      // Listen for registration errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error.error);
      });

      // Listen for push notifications received
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
      });

      // Listen for push notification action performed
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push notification action performed:', notification);
      });
    };

    initPushNotifications();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);

  // Save token when we have both token and userId
  useEffect(() => {
    if (token && userId) {
      console.log('[PUSH] Have both token and userId, saving to database');
      saveTokenToDatabase(token, userId);
    }
  }, [userId, token]);

  return { token, isSupported };
};
