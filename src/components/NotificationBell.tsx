import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  enableWebPush,
  disableWebPush,
  getExistingSubscription,
  isWebPushSupported,
  webPushPermission,
} from "@/lib/web-push";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  source_type?: string;
  source_id?: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    const supported = isWebPushSupported();
    setPushSupported(supported);
    if (!supported) return;
    getExistingSubscription().then((sub) => {
      setPushEnabled(!!sub && webPushPermission() === "granted");
    });
  }, [user]);

  const togglePush = async () => {
    if (!user) return;
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disableWebPush(user.id);
        setPushEnabled(false);
        toast.success("Announcement notifications turned off");
      } else {
        const result = await enableWebPush(user.id);
        if (result.ok) {
          setPushEnabled(true);
          toast.success("You'll now get a notification for new announcements");
        } else if (result.reason === "denied") {
          toast.error("Notifications are blocked in your browser settings");
        } else if (result.reason === "unsupported") {
          toast.error("This device can't receive notifications here. On iPhone, add Birdies Hub to your Home Screen first.");
        } else {
          toast.error("Couldn't turn on notifications. Please try again.");
        }
      }
    } catch (err) {
      console.error("[WEBPUSH] toggle failed", err);
      toast.error("Couldn't update notification settings");
    } finally {
      setPushBusy(false);
    }
  };

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
      .select("id, title, content, created_at, source_type, source_id")
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

  const handleNotificationClick = (announcement: Announcement) => {
    markAsRead(announcement.id);
    setSelectedAnnouncement(announcement);
    setDialogOpen(true);
    setIsOpen(false);
  };

  const handleViewSource = () => {
    if (selectedAnnouncement?.source_type === 'clubhouse_post' && selectedAnnouncement.source_id) {
      navigate('/clubhouse');
      setDialogOpen(false);
    }
  };

  return (
    <>
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
                      onClick={() => handleNotificationClick(announcement)}
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
          {pushSupported && user && (
            <div className="border-t p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                disabled={pushBusy}
                onClick={togglePush}
              >
                {pushEnabled ? (
                  <>
                    <BellRing className="h-4 w-4 text-accent" />
                    Announcement alerts on — tap to turn off
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4" />
                    Turn on announcement alerts
                  </>
                )}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-3 shrink-0">
            <DialogTitle className="pr-6">{selectedAnnouncement?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                {selectedAnnouncement?.content?.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-birdies-orange underline break-all">
                      {part}
                    </a>
                  ) : part
                )}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {selectedAnnouncement && format(new Date(selectedAnnouncement.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <div className="p-6 pt-4 shrink-0 space-y-2 border-t">
            {selectedAnnouncement?.source_type === 'clubhouse_post' && (
              <Button onClick={handleViewSource} className="w-full">
                View in Clubhouse
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}