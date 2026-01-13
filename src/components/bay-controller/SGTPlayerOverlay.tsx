import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Copy, Check, GripHorizontal, X, ClipboardPaste, Info, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import "@/types/electron.d";
import { format, parseISO } from "date-fns";

interface NextBooking {
  id: string;
  booking_date: string;
  start_time: string;
  customer_name?: string;
  sgt_user_id?: number | null;
  sgt_username?: string | null;
  sgt_game_id?: string | null;
}

interface SGTPlayerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  sgtGameId: string | null;
  sgtUsername: string | null;
  customerName: string | null;
  isElectron: boolean;
  nextBooking?: NextBooking;
}

export function SGTPlayerOverlay({
  isOpen,
  onClose,
  sgtGameId,
  sgtUsername,
  customerName,
  isElectron,
  nextBooking,
}: SGTPlayerOverlayProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [autoPasteArmed, setAutoPasteArmed] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Load position from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("bayController_sgtOverlayPosition");
    if (saved) {
      try {
        setPosition(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Save position to localStorage when dragging ends
  useEffect(() => {
    if (!isDragging) {
      localStorage.setItem("bayController_sgtOverlayPosition", JSON.stringify(position));
    }
  }, [position, isDragging]);

  // Handle mouse events for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Copy for auto-paste (arms the sequence)
  const copyForPaste = async (field: string, value: string) => {
    if (!isElectron || !window.electronAPI) {
      // Fallback for web
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success(`Copied ${field} to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
      return;
    }

    try {
      const result = await window.electronAPI.copyForPaste(value);
      if (result.success) {
        setAutoPasteArmed(field);
        setCopiedField(field);
        toast.success(`${field} copied - click in GSPro field, then click "Paste" button`);
        setTimeout(() => setCopiedField(null), 2000);
      } else {
        toast.error("Failed to copy: " + result.error);
      }
    } catch (err) {
      toast.error("Copy failed");
    }
  };

  // Trigger the auto-paste sequence
  const triggerPaste = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.info("Use Ctrl+V to paste");
      return;
    }

    try {
      const result = await window.electronAPI.triggerAutoPaste();
      if (result.success) {
        toast.success("Pasted!");
        setAutoPasteArmed(null);
      } else {
        toast.error("Paste failed: " + result.error);
      }
    } catch (err) {
      toast.error("Paste failed");
    }
  };

  // Clear armed state
  const clearArmed = async () => {
    if (isElectron && window.electronAPI) {
      await window.electronAPI.clearAutoPaste();
    }
    setAutoPasteArmed(null);
  };

  if (!isOpen) return null;

  const hasActiveBooking = customerName !== null;
  const hasSGTAccount = sgtGameId && sgtUsername;

  return (
    <div
      ref={overlayRef}
      className="fixed z-50 shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <Card className="w-80 bg-background/95 backdrop-blur border-2 border-primary/30">
        <CardHeader
          className="cursor-grab active:cursor-grabbing py-3 px-4 flex flex-row items-center justify-between space-y-0"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">SGT Player Info</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-4 pt-0 space-y-4">
          {hasActiveBooking ? (
            <>
              {/* Customer Name */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Current Booker</p>
                <p className="font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {customerName}
                </p>
              </div>

              {hasSGTAccount ? (
                <>
                  <div className="h-px bg-border" />

                  {/* SGT Username */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">SGT Username</p>
                      <Badge variant="secondary" className="text-xs">SGT Linked</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                        {sgtUsername}
                      </code>
                      <Button
                        size="sm"
                        variant={copiedField === "username" ? "secondary" : "outline"}
                        className="shrink-0"
                        onClick={() => copyForPaste("Username", sgtUsername!)}
                      >
                        {copiedField === "username" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* SGT Game ID (12-digit UID) */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">SGT Game ID (UID)</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-xs">
                        {sgtGameId}
                      </code>
                      <Button
                        size="sm"
                        variant={copiedField === "uid" ? "secondary" : "outline"}
                        className="shrink-0"
                        onClick={() => copyForPaste("UID", sgtGameId!)}
                      >
                        {copiedField === "uid" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Auto-paste button */}
                  {autoPasteArmed ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground text-center">
                        Click in the GSPro field, then click Paste
                      </p>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={triggerPaste}
                        >
                          <ClipboardPaste className="h-4 w-4 mr-2" />
                          Paste {autoPasteArmed}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={clearArmed}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      <p className="flex items-start gap-2">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                          Click Copy on a field, then click in the GSPro input field, and click the Paste button.
                        </span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
                  <p className="mb-2">No SGT account linked to this customer.</p>
                  <p className="text-xs">
                    They can link their account via the Birdies app.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
                <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p className="font-medium text-foreground">No Active Booking</p>
                <p className="text-xs mt-1">
                  Press F9 to close this overlay
                </p>
              </div>

              {nextBooking && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Next Booking
                    </p>
                    <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                      <p className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {nextBooking.customer_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(`${nextBooking.booking_date}T${nextBooking.start_time}`), "h:mm a")}
                      </p>
                      {nextBooking.sgt_username ? (
                        <Badge variant="secondary" className="text-xs">
                          SGT: {nextBooking.sgt_username}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No SGT linked</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}