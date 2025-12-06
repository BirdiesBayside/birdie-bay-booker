import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Crown, CreditCard, Lock, User, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import birdiesLogo from "@/assets/birdies-logo.png";

const MEMBERSHIP_DETAILS: Record<string, { name: string; color: string; rate: number }> = {
  visitor: { name: "Visitor", color: "bg-muted text-muted-foreground", rate: 30 },
  par: { name: "Par Member", color: "bg-emerald-100 text-emerald-800", rate: 12 },
  birdie: { name: "Birdie Member", color: "bg-blue-100 text-blue-800", rate: 10 },
  eagle: { name: "Eagle Member", color: "bg-purple-100 text-purple-800", rate: 9 },
  albatross: { name: "Albatross Member", color: "bg-amber-100 text-amber-800", rate: 8 },
};

interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
}

const MyAccount = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone, membership_tier")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;

    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
    } catch (error) {
      console.error("Error sending reset email:", error);
      toast.error("Failed to send reset email");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const membershipInfo = profile?.membership_tier 
    ? MEMBERSHIP_DETAILS[profile.membership_tier] 
    : MEMBERSHIP_DETAILS.visitor;

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
      <header className="bg-primary py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-display text-2xl tracking-wide text-primary-foreground">
            MY ACCOUNT
          </span>
        </div>
        <img 
          src={birdiesLogo} 
          alt="Birdies" 
          className="h-10 w-auto"
        />
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-2xl mx-auto space-y-6">
          {/* Membership Tier */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Crown className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Membership</CardTitle>
                  <CardDescription>Your current membership tier and benefits</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <Badge className={`${membershipInfo.color} text-sm px-3 py-1`}>
                    {membershipInfo.name}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    Your hourly rate: <span className="font-semibold text-foreground">${membershipInfo.rate}/hour</span>
                  </p>
                </div>
                <Button variant="outline" disabled>
                  Upgrade Membership
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profile Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Your personal details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profile?.first_name || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profile?.last_name || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={profile?.email || user?.email || ""}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profile?.phone || "Not provided"}
                  disabled
                  className="bg-muted"
                />
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>Manage your saved payment methods</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">No payment methods saved</p>
                <Button variant="outline" disabled>
                  Add Payment Method
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>Manage your password and security settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="font-medium">Password</p>
                  <p className="text-sm text-muted-foreground">
                    Send a password reset link to your email
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handlePasswordReset}
                  disabled={isResettingPassword}
                >
                  {isResettingPassword ? "Sending..." : "Reset Password"}
                </Button>
              </div>
            </CardContent>
          </Card>
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

export default MyAccount;