import { useEffect } from "react";

/**
 * Posts the document's scrollHeight to the parent window whenever it changes.
 * The parent Shopify page listens for these messages and resizes the iframe,
 * eliminating the nested-scroll problem (especially bad on iOS Safari).
 *
 * Parent snippet (paste into the Shopify page that embeds the iframe):
 *
 *   <script>
 *     window.addEventListener('message', function (e) {
 *       if (!e.data || e.data.type !== 'birdies:embed-height') return;
 *       var iframes = document.querySelectorAll('iframe[src*="hub.birdiesbayside.com.au/embed"]');
 *       iframes.forEach(function (f) {
 *         try {
 *           if (f.contentWindow === e.source) {
 *             f.style.height = (e.data.height + 20) + 'px';
 *             f.scrolling = 'no';
 *           }
 *         } catch (_) {}
 *       });
 *     });
 *   </script>
 */
export function useIframeAutoResize(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    // Only run when embedded
    if (window.parent === window) return;

    let lastHeight = 0;
    const post = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      if (height && height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage(
          { type: "birdies:embed-height", height },
          "*"
        );
      }
    };

    post();
    const ro = new ResizeObserver(() => post());
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    const interval = window.setInterval(post, 1000);
    window.addEventListener("load", post);

    return () => {
      ro.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("load", post);
    };
  }, [enabled]);
}
