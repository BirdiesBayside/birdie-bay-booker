import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";

/**
 * Manual Cloudflare Stream upload test.
 * Uploads a local recording straight from the browser to Cloudflare using a
 * one-time direct-upload URL — completely bypassing the Bay Controller's tus
 * pipeline. If this succeeds, the file/Cloudflare side is fine and the fault
 * is in the controller upload path.
 */
export default function ManualStreamUpload() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [uid, setUid] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true); setPct(0); setUid(null); setStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("stream-test-upload", {
        body: { action: "create", name: file.name },
      });
      if (error || !data?.upload_url) throw new Error(data?.error ?? error?.message ?? "Could not get upload URL");
      setUid(data.uid);

      await new Promise<void>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", data.upload_url);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Cloudflare responded ${xhr.status}: ${xhr.responseText.slice(0, 300)}`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(form);
      });

      setStatus("Uploaded — Cloudflare is processing");
      toast({ title: "Upload complete", description: "Cloudflare accepted the file. Check status below." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setStatus(`Failed: ${msg}`);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const checkStatus = async () => {
    if (!uid) return;
    const { data, error } = await supabase.functions.invoke("stream-test-upload", { body: { action: "status", uid } });
    if (error || data?.error) {
      toast({ title: "Status check failed", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    setStatus(`${data.state}${data.pct != null ? ` (${data.pct}%)` : ""}${data.duration ? ` · ${Math.round(data.duration)}s` : ""}${data.size ? ` · ${(data.size / 1048576).toFixed(0)} MB` : ""}${data.error ? ` · ${data.error}` : ""}`);
  };

  return (
    <Card>
      <CardHeader><CardTitle>Manual Cloudflare Upload Test</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pick a recording from <code>C:\BirdiesRecordings</code> and upload it straight to Cloudflare from this browser.
          This skips the Bay Controller entirely — if it works, the file and Cloudflare are fine and the fault is in the controller's upload.
        </p>
        <Input ref={fileRef} type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && <p className="text-sm">{file.name} — {(file.size / 1048576).toFixed(1)} MB</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={upload} disabled={!file || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload to Cloudflare
          </Button>
          {uid && <Button variant="outline" onClick={checkStatus} disabled={busy}>Check status</Button>}
        </div>
        {busy && <Progress value={pct} />}
        {uid && <p className="text-xs text-muted-foreground break-all">Video UID: {uid}</p>}
        {status && <p className="text-sm">{status}</p>}
      </CardContent>
    </Card>
  );
}
