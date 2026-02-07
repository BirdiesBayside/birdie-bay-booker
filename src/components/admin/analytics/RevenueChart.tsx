import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

interface RevenueChartProps {
  data: { month: string; bookings: number; pos: number; memberships: number }[];
}

const chartConfig: ChartConfig = {
  bookings: {
    label: "Bookings",
    color: "hsl(var(--primary))",
  },
  pos: {
    label: "POS",
    color: "hsl(var(--accent))",
  },
  memberships: {
    label: "Memberships",
    color: "hsl(var(--secondary))",
  },
};

export function RevenueChart({ data }: RevenueChartProps) {
  const totalRevenue = data.reduce(
    (sum, d) => sum + d.bookings + d.pos + d.memberships,
    0
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Revenue Trend (6 Months)
        </CardTitle>
        <p className="text-2xl font-bold">
          ${totalRevenue.toLocaleString()}
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
              className="text-xs"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="font-medium">${Number(value).toLocaleString()}</span>
                  )}
                />
              }
            />
            <Bar
              dataKey="bookings"
              stackId="a"
              fill="var(--color-bookings)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="pos"
              stackId="a"
              fill="var(--color-pos)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="memberships"
              stackId="a"
              fill="var(--color-memberships)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <div className="mt-4 flex justify-center gap-6 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-primary" />
            <span className="text-muted-foreground">Bookings</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-accent" />
            <span className="text-muted-foreground">POS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-secondary" />
            <span className="text-muted-foreground">Memberships</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
