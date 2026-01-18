import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Check, AlertCircle, Loader2 } from "lucide-react";
import birdieLogo from "@/assets/birdies-logo.png";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidSession, setIsValidSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleTokenExchange = async () => {
      setIsValidating(true);
      setErrorMessage(null);

      try {
        // Check for hash fragment (Supabase recovery links use hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        // Also check query params as fallback
        const queryParams = new URLSearchParams(window.location.search);
        const errorParam = queryParams.get("error");
        const errorDescription = queryParams.get("error_description");

        if (errorParam) {
          setErrorMessage(errorDescription || "Invalid or expired link");
          setIsValidating(false);
          return;
        }

        // If we have tokens in the hash with type=recovery, this is a valid recovery flow
        if (accessToken && refreshToken && type === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error("Session error:", error);
            setErrorMessage("Invalid or expired reset link. Please request a new one.");
            setIsValidating(false);
            return;
          }

          // Mark that we came from a valid recovery link
          sessionStorage.setItem("password_reset_in_progress", "true");
          setIsValidSession(true);
          setIsValidating(false);
          return;
        }

        // Listen for auth state changes that include RECOVERY events
        // This catches when Supabase redirects with tokens automatically processed
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          console.log("Auth event during reset:", event);
          if (event === "PASSWORD_RECOVERY") {
            // This event fires when the recovery link is being processed
            sessionStorage.setItem("password_reset_in_progress", "true");
            setIsValidSession(true);
            setIsValidating(false);
          }
        });

        // Give time for the auth state change to fire
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if we have a session AND came from a recovery flow
        const { data: { session } } = await supabase.auth.getSession();
        const isRecoveryFlow = sessionStorage.getItem("password_reset_in_progress") === "true";
        
        if (session && isRecoveryFlow) {
          // Valid recovery session
          setIsValidSession(true);
          setIsValidating(false);
          subscription.unsubscribe();
          return;
        }
        
        if (session && !isRecoveryFlow) {
          // User has an existing session but didn't come from a recovery link
          // Check if there's a recovery token in the URL hash that Supabase might have auto-processed
          const hash = window.location.hash;
          if (hash.includes("type=recovery") || hash.includes("access_token")) {
            // Supabase auto-processed the recovery - allow password reset
            sessionStorage.setItem("password_reset_in_progress", "true");
            setIsValidSession(true);
            setIsValidating(false);
            subscription.unsubscribe();
            return;
          }
          
          // Regular logged-in user, not a recovery flow - redirect to dashboard
          console.log("User already logged in without recovery token, redirecting to dashboard");
          setErrorMessage("You're already logged in. If you need to reset your password, please log out first and use the forgot password feature.");
          setIsValidating(false);
          subscription.unsubscribe();
          return;
        }

        subscription.unsubscribe();
        
        // No valid session or token found
        setErrorMessage("Invalid or expired reset link. Please request a new password reset.");
        setIsValidating(false);
      } catch (error: any) {
        console.error("Token exchange error:", error);
        setErrorMessage("An error occurred. Please try again.");
        setIsValidating(false);
      }
    };

    handleTokenExchange();
    
    // Clean up the recovery flag on unmount
    return () => {
      // Don't clear immediately - only clear after successful password update
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      // Clear the recovery flag after successful password update
      sessionStorage.removeItem("password_reset_in_progress");
      
      setIsSuccess(true);
      toast.success("Password updated successfully!");
      
      // Redirect to dashboard after a moment
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (error: any) {
      console.error("Update password error:", error);
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while validating token
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Validating your reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-display uppercase tracking-wide mb-2">Link Expired</h2>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <Button onClick={() => navigate("/")} variant="outline">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-display uppercase tracking-wide mb-2">Password Updated!</h2>
            <p className="text-muted-foreground">
              Redirecting you to the dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password form (only shown when session is valid)
  if (!isValidSession) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={birdieLogo} alt="Birdies" className="h-12 mx-auto mb-4" />
          <CardTitle className="font-display text-2xl uppercase tracking-wide">
            Set Your Password
          </CardTitle>
          <CardDescription>
            Enter a new password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="pl-10 pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Set Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
