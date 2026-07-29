import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, Copy, RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competition: { id: string; name: string } | null;
}

export function CompCommentaryDialog({ open, onOpenChange, competition }: Props) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");

  const generate = async () => {
    if (!competition) return;
    setLoading(true);
    setText("");
    try {
      const { data, error } = await supabase.functions.invoke("local-comp-commentary", {
        body: { competition_id: competition.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setText((data as any).commentary || "");
    } catch (e: any) {
      toast({
        title: "Couldn't generate recap",
        description: e.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && competition) generate();
    if (!open) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, competition?.id]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Recap copied to clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Weekly Ambrose Recap</DialogTitle>
          <DialogDescription>
            {competition?.name} — a social-ready wrap built from the team leaderboard and handicaps.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Writing the wrap…
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="resize-none text-sm leading-relaxed"
            placeholder="No recap yet."
          />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={generate} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
          <Button onClick={copy} disabled={loading || !text}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
