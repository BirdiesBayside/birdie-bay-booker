import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { InAppBrowser, iOSViewStyle, iOSAnimation, ToolbarPosition } from '@capacitor/inappbrowser';
import { useNavigate } from 'react-router-dom';

interface UseInAppBrowserOptions {
  successPath: string;
  cancelPath: string;
  onSuccess?: (bookingId: string) => void;
  onCancel?: () => void;
  bookingId?: string;
}

export function useInAppBrowser() {
  const isNative = Capacitor.isNativePlatform();
  const navigate = useNavigate();

  const openCheckoutUrl = useCallback(async (
    url: string,
    options: UseInAppBrowserOptions
  ) => {
    if (!isNative) {
      // On web, just redirect
      window.location.href = url;
      return;
    }

    // On native, open in WebView and listen for page navigation
    // When Stripe redirects to our custom scheme, we'll catch it and navigate
    try {
      // Add listener for page navigation to detect deep link redirect
      await InAppBrowser.addListener('browserPageNavigationCompleted', async (event) => {
        const eventUrl = event.url || '';
        
        // Check if this is our custom scheme redirect
        if (eventUrl.startsWith('birdiesbayside://booking-success')) {
          const urlParams = new URL(eventUrl.replace('birdiesbayside://', 'https://app/'));
          const bookingId = urlParams.searchParams.get('booking_id');
          
          // Close the browser
          await InAppBrowser.close();
          InAppBrowser.removeAllListeners();
          
          // Navigate to success page
          if (bookingId) {
            navigate(`/booking-success?booking_id=${bookingId}`);
          }
        } else if (eventUrl.startsWith('birdiesbayside://booking-cancelled')) {
          const urlParams = new URL(eventUrl.replace('birdiesbayside://', 'https://app/'));
          const bookingId = urlParams.searchParams.get('booking_id');
          
          // Close the browser
          await InAppBrowser.close();
          InAppBrowser.removeAllListeners();
          
          // Navigate back to booking with cancelled state
          navigate(`/booking?booking_cancelled=true${bookingId ? `&booking_id=${bookingId}` : ''}`);
        }
      });

      // Also listen for browser close event (user manually closes)
      await InAppBrowser.addListener('browserClosed', () => {
        InAppBrowser.removeAllListeners();
      });

      // Open in WebView - this allows us to intercept URL changes
      await InAppBrowser.openInWebView({
        url,
        options: {
          showURL: false,
          showToolbar: true,
          clearCache: false,
          clearSessionCache: false,
          mediaPlaybackRequiresUserAction: true,
          closeButtonText: 'Cancel',
          toolbarPosition: ToolbarPosition.TOP,
          showNavigationButtons: false,
          leftToRight: false,
          android: {
            allowZoom: false,
            hardwareBack: true,
            pauseMedia: true,
          },
          iOS: {
            allowOverScroll: false,
            enableViewportScale: false,
            allowInLineMediaPlayback: false,
            surpressIncrementalRendering: false,
            viewStyle: iOSViewStyle.FULL_SCREEN,
            animationEffect: iOSAnimation.COVER_VERTICAL,
            allowsBackForwardNavigationGestures: false,
          }
        }
      });
    } catch (error) {
      console.error('Error opening checkout:', error);
      InAppBrowser.removeAllListeners();
    }
  }, [isNative, navigate]);

  return {
    openCheckoutUrl,
    isNative,
  };
}
