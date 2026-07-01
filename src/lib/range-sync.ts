// Range session + per-customer GSPro settings sync for the Bay Controller.
// The renderer performs network calls (auth is inherited from the current Supabase session).
// Electron main only exposes file I/O IPCs (read/write GSPro folder + scan/delete Desktop CSVs).

import { supabase } from "@/integrations/supabase/client";

const SETTINGS_FILES = ["dpsV2x3.gss", "Settings.vgs"] as const;

/**
 * Called just BEFORE launching GSPro. If the customer has a saved per-user
 * settings snapshot in the cloud, download it and overwrite the local GSPro
 * files (which were just replaced with the shared baseline). If nothing is
 * saved yet, we leave the baseline in place — snapshot is captured on close.
 */
export async function restoreUserGsproSettings(userId: string): Promise<{ restored: string[]; missing: string[]; error?: string }> {
  if (!userId || !window.electronAPI) return { restored: [], missing: [] };
  const files: Record<string, string> = {};
  const missing: string[] = [];

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { restored: [], missing: [], error: "not_signed_in" };


  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bay-user-settings`;
  for (const f of SETTINGS_FILES) {
    try {
      const res = await fetch(`${base}?user_id=${encodeURIComponent(userId)}&file=${encodeURIComponent(f)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { missing.push(f); continue; }
      const json = await res.json();
      if (json?.exists && typeof json.base64 === "string") files[f] = json.base64;
      else missing.push(f);
    } catch { missing.push(f); }
  }

  if (Object.keys(files).length === 0) return { restored: [], missing };

  const writeRes = await window.electronAPI.writeGsproUserSettings(files);
  if (!writeRes.success) return { restored: [], missing, error: writeRes.error };
  return { restored: writeRes.written ?? [], missing };
}

/**
 * Called just AFTER GSPro closes. Captures the current GSPro settings files
 * (including any tweaks the customer made) and uploads them to their profile.
 * Next time they play, restoreUserGsproSettings() will bring them back.
 */
export async function saveUserGsproSettings(userId: string): Promise<{ saved: string[]; error?: string }> {
  if (!userId || !window.electronAPI) return { saved: [] };
  const read = await window.electronAPI.readGsproUserSettings();
  if (!read.success || !read.files) return { saved: [], error: read.error };

  const saved: string[] = [];
  for (const [file, base64] of Object.entries(read.files)) {
    const { error } = await supabase.functions.invoke("bay-user-settings", {
      body: { user_id: userId, file, base64 },
    });
    if (!error) saved.push(file);
  }
  return { saved };
}

/**
 * Called just AFTER GSPro closes. Scans the Windows Desktop for any CSV files
 * created since this GSPro session started (GSPro range "Export" saves there),
 * uploads each to the ingest edge function which parses + archives them, then
 * deletes the local file on successful upload.
 */
export async function sweepAndUploadRangeCsvs(opts: {
  userId: string;
  bookingId?: string | null;
  bayId?: string | null;
}): Promise<{ uploaded: string[]; failed: string[] }> {
  const uploaded: string[] = [];
  const failed: string[] = [];
  if (!opts.userId || !window.electronAPI) return { uploaded, failed };

  const launchTs = await window.electronAPI.getGsproLaunchTs();
  const sinceMs = launchTs.ts ?? undefined;

  const scan = await window.electronAPI.scanDesktopCsvs(sinceMs);
  if (!scan.success || scan.csvs.length === 0) return { uploaded, failed };

  for (const csv of scan.csvs) {
    try {
      const { data, error } = await supabase.functions.invoke("ingest-range-session", {
        body: {
          user_id: opts.userId,
          booking_id: opts.bookingId ?? null,
          bay_id: opts.bayId ?? null,
          csv_base64: csv.base64,
          filename: csv.filename,
        },
      });
      if (error || !data?.ok) { failed.push(csv.filename); continue; }
      await window.electronAPI.deleteDesktopCsv(csv.filename);
      uploaded.push(csv.filename);
    } catch {
      failed.push(csv.filename);
    }
  }
  return { uploaded, failed };
}
