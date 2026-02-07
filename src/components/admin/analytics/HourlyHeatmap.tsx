import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HourlyHeatmapProps {
  data: { day: number; hour: number; bookings: number }[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm

export function HourlyHeatmap({ data }: HourlyHeatmapProps) {
  const maxBookings = Math.max(...data.map((d) => d.bookings), 1);
  
  const getIntensity = (bookings: number) => {
    if (bookings === 0) return 0;
    return Math.ceil((bookings / maxBookings) * 5);
  };

  const getCell = (day: number, hour: number) => {
    const cell = data.find((d) => d.day === day && d.hour === hour);
    return cell?.bookings || 0;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Peak Hours Heatmap
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Bay utilization by day and hour (last 30 days)
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex gap-1 mb-1 ml-10">
              {HOURS.filter((_, i) => i % 2 === 0).map((hour) => (
                <div
                  key={hour}
                  className="text-xs text-muted-foreground w-[38px] text-center"
                >
                  {hour > 12 ? `${hour - 12}p` : hour === 12 ? "12p" : `${hour}a`}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="space-y-1">
              {DAYS.map((day, dayIndex) => (
                <div key={day} className="flex items-center gap-1">
                  <span className="w-8 text-xs text-muted-foreground text-right pr-1">
                    {day}
                  </span>
                  <div className="flex gap-0.5">
                    {HOURS.map((hour) => {
                      const bookings = getCell(dayIndex, hour);
                      const intensity = getIntensity(bookings);
                      return (
                        <div
                          key={`${day}-${hour}`}
                          title={`${day} ${hour}:00 - ${bookings} bookings`}
                          className={cn(
                            "w-[18px] h-[18px] rounded-sm transition-colors cursor-default",
                            intensity === 0 && "bg-muted/50",
                            intensity === 1 && "bg-primary/20",
                            intensity === 2 && "bg-primary/40",
                            intensity === 3 && "bg-primary/60",
                            intensity === 4 && "bg-primary/80",
                            intensity === 5 && "bg-primary"
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-0.5">
                <div className="w-3 h-3 rounded-sm bg-muted/50" />
                <div className="w-3 h-3 rounded-sm bg-primary/20" />
                <div className="w-3 h-3 rounded-sm bg-primary/40" />
                <div className="w-3 h-3 rounded-sm bg-primary/60" />
                <div className="w-3 h-3 rounded-sm bg-primary/80" />
                <div className="w-3 h-3 rounded-sm bg-primary" />
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
