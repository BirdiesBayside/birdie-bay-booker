import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint, Loader2 } from "lucide-react";

interface BiometricEnableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  biometryName: string;
  email: string;
  onEnable: (password: string) => Promise<void>;
}

export function BiometricEnableDialog({
  open,
  onOpenChange,
  biometryName,
  email,
  onEnable,
}: BiometricEnableDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const emailLabel = useMemo(() => email || "your account", [email]);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setIsSaving(false);
    }
  }, [open]);

  const handleEnable = async () => {
    if (!password) {
      setError("Password is required");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onEnable(password);
      onOpenChange(false);
    } catch {
      setError(`Couldn't enable ${biometryName}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
              <Fingerprint className="h-8 w-8 text-accent" />
            </div>
          </div>
          <AlertDialogTitle className="text-center">
            Enable {biometryName} login
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Enter your password once to securely store a sign-in for {emailLabel} on
            this device.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="biometric-password">Password</Label>
          <Input
            id="biometric-password"
            name="biometricPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel disabled={isSaving} className="sm:flex-1">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-accent text-accent-foreground hover:bg-accent/90 sm:flex-1"
            onClick={(e) => {
              // Keep dialog open while saving
              e.preventDefault();
              handleEnable();
            }}
            disabled={isSaving}
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enabling...
              </span>
            ) : (
              `Enable ${biometryName}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
