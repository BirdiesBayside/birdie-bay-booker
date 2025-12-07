import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Info } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

interface CustomerForEmail {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function AdminBulkEmail() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  
  const customers = (location.state?.customers || []) as CustomerForEmail[];
  
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  const sendEmails = async () => {
    if (!subject.trim()) {
      toast({
        title: "Missing subject",
        description: "Please enter an email subject.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    if (!htmlContent.trim()) {
      toast({
        title: "Missing content",
        description: "Please enter email HTML content.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSending(true);

    let successCount = 0;
    let failCount = 0;

    for (const customer of customers) {
      try {
        // Replace template tags
        const personalizedHtml = htmlContent
          .replace(/\{first_name\}/gi, customer.first_name || "")
          .replace(/\{last_name\}/gi, customer.last_name || "")
          .replace(/\{email\}/gi, customer.email || "")
          .replace(/\{full_name\}/gi, `${customer.first_name || ""} ${customer.last_name || ""}`.trim());

        const personalizedSubject = subject
          .replace(/\{first_name\}/gi, customer.first_name || "")
          .replace(/\{last_name\}/gi, customer.last_name || "")
          .replace(/\{email\}/gi, customer.email || "")
          .replace(/\{full_name\}/gi, `${customer.first_name || ""} ${customer.last_name || ""}`.trim());

        const { error } = await supabase.functions.invoke("send-bulk-email", {
          body: {
            to: customer.email,
            subject: personalizedSubject,
            html: personalizedHtml,
          },
        });

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error(`Failed to send email to ${customer.email}:`, error);
        failCount++;
      }
    }

    setIsSending(false);

    if (failCount === 0) {
      toast({
        title: "Emails sent",
        description: `Successfully sent ${successCount} email${successCount !== 1 ? "s" : ""}.`,
        duration: 4000,
      });
      navigate("/admin/customers");
    } else {
      toast({
        title: "Some emails failed",
        description: `Sent ${successCount}, failed ${failCount}.`,
        variant: "destructive",
        duration: 4000,
      });
    }
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[600px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  if (customers.length === 0) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Button variant="ghost" onClick={() => navigate("/admin/customers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>
          <div className="text-center py-12 text-muted-foreground">
            No customers selected. Please select customers from the Customers page.
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/customers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Send Email
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Sending to {customers.length} customer{customers.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Template Tags Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Available Template Tags</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="text-sm">Use these tags in your subject or content to personalize emails:</p>
            <ul className="mt-2 text-sm space-y-1 font-mono">
              <li><code className="bg-muted px-1 rounded">{"{first_name}"}</code> - Customer's first name</li>
              <li><code className="bg-muted px-1 rounded">{"{last_name}"}</code> - Customer's last name</li>
              <li><code className="bg-muted px-1 rounded">{"{full_name}"}</code> - Customer's full name</li>
              <li><code className="bg-muted px-1 rounded">{"{email}"}</code> - Customer's email address</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Recipients Preview */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <Label className="text-sm font-medium">Recipients</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {customers.slice(0, 10).map((c) => (
              <span key={c.id} className="text-xs bg-background px-2 py-1 rounded border">
                {c.first_name} {c.last_name}
              </span>
            ))}
            {customers.length > 10 && (
              <span className="text-xs text-muted-foreground px-2 py-1">
                +{customers.length - 10} more
              </span>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Hi {first_name}, check out our latest offer!"
            />
          </div>

          <div className="space-y-2">
            <Label>HTML Content *</Label>
            <Textarea
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              placeholder="Paste your HTML email content here..."
              rows={15}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/customers")}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              onClick={sendEmails}
              disabled={isSending}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? "Sending..." : `Send to ${customers.length} Customer${customers.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
