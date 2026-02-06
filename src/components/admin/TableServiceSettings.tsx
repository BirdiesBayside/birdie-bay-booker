import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TableServiceHour {
  id: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIME_OPTIONS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
  "20:00", "21:00", "22:00", "23:00"
];

function formatTime(time: string): string {
  const [hours] = time.split(":");
  const hour = parseInt(hours);
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  if (hour > 12) return `${hour - 12}:00 PM`;
  return `${hour}:00 AM`;
}

export function TableServiceSettings() {
  const { toast } = useToast();
  const [hours, setHours] = useState<TableServiceHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHours();
  }, []);

  const fetchHours = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("table_service_hours")
      .select("*")
      .order("day_of_week");

    if (!error && data) {
      // Normalize time format: database returns HH:MM:SS, we need HH:MM
      const normalized = data.map((h) => ({
        ...h,
        open_time: h.open_time?.substring(0, 5) || "09:00",
        close_time: h.close_time?.substring(0, 5) || "17:00",
      }));
      setHours(normalized);
    }
    setIsLoading(false);
  };

  const updateHour = async (id: string, updates: Partial<TableServiceHour>) => {
    // Optimistic update
    setHours(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));

    const { error } = await supabase
      .from("table_service_hours")
      .update(updates)
      .eq("id", id);

    if (error) {
      toast({
        title: "Error updating hours",
        description: error.message,
        variant: "destructive",
        duration: 4000,
      });
      fetchHours(); // Revert on error
    } else {
      toast({
        title: "Hours updated",
        description: "Table service hours have been saved.",
        duration: 2000,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Table Service</CardTitle>
          <CardDescription>Configure when QR code ordering is available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Table Service</CardTitle>
        <CardDescription>
          Configure when QR code ordering is available. Outside these hours, customers won't be able to place orders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {hours.map((hour) => (
            <div
              key={hour.id}
              className={`p-4 border rounded-lg transition-colors ${
                hour.is_open ? "bg-background" : "bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-[140px]">
                  <Switch
                    checked={hour.is_open}
                    onCheckedChange={(checked) => updateHour(hour.id, { is_open: checked })}
                  />
                  <Label className="font-medium">
                    {DAY_NAMES[hour.day_of_week]}
                  </Label>
                </div>

                {hour.is_open && (
                  <div className="flex items-center gap-2 text-sm">
                    <Select
                      value={hour.open_time}
                      onValueChange={(value) => updateHour(hour.id, { open_time: value })}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {formatTime(time)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">to</span>
                    <Select
                      value={hour.close_time}
                      onValueChange={(value) => updateHour(hour.id, { close_time: value })}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {formatTime(time)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!hour.is_open && (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
