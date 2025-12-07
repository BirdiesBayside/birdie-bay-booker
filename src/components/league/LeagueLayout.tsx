import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import birdiesBLogo from "@/assets/birdies-b-logo.png";
import {
  LayoutDashboard,
  History,
  Trophy,
  User,
  LogOut,
  Menu,
  X,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LeagueLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/league", label: "Dashboard", icon: LayoutDashboard },
  { path: "/league/rounds", label: "Rounds", icon: History },
  { path: "/league/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/league/profile", label: "Profile", icon: User },
];

export function LeagueLayout({ children }: LeagueLayoutProps) {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary sticky top-0 z-50 shadow-lg">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-primary-foreground hover:text-primary-foreground/80 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline font-inter text-sm">Back</span>
            </button>
            <div className="h-6 w-px bg-primary-foreground/30 hidden sm:block" />
            <Link to="/league" className="flex items-center gap-3">
              <img src={birdiesBLogo} alt="Birdies" className="h-10 w-auto" />
              <span className="font-display text-xl text-primary-foreground tracking-wide">
                BIRDIES HUB
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg font-inter text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-primary-foreground/80 hover:bg-primary-foreground/10"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-inter text-sm text-primary-foreground/80 hover:bg-primary-foreground/10 transition-colors ml-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-primary-foreground p-2"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden bg-primary border-t border-primary-foreground/10 animate-fade-in">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 font-inter text-sm border-b border-primary-foreground/10",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-primary-foreground/80"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 font-inter text-sm text-primary-foreground/80 w-full"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-primary py-4 px-6 text-center mt-auto">
        <p className="text-primary-foreground/60 text-sm font-inter">
          © {new Date().getFullYear()} Birdies League. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
