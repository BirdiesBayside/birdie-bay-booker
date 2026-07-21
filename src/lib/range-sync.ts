// Range session + per-customer GSPro settings sync for the Bay Controller.
// The renderer performs network calls (auth is inherited from the current Supabase session).
// Electron main only exposes file I/O IPCs (read/write GSPro folder + scan/delete Desktop CSVs,
// plus a Desktop watcher that pushes newly-detected CSVs to the renderer for immediate ingest).

import { supabase } from "@/integrations/supabase/client";

const SETTINGS_FILES = ["dpsV2x3.gss", "Settings.vgs"] as const;

export type SyncLogFn = (msg: string, level?: "info" | "success" | "error" | "warning") => void;

type ControllerSyncContext = {
  bayNumber?: number | null;
  bookingId?: string | null;
  appVersion?: string;
  log?: SyncLogFn;
};

async function invokeBayControllerApi<T = any>(
  action: string,
  body: Record<string, unknown>,
  ctx?: ControllerSyncContext
): Promise<{ data: T | null; error: any }> {
  if (!ctx?.bayNumber) {
    return { data: null, error: new Error("missing_bay_number") };
  }

  return supabase.functions.invoke("bay-controller-api", {
    body: { action, ...body },
    headers: {
      "x-bay-number": String(ctx.bayNumber),
      "x-app-version": ctx.appVersion ?? "unknown",
      "x-action": action,
    },
  });
}

/**
 * Called just BEFORE launching GSPro. If the customer has a saved per-user
 * settings snapshot in the cloud, download it and overwrite the local GSPro
 * files (which were just replaced with the shared baseline). If nothing is
 * saved yet, we leave the baseline in place — snapshot is captured on close.
 */
