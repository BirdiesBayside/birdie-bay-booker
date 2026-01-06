import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { InAppBrowser, ToolbarPosition } from '@capacitor/inappbrowser';

interface UseInAppBrowserOptions {
  successPath: string;
  cancelPath: string;
  onSuccess?: (bookingId: string) => void;
  onCancel?: () => void;
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
    const { successPath, cancelPath, onSuccess, onCancel } = options;

    if (!isNative) {
      // On web, just redirect
      window.location.href = url;
      return;
    }

    // Set up listener for page navigation completion (has URL data)
    const navListener = await InAppBrowser.addListener(
      'browserPageNavigationCompleted',
      async (data) => {
        const currentUrl = data.url || '';
        
        // Check if we've reached the success page
        if (currentUrl.includes(successPath)) {
          // Extract booking_id from URL
          try {
            const urlObj = new URL(currentUrl);
            const bookingId = urlObj.searchParams.get('booking_id');
            
            await cleanup();
            
            if (onSuccess && bookingId) {
              onSuccess(bookingId);
            }
          } catch (e) {
            console.error('Error parsing success URL:', e);
          }
          return;
        }

        // Check if user cancelled
        if (currentUrl.includes(cancelPath)) {
          await cleanup();
          
          if (onCancel) {
            onCancel();
          }
          return;
        }
      }
    );

    // Also listen for browser close (user manually closed)
    const closeListener = await InAppBrowser.addListener(
      'browserClosed',
      async () => {
        if (onCancel) {
          onCancel();
        }
        cleanup();
      }
    );

    // Store cleanup function for both listeners
    listenerRef.current = () => {
      navListener.remove();
      closeListener.remove();
    };

    // Open the URL in the in-app browser
    await InAppBrowser.openInWebView({
      url,
      options: {
        showToolbar: true,
        showURL: false,
        closeButtonText: 'Cancel',
        clearCache: false,
        clearSessionCache: false,
        mediaPlaybackRequiresUserAction: false,
        showNavigationButtons: false,
        leftToRight: false,
        toolbarPosition: ToolbarPosition.TOP,
        android: {
          allowZoom: false,
          hardwareBack: true,
          pauseMedia: true,
        },
        iOS: {
          allowOverScroll: true,
          enableViewportScale: false,
          allowInLineMediaPlayback: true,
          surpressIncrementalRendering: false,
          viewStyle: 2, // FULL_SCREEN
          animationEffect: 2, // COVER_VERTICAL
          allowsBackForwardNavigationGestures: false,
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
