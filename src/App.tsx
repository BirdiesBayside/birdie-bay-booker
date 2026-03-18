import { lazy, Suspense, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// Lazy load all pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Booking = lazy(() => import("./pages/Booking"));
const BookingSuccess = lazy(() => import("./pages/BookingSuccess"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const Membership = lazy(() => import("./pages/Membership"));
const LeagueHub = lazy(() => import("./pages/LeagueHub"));
const LeagueRounds = lazy(() => import("./pages/LeagueRounds"));
const LeagueLeaderboard = lazy(() => import("./pages/LeagueLeaderboard"));
const LeagueProfile = lazy(() => import("./pages/LeagueProfile"));
const LeagueRegister = lazy(() => import("./pages/LeagueRegister"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Clubhouse = lazy(() => import("./pages/Clubhouse"));
const BayController = lazy(() => import("./pages/BayController"));
const EmbedLeaderboard = lazy(() => import("./pages/EmbedLeaderboard"));
const EmbedTVCurrentWeek = lazy(() => import("./pages/EmbedTVCurrentWeek"));
const EmbedTVPreviousWeek = lazy(() => import("./pages/EmbedTVPreviousWeek"));
const EmbedTVMonthlyWinner = lazy(() => import("./pages/EmbedTVMonthlyWinner"));
const CardAdded = lazy(() => import("./pages/CardAdded"));
const WelcomePreview = lazy(() => import("./pages/WelcomePreview"));
const BirdiesGuide = lazy(() => import("./pages/BirdiesGuide"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const BayOrder = lazy(() => import("./pages/BayOrder"));
const Feedback = lazy(() => import("./pages/Feedback"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminTimetable = lazy(() => import("./pages/admin/AdminTimetable"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminPOS = lazy(() => import("./pages/admin/AdminPOS"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminBulkEmail = lazy(() => import("./pages/admin/AdminBulkEmail"));
const AdminBayControl = lazy(() => import("./pages/admin/AdminBayControl"));
const AdminMarketing = lazy(() => import("./pages/admin/AdminMarketing"));
const AdminCustomerImport = lazy(() => import("./pages/admin/AdminCustomerImport"));
const AdminAnnouncements = lazy(() => import("./pages/admin/AdminAnnouncements"));
const AdminSGTManager = lazy(() => import("./pages/admin/AdminSGTManager"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes default - prevents unnecessary refetches
      gcTime: 1000 * 60 * 30, // 30 minutes cache retention
      retry: 2,
      refetchOnWindowFocus: false, // Disable for commercial reliability
      refetchOnReconnect: true,
    },
  },
});

// Detect if running in Electron (uses hash routing)
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;
const Router = isElectron ? HashRouter : BrowserRouter;

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  </div>
);

// Deep link handler component - handles birdiesbayside:// URLs
function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Listen for app URL open events (deep links)
    const setupAppUrlListener = async () => {
      await CapacitorApp.addListener('appUrlOpen', (event) => {
        console.log('[DeepLink] App opened with URL:', event.url);
        
        try {
          // Parse the deep link URL
          // Format: birdiesbayside://booking-success?booking_id=xxx
          // or: birdiesbayside://card-added
          const url = new URL(event.url);
          const path = url.hostname; // e.g., "booking-success", "card-added"
          const params = url.searchParams;
          
          if (path === 'booking-success') {
            const bookingId = params.get('booking_id');
            console.log('[DeepLink] Navigating to booking success:', bookingId);
            navigate(`/booking-success?booking_id=${bookingId}`);
          } else if (path === 'booking-cancelled') {
            const bookingId = params.get('booking_id');
            console.log('[DeepLink] Navigating to booking (cancelled):', bookingId);
            navigate(`/booking?booking_cancelled=true&booking_id=${bookingId}`);
          } else if (path === 'card-added') {
            console.log('[DeepLink] Card added successfully, navigating to card-added page');
            navigate('/card-added');
          } else if (path === 'card-cancelled') {
            console.log('[DeepLink] Card setup cancelled, navigating to booking');
            navigate('/booking?setup_cancelled=true');
          }
        } catch (error) {
          console.error('[DeepLink] Error parsing URL:', error);
        }
      });
    };

    setupAppUrlListener();

    return () => {
      CapacitorApp.removeAllListeners();
    };
  }, [navigate]);

  return null;
}

const LAST_ROUTE_KEY = "bb:lastRoute";

// iOS may reload the webview after switching to Safari. This restores the last route
// so users land back on the Booking screen instead of "/".
function NativeRoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const current = `${location.pathname}${location.search}`;
    localStorage.setItem(LAST_ROUTE_KEY, current);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = localStorage.getItem(LAST_ROUTE_KEY);
    if (!saved) return;

    if (location.pathname === "/" && saved !== "/") {
      console.log("[NativeNav] Restoring last route:", saved);
      navigate(saved, { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

// Push notification initializer component
function PushNotificationInit() {
  usePushNotifications();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PushNotificationInit />
      <Router>
        <DeepLinkHandler />
        <NativeRoutePersistence />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/booking-success" element={<BookingSuccess />} />
            <Route path="/my-bookings" element={<MyBookings />} />
            <Route path="/my-account" element={<MyAccount />} />
            <Route path="/membership" element={<Membership />} />
            <Route path="/league" element={<LeagueHub />} />
            <Route path="/league/rounds" element={<LeagueRounds />} />
            <Route path="/league/leaderboard" element={<LeagueLeaderboard />} />
            <Route path="/league/profile" element={<LeagueProfile />} />
            <Route path="/league/register" element={<LeagueRegister />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/clubhouse" element={<Clubhouse />} />
            <Route path="/embed/leaderboard" element={<EmbedLeaderboard />} />
            <Route path="/embed/tv-current-week" element={<EmbedTVCurrentWeek />} />
            <Route path="/embed/tv-previous-week" element={<EmbedTVPreviousWeek />} />
            <Route path="/embed/tv-monthly-winner" element={<EmbedTVMonthlyWinner />} />
            <Route path="/bay-controller" element={<BayController />} />
            <Route path="/card-added" element={<CardAdded />} />
            <Route path="/welcome-preview" element={<WelcomePreview />} />
            <Route path="/birdies-guide" element={<BirdiesGuide />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/order/:bayNumber" element={<BayOrder />} />
            <Route path="/feedback" element={<Feedback />} />
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/timetable" element={<AdminTimetable />} />
            <Route path="/admin/customers" element={<AdminCustomers />} />
            <Route path="/admin/pos" element={<AdminPOS />} />
            <Route path="/admin/bay-control" element={<AdminBayControl />} />
            <Route path="/admin/marketing" element={<AdminMarketing />} />
            <Route path="/admin/announcements" element={<AdminAnnouncements />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/bulk-email" element={<AdminBulkEmail />} />
            <Route path="/admin/customer-import" element={<AdminCustomerImport />} />
            <Route path="/admin/sgt" element={<AdminSGTManager />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
