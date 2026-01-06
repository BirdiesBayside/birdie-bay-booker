import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { InAppBrowser, DismissStyle, iOSViewStyle, iOSAnimation, AndroidViewStyle, AndroidAnimation } from '@capacitor/inappbrowser';

interface UseInAppBrowserOptions {
  successPath: string;
  cancelPath: string;
  onSuccess?: (bookingId: string) => void;
  onCancel?: () => void;
  bookingId?: string;
}

export function useInAppBrowser() {
  const isNative = Capacitor.isNativePlatform();

  const openCheckoutUrl = useCallback(async (
    url: string,
    _options: UseInAppBrowserOptions
  ) => {
    if (!isNative) {
      // On web, just redirect
      window.location.href = url;
      return;
    }

    // On native, open in system browser (SFSafariViewController on iOS)
    // Stripe will redirect to birdiesbayside://booking-success?booking_id=xxx
    // which will be handled by App.tsx via the App URL listener
    // The browser will automatically close when redirecting to the custom scheme
    await InAppBrowser.openInSystemBrowser({
      url,
      options: {
        iOS: {
          closeButtonText: DismissStyle.CANCEL,
          viewStyle: iOSViewStyle.FULL_SCREEN,
          animationEffect: iOSAnimation.COVER_VERTICAL,
          enableBarsCollapsing: false,
          enableReadersMode: false,
        },
        android: {
          showTitle: true,
          hideToolbarOnScroll: false,
          viewStyle: AndroidViewStyle.FULL_SCREEN,
          startAnimation: AndroidAnimation.FADE_IN,
          exitAnimation: AndroidAnimation.FADE_OUT,
        },
      }
    });
  }, [isNative]);

  return {
    openCheckoutUrl,
    isNative,
  };
}
