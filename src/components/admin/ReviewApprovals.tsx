import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, Star, CheckCircle, Loader2, Gift } from "lucide-react";

interface ReviewReward {
  id: string;
  user_id: string;
  credit_amount: number;
  credit_issued: boolean;
  approved_at: string;
  notes: string | null;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
    deposit_balance: number;
  };
}

interface CustomerResult {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  deposit_balance: number;
}

export function ReviewApprovals() {
  const { toast } = useToast();
  const [rewards, setRewards] = useState<ReviewReward[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("google_review_rewards")
      .select("*")
      .order("approved_at", { ascending: false });

    if (error) {
      console.error("Error fetching rewards:", error);
      setIsLoading(false);
      return;
    }

    // Fetch profiles for each reward
    const userIds = (data || []).map((r: any) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email, deposit_balance")
      .in("user_id", userIds);

    const profileMap = new Map(
      (profiles || []).map((p: any) => [p.user_id, p])
    );

    const enriched = (data || []).map((r: any) => ({
      ...r,
      profile: profileMap.get(r.user_id),
    }));

    setRewards(enriched);
    setIsLoading(false);
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setIsSearching(true);

    const query = searchQuery.trim().toLowerCase();
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email, deposit_balance")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);

    if (!error && data) {
      // Filter out users who already have a review reward
      const existingUserIds = new Set(rewards.map((r) => r.user_id));
      setSearchResults(
        data.filter((c: any) => !existingUserIds.has(c.user_id))
      );
    }
    setIsSearching(false);
  };

  const handleApprove = async (customer: CustomerResult) => {
    setProcessingId(customer.user_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert review reward record
      const { error: rewardError } = await supabase
        .from("google_review_rewards")
        .insert({
          user_id: customer.user_id,
          approved_by: user?.id,
          credit_amount: 15,
          credit_issued: true,
          notes: `Review approved by admin`,
        });

      if (rewardError) throw rewardError;

      // Issue $15 credit to deposit balance
      const newBalance = customer.deposit_balance + 15;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", customer.user_id);

      if (balanceError) throw balanceError;

      // Log the deposit transaction
      const { error: txError } = await supabase
        .from("deposit_transactions")
        .insert({
          user_id: customer.user_id,
          amount: 15,
          balance_before: customer.deposit_balance,
          balance_after: newBalance,
          transaction_type: "google_review_reward",
          description: "Google Review reward - $15 credit",
          created_by: user?.id,
        });

      if (txError) console.error("Failed to log deposit transaction:", txError);

      toast({
        title: "Review approved",
        description: `$15 credit issued to ${customer.first_name} ${customer.last_name}. New balance: $${newBalance.toFixed(2)}`,
      });

      setSearchResults((prev) => prev.filter((c) => c.user_id !== customer.user_id));
      fetchRewards();
    } catch (error: any) {
      console.error("Error approving review:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve review",
        variant: "destructive",
      });
    }
    setProcessingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Search and approve */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-accent" />
            <h3 className="font-medium text-foreground">Approve a Google Review</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Search for a customer who left a Google review to issue their $15 credit reward.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isSearching || searchQuery.trim().length < 2}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3">
              {searchResults.map((customer) => (
                <div key={customer.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm text-foreground">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{customer.email}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        disabled={processingId === customer.user_id}
                      >
                        {processingId === customer.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Gift className="h-4 w-4 mr-1" />
                        )}
                        Approve & Credit $15
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Approve Google Review</AlertDialogTitle>
                        <AlertDialogDescription>
                          Issue $15 credit to <strong>{customer.first_name} {customer.last_name}</strong> ({customer.email}) for their Google review?
                          Their current balance is ${customer.deposit_balance.toFixed(2)}.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleApprove(customer)}>
                          Approve & Issue Credit
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approved list */}
      <div>
        <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-primary" />
          Approved Reviews ({rewards.length})
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews approved yet.</p>
        ) : (
          <div className="space-y-2">
            {rewards.map((reward) => (
              <div
                key={reward.id}
                className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reward.profile
                      ? `${reward.profile.first_name} ${reward.profile.last_name}`
                      : "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reward.profile?.email || reward.user_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                    ${reward.credit_amount} credited
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(reward.approved_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
