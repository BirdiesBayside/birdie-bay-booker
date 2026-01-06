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
import { Fingerprint } from "lucide-react";

interface BiometricPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  biometryName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BiometricPrompt({
  open,
  onOpenChange,
  biometryName,
  onConfirm,
  onCancel,
}: BiometricPromptProps) {
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
            Enable {biometryName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Sign in faster next time using {biometryName}. Your credentials will
            be stored securely on your device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onCancel} className="sm:flex-1">
            Not Now
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-accent text-accent-foreground hover:bg-accent/90 sm:flex-1"
          >
            Enable {biometryName}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
