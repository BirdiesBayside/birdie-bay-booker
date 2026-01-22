import { useEffect } from "react";

export default function BirdiesGuide() {
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  return (
    <iframe
      src="/birdies-guide.html"
      className="w-full h-screen border-0"
      title="How to Use Birdies Guide"
    />
  );
}
