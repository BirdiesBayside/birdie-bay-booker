import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatBrisbane } from "@/lib/brisbane-time";
import { Loader2, Send, Trash2, RefreshCw, Power, CheckCircle2, XCircle } from "lucide-react";

// The venue runs on Australia/Brisbane (UTC+10, no DST). Datetime-local inputs
// are naive strings, so we pin them to +10:00 explicitly rather than trusting
// the admin's browser timezone.
const brisbaneLocalToIso = (local: string) => new Date(`${local}:00+10:00`).toISOString();
const isoToBrisbaneLocal = (iso: string) =>
  new Date(new Date(iso).getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16);

interface CustomerAlert {
  id: string;
  message: string;
  window_start: string;
  window_end: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

export function CustomerAlertsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [message, setMessage] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["customer-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_alerts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CustomerAlert[];
    },
  });

  const { data: sendCounts } = useQuery({
    queryKey: ["customer-alert-sends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_alert_sends")
        .select("alert_id, success");
      if (error) throw error;
      const map: Record<string, { sent: number; failed: number }> = {};
      for (const row of data ?? []) {
        const entry = (map[row.alert_id] ??= { sent: 0, failed: 0 });
        if (row.success) entry.sent++;
        else entry.failed++;
      }
      return map;
    },
  });

  const runAlert = async (alertId: string) => {
    setRunningId(alertId);
    try {
      const { data, error } = await supabase.functions.invoke("customer-alert-sms", {
        body: { alert_id: alertId },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      toast({
        title: "Alert run complete",
        description: result
          ? `${result.sent} sent, ${result.failed} failed (${result.eligible} bookings in window)`
          : "No bookings matched this window",
      });
      queryClient.invalidateQueries({ queryKey: ["customer-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["customer-alert-sends"] });
    } catch (e) {
      toast({
        title: "Send failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningId(null);
    }
  };

  const createAlert = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customer_alerts")
        .insert({
          message: message.trim(),
          window_start: brisbaneLocalToIso(start),
          window_end: brisbaneLocalToIso(end),
          is_active: true,
          created_by: userData?.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CustomerAlert;
    },
    onSuccess: async (alert) => {
      setMessage("");
      setStart("");
      setEnd("");
      queryClient.invalidateQueries({ queryKey: ["customer-alerts"] });
      await runAlert(alert.id);
    },
    onError: (e) =>
      toast({
        title: "Couldn't create alert",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      }),
  });

  const toggleActive = useMutation({
    mutationFn: async (alert: CustomerAlert) => {
      const { error } = await supabase
        .from("customer_alerts")
        .update({ is_active: !alert.is_active })
        .eq("id", alert.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-alerts"] }),
  });

  const deleteAlert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Alert deleted" });
      queryClient.invalidateQueries({ queryKey: ["customer-alerts"] });
    },
  });

  const canCreate = start && end && message.trim().length > 0 && !createAlert.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="alert-start">Window start (Brisbane)</Label>
              <Input
                id="alert-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-end">Window end (Brisbane)</Label>
              <Input
                id="alert-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="alert-message">SMS message</Label>
            <Textarea
              id="alert-message"
              rows={4}
              maxLength={480}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Birdies Bayside: heads up — ..."
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/480 characters. Every booking starting inside the window gets this
              message once — existing bookings immediately, new bookings as they come in.
            </p>
          </div>

          <Button onClick={() => createAlert.mutate()} disabled={!canCreate}>
            {createAlert.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Activate & send now
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !alerts?.length ? (
        <p className="text-sm text-muted-foreground">No customer alerts yet.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const counts = sendCounts?.[alert.id];
            const expired = new Date(alert.window_end).getTime() < Date.now();
            return (
              <div key={alert.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {alert.is_active ? (
                    <Badge className="bg-green-600">Active</Badge>
                  ) : (
                    <Badge variant="secondary">{expired ? "Finished" : "Paused"}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatBrisbane(alert.window_start)} → {formatBrisbane(alert.window_end)}
                  </span>
                  {counts && (
                    <span className="text-xs text-muted-foreground">
                      · {counts.sent} sent{counts.failed ? `, ${counts.failed} failed` : ""}
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{alert.message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runAlert(alert.id)}
                    disabled={runningId === alert.id}
                  >
                    {runningId === alert.id ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-3 w-3" />
                    )}
                    Run now
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleActive.mutate(alert)}>
                    <Power className="mr-2 h-3 w-3" />
                    {alert.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteAlert.mutate(alert.id)}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </Button>
                </div>
                {alert.last_run_at && (
                  <p className="text-xs text-muted-foreground">
                    Last checked {formatBrisbane(alert.last_run_at)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
