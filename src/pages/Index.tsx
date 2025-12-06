import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary py-4 px-6">
        <span className="font-display text-2xl tracking-wide text-primary-foreground">
          BIRDIES
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <AuthForm />
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

export default Index;