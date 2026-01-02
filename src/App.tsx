import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Booking from "./pages/Booking";
import MyBookings from "./pages/MyBookings";
import MyAccount from "./pages/MyAccount";
import Membership from "./pages/Membership";
import LeagueHub from "./pages/LeagueHub";
import LeagueRounds from "./pages/LeagueRounds";
import LeagueLeaderboard from "./pages/LeagueLeaderboard";
import LeagueProfile from "./pages/LeagueProfile";
import LeagueRegister from "./pages/LeagueRegister";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import Clubhouse from "./pages/Clubhouse";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTimetable from "./pages/admin/AdminTimetable";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminPOS from "./pages/admin/AdminPOS";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminBulkEmail from "./pages/admin/AdminBulkEmail";
import AdminBayControl from "./pages/admin/AdminBayControl";
import AdminMarketing from "./pages/admin/AdminMarketing";
import AdminCustomerImport from "./pages/admin/AdminCustomerImport";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";
import AdminSGTManager from "./pages/admin/AdminSGTManager";
import BayController from "./pages/BayController";

const queryClient = new QueryClient();

// Detect if running in Electron (uses hash routing)
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;
const Router = isElectron ? HashRouter : BrowserRouter;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/booking" element={<Booking />} />
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
          <Route path="/bay-controller" element={<BayController />} />
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminDashboard />} />
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
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;