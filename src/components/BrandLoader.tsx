import birdiesAppIcon from "@/assets/birdies-app-icon.png";
import { cn } from "@/lib/utils";

interface BrandLoaderProps {
  className?: string;
  size?: number;
  fullScreen?: boolean;
}

/**
 * Animated brand loader — the "B" icon breathing/bobbing with a soft glow.
 * Replaces textual "Loading..." indicators.
 */
export const BrandLoader = ({ className, size = 64, fullScreen = false }: BrandLoaderProps) => {
  const mark = (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-brand-glow"
      />
      <img
        src={birdiesAppIcon}
        alt="Loading"
        className="relative w-full h-full object-contain animate-brand-bob"
        style={{ filter: "drop-shadow(0 6px 14px hsl(var(--primary) / 0.25))" }}
      />
    </div>
  );

  if (!fullScreen) return mark;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">{mark}</div>
  );
};

export default BrandLoader;
