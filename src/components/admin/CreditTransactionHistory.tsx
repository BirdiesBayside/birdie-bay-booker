import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ArrowUpCircle, ArrowDownCircle, History } from "lucide-react";

interface Transaction {
  id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

export function CreditTransactionHistory({ userId }: { userId: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("deposit_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      setTransactions(data || []);
      setIsLoading(false);
    };
    fetch();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        Loading history...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <History className="h-3 w-3" />
        <span>No credit transaction history yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <History className="h-3 w-3" />
        Credit History
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2 bg-muted/30">
        {transactions.map((tx) => {
          const isCredit = tx.amount > 0;
          return (
            <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0 border-border/50">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isCredit ? (
                  <ArrowUpCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : (
                  <ArrowDownCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                )}
                <span className="truncate text-muted-foreground">
                  {tx.description || tx.transaction_type}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={isCredit ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                  {isCredit ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                </span>
                <span className="text-muted-foreground w-16 text-right">
                  {format(new Date(tx.created_at), "MMM d")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
