import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, ShieldCheck, RefreshCw } from "lucide-react";
import { formatBrisbane } from "@/lib/brisbane-time";

interface DoorAccessSettings {
  id: string;
  mode: "fixed" | "daily" | "per_booking" | "unstaffed_only";
  fixed_code: string;
  code_length: number;
  append_hash: boolean;
  valid_from_minutes_before: number;
  valid_until_minutes_after: number;
  provider: "manual" | "tuya";
  tuya_device_id: string | null;
  tuya_region: string;
  enabled: boolean;
}

interface DoorCodeRow {
  id: string;
  code: string;
  status: string;
  valid_from: string;
  valid_until: string;
  provider: string;
  last_error: string | null;
  booking_id: string | null;
  scope?: string;

}

const MODE_LABELS: Record<DoorAccessSettings["mode"], { label: string; help: string }> = {
  fixed: {
    label: "Fixed shared code",
    help: "One permanent code for everyone. Per-booking codes are only issued if you generate them manually.",
  },
  daily: {
    label: "Daily rotating code",
    help: "A new code is generated each day and used in that day's confirmations.",
  },
  per_booking: {
    label: "Per-booking codes",
    help: "Every confirmed booking gets its own code, valid only around that session.",
  },
  unstaffed_only: {
    label: "Per-booking during unstaffed hours",
    help: "Fixed code while staff are on site, unique per-booking codes outside staffed hours.",
  },
};

/** datetime-local string for "now + n minutes" in Brisbane time. */
const bneLocalInput = (plusMinutes = 0) =>
  new Date(Date.now() + plusMinutes * 60_000 + 10 * 3600 * 1000).toISOString().slice(0, 16);

/** datetime-local value entered as Brisbane time → absolute ISO instant. */
const bneInputToIso = (v: string) => new Date(`${v}:00+10:00`).toISOString();

