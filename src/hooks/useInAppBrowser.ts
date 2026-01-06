import { useCallback, useEffect, useRef } from 'react';
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
  const listenerRef = useRef<(() => void) | null>(null);

  const isNative = Capacitor.isNativePlatform();

  const cleanup = useCallback(async () => {
    if (listenerRef.current) {
      listenerRef.current();
      listenerRef.current = null;
    }
    if (isNative) {
      try {
        await InAppBrowser.close();
      } catch (e) {
        // Browser might already be closed
      }
    }
  }, [isNative]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const openCheckoutUrl = useCallback(async (
    url: string,
    options: UseInAppBrowserOptions
  ) => {
    const { onSuccess, onCancel, bookingId } = options;

    if (!isNative) {
      // On web, just redirect
      window.location.href = url;
      return;
    }

    // Listen for browser close - we'll check payment status when it closes
    const closeListener = await InAppBrowser.addListener(
      'browserClosed',
      async () => {
        // When browser closes, we assume user either completed or cancelled
        // The parent component should verify payment status
        if (onSuccess && bookingId) {
          onSuccess(bookingId);
        } else if (onCancel) {
          onCancel();
        }
        cleanup();
      }
    );

    // Store cleanup function
    listenerRef.current = () => {
      closeListener.remove();
    };

    // Open the URL in the system browser (Safari on iOS, Chrome Custom Tabs on Android)
    // This uses SFSafariViewController on iOS which DOES share Safari's saved passwords/cards
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
  }, [isNative, cleanup]);

  return {
    openCheckoutUrl,
    isNative,
    cleanup,
  };
}
