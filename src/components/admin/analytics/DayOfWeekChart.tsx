import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface DayOfWeekChartProps {
  data: { day: string; hours: number }[];
}

const chartConfig: ChartConfig = {
  hours: {
    label: "Hours Booked",
    color: "hsl(var(--primary))",
  },
};

export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
  const totalHours = data.reduce((sum, d) => sum + d.hours, 0);
  const peakDay = data.reduce((max, d) => (d.hours > max.hours ? d : max), data[0]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Day of Week Performance
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {totalHours} hours booked (last 30 days) • Peak: {peakDay?.day}
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}h`}
              className="text-xs"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span className="font-medium">{value} hours</span>
                  )}
                />
              }
            />
            <Bar
              dataKey="hours"
              fill="var(--color-hours)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
