import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50, "First name too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name too long"),
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  phone: z.string().trim().min(8, "Phone number must be at least 8 digits").max(20, "Phone number too long"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100, "Password too long"),
});

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

interface AuthFormProps {
  defaultToSignUp?: boolean;
}

export function AuthForm({ defaultToSignUp = false }: AuthFormProps) {
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(defaultToSignUp);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Check for forgot=true query param to auto-show forgot password form
  useEffect(() => {
    if (searchParams.get("forgot") === "true") {
      setIsForgotPassword(true);
    }
  }, [searchParams]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (!formData.email.trim()) {
      setErrors({ email: "Email is required" });
      return;
    }

    const emailValidation = z.string().email().safeParse(formData.email.trim());
    if (!emailValidation.success) {
      setErrors({ email: "Invalid email address" });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Check your email",
          description: "We've sent you a password reset link.",
        });
        setIsForgotPassword(false);
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!acceptedTerms) {
          setErrors({ terms: "You must accept the terms and conditions" });
          setIsLoading(false);
          return;
        }

        const validation = signUpSchema.safeParse(formData);
        if (!validation.success) {
          const fieldErrors: Record<string, string> = {};
          validation.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setIsLoading(false);
          return;
        }

        const { data: signUpData, error } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              first_name: formData.firstName.trim(),
              last_name: formData.lastName.trim(),
              phone: formData.phone.trim(),
            },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            // Auto-redirect to forgot password with email pre-filled
            setIsForgotPassword(true);
            setIsLoading(false);
            toast({
              title: "You already have an account!",
              description: "Just set your password below to get started.",
            });
            return;
          } else {
            toast({
              title: "Sign up failed",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          // Send welcome email
          if (signUpData.user) {
            supabase.functions.invoke("send-welcome-email", {
              body: {
                user_id: signUpData.user.id,
                email: formData.email.trim(),
                first_name: formData.firstName.trim(),
                last_name: formData.lastName.trim(),
              },
            }).catch((err) => {
              console.error("Failed to send welcome email:", err);
            });
          }
          
          toast({
            title: "Welcome to Birdies!",
            description: "Your account has been created successfully.",
          });
        }
      } else {
        const validation = signInSchema.safeParse(formData);
        if (!validation.success) {
          const fieldErrors: Record<string, string> = {};
          validation.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setIsLoading(false);
          return;
        }

        const email = formData.email.trim();
        const password = formData.password;

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          toast({
            title: "Sign in failed",
            description: "Invalid email or password. Please try again.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password form
  if (isForgotPassword) {
    return (
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="font-display text-3xl text-primary">
            RESET PASSWORD
          </CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-destructive text-sm">{errors.email}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setErrors({});
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ← Back to sign in
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="font-display text-3xl text-primary">
            {isSignUp ? "CREATE ACCOUNT" : "WELCOME BACK"}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? "Join Birdies and start booking bays today"
              : "Sign in to access your account"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          
          <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={errors.firstName ? "border-destructive" : ""}
                  />
                  {errors.firstName && (
                    <p className="text-destructive text-sm">{errors.firstName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Smith"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={errors.lastName ? "border-destructive" : ""}
                  />
                  {errors.lastName && (
                    <p className="text-destructive text-sm">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="0400 000 000"
                  value={formData.phone}
                  onChange={handleChange}
                  inputMode="tel"
                  autoComplete="tel"
                  className={errors.phone ? "border-destructive" : ""}
                />
                {errors.phone && (
                  <p className="text-destructive text-sm">{errors.phone}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              inputMode="email"
              autoComplete={isSignUp ? "email" : "username"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-destructive text-sm">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={errors.password ? "border-destructive" : ""}
            />
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password}</p>
            )}
            {!isSignUp && (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setErrors({});
                }}
                className="text-sm text-accent hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>

          {isSignUp && (
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => {
                    setAcceptedTerms(checked === true);
                    if (errors.terms) {
                      setErrors((prev) => ({ ...prev, terms: "" }));
                    }
                  }}
                  className={errors.terms ? "border-destructive" : ""}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I accept the{" "}
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" className="text-accent hover:underline font-semibold">
                          Terms and Conditions
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle className="font-display text-xl text-primary">
                            Terms and Conditions
                          </DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-[60vh] pr-4">
                          <div className="space-y-4 text-sm text-muted-foreground">
                            <p className="font-semibold text-foreground">
                              Birdies Indoor Golf Centre — Terms and Conditions
                            </p>
                            <p>
                              These Terms and Conditions ("Terms") govern the use of all facilities, equipment, and services provided by Birdies Indoor Golf Centre ("Birdies", "we", "us", or "our"). By signing up for a membership, booking a session, or otherwise accessing the premises, you ("Customer", "you", or "your") agree to be bound by these Terms.
                            </p>

                            <div>
                              <h3 className="font-semibold text-foreground">1. General Use of Facilities</h3>
                              <p>1.1. Birdies provides indoor golf simulation services in a safe, clean, and welcoming environment.</p>
                              <p>1.2. All customers must follow the instructions provided on signage, in-app messages, and/or by staff to ensure safe and appropriate use of the facility.</p>
                              <p>1.3. Customers must not interfere with or modify any equipment or software systems.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">2. Health and Safety</h3>
                              <p>2.1. Customers are fully responsible for their own health and safety while on the premises.</p>
                              <p>2.2. The use of real golf clubs and balls indoors is inherently dangerous.</p>
                              <p>2.3. Birdies takes all reasonable steps to provide a safe playing environment, but it is your responsibility to maintain a safe distance from other players and equipment, particularly when beginners are present.</p>
                              <p>2.4. All use of the facilities is at your own risk.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">3. Damage and Liability</h3>
                              <p>3.1. You are liable for any damage you or your guests cause to any equipment, furniture, or fittings within the Birdies premises.</p>
                              <p>3.2. Intentional or reckless damage may result in repair or replacement costs being invoiced to you.</p>
                              <p>3.3. We reserve the right to recover all associated costs and pursue legal action if necessary.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">4. Alcohol Policy</h3>
                              <p>4.1. Responsible alcohol consumption is mandatory.</p>
                              <p>4.2. Anyone seen abusing alcohol or appearing intoxicated will be removed from the premises immediately and banned permanently.</p>
                              <p>4.3. Alcohol service is only available to those with a valid Gold Bay booking during staffed hours (Fridays to Sundays, 2:00pm – 10:00pm).</p>
                              <p>4.4. The bar is not open to the public, and cannot be accessed without a valid, active booking.</p>
                              <p>4.5. BYO alcohol is strictly prohibited. Any individual caught bringing alcohol onto the premises will face an immediate and permanent ban.</p>
                              <p>4.6. Alcohol may not be consumed or accessed outside of designated staffed hours.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">5. Booking, Access, and Session Rules</h3>
                              <p>5.1. Your door access code will only be valid 10 minutes before your scheduled session.</p>
                              <p>5.2. Early access is not permitted to ensure parking availability and operational flow.</p>
                              <p>5.3. You and your entire group must vacate the premises promptly once your booking ends.</p>
                              <p>5.4. Customers staying beyond their booked time may be issued a warning or banned.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">6. Guest Policy</h3>
                              <p>6.1. Each bay booking allows a maximum of 3 people total (1 member + 2 guests).</p>
                              <p>6.2. This operates on a trust system. Exceeding this limit will result in a warning and may lead to a ban.</p>
                              <p>6.3. Memberships may not be shared. Sharing your membership or access code with another person is strictly prohibited and will result in disciplinary action including bans.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">7. Premises Access Hours</h3>
                              <p>7.1. The facility is only accessible between 5:00am and 11:00pm daily.</p>
                              <p>7.2. Remaining on the premises outside these hours may trigger a security alert and police may be contacted.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">8. Use of Equipment</h3>
                              <p>8.1. Free golf club hire is available on a first-come, first-served basis.</p>
                              <p>8.2. You agree to take care of hired equipment, return it after use, and keep it clean.</p>
                              <p>8.3. Only clean, undamaged golf balls and clubs are to be used.</p>
                              <p>8.4. Any customer using nicked, scuffed, or dirty balls/clubs that cause screen damage will be liable for replacement costs and may be banned.</p>
                              <p>8.5. PCs and simulation equipment may only be used for their intended purpose — golf simulation. Any unauthorized use will result in an immediate and permanent ban.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">9. Children and Supervision</h3>
                              <p>9.1. All minors must be supervised by an adult at all times.</p>
                              <p>9.2. The supervising adult is fully responsible for the safety and conduct of the minor(s).</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">10. Behaviour and Conduct</h3>
                              <p>10.1. Birdies maintains a zero-tolerance policy for abusive, aggressive, or inappropriate behaviour.</p>
                              <p>10.2. We reserve the right to refuse service, terminate memberships, or ban individuals who violate these Terms.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">11. Cancellations and Refunds</h3>
                              <p>11.1. All bookings are non-refundable unless otherwise stated.</p>
                              <p>11.2. Reschedules may be allowed if requested at least 24 hours prior to your booking, subject to availability.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">12. Privacy Policy</h3>
                              <p>12.1. By using Birdies, you agree to our collection and use of personal data as outlined in our Privacy Policy.</p>
                              <p>12.2. Security cameras are in use throughout the facility for safety and monitoring purposes.</p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-foreground">13. Amendments to Terms</h3>
                              <p>13.1. Birdies reserves the right to amend these Terms at any time.</p>
                              <p>13.2. Updated terms will be posted on our website and it is the customer's responsibility to review them periodically.</p>
                            </div>

                            <p className="font-semibold text-foreground pt-4">
                              By signing up to Birdies, you acknowledge that you have read, understood, and agreed to abide by these Terms and Conditions. Failure to comply may result in the suspension or termination of your access to the facility.
                            </p>
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  </label>
                </div>
              </div>
              {errors.terms && (
                <p className="text-destructive text-sm">{errors.terms}</p>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={isLoading}
          >
            {isLoading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrors({});
              setAcceptedTerms(false);
            }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}