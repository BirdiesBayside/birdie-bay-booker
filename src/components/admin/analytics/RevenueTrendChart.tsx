import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRevenueTrend, RevenueGranularity } from "@/hooks/useRevenueTrend";

const GRANULARITY_OPTIONS: { value: RevenueGranularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "half", label: "Half Year" },
  { value: "year", label: "Year" },
];

const chartConfig: ChartConfig = {
  total: {
    label: "Revenue",
    color: "hsl(var(--primary))",
  },
};

export function RevenueTrendChart() {
  const [granularity, setGranularity] = useState<RevenueGranularity>("month");
  const { data, isLoading } = useRevenueTrend(granularity);

  const total = (data ?? []).reduce((sum, d) => sum + d.total, 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base font-medium">Revenue Trend</CardTitle>
          <p className="text-2xl font-bold">${total.toLocaleString()}</p>
        </div>
        <Select
          value={granularity}
          onValueChange={(v) => setGranularity(v as RevenueGranularity)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRANULARITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`
                }
                className="text-xs"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="font-medium">
                        ${Number(value).toLocaleString()}
                      </span>
                    )}
                  />
                }
              />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
