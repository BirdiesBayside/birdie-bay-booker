import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { BRISBANE_TZ } from "@/lib/brisbane-time";

const brisbaneDateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BRISBANE_TZ }).format(d);

interface Row {
  id: string;
  tier: string;
  display_name: string;
  hourly_rate: number;
  weekly_subscription_price: number | null;
  effective_from: string;
}

export function PriceScheduleSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const today = brisbaneDateKey(new Date());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("pricing_config")
        .select("id, tier, display_name, hourly_rate, weekly_subscription_price, effective_from")
        .order("effective_from", { ascending: true });
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const upcoming = rows.filter((r) => r.effective_from > today);
  const current = rows.filter((r) => r.effective_from <= today);

  const fmt = (d: string) =>
    new Date(`${d}T00:00:00+10:00`).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Australia/Brisbane",
    });

  const renderRow = (r: Row, isUpcoming: boolean) => {
    const currentForTier = current
      .filter((c) => c.tier === r.tier)
      .sort((a, b) => (a.effective_from > b.effective_from ? -1 : 1))[0];
    return (
      <div
        key={r.id}
        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{r.display_name}</p>
          <p className="text-xs text-muted-foreground">
            {isUpcoming ? `Starts ${fmt(r.effective_from)} (midnight Brisbane)` : `Active since ${fmt(r.effective_from)}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          {isUpcoming && currentForTier && currentForTier.hourly_rate !== r.hourly_rate && (
            <span className="mr-2 text-xs text-muted-foreground line-through">
              ${Number(currentForTier.hourly_rate)}/hr
            </span>
          )}
          <span className="text-sm font-semibold">${Number(r.hourly_rate)}/hr</span>
          {r.weekly_subscription_price != null && (
            <p className="text-xs text-muted-foreground">${Number(r.weekly_subscription_price)}/wk</p>
          )}
        </div>
      </div>
    );
  };

  if (loading) return null;

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Upcoming changes</h4>
            {upcoming.length > 0 && <Badge variant="secondary">{upcoming.length} scheduled</Badge>}
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price changes scheduled.</p>
          ) : (
            <div className="space-y-2">{upcoming.map((r) => renderRow(r, true))}</div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Currently active</h4>
          <div className="space-y-2">
            {Object.values(
              current.reduce<Record<string, Row>>((acc, r) => {
                if (!acc[r.tier] || acc[r.tier].effective_from < r.effective_from) acc[r.tier] = r;
                return acc;
              }, {})
            ).map((r) => renderRow(r, false))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Rates switch automatically based on the booking date — a session on the change date is priced at the new rate
          from midnight Brisbane time.
        </p>
      </CardContent>
    </Card>
  );
}