export async function restoreUserGsproSettings(
  userId: string,
  ctx?: ControllerSyncContext
): Promise<{ restored: string[]; missing: string[]; error?: string }> {
  if (!userId || !window.electronAPI) return { restored: [], missing: [] };
  const files: Record<string, string> = {};
  const missing: string[] = [];

  for (const f of SETTINGS_FILES) {
    try {
      let json: any = null;
      if (ctx?.bayNumber) {
        const { data, error } = await invokeBayControllerApi("get_user_setting", { user_id: userId, booking_id: ctx.bookingId ?? null, file: f }, ctx);
        if (error) { missing.push(f); continue; }
        json = data;
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return { restored: [], missing: [], error: "not_signed_in" };

        const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bay-user-settings`;
        const res = await fetch(`${base}?user_id=${encodeURIComponent(userId)}&file=${encodeURIComponent(f)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { missing.push(f); continue; }
        json = await res.json();
      }
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
  logOrCtx?: SyncLogFn | ControllerSyncContext
): Promise<{ saved: string[]; failed: string[]; error?: string }> {
  const ctx = typeof logOrCtx === "function" ? undefined : logOrCtx;
  const log = typeof logOrCtx === "function" ? logOrCtx : logOrCtx?.log;
  const L = log ?? (() => {});
  if (!userId) { L("[Settings] Skipped: no userId", "warning"); return { saved: [], failed: [] }; }
  if (!window.electronAPI) { L("[Settings] Skipped: no electronAPI", "warning"); return { saved: [], failed: [] }; }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    if (ctx?.bayNumber) L("[Settings] No signed-in web session. Using Bay Controller API for settings upload.", "info");
    else L("[Settings] No signed-in web session and no Bay Controller API context. Upload will be rejected.", "error");
  } else {
    L(`[Settings] Signed-in web session present for ${sessionData.session.user?.email ?? sessionData.session.user?.id}`, "info");
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
  const skipped: string[] = [];
  // Guard: GSPro sometimes leaves near-empty stub files on disk when the user
  // never opened the corresponding settings panel. Uploading those overwrites
  // the customer's last good snapshot and, on their next session, clobbers the
  // baseline. Skip anything below this floor — real configs are always larger.
  const MIN_SNAPSHOT_BYTES = 2048;
  for (const [file, base64] of Object.entries(read.files)) {
    const b64 = base64 as string;
    const approxBytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    const sizeKB = Math.round(approxBytes / 1024);
    if (approxBytes < MIN_SNAPSHOT_BYTES) {
      L(`[Settings] Skipped upload of ${file} — stub file (${approxBytes} bytes < ${MIN_SNAPSHOT_BYTES}). Keeping previous snapshot intact.`, "warning");
      skipped.push(file);
      continue;
    }
    L(`[Settings] Uploading ${file} (~${sizeKB} KB) for user ${userId}`, "info");
    const { data, error } = ctx?.bayNumber
      ? await invokeBayControllerApi("save_user_setting", { user_id: userId, booking_id: ctx.bookingId ?? null, file, base64 }, ctx)
      : await supabase.functions.invoke("bay-user-settings", {
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
  bayNumber?: number | null;
  appVersion?: string;
  /** Optional lower-bound timestamp (ms). If provided, the sweep uses the EARLIER of this and the GSPro launch time as the cutoff. Prevents mid-session relaunches (e.g. changeover) from excluding CSVs exported before the relaunch. */
  bookingStartMs?: number | null;
  log?: SyncLogFn;
}): Promise<{ uploaded: string[]; failed: string[] }> {
  const L = opts.log ?? (() => {});
  const uploaded: string[] = [];
  const failed: string[] = [];

  if (!opts.userId) { L("[CSV] Skipped: no userId on active booking", "warning"); return { uploaded, failed }; }
  if (!window.electronAPI) { L("[CSV] Skipped: no electronAPI (not in Electron?)", "warning"); return { uploaded, failed }; }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    if (opts.bayNumber) L("[CSV] No signed-in web session. Using Bay Controller API for CSV upload.", "info");
    else L("[CSV] WARNING: no signed-in web session and no Bay Controller API context. Upload will be rejected.", "error");
  } else {
    L(`[CSV] Signed-in web session present (${sessionData.session.user?.email ?? sessionData.session.user?.id})`, "info");
  }

  const launchTs = await window.electronAPI.getGsproLaunchTs();
  const launchMs = launchTs.ts ?? undefined;
  // Use the EARLIER of booking-start and GSPro launch time so a mid-session relaunch
  // (e.g. changeover) doesn't cause pre-relaunch CSVs to be rejected as "too old".
  let sinceMs: number | undefined = launchMs;
  if (opts.bookingStartMs && (!sinceMs || opts.bookingStartMs < sinceMs)) {
    sinceMs = opts.bookingStartMs;
  }
  L(`[CSV] Sweep cutoff: ${sinceMs ? new Date(sinceMs).toISOString() : "(none)"} (launch=${launchMs ? new Date(launchMs).toISOString() : "n/a"}, bookingStart=${opts.bookingStartMs ? new Date(opts.bookingStartMs).toISOString() : "n/a"})`, "info");

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
      const uploadBody = {
        user_id: opts.userId,
        booking_id: opts.bookingId ?? null,
        bay_id: opts.bayId ?? null,
        csv_base64: csv.base64,
        filename: csv.filename,
      };
      const { data, error } = opts.bayNumber
        ? await invokeBayControllerApi("ingest_range_session", uploadBody, { bayNumber: opts.bayNumber, appVersion: opts.appVersion })
        : await supabase.functions.invoke("ingest-range-session", { body: uploadBody });
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

/**
 * Upload a single Desktop CSV (pushed by the Electron main-process watcher the
 * moment GSPro writes a new export). Deletes the local file on successful
 * ingest so we never re-upload the same one.
 */
export async function uploadRangeCsv(opts: {
  filename: string;
  base64: string;
  userId: string;
  bookingId?: string | null;
  bayId?: string | null;
  bayNumber?: number | null;
  appVersion?: string;
  log?: SyncLogFn;
}): Promise<{ uploaded: boolean; error?: string }> {
  const L = opts.log ?? (() => {});
  if (!opts.userId) { L(`[CSV-Watch] Skipped ${opts.filename}: no active booking user`, "warning"); return { uploaded: false, error: "no_user" }; }
  if (!window.electronAPI) return { uploaded: false, error: "no_electron" };

  L(`[CSV-Watch] Uploading ${opts.filename} (${Math.round((opts.base64.length * 3) / 4 / 1024)} KB) for user ${opts.userId}`, "info");

  try {
    const uploadBody = {
      user_id: opts.userId,
      booking_id: opts.bookingId ?? null,
      bay_id: opts.bayId ?? null,
      csv_base64: opts.base64,
      filename: opts.filename,
    };
    const { data, error } = opts.bayNumber
      ? await invokeBayControllerApi("ingest_range_session", uploadBody, { bayNumber: opts.bayNumber, appVersion: opts.appVersion })
      : await supabase.functions.invoke("ingest-range-session", { body: uploadBody });
    if (error) {
      L(`[CSV-Watch] Ingest FAILED for ${opts.filename}: ${error.message ?? JSON.stringify(error)}`, "error");
      return { uploaded: false, error: error.message ?? "ingest_failed" };
    }
    if (!(data as any)?.ok) {
      L(`[CSV-Watch] Ingest returned non-ok for ${opts.filename}: ${JSON.stringify(data ?? {}).slice(0, 300)}`, "error");
      return { uploaded: false, error: "ingest_not_ok" };
    }
    L(`[CSV-Watch] Ingest OK for ${opts.filename} (session_id=${(data as any).session_id ?? "?"}, shots=${(data as any).shot_count ?? "?"})`, "success");
    const del = await window.electronAPI.deleteDesktopCsv(opts.filename);
    if (del.success) L(`[CSV-Watch] Deleted local ${opts.filename} after successful upload`, "info");
    else L(`[CSV-Watch] Uploaded but failed to delete local ${opts.filename}: ${del.error ?? "unknown"}`, "warning");
    return { uploaded: true };
  } catch (e: any) {
    L(`[CSV-Watch] Exception uploading ${opts.filename}: ${e?.message ?? String(e)}`, "error");
    return { uploaded: false, error: e?.message ?? String(e) };
  }
}

