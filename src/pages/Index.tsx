import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/useAuth";
import birdiesLogo from "@/assets/birdies-logo.png";
import birdiesAppIcon from "@/assets/birdies-app-icon.png";

const Index = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background safe-area-top safe-area-bottom">
        <img src={birdiesAppIcon} alt="Birdies" className="h-20 mb-6" />
        <div className="animate-pulse text-muted-foreground">Loading...</div>
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
