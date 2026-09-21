import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Never leave the whole app behind a loader if session recovery stalls on a
    // weak connection. Auth events can still update the session afterwards.
    const loadingTimeout = window.setTimeout(() => {
      if (active) setIsLoading(false);
    }, 8000);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // Handle PASSWORD_RECOVERY event - redirect to reset password page
        if (event === "PASSWORD_RECOVERY") {
          // Set a flag so the reset password page knows this is valid
          sessionStorage.setItem("password_reset_in_progress", "true");
          // Redirect to reset password page
          window.location.href = "/reset-password";
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    isLoading,
    signOut,
    isAuthenticated: !!user,
  };
}