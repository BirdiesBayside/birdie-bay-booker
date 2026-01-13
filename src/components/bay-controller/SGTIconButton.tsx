import { useState } from "react";
import sgtIcon from "@/assets/sgt-icon.png";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { X } from "lucide-react";

interface SGTIconButtonProps {
  onClick: () => void;
  onClose: () => void;
  isVisible: boolean;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export function SGTIconButton({
  onClick,
  onClose,
  isVisible,
  position,
}: SGTIconButtonProps) {
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  if (!isVisible) return null;

  const positionClasses = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCloseConfirm(true);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`fixed z-40 ${positionClasses[position]} group cursor-pointer`}
            >
              {/* Close button - appears on hover */}
              <button
                onClick={handleCloseClick}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:scale-110"
                title="Close SGT icon"
              >
                <X className="w-3 h-3" />
              </button>

              {/* SGT Icon Button */}
              <button
                onClick={onClick}
                className="w-14 h-14 rounded-full overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-105 border-2 border-primary/30 hover:border-primary bg-background"
              >
                <img
                  src={sgtIcon}
                  alt="SGT"
                  className="w-full h-full object-cover"
                />
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>View SGT Player Info</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Close Confirmation Dialog */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide SGT Icon?</AlertDialogTitle>
            <AlertDialogDescription>
              The SGT icon will be hidden until a new booking with an SGT-linked
              account starts.
              <br />
              <br />
              <span className="font-medium text-foreground">
                💡 Tip: If you want to play your SGT tour round, press F7 to
                open the SGT info window anytime.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Showing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Hide Icon</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
