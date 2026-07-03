// Range session + per-customer GSPro settings sync for the Bay Controller.
// The renderer performs network calls (auth is inherited from the current Supabase session).
// Electron main only exposes file I/O IPCs (read/write GSPro folder + scan/delete Desktop CSVs).

import { supabase } from "@/integrations/supabase/client";

const SETTINGS_FILES = ["dpsV2x3.gss", "Settings.vgs"] as const;

export type SyncLogFn = (msg: string, level?: "info" | "success" | "error" | "warning") => void;

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
 */
export async function saveUserGsproSettings(
  userId: string,
  log?: SyncLogFn
): Promise<{ saved: string[]; failed: string[]; error?: string }> {
  const L = log ?? (() => {});
  if (!userId) { L("[Settings] Skipped: no userId", "warning"); return { saved: [], failed: [] }; }
  if (!window.electronAPI) { L("[Settings] Skipped: no electronAPI", "warning"); return { saved: [], failed: [] }; }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    L("[Settings] No Supabase session on bay controller — edge fn will reject as non-admin", "error");
  } else {
    L(`[Settings] Supabase session present for ${sessionData.session.user?.email ?? sessionData.session.user?.id}`, "info");
  }

  const read = await window.electronAPI.readGsproUserSettings();
  if (!read.success || !read.files) {
    L(`[Settings] read-gspro-user-settings failed: ${read.error ?? "unknown"}`, "error");
    return { saved: [], failed: [], error: read.error };
  }
  const names = Object.keys(read.files);
  L(`[Settings] Read ${names.length} settings file(s) from GSPro folder: ${names.join(", ") || "(none)"}`, "info");
  if (names.length === 0) return { saved: [], failed: [] };

  const saved: string[] = [];
  const failed: string[] = [];
  for (const [file, base64] of Object.entries(read.files)) {
    const sizeKB = Math.round(((base64 as string).length * 3) / 4 / 1024);
    L(`[Settings] Uploading ${file} (~${sizeKB} KB) for user ${userId}`, "info");
    const { data, error } = await supabase.functions.invoke("bay-user-settings", {
      body: { user_id: userId, file, base64 },
    });
    if (error) {
      L(`[Settings] Upload FAILED for ${file}: ${error.message ?? JSON.stringify(error)}`, "error");
      failed.push(file);
    } else {
      L(`[Settings] Upload OK for ${file} (response: ${JSON.stringify(data ?? {}).slice(0, 200)})`, "success");
      saved.push(file);
    }
  }
  return { saved, failed };
}

/**
 * Called just AFTER GSPro closes. Scans the Windows Desktop for CSV files
 * created since GSPro launched, uploads each to the ingest edge function,
 * then deletes the local file on successful upload.
 */
export async function sweepAndUploadRangeCsvs(opts: {
  userId: string;
  bookingId?: string | null;
  bayId?: string | null;
  log?: SyncLogFn;
}): Promise<{ uploaded: string[]; failed: string[] }> {
  const L = opts.log ?? (() => {});
  const uploaded: string[] = [];
  const failed: string[] = [];

  if (!opts.userId) { L("[CSV] Skipped: no userId on active booking", "warning"); return { uploaded, failed }; }
  if (!window.electronAPI) { L("[CSV] Skipped: no electronAPI (not in Electron?)", "warning"); return { uploaded, failed }; }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    L("[CSV] WARNING: bay controller has NO Supabase session. ingest-range-session requires signed-in admin and will reject.", "error");
  } else {
    L(`[CSV] Supabase session present (${sessionData.session.user?.email ?? sessionData.session.user?.id})`, "info");
  }

  const launchTs = await window.electronAPI.getGsproLaunchTs();
  const sinceMs = launchTs.ts ?? undefined;
  L(`[CSV] GSPro launch timestamp: ${sinceMs ? new Date(sinceMs).toISOString() : "(none — will scan all CSVs)"}`, "info");

  const scan = await window.electronAPI.scanDesktopCsvs(sinceMs);
  const scanAny = scan as any;
  if (scanAny.desktopPath) L(`[CSV] Desktop path: ${scanAny.desktopPath}`, "info");
  if (typeof scanAny.totalCsvOnDesktop === "number") L(`[CSV] Total .csv files present on Desktop: ${scanAny.totalCsvOnDesktop}`, "info");
  if (!scan.success) {
    L(`[CSV] Desktop scan FAILED: ${scan.error ?? "unknown"}`, "error");
    return { uploaded, failed };
  }
  L(`[CSV] Desktop scan returned ${scan.csvs.length} CSV(s) after filter`, scan.csvs.length ? "info" : "warning");
  if (Array.isArray(scanAny.rejectedReasons) && scanAny.rejectedReasons.length) {
    L(`[CSV] Rejected: ${scanAny.rejectedReasons.join(" | ")}`, "warning");
  }
  if (scan.csvs.length === 0) {
    L("[CSV] Nothing to upload. Confirm GSPro range export saves .csv to the Windows Desktop.", "warning");
    return { uploaded, failed };
  }

  for (const csv of scan.csvs) {
    L(`[CSV] Uploading ${csv.filename} (${Math.round(csv.size / 1024)} KB, mtime ${new Date(csv.mtime).toISOString()})`, "info");
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
      if (error) {
        L(`[CSV] Ingest FAILED for ${csv.filename}: ${error.message ?? JSON.stringify(error)}`, "error");
        failed.push(csv.filename);
        continue;
      }
      if (!data?.ok) {
        L(`[CSV] Ingest returned non-ok for ${csv.filename}: ${JSON.stringify(data ?? {}).slice(0, 300)}`, "error");
        failed.push(csv.filename);
        continue;
      }
      L(`[CSV] Ingest OK for ${csv.filename} (session_id=${data.session_id ?? "?"}, shots=${data.shot_count ?? "?"})`, "success");
      const del = await window.electronAPI.deleteDesktopCsv(csv.filename);
      if (del.success) L(`[CSV] Deleted local ${csv.filename} after successful upload`, "info");
      else L(`[CSV] Uploaded but failed to delete local ${csv.filename}: ${del.error ?? "unknown"}`, "warning");
      uploaded.push(csv.filename);
    } catch (e: any) {
      L(`[CSV] Exception uploading ${csv.filename}: ${e?.message ?? String(e)}`, "error");
      failed.push(csv.filename);
    }
  }
  return { uploaded, failed };
}
