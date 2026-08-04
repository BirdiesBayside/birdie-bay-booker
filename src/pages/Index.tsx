import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/useAuth";
import birdiesLogo from "@/assets/birdies-logo.png";
import birdiesAppIcon from "@/assets/birdies-app-icon.png";
import MarketingHome from "./marketing/MarketingHome";

/**
 * Hostname routing:
 *  - hub.birdiesbayside.com.au  → existing Hub login (AuthForm)
 *  - everything else (main domain, lovable preview, localhost)
 *      → public marketing site
 *
 * Hub can still be reached from any host via deep links (/dashboard, /booking, …).
 */
const isHubHost = () => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.startsWith("hub.") || h === "hub.birdiesbayside.com.au";
};

const Index = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const hubHost = isHubHost();

  useEffect(() => {
    if (hubHost && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [hubHost, isAuthenticated, navigate]);

  // Public marketing site
  if (!hubHost) {
    return <MarketingHome />;
  }

  // Hub login
  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background safe-area-top safe-area-bottom">
        <BrandLoader size={88} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary py-4 px-6 safe-area-top">
        <img src={birdiesLogo} alt="Birdies" className="h-10" />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <AuthForm />
        </div>
      </main>

      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} Birdies. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Index;
