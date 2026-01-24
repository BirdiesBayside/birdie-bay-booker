import { useCallback } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface UseInAppBrowserOptions {
  successPath: string;
  cancelPath: string;
  bookingId?: string;
}

// Simplified hook - since the Capacitor app is a WebView loading our web app,
// Stripe checkout can just use regular navigation (no separate browser needed)
export function useInAppBrowser() {
  const openExternalUrl = useCallback(async (url: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url });
        return;
      }

      // Web: try to open a new tab/window. If blocked, fall back to same-tab nav.
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) {
        // Extra safety for older browsers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (win as any).opener = null;
      } else {
        window.location.href = url;
      }
    } catch {
      // As a last resort, navigate in the current tab
      window.location.href = url;
    }
  }, []);

  const openCheckoutUrl = useCallback(async (
    url: string,
    _options: UseInAppBrowserOptions
  ) => {
    // Simply redirect to the checkout URL
    // On web: opens in same window, Stripe redirects back to success/cancel URL
    // On native Capacitor: same behavior - the WebView navigates to Stripe,
    // then Stripe redirects to our HTTPS success URL which loads in the same WebView
    window.location.href = url;
  }, []);

  return {
    openExternalUrl,
    openCheckoutUrl,
  };
}
