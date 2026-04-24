import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";

interface PublicHoliday {
  id: string;
  holiday_date: string;
  name: string;
  surcharge_percent: number;
}

export function PublicHolidaysSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [newSurcharge, setNewSurcharge] = useState("20");
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("public_holidays")
      .select("*")
      .order("holiday_date", { ascending: true });
    if (error) {
      toast({ title: "Failed to load holidays", description: error.message, variant: "destructive" });
    } else {
      setHolidays((data || []) as PublicHoliday[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!newDate || !newName.trim()) {
      toast({ title: "Date and name are required", variant: "destructive" });
      return;
    }
    const surcharge = parseFloat(newSurcharge);
    if (isNaN(surcharge) || surcharge < 0) {
      toast({ title: "Invalid surcharge percentage", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("public_holidays").insert({
      holiday_date: newDate,
      name: newName.trim(),
      surcharge_percent: surcharge,
    });
    setIsSaving(false);

    if (error) {
      toast({ title: "Failed to add holiday", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Holiday added", description: `${newName} on ${newDate} (+${surcharge}%)` });
    setNewDate("");
    setNewName("");
    setNewSurcharge("20");
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PUBLIC_HOLIDAYS });
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("public_holidays").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PUBLIC_HOLIDAYS });
    load();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Public Holiday Surcharges
        </CardTitle>
        <CardDescription>
          Add public holidays to apply a percentage surcharge to all online bookings on those days.
          Surcharges apply to every membership tier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="holiday-date">Date</Label>
            <Input
              id="holiday-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="holiday-name">Holiday Name</Label>
            <Input
              id="holiday-name"
              placeholder="e.g. ANZAC Day"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="holiday-surcharge">Surcharge %</Label>
            <Input
              id="holiday-surcharge"
              type="number"
              min={0}
              step="0.5"
              value={newSurcharge}
              onChange={(e) => setNewSurcharge(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={isSaving}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="border rounded-lg divide-y">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : holidays.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No public holidays configured.</div>
          ) : (
            holidays.map((h) => {
              const d = parseISO(h.holiday_date);
              const isPast = d < today;
              return (
                <div
                  key={h.id}
                  className={`flex items-center justify-between p-3 ${isPast ? "opacity-60" : ""}`}
                >
                  <div>
                    <div className="font-medium">{h.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {format(d, "EEEE, d MMMM yyyy")} · +{Number(h.surcharge_percent)}% surcharge
                      {isPast && " · past"}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
