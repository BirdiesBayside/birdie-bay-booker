import { useState } from "react";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { extensionOptions, extendedEndTime } from "@/lib/session-extension";
import { formatBrisbaneTime } from "@/lib/brisbane-time";

interface Props {
  booking: { id: string; booking_date: string; end_time: string; status: string };
  onExtended: () => void;
}

export function ExtendSession({ booking, onExtended }: Props) {
  const { toast } = useToast();
  const [options, setOptions] = useState<number[] | null>(null);
  const [minutes, setMinutes] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ended = Date.parse(`${booking.booking_date}T${booking.end_time}+10:00`) <= Date.now();
  if (booking.status !== "confirmed" || ended) return null;

  const check = async () => {
    setBusy(true);
    setError("");
    const { data, error: failure } = await supabase.rpc("admin_extend_session", {
      p_booking_id: booking.id, p_expected_end_time: booking.end_time,
    });
    if (failure) {
      setError(failure.message);
    } else if (data && typeof data === "object" && !Array.isArray(data) && typeof data.max_minutes === "number") {
      const available = extensionOptions(data.max_minutes);
      setOptions(available);
      setMinutes(String(available[0] ?? 30));
    } else {
      setError("Could not check available time. Please try again.");
    }
    setBusy(false);
  };

  const extend = async () => {
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.rpc("admin_extend_session", {
      p_booking_id: booking.id, p_expected_end_time: booking.end_time,
      p_additional_minutes: Number(minutes),
    });
    if (failure) {
      setError(failure.message);
      setOptions(null);
    } else {
      const { data: accessResult, error: accessError } = await supabase.functions.invoke("door-code-manager", {
        body: { action: "refresh", booking_id: booking.id },
      });
      toast({ title: "Session extended", description: accessError || accessResult?.success === false
        ? "Booking updated. Door access could not be refreshed; check access before the original finish time."
        : `${minutes} minutes added. Booking price unchanged.` });
      onExtended();
    }
    setBusy(false);
  };

  const finish = formatBrisbaneTime(`${booking.booking_date}T${extendedEndTime(booking.end_time, Number(minutes))}:00+10:00`);
  return <div className="space-y-3">
    {options === null ? <Button variant="outline" className="w-full" disabled={busy} onClick={check}>
      <Clock className="h-4 w-4 mr-2" />{busy ? "Checking availability…" : "Extend Session"}
    </Button> : options.length === 0 ? <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">No extra time available in this bay.</p>
      <Button variant="ghost" size="sm" disabled={busy} onClick={check}>Recheck</Button>
    </div> : <>
      <Label htmlFor="extension-minutes">Extra time · complimentary</Label>
      <Select value={minutes} onValueChange={setMinutes} disabled={busy}>
        <SelectTrigger id="extension-minutes"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(value => <SelectItem key={value} value={String(value)}>{value} minutes</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">New finish: <strong>{finish}</strong></p>
        <Button disabled={busy} onClick={extend}>{busy ? "Extending…" : "Confirm Extension"}</Button>
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}