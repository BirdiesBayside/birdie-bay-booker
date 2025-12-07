import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTimetable from "./pages/admin/AdminTimetable";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminPOS from "./pages/admin/AdminPOS";
import AdminSettings from "./pages/admin/AdminSettings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/timetable" element={<AdminTimetable />} />
          <Route path="/admin/customers" element={<AdminCustomers />} />
          <Route path="/admin/pos" element={<AdminPOS />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;