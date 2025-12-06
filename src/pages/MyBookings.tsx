import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, Clock, MapPin, X } from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: number;
  status: string;
  bay_id: string;
  bay_name?: string;
  bay_number?: number;
}

const MyBookings = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user]);

  const fetchBookings = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_date,
          start_time,
          end_time,
          duration_hours,
          total_price,
          status,
          bay_id,
          bays (name, bay_number)
        `)
        .eq("user_id", user.id)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      const formattedBookings = (data || []).map((booking: any) => ({
        ...booking,
        bay_name: booking.bays?.name,
        bay_number: booking.bays?.bay_number,
      }));

      setBookings(formattedBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error("Failed to load bookings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);

      if (error) throw error;

      toast.success("Booking cancelled successfully");
      fetchBookings();
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast.error("Failed to cancel booking");
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const isBookingPast = (bookingDate: string, endTime: string) => {
    const date = parseISO(bookingDate);
    if (isPast(date) && !isToday(date)) return true;
    if (isToday(date)) {
      const [hours, minutes] = endTime.split(":");
      const now = new Date();
      const endDateTime = new Date();
      endDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
      return now > endDateTime;
    }
    return false;
  };

  const upcomingBookings = bookings.filter(
    (b) => b.status === "confirmed" && !isBookingPast(b.booking_date, b.end_time)
  );
  const pastBookings = bookings.filter(
    (b) => b.status !== "confirmed" || isBookingPast(b.booking_date, b.end_time)
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard")}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="font-display text-2xl tracking-wide text-primary-foreground">
          MY BOOKINGS
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-3xl mx-auto space-y-8">
          {/* Upcoming Bookings */}
          <section>
            <h2 className="font-display text-2xl text-primary mb-4">
              UPCOMING BOOKINGS
            </h2>
            {upcomingBookings.length === 0 ? (
              <div className="bg-card rounded-lg p-6 border border-border text-center">
                <p className="text-muted-foreground">No upcoming bookings</p>
                <Button
                  className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => navigate("/booking")}
                >
                  Book a Bay
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-card rounded-lg p-5 border border-border shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                          <MapPin className="h-4 w-4" />
                          Bay {booking.bay_number}
                          {booking.bay_name && ` - ${booking.bay_name}`}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(parseISO(booking.booking_date), "EEE, MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">${booking.total_price.toFixed(2)}</span>
                          <span className="text-muted-foreground">
                            {" "}• {booking.duration_hours} hour{booking.duration_hours > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to cancel your booking for Bay {booking.bay_number} on{" "}
                              {format(parseISO(booking.booking_date), "MMMM d, yyyy")} at{" "}
                              {formatTime(booking.start_time)}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancelBooking(booking.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Cancel Booking
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Past Bookings */}
          <section>
            <h2 className="font-display text-2xl text-primary mb-4">
              PAST BOOKINGS
            </h2>
            {pastBookings.length === 0 ? (
              <div className="bg-card rounded-lg p-6 border border-border text-center">
                <p className="text-muted-foreground">No past bookings</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pastBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-card rounded-lg p-5 border border-border shadow-sm opacity-70"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <MapPin className="h-4 w-4" />
                          Bay {booking.bay_number}
                          {booking.bay_name && ` - ${booking.bay_name}`}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(parseISO(booking.booking_date), "EEE, MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">${booking.total_price.toFixed(2)}</span>
                          <span className="text-muted-foreground">
                            {" "}• {booking.duration_hours} hour{booking.duration_hours > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          booking.status === "cancelled"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {booking.status === "cancelled" ? "Cancelled" : "Completed"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} Birdies. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default MyBookings;