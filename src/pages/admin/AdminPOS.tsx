import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Wallet,
  Banknote,
  User,
  Calendar,
  X,
  ChevronLeft,
  Percent
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface POSProduct {
  id: string;
  name: string;
  price: number;
  family: string | null;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  bookingId?: string;
}

interface UnpaidBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_price: number;
  bay_name: string;
  customer_name: string;
  customer_id: string;
}

interface Customer {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface BookingDataFromNav {
  bookingId: string;
  customerId: string;
  duration: number;
  customerName: string;
  totalPrice: number;
  bayName: string;
  bookingDate: string;
  startTime: string;
}

export default function AdminPOS() {
  const { isAdmin, isLoading } = useAdminAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [unpaidBookings, setUnpaidBookings] = useState<UnpaidBooking[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>("categories");
  const [families, setFamilies] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showBookingsDialog, setShowBookingsDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<UnpaidBooking | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [processedNavBooking, setProcessedNavBooking] = useState<string | null>(null);
  const [terminalCountdown, setTerminalCountdown] = useState<number | null>(null);
  const [surchargeEnabled, setSurchargeEnabled] = useState(false);
  const [surchargePercent, setSurchargePercent] = useState<string>("1.5");

  useEffect(() => {
    if (isAdmin) {
      fetchProducts();
      fetchUnpaidBookings();
      fetchCustomers();
    }
  }, [isAdmin]);

  // Handle booking data from navigation (from timetable)
  useEffect(() => {
    const navState = location.state as { bookingData?: BookingDataFromNav } | null;
    if (navState?.bookingData && processedNavBooking !== navState.bookingData.bookingId) {
      const bookingData = navState.bookingData;
      
      // Set customer
      setSelectedCustomer(bookingData.customerId);
      
      // Set selected booking for tracking
      setSelectedBooking({
        id: bookingData.bookingId,
        booking_date: bookingData.bookingDate,
        start_time: bookingData.startTime,
        end_time: '',
        total_price: bookingData.totalPrice,
        bay_name: bookingData.bayName,
        customer_name: bookingData.customerName,
        customer_id: bookingData.customerId,
      });
      
      // Add booking as custom cart item with actual calculated price
      setCart([{
        id: `booking-${bookingData.bookingId}`,
        name: `${bookingData.duration}hr Booking: ${bookingData.bayName} - ${format(new Date(bookingData.bookingDate), 'dd/MM')} ${bookingData.startTime.slice(0, 5)}`,
        price: bookingData.totalPrice,
        quantity: 1,
        bookingId: bookingData.bookingId,
      }]);
      
      setProcessedNavBooking(bookingData.bookingId);
      toast.success(`Added ${bookingData.duration}hr booking ($${bookingData.totalPrice}) to cart`);
    }
  }, [location.state, processedNavBooking]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('pos_products')
      .select('*')
      .eq('is_active', true)
      .order('family', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts(data || []);
      const uniqueFamilies = [...new Set(data?.map(p => p.family).filter(Boolean))] as string[];
      setFamilies(uniqueFamilies);
    }
    setLoadingProducts(false);
  };

  const fetchUnpaidBookings = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        start_time,
        end_time,
        total_price,
        user_id,
        bay_id,
        bays(name),
        profiles!bookings_user_id_fkey(first_name, last_name, user_id)
      `)
      .gte('booking_date', today)
      .eq('payment_method', 'pending')
      .neq('status', 'cancelled')
      .order('booking_date', { ascending: true });

    if (error) {
      console.error('Error fetching unpaid bookings:', error);
    } else {
      const bookings = data?.map((b: any) => ({
        id: b.id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        total_price: b.total_price,
        bay_name: b.bays?.name || 'Unknown',
        customer_name: b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : 'Unknown',
        customer_id: b.profiles?.user_id || b.user_id,
      })) || [];
      setUnpaidBookings(bookings);
    }
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, email')
      .order('first_name', { ascending: true });

    if (error) {
      console.error('Error fetching customers:', error);
    } else {
      setCustomers(data || []);
    }
  };

  const addToCart = (product: POSProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedBooking(null);
    setSelectedCustomer("");
    setSurchargeEnabled(false);
  };

  const addBookingToCart = (booking: UnpaidBooking) => {
    setSelectedBooking(booking);
    setSelectedCustomer(booking.customer_id);
    setCart([{
      id: `booking-${booking.id}`,
      name: `Booking: ${booking.bay_name} - ${format(new Date(booking.booking_date), 'dd/MM')} ${booking.start_time.slice(0, 5)}`,
      price: booking.total_price,
      quantity: 1,
    }]);
    setShowBookingsDialog(false);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const surchargeAmount = surchargeEnabled ? subtotal * (parseFloat(surchargePercent) || 0) / 100 : 0;
  const total = subtotal + surchargeAmount;

  const [terminalPaymentIntentId, setTerminalPaymentIntentId] = useState<string | null>(null);

  const handleCancelTerminal = async () => {
    try {
      await supabase.functions.invoke('stripe-terminal', {
        body: { action: 'cancel_reader_action' },
      });
      toast.info("Payment cancelled");
      setTerminalPaymentIntentId(null);
      setTerminalCountdown(null);
      setIsProcessing(false);
    } catch (error: any) {
      console.error('Cancel error:', error);
      toast.error("Failed to cancel payment");
    }
  };

  const handlePayment = async (method: 'cash' | 'customer_account' | 'pos') => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    setIsProcessing(true);

    try {
      if (method === 'customer_account') {
        if (!selectedCustomer) {
          toast.error("Please select a customer");
          setIsProcessing(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke('stripe-terminal', {
          body: {
            action: 'charge_saved_card',
            amount: total,
            customerId: selectedCustomer,
            bookingId: selectedBooking?.id,
            items: cart,
            description: `POS Sale - ${cart.map(i => i.name).join(', ')}`,
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Payment failed");
        }

        // Save transaction and update booking if applicable
        await saveTransaction(method, data.paymentIntentId);
        toast.success("Payment successful!");
      } else if (method === 'pos') {
        const { data, error } = await supabase.functions.invoke('stripe-terminal', {
          body: {
            action: 'create_payment_intent',
            amount: total,
            customerId: selectedCustomer,
            bookingId: selectedBooking?.id,
            items: cart,
            description: `POS Sale - ${cart.map(i => i.name).join(', ')}`,
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Failed to initiate payment");
        }

        toast.info("Please complete payment on terminal...");
        const paymentIntentId = data.paymentIntentId;
        setTerminalPaymentIntentId(paymentIntentId);
        setTerminalCountdown(60); // 1 minute countdown

        // Start countdown timer
        const countdownInterval = setInterval(() => {
          setTerminalCountdown(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownInterval);
              return null;
            }
            return prev - 1;
          });
        }, 1000);

        // Poll for payment status
        let attempts = 0;
        const maxAttempts = 30; // 1 minute timeout (30 * 2 seconds)
        let lastStatus = '';

        const checkStatus = async () => {
          try {
            const { data: statusData, error: statusError } = await supabase.functions.invoke('stripe-terminal', {
              body: { action: 'check_payment_status', paymentIntentId },
            });

            if (statusError) {
              console.error('Status check error:', statusError);
              // Continue polling on error
              attempts++;
              if (attempts < maxAttempts) {
                setTimeout(checkStatus, 2000);
              }
              return;
            }

            console.log('Payment status:', statusData);
            lastStatus = statusData?.status || '';

            if (statusData?.paid) {
              clearInterval(countdownInterval);
              await saveTransaction(method, paymentIntentId);
              setShowPaymentDialog(false);
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              clearCart();
              setIsProcessing(false);
              // Show success toast AFTER clearing state so it's visible
              toast.success("Payment successful!", {
                description: `$${total.toFixed(2)} paid via card terminal`,
                duration: 5000,
              });
              return;
            }

            // Only show error if payment was explicitly cancelled
            if (statusData?.status === 'canceled') {
              clearInterval(countdownInterval);
              toast.error("Payment was cancelled");
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              setIsProcessing(false);
              return;
            }

            // Continue polling for any other status (requires_payment_method, processing, etc.)
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkStatus, 2000);
            } else {
              clearInterval(countdownInterval);
              // Cancel the reader action on timeout
              await supabase.functions.invoke('stripe-terminal', {
                body: { action: 'cancel_reader_action' },
              });
              toast.error("Payment timed out");
              setTerminalPaymentIntentId(null);
              setTerminalCountdown(null);
              setIsProcessing(false);
            }
          } catch (err) {
            console.error('Polling error:', err);
            // Continue polling on error
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkStatus, 2000);
            }
          }
        };

        setTimeout(checkStatus, 2000);
        return; // Don't close dialog yet for POS
      } else {
        // Cash payment
        await saveTransaction(method, null);
        toast.success("Cash payment recorded!");
      }

      setShowPaymentDialog(false);
      clearCart();
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || "Payment failed");
    } finally {
      if (method !== 'pos') {
        setIsProcessing(false);
      }
    }
  };

  const saveTransaction = async (paymentMethod: string, stripePaymentIntentId: string | null) => {
    // Build items array - include surcharge as a line item if applicable
    const transactionItems = [...cart];
    if (surchargeEnabled && surchargeAmount > 0) {
      transactionItems.push({
        id: 'surcharge',
        name: `Card Surcharge (${surchargePercent}%)`,
        price: surchargeAmount,
        quantity: 1,
      });
    }
    
    // Save POS transaction
    await supabase.from('pos_transactions').insert({
      items: JSON.parse(JSON.stringify(transactionItems)),
      subtotal,
      total,
      payment_method: paymentMethod,
      stripe_payment_intent_id: stripePaymentIntentId,
      customer_id: selectedCustomer || null,
      booking_id: selectedBooking?.id || null,
    });

    // Update booking if this was for a booking
    if (selectedBooking) {
      await supabase
        .from('bookings')
        .update({
          payment_method: paymentMethod === 'pos' ? 'stripeinperson' : paymentMethod,
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .eq('id', selectedBooking.id);

      fetchUnpaidBookings();
    }
  };

  const filteredProducts = selectedFamily === 'all'
    ? products
    : products.filter(p => p.family === selectedFamily);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 h-[calc(100vh-64px)]">
          <Skeleton className="h-full w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  // Define all category names (including empty ones for navigation)
  const ALL_FAMILIES = ['Golf', 'Drinks & Snacks', 'Merch & Other'];

  // Cart Panel Component (reused for both layouts)
  const CartPanel = ({ className = "" }: { className?: string }) => (
    <div className={`bg-card flex flex-col ${className}`}>
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-display text-xl uppercase">Cart</h2>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearCart}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Customer Selection */}
      <div className="p-4 border-b">
        <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
          <SelectTrigger>
            <SelectValue placeholder="Select customer (optional)">
              {selectedCustomer && customers.find(c => c.user_id === selectedCustomer) && (
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {customers.find(c => c.user_id === selectedCustomer)?.first_name}{' '}
                  {customers.find(c => c.user_id === selectedCustomer)?.last_name}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {customers.map(customer => (
              <SelectItem key={customer.user_id} value={customer.user_id}>
                {customer.first_name} {customer.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cart Items */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isMobile ? 'max-h-40' : ''}`}>
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-2 opacity-50" />
            <p>Cart is empty</p>
          </div>
        ) : (
          cart.map(item => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-base truncate">{item.name}</p>
                  <p className="text-primary font-bold text-lg">${(item.price * item.quantity).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => updateQuantity(item.id, -1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="w-8 text-center text-lg font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => updateQuantity(item.id, 1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Totals & Pay */}
      <div className="p-4 border-t space-y-4">
        {/* Surcharge Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="surcharge-toggle"
              checked={surchargeEnabled}
              onCheckedChange={setSurchargeEnabled}
            />
            <Label htmlFor="surcharge-toggle" className="text-sm cursor-pointer">
              Card Surcharge
            </Label>
          </div>
          {surchargeEnabled && (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={surchargePercent}
                onChange={(e) => setSurchargePercent(e.target.value)}
                className="w-16 h-8 text-center text-sm"
                step="0.1"
                min="0"
                max="10"
              />
              <Percent className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Subtotal and Surcharge breakdown */}
        {surchargeEnabled && surchargeAmount > 0 && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Surcharge ({surchargePercent}%)</span>
              <span>${surchargeAmount.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-primary">${total.toFixed(2)}</span>
        </div>

        <Button
          className="w-full h-14 text-lg font-display uppercase"
          disabled={cart.length === 0}
          onClick={() => setShowPaymentDialog(true)}
        >
          <CreditCard className="h-5 w-5 mr-2" />
          Pay ${total.toFixed(2)}
        </Button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      {isMobile ? (
        /* Mobile Layout: Products on top, Cart below */
        <div className="flex flex-col h-[calc(100vh-64px)]">
          {/* Products Section */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
            {/* Header with back button and unpaid bookings */}
            <div className="flex items-center justify-between mb-4">
              {selectedFamily !== 'categories' && (
                <Button
                  variant="ghost"
                  onClick={() => setSelectedFamily('categories')}
                  className="gap-2"
                  size="sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {selectedFamily === 'categories' && <div />}
              <Button
                variant="outline"
                onClick={() => setShowBookingsDialog(true)}
                className="shrink-0"
                size="sm"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Unpaid ({unpaidBookings.length})
              </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingProducts ? (
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square" />
                  ))}
                </div>
              ) : selectedFamily === 'categories' ? (
                /* Category Selection View */
                <div className="grid grid-cols-3 gap-3">
                  {ALL_FAMILIES.map(family => {
                    const productCount = products.filter(p => p.family === family).length;
                    return (
                      <button
                        key={family}
                        onClick={() => setSelectedFamily(family)}
                        className="aspect-square bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center active:bg-muted transition-colors"
                      >
                        <span className="font-display text-base uppercase tracking-wide">{family}</span>
                        <span className="text-muted-foreground text-sm mt-1">
                          {productCount} {productCount === 1 ? 'item' : 'items'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-base">No products in {selectedFamily}</p>
                </div>
              ) : (
                /* Products Grid */
                <div className="grid grid-cols-3 gap-3">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="aspect-square bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center active:bg-muted transition-colors"
                    >
                      <span className="font-medium text-base line-clamp-2">{product.name}</span>
                      <span className="text-primary font-bold text-lg mt-1">${product.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart Section - Fixed at bottom on mobile */}
          <CartPanel className="border-t shrink-0" />
        </div>
      ) : (
        /* Desktop Layout: Side by side */
        <div className="flex h-[calc(100vh-64px)]">
          {/* Products Grid */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            {/* Header with back button and unpaid bookings */}
            <div className="flex items-center justify-between mb-4">
              {selectedFamily !== 'categories' && (
                <Button
                  variant="ghost"
                  onClick={() => setSelectedFamily('categories')}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to Categories
                </Button>
              )}
              {selectedFamily === 'categories' && <div />}
              <Button
                variant="outline"
                onClick={() => setShowBookingsDialog(true)}
                className="shrink-0"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Unpaid Bookings ({unpaidBookings.length})
              </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingProducts ? (
                <div className="grid grid-cols-3 gap-6 w-full">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : selectedFamily === 'categories' ? (
                /* Category Selection View */
                <div className="grid grid-cols-3 gap-6 w-full">
                  {ALL_FAMILIES.map(family => {
                    const productCount = products.filter(p => p.family === family).length;
                    return (
                      <button
                        key={family}
                        onClick={() => setSelectedFamily(family)}
                        className="w-full bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center active:bg-muted transition-colors min-h-[140px]"
                      >
                        <span className="font-display text-lg uppercase tracking-wide">{family}</span>
                        <span className="text-muted-foreground text-base mt-1">
                          {productCount} {productCount === 1 ? 'item' : 'items'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <ShoppingCart className="h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg">No products in {selectedFamily}</p>
                  <p className="text-sm">Add products in Settings to get started</p>
                </div>
              ) : (
                /* Products Grid */
                <div className="grid grid-cols-3 gap-6 w-full">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center active:bg-muted transition-colors min-h-[140px]"
                    >
                      <span className="font-medium text-lg line-clamp-2">{product.name}</span>
                      <span className="text-primary font-bold text-xl mt-2">${product.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart Panel - Side panel on desktop */}
          <CartPanel className="w-80 lg:w-96 border-l" />
        </div>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase text-center">
              Pay ${total.toFixed(2)}
            </DialogTitle>
            {surchargeEnabled && surchargeAmount > 0 && (
              <p className="text-sm text-muted-foreground text-center">
                (includes ${surchargeAmount.toFixed(2)} card surcharge)
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3 pt-4">
            <Button
              variant="outline"
              className="w-full h-16 text-lg justify-start gap-4"
              onClick={() => handlePayment('cash')}
              disabled={isProcessing}
            >
              <Banknote className="h-8 w-8 text-green-600" />
              <span>Cash</span>
            </Button>
            <Button
              variant="outline"
              className="w-full h-16 text-lg justify-start gap-4"
              onClick={() => handlePayment('customer_account')}
              disabled={isProcessing || !selectedCustomer}
            >
              <Wallet className="h-8 w-8 text-blue-600" />
              <div className="text-left">
                <span>Customer Account</span>
                {!selectedCustomer && (
                  <p className="text-xs text-muted-foreground">Select a customer first</p>
                )}
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full h-16 text-lg justify-start gap-4"
              onClick={() => handlePayment('pos')}
              disabled={isProcessing}
            >
              <CreditCard className="h-8 w-8 text-primary" />
              <span>Card Terminal</span>
            </Button>
          </div>
          {isProcessing && terminalPaymentIntentId && (
            <div className="text-center py-6 space-y-4 border-t mt-4">
              <div className="flex items-center justify-center gap-3">
                <div className="animate-pulse">
                  <CreditCard className="h-10 w-10 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-lg">Awaiting tap or insert...</p>
                  <p className="text-sm text-muted-foreground">Present card on terminal</p>
                </div>
              </div>
              {terminalCountdown !== null && (
                <div className="text-3xl font-bold text-primary">
                  {Math.floor(terminalCountdown / 60)}:{(terminalCountdown % 60).toString().padStart(2, '0')}
                </div>
              )}
              <Button
                variant="destructive"
                onClick={handleCancelTerminal}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel Payment
              </Button>
            </div>
          )}
          {isProcessing && !terminalPaymentIntentId && (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Processing payment...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unpaid Bookings Dialog */}
      <Dialog open={showBookingsDialog} onOpenChange={setShowBookingsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase">
              Unpaid Bookings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {unpaidBookings.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No unpaid bookings
              </p>
            ) : (
              unpaidBookings.map(booking => (
                <Card
                  key={booking.id}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => addBookingToCart(booking)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{booking.customer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.bay_name} • {format(new Date(booking.booking_date), 'dd/MM/yyyy')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}
                      </p>
                    </div>
                    <span className="text-primary font-bold text-lg">
                      ${booking.total_price.toFixed(2)}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
