import { useCallback } from 'react';

interface UseInAppBrowserOptions {
  successPath: string;
  cancelPath: string;
  bookingId?: string;
}

// Simplified hook - since the Capacitor app is a WebView loading our web app,
// Stripe checkout can just use regular navigation (no separate browser needed)
export function useInAppBrowser() {
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
    openCheckoutUrl,
  };
}
