import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, RefreshCw, CheckCircle, XCircle, Key, LogIn, UserPlus, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuthEvent {
  id: string;
  timestamp: string;
  event_type: string;
  email: string;
  status: number;
  path: string;
  msg?: string;
  error?: string;
}

type FilterType = "all" | "password_resets" | "logins" | "errors";

export function ActivityLog() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  const fetchAuthLogs = async () => {
    setIsLoading(true);
    try {
      // Query auth logs using the analytics endpoint
      const { data, error } = await supabase.rpc('get_auth_logs' as any);
      
      // If RPC doesn't exist, we'll fall back to showing a message
      if (error) {
        console.log("Auth logs RPC not available, using direct query");
        // Try fetching from the analytics API via edge function
        const response = await supabase.functions.invoke('get-activity-logs');
        if (response.data?.events) {
          setEvents(response.data.events);
        }
      } else if (data) {
        setEvents(data);
      }
    } catch (err) {
      console.error("Error fetching auth logs:", err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen && events.length === 0) {
      fetchAuthLogs();
    }
  }, [isOpen]);

  const getEventIcon = (event: AuthEvent) => {
    if (event.error || event.status >= 400) {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    if (event.path?.includes("recover") || event.msg?.includes("recovery")) {
      return <Key className="h-4 w-4 text-amber-500" />;
    }
    if (event.path?.includes("signup") || event.msg?.includes("signup")) {
      return <UserPlus className="h-4 w-4 text-blue-500" />;
    }
    return <LogIn className="h-4 w-4 text-green-500" />;
  };

  const getEventType = (event: AuthEvent): string => {
    if (event.msg?.includes("recovery")) return "Password Reset";
    if (event.path?.includes("recover")) return "Password Reset";
    if (event.path?.includes("signup")) return "Signup";
    if (event.path?.includes("token")) return "Login";
    if (event.path?.includes("verify")) return "Verification";
    if (event.msg?.includes("login")) return "Login";
    return event.event_type || "Auth Event";
  };

  const getEventStatus = (event: AuthEvent): "success" | "error" | "warning" => {
    if (event.error || event.status >= 400) return "error";
    if (event.msg?.includes("recovery") || event.path?.includes("recover")) return "warning";
    return "success";
  };

  const filteredEvents = events.filter(event => {
    if (filter === "all") return true;
    if (filter === "errors") return event.error || event.status >= 400;
    if (filter === "password_resets") {
      return event.msg?.includes("recovery") || event.path?.includes("recover");
    }
    if (filter === "logins") {
      return event.path?.includes("token") || event.msg?.includes("login");
    }
    return true;
  });

  const filterCounts = {
    all: events.length,
    password_resets: events.filter(e => e.msg?.includes("recovery") || e.path?.includes("recover")).length,
    logins: events.filter(e => e.path?.includes("token") || e.msg?.includes("login")).length,
    errors: events.filter(e => e.error || e.status >= 400).length,
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {(["all", "password_resets", "logins", "errors"] as FilterType[]).map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(f)}
                    className="text-xs"
                  >
                    {f === "all" && "All"}
                    {f === "password_resets" && "Password Resets"}
                    {f === "logins" && "Logins"}
                    {f === "errors" && "Errors"}
                    <span className="ml-1 opacity-70">({filterCounts[f]})</span>
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAuthLogs}
                disabled={isLoading}
                className="ml-auto"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Events list */}
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No activity logs available</p>
                <p className="text-xs mt-1">Logs will appear here after user authentication events</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredEvents.slice(0, 50).map((event) => {
                  const status = getEventStatus(event);
                  return (
                    <div
                      key={event.id}
                      className={`p-3 border rounded-lg flex items-start gap-3 ${
                        status === "error" ? "border-destructive/30 bg-destructive/5" :
                        status === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                        "bg-background"
                      }`}
                    >
                      <div className="mt-0.5">
                        {getEventIcon(event)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={status === "error" ? "destructive" : status === "warning" ? "secondary" : "default"}
                            className="text-xs"
                          >
                            {getEventType(event)}
                          </Badge>
                          <span className="text-sm font-medium truncate">
                            {event.email || "Unknown"}
                          </span>
                        </div>
                        {event.error && (
                          <p className="text-xs text-destructive mt-1 truncate">
                            {event.error}
                          </p>
                        )}
                        {event.msg && !event.error && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {event.msg}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
      </CardContent>
    </Card>

  );
}
