import { useState, useEffect } from "react";
import { format } from "date-fns";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  FileText,
  BarChart3,
  Plus,
  Eye,
  Mail,
  Users,
  Clock,
  MousePointer,
  Loader2,
  Search,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  recipient_count: number;
  sent_at: string | null;
  status: string;
  opens: number;
  clicks: number;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  category: string;
}

interface CustomerFilter {
  membership_tier?: string;
  booking_count?: string;
}

const MEMBERSHIP_OPTIONS = [
  { value: "all", label: "All Customers" },
  { value: "visitor", label: "Visitor" },
  { value: "weekday", label: "Weekday" },
  { value: "birdie", label: "Birdie" },
  { value: "eagle", label: "Eagle" },
];

const BOOKING_OPTIONS = [
  { value: "all", label: "Any Booking Count" },
  { value: "0", label: "0 Bookings" },
  { value: "1-5", label: "1-5 Bookings" },
  { value: "6-10", label: "6-10 Bookings" },
  { value: "10+", label: "10+ Bookings" },
];

const SEGMENT_OPTIONS = [
  { value: "all", label: "All Customers" },
  { value: "hub_launch_missed", label: "Hub Launch Missed (622)" },
  { value: "none", label: "No Segment Only" },
];

export default function AdminMarketing() {
  const { isLoading: authLoading, isAdmin } = useAdminAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignHtml, setCampaignHtml] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [recipientCount, setRecipientCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isCountingRecipients, setIsCountingRecipients] = useState(false);
  
  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    if (isAdmin) {
      fetchCampaigns();
      fetchTemplates();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (composerOpen) {
      countRecipients();
    }
  }, [membershipFilter, bookingFilter, segmentFilter, composerOpen]);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setCampaigns(data);
    }
    setIsLoading(false);
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("marketing_templates")
      .select("*")
      .eq("is_active", true)
      .order("name");
    
    if (!error && data) {
      setTemplates(data);
    }
  };

  const countRecipients = async () => {
    setIsCountingRecipients(true);
    
    let query = supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("marketing_opt_out", false);
    
    if (membershipFilter !== "all") {
      query = query.eq("membership_tier", membershipFilter as "visitor" | "weekday" | "birdie" | "eagle");
    }

    // Apply segment filter
    if (segmentFilter === "hub_launch_missed") {
      query = query.eq("custom_segment", "hub_launch_missed");
    } else if (segmentFilter === "none") {
      query = query.is("custom_segment", null);
    }
    
    const { count, error } = await query;
    
    if (!error) {
      setRecipientCount(count || 0);
    }
    
    setIsCountingRecipients(false);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCampaignSubject(template.subject);
      setCampaignHtml(template.html_content);
    }
  };

  const openComposer = (template?: Template) => {
    setCampaignName("");
    setCampaignSubject(template?.subject || "");
    setCampaignHtml(template?.html_content || "");
    setSelectedTemplateId(template?.id || "");
    setMembershipFilter("all");
    setBookingFilter("all");
    setSegmentFilter("all");
    setComposerOpen(true);
  };

  const handlePreview = () => {
    setPreviewHtml(campaignHtml);
    setPreviewOpen(true);
  };

  const handleSendCampaign = async () => {
    if (!campaignName || !campaignSubject || !campaignHtml) {
      toast({
        title: "Missing information",
        description: "Please fill in campaign name, subject, and content.",
        variant: "destructive",
      });
      return;
    }

    if (recipientCount === 0) {
      toast({
        title: "No recipients",
        description: "No customers match your filter criteria.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      // Build filter for storing
      const recipientFilter: Record<string, string> = {};
      if (membershipFilter !== "all") {
        recipientFilter.membership_tier = membershipFilter;
      }
      if (bookingFilter !== "all") {
        recipientFilter.booking_count = bookingFilter;
      }

      // Create campaign record
      const { data: campaign, error: campaignError } = await supabase
        .from("marketing_campaigns")
        .insert([{
          name: campaignName,
          subject: campaignSubject,
          html_content: campaignHtml,
          recipient_filter: recipientFilter,
          recipient_count: recipientCount,
          status: "sending",
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Get recipients
      let recipientQuery = supabase
        .from("profiles")
        .select("email, first_name, last_name")
        .eq("marketing_opt_out", false);
      
      if (membershipFilter !== "all") {
        recipientQuery = recipientQuery.eq("membership_tier", membershipFilter as "visitor" | "weekday" | "birdie" | "eagle");
      }

      // Apply segment filter
      if (segmentFilter === "hub_launch_missed") {
        recipientQuery = recipientQuery.eq("custom_segment", "hub_launch_missed");
      } else if (segmentFilter === "none") {
        recipientQuery = recipientQuery.is("custom_segment", null);
      }

      const { data: recipients, error: recipientError } = await recipientQuery;
      
      if (recipientError) throw recipientError;

      // Send emails via edge function
      const { error: sendError } = await supabase.functions.invoke("send-marketing-email", {
        body: {
          campaign_id: campaign.id,
          subject: campaignSubject,
          html_content: campaignHtml,
          recipients: recipients,
        },
      });

      if (sendError) throw sendError;

      // Update campaign status
      await supabase
        .from("marketing_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      toast({
        title: "Campaign sent!",
        description: `Email sent to ${recipientCount} recipients.`,
      });

      setComposerOpen(false);
      fetchCampaigns();
    } catch (error: any) {
      console.error("Error sending campaign:", error);
      toast({
        title: "Error sending campaign",
        description: error.message || "Failed to send campaign.",
        variant: "destructive",
      });
    }

    setIsSending(false);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "onboarding": return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
      case "retention": return "bg-amber-500/10 text-amber-600 border-amber-200";
      case "promotion": return "bg-rose-500/10 text-rose-600 border-rose-200";
      case "newsletter": return "bg-blue-500/10 text-blue-600 border-blue-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent": return "bg-emerald-500/10 text-emerald-600";
      case "sending": return "bg-amber-500/10 text-amber-600";
      case "draft": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p className="text-destructive">Access denied. Admin privileges required.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-foreground">
              Marketing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Email campaigns and templates
            </p>
          </div>
          <Button onClick={() => openComposer()} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No campaigns yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first email campaign to reach your customers.
                  </p>
                  <Button onClick={() => openComposer()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-foreground">{campaign.name}</h3>
                            <Badge className={getStatusColor(campaign.status)}>
                              {campaign.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewHtml(campaign.html_content);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span>{campaign.recipient_count} recipients</span>
                        </div>
                        {campaign.sent_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{format(new Date(campaign.sent_at), "MMM d, yyyy 'at' h:mm a")}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-4 w-4" />
                          <span>{campaign.opens} opens</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Card key={template.id} className="cursor-pointer hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <Badge className={getCategoryColor(template.category)}>
                        {template.category}
                      </Badge>
                    </div>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-3">
                      Subject: {template.subject}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewHtml(template.html_content);
                          setPreviewOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openComposer(template)}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Use Template
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Composer Dialog */}
        <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Create Campaign
              </DialogTitle>
              <DialogDescription>
                Compose and send an email campaign to your customers.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {/* Campaign Name */}
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. December Newsletter"
                />
              </div>

              {/* Template Selection */}
              <div className="space-y-2">
                <Label>Start from Template (optional)</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label>Email Subject</Label>
                <Input
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  placeholder="Enter email subject line..."
                />
              </div>

              {/* HTML Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Content (HTML)</Label>
                  <Button variant="ghost" size="sm" onClick={handlePreview}>
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                </div>
                <Textarea
                  value={campaignHtml}
                  onChange={(e) => setCampaignHtml(e.target.value)}
                  placeholder="Paste your HTML email content here..."
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{first_name}"}, {"{last_name}"}, {"{email}"} for personalization.
                </p>
              </div>

              {/* Recipient Filters */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <Label className="text-base font-medium">Recipients</Label>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Custom Segment</Label>
                    <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEGMENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Membership Tier</Label>
                    <Select value={membershipFilter} onValueChange={setMembershipFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBERSHIP_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Booking Count</Label>
                    <Select value={bookingFilter} onValueChange={setBookingFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BOOKING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {isCountingRecipients ? (
                    <span className="text-muted-foreground">Counting...</span>
                  ) : (
                    <span className="font-medium">{recipientCount} recipients</span>
                  )}
                  <span className="text-muted-foreground">will receive this email</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setComposerOpen(false)}
                  disabled={isSending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleSendCampaign}
                  disabled={isSending || recipientCount === 0}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Campaign
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <div className="border rounded-lg overflow-hidden bg-white">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[500px] border-0"
                title="Email Preview"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}