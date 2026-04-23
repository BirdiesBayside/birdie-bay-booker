import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Check, AlertCircle, Loader2, Mail } from "lucide-react";
import birdieLogo from "@/assets/birdies-logo.png";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  const [resetEmail, setResetEmail] = useState("");
  const [isRequestingLink, setIsRequestingLink] = useState(false);
  const [linkRequested, setLinkRequested] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const finishValidation = (isValid: boolean, message?: string | null) => {
      if (!isMounted) return;
      setIsValidSession(isValid);
      setErrorMessage(isValid ? null : message || "Invalid or expired reset link. Please request a new password reset.");
      setIsValidating(false);
    };

    const handleTokenExchange = async () => {
      setIsValidating(true);
      setErrorMessage(null);

      try {
        const hash = window.location.hash;
        const search = window.location.search;
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const queryParams = new URLSearchParams(search);

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const tokenHash = queryParams.get("token_hash") || hashParams.get("token_hash");
        const type = hashParams.get("type") || queryParams.get("type");
        const errorParam = hashParams.get("error") || queryParams.get("error");
        const errorDescription = hashParams.get("error_description") || queryParams.get("error_description");

        console.log("[RESET] Page loaded. Full URL:", window.location.href);
        console.log("[RESET] Recovery params:", {
          type,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasTokenHash: !!tokenHash,
          hasError: !!errorParam,
        });

        if (errorParam) {
          console.log("[RESET] Recovery error detected:", errorParam, errorDescription);
          finishValidation(false, errorDescription || "Invalid or expired link");
          return;
        }

        if (accessToken && refreshToken && type === "recovery") {
          console.log("[RESET] Found recovery tokens in URL hash, setting session...");

          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error("[RESET] Session error:", error.message, error);
            finishValidation(false, "Invalid or expired reset link. Please request a new one.");
            return;
          }

          console.log("[RESET] Session set successfully for:", data?.session?.user?.email);
          window.history.replaceState(null, "", window.location.pathname);
          sessionStorage.setItem("password_reset_in_progress", "true");
          finishValidation(true);
          return;
        }

        if (tokenHash && type === "recovery") {
          console.log("[RESET] Found recovery token hash in URL, verifying OTP...");

          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) {
            console.error("[RESET] Token hash verification error:", error.message, error);
            finishValidation(false, "Invalid or expired reset link. Please request a new one.");
            return;
          }

          console.log("[RESET] Token hash verified for:", data?.user?.email);
          window.history.replaceState(null, "", window.location.pathname);
          sessionStorage.setItem("password_reset_in_progress", "true");
          finishValidation(true);
          return;
        }

        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (existingSession) {
          console.log("[RESET] Existing session detected on reset page for:", existingSession.user?.email);
          sessionStorage.setItem("password_reset_in_progress", "true");
          finishValidation(true);
          return;
        }

        const authStateChange = supabase.auth.onAuthStateChange((event, session) => {
          console.log("[RESET] Auth event during reset:", event, "hasSession:", !!session);

          if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
            sessionStorage.setItem("password_reset_in_progress", "true");
            finishValidation(true);
          }
        });

        subscription = authStateChange.data.subscription;

        await new Promise((resolve) => setTimeout(resolve, 1200));

        const { data: { session: finalSession } } = await supabase.auth.getSession();

        if (finalSession) {
          console.log("[RESET] Session became available after auth event for:", finalSession.user?.email);
          sessionStorage.setItem("password_reset_in_progress", "true");
          finishValidation(true);
          return;
        }

        finishValidation(false, "Invalid or expired reset link. Please request a new password reset.");
      } catch (error: any) {
        console.error("[RESET] Token exchange error:", error);
        finishValidation(false, "An error occurred. Please try again.");
      }
    };

    handleTokenExchange();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
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

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }

    setIsRequestingLink(true);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset link");
      }

      setLinkRequested(true);
      toast.success("Password reset link sent! Check your email.");
    } catch (error: any) {
      console.error("Request new link error:", error);
      toast.error(error.message || "Failed to send reset link");
    } finally {
      setIsRequestingLink(false);
    }
  };

  // Error state with request new link option
  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={birdieLogo} alt="Birdies" className="h-12 mx-auto mb-4" />
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="font-display text-xl uppercase tracking-wide">
              {linkRequested ? "Check Your Email" : "Link Expired"}
            </CardTitle>
            <CardDescription>
              {linkRequested 
                ? "We've sent you a new password reset link. Please check your inbox."
                : errorMessage
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkRequested ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setLinkRequested(false)}
                  className="w-full"
                >
                  Request Another Link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestNewLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="resetEmail"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isRequestingLink}>
                  {isRequestingLink ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Request New Link"
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate("/")}
                >
                  Back to Login
                </Button>
              </form>
            )}
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
