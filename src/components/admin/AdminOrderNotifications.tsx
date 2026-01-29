import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Send, X, Clock } from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

interface BayOrder {
  id: string;
  bay_number: number;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
}

// Checkout till sound - a pleasant "cha-ching" beep sequence
const createCheckoutSound = (): HTMLAudioElement => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = audioContext.sampleRate;
  const duration = 0.6;
  const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);
  
  // Create a cash register "cha-ching" sound
  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    
    // First "cha" - quick metallic hit
    if (t < 0.1) {
      const env = Math.exp(-t * 40);
      sample += Math.sin(2 * Math.PI * 800 * t) * env * 0.3;
      sample += Math.sin(2 * Math.PI * 1200 * t) * env * 0.2;
    }
    
    // "Ching" - the bell ring
    if (t >= 0.1 && t < 0.6) {
      const t2 = t - 0.1;
      const env = Math.exp(-t2 * 4);
      sample += Math.sin(2 * Math.PI * 2000 * t2) * env * 0.4;
      sample += Math.sin(2 * Math.PI * 2500 * t2) * env * 0.3;
      sample += Math.sin(2 * Math.PI * 3000 * t2) * env * 0.2;
    }
    
    data[i] = sample;
  }
  
  // Convert to WAV blob
  const wavBuffer = audioBufferToWav(buffer);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.volume = 0.7;
  return audio;
};

// Helper function to convert AudioBuffer to WAV
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return arrayBuffer;
}

export function AdminOrderNotifications() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<BayOrder[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<BayOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendingToPOS, setSendingToPOS] = useState(false);
  
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  // Initialize audio on first user interaction
  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      try {
        audioRef.current = createCheckoutSound();
      } catch (e) {
        console.error("Failed to create audio:", e);
      }
    }
  }, []);

  // Play the notification sound
  const playSound = useCallback(() => {
    initAudio();
    
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => {
        console.log("Audio play failed (user interaction required):", e);
      });
    }
  }, [initAudio]);

  // Manage the recurring sound interval
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // If there are pending orders, set up the interval
    if (pendingCount > 0) {
      // Play immediately when first pending order arrives
      playSound();
      
      // Then play every 60 seconds
      intervalRef.current = setInterval(() => {
        if (pendingCount > 0) {
          playSound();
        }
      }, 60000); // 60 seconds
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pendingCount, playSound]);

  useEffect(() => {
    fetchOrders();

    // Subscribe to new orders
    const channel = supabase
      .channel("bay_orders_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bay_orders",
        },
        (payload) => {
          console.log("Order change:", payload);
          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as BayOrder;
            setOrders((prev) => [newOrder, ...prev]);
            // Play sound for new order
            playSound();
            // Show toast
            toast.info(`New order from Bay ${newOrder.bay_number}!`, {
              description: `${(newOrder.items as OrderItem[]).length} items - $${newOrder.total.toFixed(2)}`,
              duration: 10000,
            });
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === payload.new.id ? (payload.new as BayOrder) : o
              )
            );
          } else if (payload.eventType === "DELETE") {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playSound]);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("bay_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching orders:", error);
    } else {
      // Cast items JSON to OrderItem[]
      const typedOrders = (data || []).map((order) => ({
        ...order,
        items: order.items as unknown as OrderItem[],
      })) as BayOrder[];
      setOrders(typedOrders);
    }
  };

  const handleOrderClick = (order: BayOrder) => {
    setSelectedOrder(order);
    setDialogOpen(true);
    setIsOpen(false);
  };

  const handleSendToPOS = async () => {
    if (!selectedOrder) return;

    setSendingToPOS(true);

    try {
      // Update order status
      const { error } = await supabase
        .from("bay_orders")
        .update({
          status: "sent_to_pos",
          processed_at: new Date().toISOString(),
        })
        .eq("id", selectedOrder.id);

      if (error) throw error;

      // Navigate to POS with the order data
      navigate("/admin/pos", {
        state: {
          bayOrderData: {
            orderId: selectedOrder.id,
            bayNumber: selectedOrder.bay_number,
            items: selectedOrder.items,
            total: selectedOrder.total,
          },
        },
      });

      setDialogOpen(false);
      toast.success(`Order sent to POS for Bay ${selectedOrder.bay_number}`);
    } catch (error: any) {
      console.error("Error sending to POS:", error);
      toast.error("Failed to send order to POS");
    } finally {
      setSendingToPOS(false);
    }
  };

  const handleDismissOrder = async () => {
    if (!selectedOrder) return;

    try {
      const { error } = await supabase
        .from("bay_orders")
        .update({
          status: "dismissed",
          processed_at: new Date().toISOString(),
        })
        .eq("id", selectedOrder.id);

      if (error) throw error;

      setDialogOpen(false);
      toast.info("Order dismissed");
    } catch (error: any) {
      console.error("Error dismissing order:", error);
      toast.error("Failed to dismiss order");
    }
  };

  const getTimeSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return format(date, "dd/MM");
  };


  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-sidebar-foreground hover:bg-sidebar-accent/50"
              onClick={initAudio} // Initialize audio on click
            >
              <Bell className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center font-medium animate-pulse">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between p-4 border-b">
              <h4 className="font-semibold">Bay Orders</h4>
              {pendingCount > 0 && (
                <Badge variant="secondary">{pendingCount} pending</Badge>
              )}
            </div>
            <ScrollArea className="h-[350px]">
              {orders.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No orders yet
                </div>
              ) : (
                <div className="divide-y">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                        order.status === "pending" ? "bg-accent/10" : ""
                      }`}
                      onClick={() => handleOrderClick(order)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">
                              Bay {order.bay_number}
                            </span>
                            {order.status === "pending" && (
                              <Badge className="bg-accent text-accent-foreground text-xs">
                                New
                              </Badge>
                            )}
                            {order.status === "sent_to_pos" && (
                              <Badge variant="outline" className="text-xs">
                                In POS
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {(order.items as OrderItem[]).length} items •{" "}
                            ${order.total.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {getTimeSince(order.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

      {/* Order Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Bay {selectedOrder?.bay_number} Order</span>
              {selectedOrder?.status === "pending" && (
                <Badge className="bg-accent text-accent-foreground">New</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Ordered {getTimeSince(selectedOrder.created_at)} •{" "}
                {format(new Date(selectedOrder.created_at), "h:mm a")}
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                {(selectedOrder.items as OrderItem[]).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.quantity}×</span>
                      <span>{item.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-3 flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-primary">
                    ${selectedOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            {selectedOrder?.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleDismissOrder}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
                <Button
                  onClick={handleSendToPOS}
                  disabled={sendingToPOS}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send to POS
                </Button>
              </>
            )}
            {selectedOrder?.status !== "pending" && (
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="w-full"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