export function DoorAccessSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DoorAccessSettings | null>(null);
  const [draft, setDraft] = useState<DoorAccessSettings | null>(null);
  const [codes, setCodes] = useState<DoorCodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [capabilities, setCapabilities] = useState<string | null>(null);

  // Staff test-code panel
  const [testStart, setTestStart] = useState(() => bneLocalInput(2));
  const [testEnd, setTestEnd] = useState(() => bneLocalInput(32));
  const [testCodeInput, setTestCodeInput] = useState("");
  const [issuingTest, setIssuingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("door_access_settings").select("*").eq("id", "global").maybeSingle(),
      supabase
        .from("door_codes")
        .select("id, code, status, valid_from, valid_until, provider, last_error, booking_id, scope")
        .in("status", ["pending", "active"])
        .order("valid_from", { ascending: true })
        .limit(50),
    ]);
    if (s) {
      setSettings(s as unknown as DoorAccessSettings);
      setDraft(s as unknown as DoorAccessSettings);
    }
    setCodes((c as DoorCodeRow[]) || []);
    setIsLoading(false);
  };


  useEffect(() => {
    load();
  }, []);

  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { id, ...payload } = draft;
    const { error } = await supabase
      .from("door_access_settings")
      .update(payload as any)
      .eq("id", "global");
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    // Keep the legacy system_settings.door_code in sync so existing templates keep working
    await supabase.from("system_settings").update({ door_code: draft.fixed_code } as any).eq("id", "global");
    setSettings(draft);
    toast({ title: "Door access settings saved", duration: 3000 });
  };

  const testConnection = async () => {
    setTesting(true);
    setCapabilities(null);
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "test" },
    });
    setTesting(false);
    if (error) {
      toast({ title: "Test failed", description: error.message, variant: "destructive", duration: 5000 });
      return;
    }
    if (!data?.success) {
      setCapabilities(data?.error || "Unknown error");
      toast({
        title: "Keypad not reachable",
        description: data?.error || "Check credentials and device ID.",
        variant: "destructive",
        duration: 6000,
      });
      return;
    }
    setCapabilities(JSON.stringify(data.capabilities, null, 2));
    toast({ title: "Keypad reachable", description: "Capabilities loaded below.", duration: 4000 });
  };

  const issueTestCode = async () => {
    setIssuingTest(true);
    setTestResult(null);
    const startedAt = Date.now();
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: {
        action: "issue_test",
        valid_from: bneInputToIso(testStart),
        valid_until: bneInputToIso(testEnd),
        code: testCodeInput.replace(/\D/g, "") || undefined,
        label: "Staff test",
      },
    });
    const roundTrip = Date.now() - startedAt;
    setIssuingTest(false);
    if (error || !data?.success) {
      const msg = error?.message || data?.error || "Unknown error";
      setTestResult(`❌ ${msg}`);
      toast({ title: "Test code failed", description: msg, variant: "destructive", duration: 6000 });
      load();
      return;
    }
    setTestResult(
      `✅ Code ${data.code} pushed via ${data.via} in ${data.push_ms}ms (round trip ${roundTrip}ms).\n` +
        `Valid ${formatBrisbane(data.valid_from)} → ${formatBrisbane(data.valid_until)} (Brisbane).`,
    );
    toast({ title: `Test code ${data.code} issued`, duration: 5000 });
    load();
  };


  const revoke = async (id: string) => {
    const { error } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "revoke", door_code_id: id },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    toast({ title: "Code revoked", duration: 3000 });
    load();
  };

  if (isLoading || !draft) return <Skeleton className="h-64" />;

  const set = <K extends keyof DoorAccessSettings>(key: K, value: DoorAccessSettings[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Door Code
          </CardTitle>
          <CardDescription>
            Controls the code used by any email or SMS template containing{" "}
            <code className="text-xs">{"{door_code}"}</code>. When per-booking codes are active the
            tag resolves to that booking's code; otherwise it falls back to the fixed code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-md space-y-2">
            <Label>Code mode</Label>
            <Select value={draft.mode} onValueChange={(v) => set("mode", v as DoorAccessSettings["mode"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as DoorAccessSettings["mode"][]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABELS[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{MODE_LABELS[draft.mode].help}</p>
          </div>

          <div className="max-w-sm space-y-2">
            <Label>Fixed / fallback code</Label>
            <Input
              value={draft.fixed_code}
              onChange={(e) => set("fixed_code", e.target.value)}
              placeholder="e.g. 7675#"
            />
            <p className="text-xs text-muted-foreground">
              Used in fixed mode, and as the fallback whenever a booking has no code of its own.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
            <div className="space-y-2">
              <Label>Valid from (min before start)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={draft.valid_from_minutes_before}
                onChange={(e) => set("valid_from_minutes_before", parseInt(e.target.value || "0", 10))}
              />
            </div>
            <div className="space-y-2">
              <Label>Expires (min after end)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={draft.valid_until_minutes_after}
                onChange={(e) => set("valid_until_minutes_after", parseInt(e.target.value || "0", 10))}
              />
            </div>
            <div className="space-y-2">
              <Label>Generated code length</Label>
              <Select
                value={String(draft.code_length)}
                onValueChange={(v) => set("code_length", parseInt(v, 10))}
                disabled
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 digits (only length this keypad accepts)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900">
            <strong>Why 6 digits is fixed:</strong> we tested this directly against your keypad. The
            Tuya cloud <em>accepts</em> 4- and 7-digit codes without an error and reports success,
            but the device never actually takes them — they sit permanently at delivery phase 11
            with no lock slot assigned, so they will never open the door. Identical 6-digit codes
            reach phase 12 with a slot assigned within about a minute. The Smart Life app enforces
            the same 6-digit rule. Allowing any other length here would silently hand customers
            codes that don't work.
          </div>


          <div className="flex items-center gap-3">
            <Switch
              id="append_hash"
              checked={draft.append_hash}
              onCheckedChange={(v) => set("append_hash", v)}
            />
            <Label htmlFor="append_hash" className="text-sm">
              Show codes with a trailing <code className="text-xs">#</code> in messages
            </Label>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Keypad Provider
          </CardTitle>
          <CardDescription>
            How generated codes reach the physical keypad. In <strong>Manual</strong> mode codes are
            still generated, logged and sent to the customer, but nothing is pushed to the device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={draft.provider} onValueChange={(v) => set("provider", v as "manual" | "tuya")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (no device push)</SelectItem>
                  <SelectItem value="tuya">Tuya Cloud (WiFi keypad)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tuya region</Label>
              <Select value={draft.tuya_region} onValueChange={(v) => set("tuya_region", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">US / Western America (openapi.tuya.com)</SelectItem>
                  <SelectItem value="eu">Europe (openapi-weaz.tuyaeu.com)</SelectItem>
                  <SelectItem value="cn">China (openapi.tuyacn.com)</SelectItem>
                  <SelectItem value="in">India (openapi.tuyain.com)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="max-w-md space-y-2">
            <Label>Tuya device ID</Label>
            <Input
              value={draft.tuya_device_id || ""}
              onChange={(e) => set("tuya_device_id", e.target.value)}
              placeholder="e.g. bfa1c2d3e4f5..."
            />
            <p className="text-xs text-muted-foreground">
              Found in the Tuya IoT Platform under Cloud → Devices, after linking the Smart Life app
              account the keypad is paired to.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="dc_enabled" checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
            <Label htmlFor="dc_enabled" className="text-sm">
              Push codes to the keypad
            </Label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${testing ? "animate-spin" : ""}`} />
              Test connection
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>

          {capabilities && (
            <pre className="bg-muted/40 rounded p-3 text-xs overflow-x-auto max-h-64">
              {capabilities}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Staff Test Code
          </CardTitle>
          <CardDescription>
            Pushes a real temporary code to the keypad for a window you choose (Brisbane time),
            without touching customer bookings. Works even while "Push codes to the keypad" is off,
            so the permanent code and live confirmations are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div className="space-y-2">
              <Label>Valid from (Brisbane)</Label>
              <Input
                type="datetime-local"
                value={testStart}
                onChange={(e) => setTestStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valid until (Brisbane)</Label>
              <Input
                type="datetime-local"
                value={testEnd}
                onChange={(e) => setTestEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Code (optional)</Label>
              <Input
                value={testCodeInput}
                onChange={(e) => setTestCodeInput(e.target.value)}
                placeholder="Auto-generated"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={issueTestCode} disabled={issuingTest}>
              {issuingTest ? "Pushing to keypad..." : "Issue test code"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTestStart(bneLocalInput(2));
                setTestEnd(bneLocalInput(32));
              }}
            >
              Now + 30 min
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTestStart(bneLocalInput(60));
                setTestEnd(bneLocalInput(75));
              }}
            >
              In 1 hour, 15 min window
            </Button>
          </div>

          {testResult && (
            <pre className="bg-muted/40 rounded p-3 text-xs whitespace-pre-wrap">{testResult}</pre>
          )}

          <p className="text-xs text-muted-foreground">
            Test the three things that matter: the code works from its start time, it is rejected
            before it starts, and it is rejected after it expires. Revoke it below at any point to
            check that removal is instant too.
          </p>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Codes</CardTitle>
            <CardDescription>Codes currently issued or scheduled.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active codes.</p>
          ) : (
            codes.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{c.code}</span>
                    <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-xs">
                      {c.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {c.provider}
                    </Badge>
                    {c.scope === "test" && (
                      <Badge variant="outline" className="text-xs">
                        staff test
                      </Badge>
                    )}

                  </div>
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    {formatBrisbane(c.valid_from)} → {formatBrisbane(c.valid_until)}
                  </p>
                  {c.last_error && (
                    <p className="text-xs text-destructive mt-1 break-words">{c.last_error}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => revoke(c.id)}>
                  Revoke
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
