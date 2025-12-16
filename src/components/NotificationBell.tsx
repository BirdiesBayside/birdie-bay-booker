import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  useEffect(() => {
    if (user) {
      fetchAnnouncements();
      fetchReadAnnouncements();
    }
  }, [user]);

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, content, created_at")
      .eq("is_active", true)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setAnnouncements(data);
    }
  };

  const fetchReadAnnouncements = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", user.id);

    if (!error && data) {
      setReadIds(new Set(data.map((r) => r.announcement_id)));
    }
  };

  const markAsRead = async (announcementId: string) => {
    if (!user || readIds.has(announcementId)) return;

    const { error } = await supabase.from("announcement_reads").insert({
      user_id: user.id,
      announcement_id: announcementId,
    });

    if (!error) {
      setReadIds((prev) => new Set([...prev, announcementId]));
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const unreadAnnouncements = announcements.filter((a) => !readIds.has(a.id));
    
    for (const announcement of unreadAnnouncements) {
      await supabase.from("announcement_reads").insert({
        user_id: user.id,
        announcement_id: announcement.id,
      });
    }

    setReadIds(new Set(announcements.map((a) => a.id)));
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-primary-foreground hover:bg-primary-foreground/10"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center font-medium">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {announcements.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {announcements.map((announcement) => {
                const isRead = readIds.has(announcement.id);
                return (
                  <div
                    key={announcement.id}
                    className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                      !isRead ? "bg-accent/5" : ""
                    }`}
                    onClick={() => markAsRead(announcement.id)}
                  >
                    <div className="flex items-start gap-2">
                      {!isRead && (
                        <span className="h-2 w-2 mt-1.5 rounded-full bg-accent flex-shrink-0" />
                      )}
                      <div className={!isRead ? "" : "ml-4"}>
                        <p className="font-medium text-sm">{announcement.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {announcement.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(announcement.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}