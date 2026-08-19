import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

// Public VAPID key (safe to ship in client code).
export const VAPID_PUBLIC_KEY =
  "BEJqf8itEpIGvy2fgQvE0cMsstgSNwfi5To57EeWBiVs0fTc20rEg4gmTXKHGA30PVfXNWOUhtXjUS7rMJcY-54";

const SW_URL = "/push-sw.js";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer;
}

/** Web push is only relevant in a real browser (native apps use APNs/FCM). */
export function isWebPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS only allows web push when the site is installed to the Home Screen. */
export function isIosNeedsInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !standalone && !("PushManager" in window);
}

export function webPushPermission(): NotificationPermission | null {
  if (typeof Notification === "undefined") return null;
  return Notification.permission;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export async function enableWebPush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token: JSON.stringify(subscription.toJSON()),
      platform: "web",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    console.error("[WEBPUSH] Failed to save subscription:", error);
    return { ok: false, reason: "save_failed" };
  }

  return { ok: true };
}

export async function disableWebPush(userId: string): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  const token = JSON.stringify(subscription.toJSON());
  await supabase.from("push_tokens").delete().eq("user_id", userId).eq("token", token);
  await subscription.unsubscribe();
}
