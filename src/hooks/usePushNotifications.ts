import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const usePushNotifications = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const { user } = useAuth();

  // Save token to database
  const saveTokenToDatabase = async (pushToken: string, userId: string) => {
    try {
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

  useEffect(() => {
    const initPushNotifications = async () => {
      if (!Capacitor.isNativePlatform()) {
        console.log('Push notifications only work on native platforms');
        return;
      }

      setIsSupported(true);

      // Request permission
      const permStatus = await PushNotifications.requestPermissions();
      
      if (permStatus.receive === 'granted') {
        // Register with Apple / Google to receive push
        await PushNotifications.register();
      }

      // Listen for registration success
      PushNotifications.addListener('registration', async (tokenData) => {
        console.log('Push registration success, token:', tokenData.value);
        setToken(tokenData.value);
        
        // Save to database if user is logged in
        if (user?.id) {
          await saveTokenToDatabase(tokenData.value, user.id);
        }
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

  // Re-save token when user logs in
  useEffect(() => {
    if (token && user?.id) {
      saveTokenToDatabase(token, user.id);
    }
  }, [user?.id, token]);

  return { token, isSupported };
};
