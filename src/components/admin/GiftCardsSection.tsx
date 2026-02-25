import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Gift, Send, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";

interface GiftCard {
  id: string;
  recipient_email: string;
  amount: number;
  status: string;
  token: string;
  issued_at: string;
  redeemed_at: string | null;
}

export function GiftCardsSection() {
  const { toast } = useToast();
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIssuing, setIsIssuing] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  
  // Form state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    fetchGiftCards();
  }, []);

  const fetchGiftCards = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("gift_cards")
      .select("*")
      .order("issued_at", { ascending: false });

    if (!error && data) {
      setGiftCards(data);
    }
    setIsLoading(false);
  };

  const issueGiftCard = async () => {
    if (!recipientEmail || !amount) {
      toast({
        title: "Missing information",
        description: "Please enter recipient email and amount.",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid positive amount.",
        variant: "destructive",
      });
      return;
    }

    setIsIssuing(true);

    try {
      // Check if recipient already has an account
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, deposit_balance")
        .eq("email", recipientEmail.toLowerCase().trim())
        .maybeSingle();

      if (existingProfile) {
        // User exists - add credit directly
        const balanceBefore = existingProfile.deposit_balance || 0;
        const newBalance = balanceBefore + amountNum;
        
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ deposit_balance: newBalance })
          .eq("id", existingProfile.id);

        if (updateError) throw updateError;

        // Log the transaction
        await supabase.from("deposit_transactions").insert({
          user_id: existingProfile.user_id,
          amount: amountNum,
          balance_before: balanceBefore,
          balance_after: newBalance,
          transaction_type: "gift_card",
          description: `Gift card credit - auto-redeemed for existing account`,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        });

        // Create gift card record as redeemed
        const { error: giftCardError } = await supabase
          .from("gift_cards")
          .insert({
            recipient_email: recipientEmail.toLowerCase().trim(),
            amount: amountNum,
            status: "redeemed",
            redeemed_at: new Date().toISOString(),
            redeemed_by_user_id: existingProfile.user_id,
          });

        if (giftCardError) throw giftCardError;

        // Send notification to existing user
        try {
          await supabase.functions.invoke("send-deposit-notification", {
            body: {
              user_id: existingProfile.user_id,
              amount: amountNum,
              new_balance: newBalance,
              is_gift_card: true,
            },
          });
        } catch (notifyError) {
          console.error("Failed to send notification:", notifyError);
        }

        toast({
          title: "Credit added",
          description: `$${amountNum.toFixed(2)} added to existing account for ${recipientEmail}.`,
        });
      } else {
        // New user - create pending gift card and send email
        const { data: newGiftCard, error: insertError } = await supabase
          .from("gift_cards")
          .insert({
            recipient_email: recipientEmail.toLowerCase().trim(),
            amount: amountNum,
            status: "pending",
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Send gift card email via edge function
        try {
          const { error: emailError } = await supabase.functions.invoke("issue-gift-card", {
            body: {
              gift_card_id: newGiftCard.id,
              recipient_email: recipientEmail.toLowerCase().trim(),
              amount: amountNum,
            },
          });

          if (emailError) throw emailError;

          // Update status to sent
          await supabase
            .from("gift_cards")
            .update({ status: "sent" })
            .eq("id", newGiftCard.id);
        } catch (emailError) {
          console.error("Failed to send gift card email:", emailError);
          toast({
            title: "Gift card created",
            description: "Card created but email failed to send. You may need to resend.",
            variant: "destructive",
          });
        }

        toast({
          title: "Gift card issued",
          description: `$${amountNum.toFixed(2)} gift card sent to ${recipientEmail}.`,
        });
      }

      // Reset form and refresh
      setRecipientEmail("");
      setAmount("");
      setShowIssueDialog(false);
      fetchGiftCards();
    } catch (error: any) {
      console.error("Error issuing gift card:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to issue gift card.",
        variant: "destructive",
      });
    }

    setIsIssuing(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "redeemed":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Redeemed
          </Badge>
        );
      case "sent":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">
            <Send className="h-3 w-3 mr-1" />
            Sent
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const totalIssued = giftCards.reduce((sum, gc) => sum + Number(gc.amount), 0);
  const totalRedeemed = giftCards
    .filter((gc) => gc.status === "redeemed")
    .reduce((sum, gc) => sum + Number(gc.amount), 0);
  const pendingCards = giftCards.filter((gc) => gc.status === "sent" || gc.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Issue Button & Dialog */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Issued Gift Cards</h2>
        <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
          <DialogTrigger asChild>
            <Button>
              <Gift className="h-4 w-4 mr-2" />
              Issue Gift Card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Gift Card</DialogTitle>
              <DialogDescription>
                Send credit to a customer. If they already have an account, the credit will be added automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="recipient-email">Recipient Email</Label>
                <Input
                  id="recipient-email"
                  type="email"
                  placeholder="customer@example.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={issueGiftCard} 
                disabled={isIssuing}
              >
                {isIssuing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Issue Gift Card
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Gift Cards Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Recipient</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Redeemed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading gift cards...
                </TableCell>
              </TableRow>
            ) : giftCards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No gift cards issued yet
                </TableCell>
              </TableRow>
            ) : (
              giftCards.map((gc) => (
                <TableRow key={gc.id}>
                  <TableCell className="font-medium">{gc.recipient_email}</TableCell>
                  <TableCell>${Number(gc.amount).toFixed(2)}</TableCell>
                  <TableCell>{getStatusBadge(gc.status)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(gc.issued_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {gc.redeemed_at ? format(new Date(gc.redeemed_at), "MMM d, yyyy") : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
