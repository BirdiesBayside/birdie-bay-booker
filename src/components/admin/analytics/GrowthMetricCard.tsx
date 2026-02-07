import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GrowthMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  target?: string;
  className?: string;
}

export function GrowthMetricCard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  target,
  className,
}: GrowthMetricCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {trendValue && trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-sm font-medium",
                trend === "up" && "text-emerald-600 dark:text-emerald-400",
                trend === "down" && "text-destructive",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              <TrendIcon className="h-4 w-4" />
              {trendValue}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
        {target && (
          <p className="mt-2 text-xs text-muted-foreground/70">
            Target: {target}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
