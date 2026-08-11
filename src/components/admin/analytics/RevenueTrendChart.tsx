import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

function getDefaultStartDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  d.setDate(1);
  return d;
}

function getDefaultEndDate(): Date {
  return new Date();
}

export function RevenueTrendChart() {
  const [granularity, setGranularity] = useState<RevenueGranularity>("month");
  const [startDate, setStartDate] = useState<Date>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<Date>(getDefaultEndDate());

  const { data, isLoading } = useRevenueTrend({ granularity, startDate, endDate });

  const total = (data ?? []).reduce((sum, d) => sum + d.total, 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base font-medium">Revenue Trend</CardTitle>
          <p className="text-2xl font-bold">${total.toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "dd MMM yyyy") : <span>Start date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(d) => d && setStartDate(d)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "dd MMM yyyy") : <span>End date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(d) => d && setEndDate(d)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

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
        </div>
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
