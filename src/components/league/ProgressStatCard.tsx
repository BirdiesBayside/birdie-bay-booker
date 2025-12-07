import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Info } from "lucide-react";

interface ProgressStatCardProps {
  value: string | number;
  label: string;
  subValue?: string;
  explanation: string;
  className?: string;
  valueClassName?: string;
  icon?: React.ReactNode;
  variant?: "default" | "compact";
}

export function ProgressStatCard({
  value,
  label,
  subValue,
  explanation,
  className = "",
  valueClassName = "text-foreground",
  icon,
  variant = "default",
}: ProgressStatCardProps) {
  const [open, setOpen] = useState(false);

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`rounded-lg p-4 text-center transition-all hover:scale-105 hover:shadow-md cursor-pointer ${className}`}
        >
          <p className={`font-anton text-2xl ${valueClassName}`}>{value}</p>
          <p className="text-xs font-inter text-muted-foreground">{label}</p>
          {subValue && (
            <p className="text-xs font-inter font-medium mt-1">{subValue}</p>
          )}
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-anton text-xl flex items-center gap-2">
                {label}
              </DialogTitle>
              <DialogDescription className="font-inter text-base pt-2">
                {explanation}
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className={`font-anton text-4xl ${valueClassName}`}>{value}</p>
              {subValue && (
                <p className="text-sm font-inter text-muted-foreground mt-1">{subValue}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-xl p-4 text-left transition-all hover:shadow-md cursor-pointer flex items-center gap-4 ${className}`}
      >
        {icon}
        <div>
          <p className={`font-anton text-2xl ${valueClassName}`}>{value}</p>
          <p className="text-sm font-inter text-muted-foreground">{label}</p>
        </div>
        <Info className="h-4 w-4 text-muted-foreground ml-auto" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-anton text-xl flex items-center gap-2">
              {icon}
              {label}
            </DialogTitle>
            <DialogDescription className="font-inter text-base pt-2">
              {explanation}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className={`font-anton text-4xl ${valueClassName}`}>{value}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
