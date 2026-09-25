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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Info,
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
  Pencil,
  Zap,
  Star,
  MessageSquare,
  Frown,
  Meh,
  Smile,
  ClipboardList,
  Trophy,
  ChevronDown,
  Download,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReviewApprovals } from "@/components/admin/ReviewApprovals";
import { MarketingSegments } from "@/components/admin/MarketingSegments";
import {
  DEFAULT_EMAIL_FOOTER_HTML,
  DEFAULT_EMAIL_HEADER_HTML,
  injectPreviewUnsubscribe,
} from "@/lib/email-preview";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseExcludedEmails = (value: string) =>
  new Set(
    value
      .split(/[\n,]+/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => EMAIL_PATTERN.test(email)),
  );

const buildMarketingPreview = (bodyHtml: string, headerHtml: string, footerHtml: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Birdies Email Preview</title>
  <style>@import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");</style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
        ${headerHtml}
        <tr>
          <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
            <div style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        ${injectPreviewUnsubscribe(footerHtml, "#")}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
  const [membershipTiers, setMembershipTiers] = useState<string[]>([]);
  const [bookingFilter, setBookingFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [recipientCount, setRecipientCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isCountingRecipients, setIsCountingRecipients] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<{ email: string; first_name: string | null; last_name: string | null }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<{ email: string; first_name: string | null; last_name: string | null }[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [excludedEmailsInput, setExcludedEmailsInput] = useState("");
  const [savedSegments, setSavedSegments] = useState<{ id: string; name: string; emails: any }[]>([]);
  const [segmentName, setSegmentName] = useState("");
  const [isSavingSegment, setIsSavingSegment] = useState(false);

  
  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [emailLayout, setEmailLayout] = useState({
    header: DEFAULT_EMAIL_HEADER_HTML,
    footer: DEFAULT_EMAIL_FOOTER_HTML,
  });

  // Template editor state
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editHtml, setEditHtml] = useState("");
  
  // First session promo counter
  const [promoEligibleCount, setPromoEligibleCount] = useState<number | null>(null);
  const PROMO_THRESHOLD = 10;
  
  // First session promo success tracking
  const [promoStats, setPromoStats] = useState<{ sent: number; converted: number } | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Membership benefit campaign tracking
  const [membershipStats, setMembershipStats] = useState<{ eligible: number | null; sent: number; converted: number }>({ eligible: null, sent: 0, converted: 0 });
  const [automatedCampaigns, setAutomatedCampaigns] = useState({ firstSession: true, membershipBenefit: true });
  const [togglingCampaign, setTogglingCampaign] = useState<"firstSession" | "membershipBenefit" | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchCampaigns();
      fetchTemplates();
      fetchPromoEligibleCount();
      fetchPromoSuccessRate();
      fetchMembershipStats();
      fetchSavedSegments();
      fetchEmailLayout();
      fetchAutomatedCampaignSettings();
    }
  }, [isAdmin]);

  const fetchEmailLayout = async () => {
    const { data } = await supabase
      .from("email_layout")
      .select("header_html, footer_html")
      .eq("id", "global")
      .maybeSingle();

    setEmailLayout({
      header: data?.header_html || DEFAULT_EMAIL_HEADER_HTML,
      footer: data?.footer_html || DEFAULT_EMAIL_FOOTER_HTML,
    });
  };

  const fetchAutomatedCampaignSettings = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("first_session_promo_enabled, membership_benefit_campaign_enabled")
      .eq("id", "global")
      .maybeSingle();
    setAutomatedCampaigns({
      firstSession: data?.first_session_promo_enabled !== false,
      membershipBenefit: data?.membership_benefit_campaign_enabled !== false,
    });
  };

  const toggleAutomatedCampaign = async (campaign: "firstSession" | "membershipBenefit", enabled: boolean) => {
    setTogglingCampaign(campaign);
    const column = campaign === "firstSession" ? "first_session_promo_enabled" : "membership_benefit_campaign_enabled";
    const { error } = await supabase.from("system_settings").update({ [column]: enabled }).eq("id", "global");
    if (error) {
      toast({ title: "Couldn't update campaign", description: error.message, variant: "destructive" });
    } else {
      setAutomatedCampaigns((current) => ({ ...current, [campaign]: enabled }));
      toast({ title: enabled ? "Campaign turned on" : "Campaign turned off" });
    }
    setTogglingCampaign(null);
  };

  const showPreview = (bodyHtml: string) => {
    setPreviewHtml(buildMarketingPreview(bodyHtml, emailLayout.header, emailLayout.footer));
    setPreviewOpen(true);
  };

  const fetchSavedSegments = async () => {
    const { data } = await supabase
      .from("marketing_segments")
      .select("id, name, emails")
      .order("name");
    setSavedSegments((data as any) || []);
  };

  const handleSaveSegment = async () => {
    const name = segmentName.trim();
    if (!name || selectedCustomers.length === 0) {
      toast({ title: "Nothing to save", description: "Pick customers and enter a segment name.", variant: "destructive" });
      return;
    }
    setIsSavingSegment(true);
    const { error } = await supabase.from("marketing_segments").insert([{ name, emails: selectedCustomers as any }]);
    setIsSavingSegment(false);
    if (error) {
      toast({ title: "Couldn't save segment", description: error.message, variant: "destructive" });
      return;
    }
    setSegmentName("");
    await fetchSavedSegments();
    toast({ title: "Segment saved", description: `"${name}" with ${selectedCustomers.length} customers.` });
  };

  const handleSegmentChange = (value: string) => {
    setSegmentFilter(value);
    if (value.startsWith("saved:")) {
      const seg = savedSegments.find((s) => s.id === value.slice(6));
      const people = Array.isArray(seg?.emails) ? (seg!.emails as any[]) : [];
      setSelectedCustomers(people.filter((p) => p?.email));
      setManualOnly(true);
    }
  };

  const fetchPromoSuccessRate = async () => {
    try {
      // Get all users who received the promo
      const { data: promoRecipients, error: recipientsError } = await supabase
        .from("profiles")
        .select("user_id")
        .not("first_session_promo_sent", "is", null);
      
      if (recipientsError) {
        console.error("Error fetching promo recipients:", recipientsError);
        return;
      }
      
      if (!promoRecipients || promoRecipients.length === 0) {
        setPromoStats({ sent: 0, converted: 0 });
        return;
      }
      
      const sentCount = promoRecipients.length;
      const userIds = promoRecipients.map(p => p.user_id);
      
      // Find how many of those users have made a non-cancelled booking
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("user_id")
        .in("user_id", userIds)
        .neq("status", "cancelled");
      
      if (bookingsError) {
        console.error("Error fetching bookings:", bookingsError);
        return;
      }
      
      // Count unique users who booked
      const convertedUsers = new Set(bookings?.map(b => b.user_id) || []);
      
      setPromoStats({ sent: sentCount, converted: convertedUsers.size });
    } catch (error) {
      console.error("Error calculating promo success rate:", error);
    }
  };

  const fetchPromoEligibleCount = async () => {
    try {
      // Get users who haven't received the promo, opted into marketing, created >24h ago
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: eligibleProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, created_at")
        .is("first_session_promo_sent", null)
        .eq("marketing_opt_out", false)
        .lt("created_at", twentyFourHoursAgo);
      
      if (profilesError) {
        console.error("Error fetching promo eligible profiles:", profilesError);
        return;
      }
      
      if (!eligibleProfiles || eligibleProfiles.length === 0) {
        setPromoEligibleCount(0);
        return;
      }
      
      // Filter out bulk import users (created 2026-01-18 between 07:00-08:00 UTC)
      const bulkImportStart = new Date("2026-01-18T07:00:00Z").getTime();
      const bulkImportEnd = new Date("2026-01-18T08:00:00Z").getTime();
      
      const filteredProfiles = eligibleProfiles.filter(user => {
        const createdAt = new Date(user.created_at).getTime();
        return createdAt < bulkImportStart || createdAt > bulkImportEnd;
      });
      
      // Get user_ids who have non-cancelled bookings — batch to avoid PostgREST 1000-row cap
      const userIds = filteredProfiles.map(p => p.user_id);
      const usersWithBookings = new Set<string>();
      const BATCH = 100;
      for (let i = 0; i < userIds.length; i += BATCH) {
        const chunk = userIds.slice(i, i + BATCH);
        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select("user_id")
          .in("user_id", chunk)
          .neq("status", "cancelled");
        if (bookingsError) {
          console.error("Error fetching bookings:", bookingsError);
          return;
        }
        bookings?.forEach(b => usersWithBookings.add(b.user_id));
      }

      const eligibleCount = filteredProfiles.filter(p => !usersWithBookings.has(p.user_id)).length;

      setPromoEligibleCount(eligibleCount);
    } catch (error) {
      console.error("Error counting promo eligible users:", error);
    }
  };

  const fetchMembershipStats = async () => {
    try {
      // All sends
      const { data: sends } = await supabase
        .from("membership_campaign_sends")
        .select("user_id, sent_at");
      const allSends = sends || [];
      const sent = allSends.length;
      const sentUserIds = Array.from(new Set(allSends.map((s) => s.user_id)));

      // Converted: recipients who upgraded to a paid tier AFTER their first email
      const firstSent = new Map<string, number>();
      allSends.forEach((s) => {
        const t = new Date(s.sent_at).getTime();
        const prev = firstSent.get(s.user_id);
        if (prev === undefined || t < prev) firstSent.set(s.user_id, t);
      });
      const convertedUsers = new Set<string>();
      const BATCH = 100;
      for (let i = 0; i < sentUserIds.length; i += BATCH) {
        const { data: changes } = await supabase
          .from("membership_changes")
          .select("user_id, new_tier, changed_at")
          .in("user_id", sentUserIds.slice(i, i + BATCH))
          .neq("new_tier", "visitor");
        changes?.forEach((c) => {
          const first = firstSent.get(c.user_id);
          if (first !== undefined && new Date(c.changed_at).getTime() >= first) convertedUsers.add(c.user_id);
        });
      }
      const converted = convertedUsers.size;

      // Eligible right now: visitors with 2-5 confirmed bookings in the last 56 days,
      // not emailed by this campaign in the last 60 days
      const sixtyDaysAgo = new Date(Date.now() - 60 * 864e5);
      const recentSenders = new Set(
        allSends.filter((s) => new Date(s.sent_at) >= sixtyDaysAgo).map((s) => s.user_id)
      );

      const visitorIds = new Set<string>();
      let profileFrom = 0;
      for (;;) {
        const { data: visitorProfiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("membership_tier", "visitor")
          .eq("marketing_opt_out", false)
          .range(profileFrom, profileFrom + 999);
        if (!visitorProfiles || visitorProfiles.length === 0) break;
        visitorProfiles.forEach((profile) => visitorIds.add(profile.user_id));
        if (visitorProfiles.length < 1000) break;
        profileFrom += 1000;
      }

      const excludedPastMembers = new Set<string>();
      let memberFrom = 0;
      for (;;) {
        const { data: membershipChanges } = await supabase
          .from("membership_changes")
          .select("user_id")
          .range(memberFrom, memberFrom + 999);
        if (!membershipChanges || membershipChanges.length === 0) break;
        membershipChanges.forEach((change) => excludedPastMembers.add(change.user_id));
        if (membershipChanges.length < 1000) break;
        memberFrom += 1000;
      }

      const since = new Date(Date.now() - 56 * 864e5).toISOString().slice(0, 10);
      const counts = new Map<string, number>();
      let from = 0;
      for (;;) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("user_id")
          .eq("status", "confirmed")
          .gte("booking_date", since)
          .range(from, from + 999);
        if (!bookings || bookings.length === 0) break;
        bookings.forEach((b) => counts.set(b.user_id, (counts.get(b.user_id) || 0) + 1));
        if (bookings.length < 1000) break;
        from += 1000;
      }

      let eligible = 0;
      for (const [userId, count] of counts) {
        if (
          count >= 2 &&
          count <= 5 &&
          visitorIds.has(userId) &&
          !recentSenders.has(userId) &&
          !excludedPastMembers.has(userId)
        ) eligible++;
      }

      setMembershipStats({ eligible, sent, converted });
    } catch (error) {
      console.error("Error fetching membership campaign stats:", error);
    }
  };


  useEffect(() => {
    if (composerOpen) {
      countRecipients();
    }
  }, [membershipTiers, bookingFilter, segmentFilter, composerOpen, selectedCustomers, manualOnly, excludedEmailsInput]);

  // Individual customer search (debounced)
  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setIsSearchingCustomers(true);

      const terms = term.split(/\s+/).filter(Boolean);
      const perTerm = terms.map((t) => {
        const escaped = t.replace(/"/g, '\\"');
        return `or(first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%)`;
      });
      const queryString = perTerm.length === 1 ? perTerm[0] : `and(${perTerm.join(",")})`;

      const { data } = await supabase
        .from("profiles")
        .select("email, first_name, last_name")
        .or(queryString)
        .limit(20);

      setCustomerResults((data || []).filter((d: any) => !!d.email) as any);
      setIsSearchingCustomers(false);
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);



  const toggleCustomer = (c: { email: string; first_name: string | null; last_name: string | null }) => {
    setSelectedCustomers((prev) => {
      const exists = prev.some((p) => p.email.toLowerCase() === c.email.toLowerCase());
      const next = exists
        ? prev.filter((p) => p.email.toLowerCase() !== c.email.toLowerCase())
        : [...prev, c];
      // Picking people manually switches the composer into "selected only" mode
      if (next.length > 0) setManualOnly(true);
      else setManualOnly(false);
      return next;
    });
  };

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

  // Shared filter builder for recipient queries
  const buildRecipientQuery = (select: string, opts?: { head?: boolean; count?: "exact" }) => {
    let q: any = supabase
      .from("profiles")
      .select(select, opts as any)
      .eq("marketing_opt_out", false);

    if (membershipTiers.length > 0) {
      q = q.in("membership_tier", membershipTiers);
    }
    if (segmentFilter === "hub_launch_missed") {
      q = q.eq("custom_segment", "hub_launch_missed");
    } else if (segmentFilter === "none") {
      q = q.is("custom_segment", null);
    }
    if (bookingFilter === "0") {
      q = q.eq("total_bookings", 0);
    } else if (bookingFilter === "1-5") {
      q = q.gte("total_bookings", 1).lte("total_bookings", 5);
    } else if (bookingFilter === "6-10") {
      q = q.gte("total_bookings", 6).lte("total_bookings", 10);
    } else if (bookingFilter === "10+") {
      q = q.gte("total_bookings", 11);
    }
    return q;
  };

  // PostgREST caps responses at 1,000 rows — page through every match
  const fetchAllRecipients = async (select: string) => {
    const pageSize = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await buildRecipientQuery(select).range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as any[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  const countRecipients = async () => {
    const excludedEmails = parseExcludedEmails(excludedEmailsInput);

    if (manualOnly && selectedCustomers.length > 0) {
      setRecipientCount(
        selectedCustomers.filter((customer) => !excludedEmails.has(customer.email.toLowerCase())).length,
      );
      setIsCountingRecipients(false);
      return;
    }
    setIsCountingRecipients(true);
    
    
    try {
      const filteredRecipients = await fetchAllRecipients("email");
      const recipientEmails = new Set(
        filteredRecipients
          .map((recipient: any) => String(recipient.email || "").toLowerCase())
          .filter(Boolean),
      );

      selectedCustomers.forEach((customer) => recipientEmails.add(customer.email.toLowerCase()));
      excludedEmails.forEach((email) => recipientEmails.delete(email));
      setRecipientCount(recipientEmails.size);
    } catch (error) {
      console.error("Error counting campaign recipients:", error);
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
    setMembershipTiers([]);
    setBookingFilter("all");
    setSegmentFilter("all");
    setSelectedCustomers([]);
    setManualOnly(false);
    setExcludedEmailsInput("");
    setSegmentName("");
    setCustomerSearch("");
    setCustomerResults([]);
    setComposerOpen(true);
  };

  const handlePreview = () => {
    showPreview(campaignHtml);
  };

  const handleSendTest = async () => {
    const email = testEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Enter a valid email address to send the test to.",
        variant: "destructive",
      });
      return;
    }
    if (!campaignSubject || !campaignHtml) {
      toast({
        title: "Missing content",
        description: "Add a subject and email content before sending a test.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-marketing-email", {
        body: {
          campaign_id: null,
          subject: `[TEST] ${campaignSubject}`,
          html_content: campaignHtml,
          recipients: [{ email, first_name: "Test", last_name: "" }],
          is_test: true,
        },
      });
      if (error) throw error;
      if (!data?.sent) {
        throw new Error("The email provider did not accept the test send. Check the function logs.");
      }
      toast({ title: "Test sent", description: `Test email sent to ${email}.` });

    } catch (error: any) {
      toast({
        title: "Test send failed",
        description: error.message || "Could not send the test email.",
        variant: "destructive",
      });
    }
    setIsSendingTest(false);
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
      if (membershipTiers.length > 0) {
        recipientFilter.membership_tier = membershipTiers.join(",");
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

      let recipients: any[];

      if (manualOnly && selectedCustomers.length > 0) {
        // Manual mode: ONLY the hand-picked customers
        recipients = selectedCustomers;
      } else {
        // Paged fetch — never let PostgREST's 1,000-row cap silently truncate the list
        const filteredRecipients = await fetchAllRecipients("email, first_name, last_name");

        // Merge in individually selected customers (deduped by email)
        const seen = new Set(filteredRecipients.map((r: any) => String(r.email || "").toLowerCase()));
        recipients = [
          ...filteredRecipients,
          ...selectedCustomers.filter((c) => !seen.has(c.email.toLowerCase())),
        ];
      }

      const excludedEmails = parseExcludedEmails(excludedEmailsInput);
      recipients = recipients.filter(
        (recipient) => !excludedEmails.has(String(recipient.email || "").toLowerCase()),
      );

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

      // Update campaign status (store the real list size, not the pre-send estimate)
      await supabase
        .from("marketing_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          recipient_count: recipients.length,
        })
        .eq("id", campaign.id);

      toast({
        title: "Campaign sent!",
        description: `Email sent to ${recipients.length} recipients.`,
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
      case "automated": return "bg-primary/10 text-primary border-primary/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const openTemplateEditor = (template: Template) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditHtml(template.html_content);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    setIsSavingTemplate(true);
    try {
      const { error } = await supabase
        .from("marketing_templates")
        .update({
          subject: editSubject,
          html_content: editHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;

      toast({
        title: "Template saved",
        description: "Your changes have been saved successfully.",
      });

      setEditingTemplate(null);
      fetchTemplates();
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast({
        title: "Error saving template",
        description: error.message || "Failed to save template.",
        variant: "destructive",
      });
    }
    setIsSavingTemplate(false);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-foreground">
              Marketing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Email campaigns and templates
            </p>
          </div>
          <Button onClick={() => openComposer()} className="bg-primary hover:bg-primary/90 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full sm:inline-flex sm:w-auto overflow-x-auto no-scrollbar">
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="segments" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Segments
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Review Approvals
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Feedback
            </TabsTrigger>
            <TabsTrigger value="sim-cup" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Sim Cup
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
                            showPreview(campaign.html_content);
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
                          <span>
                            {campaign.opens} opens
                            {campaign.recipient_count > 0 && campaign.opens > 0
                              ? ` (${Math.round((campaign.opens / campaign.recipient_count) * 100)}%)`
                              : ""}
                          </span>
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
              {templates.map((template) => {
                const isFirstSessionPromo = template.name === "First Session Free" && template.category === "automated";
                
                return (
                  <Card key={template.id} className="hover:border-primary/50 transition-colors relative">
                    {/* Promo counter badge for First Session Free */}
                    {isFirstSessionPromo && promoEligibleCount !== null && (
                      <div className="absolute -top-2 -right-2 z-10">
                        <div className={`px-2.5 py-1 rounded-full text-xs font-bold shadow-md ${
                          promoEligibleCount >= PROMO_THRESHOLD 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted-foreground/20 text-foreground"
                        }`}>
                          {promoEligibleCount}/{PROMO_THRESHOLD}
                        </div>
                      </div>
                    )}
                    
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {template.category === "automated" && (
                            <Zap className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isFirstSessionPromo && (
                            <Switch
                              checked={automatedCampaigns.firstSession}
                              disabled={togglingCampaign === "firstSession"}
                              onCheckedChange={(enabled) => toggleAutomatedCampaign("firstSession", enabled)}
                              aria-label="Turn First Session Free campaign on or off"
                            />
                          )}
                          <Badge className={getCategoryColor(template.category)}>
                            {template.category}
                          </Badge>
                        </div>
                      </div>
                      {template.description && (
                        <CardDescription>{template.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Progress bar and success rate for First Session Free */}
                      {isFirstSessionPromo && (
                        <div className="mb-3 space-y-3">
                          {/* Eligible customers progress */}
                          {promoEligibleCount !== null && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Eligible customers</span>
                                <span className={promoEligibleCount >= PROMO_THRESHOLD ? "text-primary font-medium" : ""}>
                                  {promoEligibleCount >= PROMO_THRESHOLD ? "Ready to trigger!" : `${PROMO_THRESHOLD - promoEligibleCount} more needed`}
                                </span>
                              </div>
                              <Progress 
                                value={Math.min((promoEligibleCount / PROMO_THRESHOLD) * 100, 100)} 
                                className="h-2"
                              />
                            </div>
                          )}
                          
                          {/* Success rate metric */}
                          {promoStats && promoStats.sent > 0 && (
                            <div className="p-2 bg-accent/20 rounded-lg border border-accent/30">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Success rate</span>
                                <span className="font-semibold text-accent-foreground">
                                  {Math.round((promoStats.converted / promoStats.sent) * 100)}%
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {promoStats.converted} of {promoStats.sent} recipients have booked
                              </div>
                            </div>
                          )}
                        </div>
                      )}


                      <p className="text-sm text-muted-foreground mb-3">
                        Subject: {template.subject}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            showPreview(template.html_content);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        {template.category === "automated" ? (
                          <Button
                            size="sm"
                            onClick={() => openTemplateEditor(template)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => openComposer(template)}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Use Template
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Membership Benefit — automated campaign. Its email template is
                  edited in Admin → Settings → Notifications (email_templates,
                  key 'membership_benefit'), so only stats live here. */}
              <Card className="hover:border-primary/50 transition-colors relative">
                {/* Total people emailed, top corner */}
                <div
                  className="absolute -top-2 -right-2 z-10 min-w-[24px] h-6 px-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shadow"
                  title={`${membershipStats.sent} people have received this campaign`}
                >
                  {membershipStats.sent}
                </div>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">Membership Benefit</CardTitle>
                      <Zap className="h-4 w-4 text-primary" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="How this campaign works" className="text-muted-foreground hover:text-primary">
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                            <p className="font-semibold mb-1">Who gets this email</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              <li>Visitors only (never current or past members)</li>
                              <li>2–5 confirmed bookings in the last 8 weeks</li>
                              <li>Heavy users (6+ bookings) excluded — they're more profitable on visitor rates</li>
                              <li>Not emailed by this campaign in the last 60 days</li>
                              <li>Opted in to marketing (not unsubscribed)</li>
                            </ul>
                            <p className="font-semibold mt-2 mb-1">Why it makes us money</p>
                            <p>
                              A casual on 3 visits per 8 weeks pays about $120. As a Birdie member they pay $216 in
                              weekly subscription plus $10/hr bay fees — roughly double, and guaranteed even in weeks
                              they don't play. Peak bays are only ~36% occupied, so member hours fill empty bays rather
                              than displacing $40 visitors.
                            </p>
                            <p className="font-semibold mt-2 mb-1">The pitch</p>
                            <p>
                              Forward-looking: $10/hr member rate, extended booking window, league entry, no lock-in.
                              It does not compare against what they've already spent.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={automatedCampaigns.membershipBenefit}
                        disabled={togglingCampaign === "membershipBenefit"}
                        onCheckedChange={(enabled) => toggleAutomatedCampaign("membershipBenefit", enabled)}
                        aria-label="Turn Membership Benefit campaign on or off"
                      />
                      <Badge className={getCategoryColor("automated")}>automated</Badge>
                    </div>
                  </div>
                  <CardDescription>
                    Runs daily. Emails visitors with 2–5 bookings in the last 8 weeks — heavy users (6+) stay on visitor rates. Re-emails after 60 days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {membershipStats.eligible !== null && (
                      <p>
                        <span className="text-primary font-medium">{membershipStats.eligible}</span> eligible right now
                      </p>
                    )}
                    <p>Template editable in Settings → Notifications (“Membership Benefit”).</p>
                  </div>
                  {membershipStats.sent > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-primary/10 rounded-lg border border-primary/30 text-center">
                        <div className="font-display text-2xl text-primary">{membershipStats.converted}</div>
                        <div className="text-xs text-muted-foreground">Converted to members</div>
                      </div>
                      <div className="p-2 bg-accent/20 rounded-lg border border-accent/30 text-center">
                        <div className="font-display text-2xl text-foreground">
                          {Math.round((membershipStats.converted / membershipStats.sent) * 100)}%
                        </div>
                        <div className="text-xs text-muted-foreground">of {membershipStats.sent} emailed</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          {/* Segments Tab */}
          <TabsContent value="segments" className="mt-4">
            <MarketingSegments onChanged={fetchSavedSegments} />
          </TabsContent>

          {/* Review Approvals Tab */}
          <TabsContent value="reviews" className="mt-4">
            <ReviewApprovals />
          </TabsContent>

          {/* Feedback Tab Content */}
          <FeedbackTab activeTab={activeTab} />

          {/* Sim Cup Registrations Tab */}
          <SimCupTab activeTab={activeTab} />
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

              {/* Body-only tip */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Body content only</p>
                <p>
                  Just like email notifications, only the <strong>body</strong> of the email is required here.
                  The branded header (logo) and footer (contact details, socials, unsubscribe) are added
                  automatically when the email is sent.
                </p>
                <p>Edit the header &amp; footer in Settings → Notifications → Email Layout.</p>
              </div>

              {/* HTML Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Content (HTML — body only, header and footer will be added from Notification Settings)</Label>
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
                
                <div className={`grid grid-cols-3 gap-3 ${manualOnly ? "opacity-50" : ""}`}>
                  <div className="space-y-1">
                    <Label className="text-xs">Custom Segment</Label>
                    <Select value={segmentFilter} onValueChange={handleSegmentChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEGMENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                        {savedSegments.map((s) => (
                          <SelectItem key={s.id} value={`saved:${s.id}`}>
                            {s.name} ({Array.isArray(s.emails) ? s.emails.length : 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Membership Tiers</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={manualOnly}
                          className="w-full justify-between font-normal"
                        >
                          <span className="truncate">
                            {membershipTiers.length === 0
                              ? "All Customers"
                              : membershipTiers.length === 1
                                ? MEMBERSHIP_OPTIONS.find((o) => o.value === membershipTiers[0])?.label
                                : `${membershipTiers.length} tiers selected`}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 p-2 space-y-1">
                        {MEMBERSHIP_OPTIONS.filter((o) => o.value !== "all").map((opt) => {
                          const checked = membershipTiers.includes(opt.value);
                          return (
                            <label
                              key={opt.value}
                              className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-muted"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setMembershipTiers((prev) =>
                                    v === true
                                      ? [...prev, opt.value]
                                      : prev.filter((t) => t !== opt.value)
                                  )
                                }
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                        {membershipTiers.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setMembershipTiers([])}
                          >
                            Clear selection
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>

                  
                  <div className="space-y-1">
                    <Label className="text-xs">Booking Count</Label>
                    <Select value={bookingFilter} onValueChange={setBookingFilter} disabled={manualOnly}>
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

                {/* Individual customers */}
                <div className="space-y-2 pt-1 border-t border-border/60">
                  <Label className="text-xs">Add individual customers</Label>
                  <Input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name or email..."
                  />
                  {customerSearch.trim().length >= 2 && (
                    <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-background">
                      {isSearchingCustomers ? (
                        <p className="p-2 text-xs text-muted-foreground">Searching...</p>
                      ) : customerResults.length === 0 ? (
                        <p className="p-2 text-xs text-muted-foreground">No customers found.</p>
                      ) : (
                        customerResults.map((c) => {
                          const checked = selectedCustomers.some(
                            (p) => p.email.toLowerCase() === c.email.toLowerCase()
                          );
                          return (
                            <label
                              key={c.email}
                              className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
                            >
                              <Checkbox checked={checked} onCheckedChange={() => toggleCustomer(c)} />
                              <span className="truncate">
                                {[c.first_name, c.last_name].filter(Boolean).join(" ") || "(no name)"}
                                <span className="text-muted-foreground"> — {c.email}</span>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                  {selectedCustomers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCustomers.map((c) => (
                        <button
                          key={c.email}
                          type="button"
                          onClick={() => toggleCustomer(c)}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
                        >
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
                          <span aria-hidden>×</span>
                        </button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setSelectedCustomers([]);
                          setManualOnly(false);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  )}

                  {selectedCustomers.length > 0 && (
                    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={manualOnly}
                          onCheckedChange={(v) => setManualOnly(v === true)}
                        />
                        Send only to the {selectedCustomers.length} selected customer
                        {selectedCustomers.length === 1 ? "" : "s"} (ignore the filters above)
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={segmentName}
                          onChange={(e) => setSegmentName(e.target.value)}
                          placeholder="Segment name..."
                          className="h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs whitespace-nowrap"
                          disabled={isSavingSegment || !segmentName.trim()}
                          onClick={handleSaveSegment}
                        >
                          {isSavingSegment ? "Saving..." : "Save as Segment"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-border/60 pt-3">
                  <Label htmlFor="campaign-exclusions" className="text-xs">
                    Remove from Campaign
                  </Label>
                  <Textarea
                    id="campaign-exclusions"
                    value={excludedEmailsInput}
                    onChange={(event) => setExcludedEmailsInput(event.target.value)}
                    placeholder={"email@example.com\nsecond@example.com, third@example.com"}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter email addresses separated by a new line or comma.
                    {parseExcludedEmails(excludedEmailsInput).size > 0 && (
                      <> {parseExcludedEmails(excludedEmailsInput).size} valid exclusion{parseExcludedEmails(excludedEmailsInput).size === 1 ? "" : "s"} applied.</>
                    )}
                  </p>
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

              {/* Send Test Email */}
              <div className="space-y-2 p-4 border border-border rounded-lg">
                <Label className="text-sm font-medium">Send a test email</Label>
                <p className="text-xs text-muted-foreground">
                  Sends this exact email (with header &amp; footer) to one address only. Doesn't create a campaign.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <Button variant="outline" onClick={handleSendTest} disabled={isSendingTest}>
                    {isSendingTest ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Test
                      </>
                    )}
                  </Button>
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

        {/* Template Editor Dialog */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Edit Automated Template: {editingTemplate?.name}
              </DialogTitle>
              <DialogDescription>
                Changes will be used the next time this automated campaign runs.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="edit-subject">Subject Line</Label>
                <Input
                  id="edit-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Email subject..."
                />
                <p className="text-xs text-muted-foreground">
                  Available tags: {"{first_name}"}, {"{last_name}"}, {"{email}"}
                </p>
              </div>

              {/* Body-only tip */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Body content only</p>
                <p>
                  Just like email notifications, only the <strong>body</strong> of the email is required here.
                  The branded header (logo) and footer (contact details, socials, unsubscribe) are added
                  automatically when the email is sent.
                </p>
                <p>Edit the header &amp; footer in Settings → Notifications → Email Layout.</p>
              </div>

              {/* HTML Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-html">Email Content (HTML — body only, header and footer will be added from Notification Settings)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      showPreview(editHtml);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                </div>
                <Textarea
                  id="edit-html"
                  value={editHtml}
                  onChange={(e) => setEditHtml(e.target.value)}
                  className="min-h-[350px] font-mono text-sm"
                  placeholder="Paste HTML content..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingTemplate(null)}
                  disabled={isSavingTemplate}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                >
                  {isSavingTemplate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Template"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </AdminLayout>
  );
}

// ───── Feedback Tab Component ─────
function FeedbackTab({ activeTab }: { activeTab: string }) {
  const { toast } = useToast();
  const [feedbackResponses, setFeedbackResponses] = useState<any[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  useEffect(() => {
    if (activeTab === "feedback") {
      fetchFeedback();
    }
  }, [activeTab]);

  const fetchFeedback = async () => {
    setIsLoadingFeedback(true);
    const { data, error } = await supabase
      .from("feedback_responses" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      setFeedbackResponses(data as any[]);
    }
    setIsLoadingFeedback(false);
  };

  const handleTriggerFeedbackCampaign = async () => {
    setIsSendingFeedback(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-feedback-request");
      if (error) throw error;

      toast({
        title: "Feedback campaign sent",
        description: `Sent ${data.sent} feedback request emails to lapsed visitors.`,
      });
      fetchFeedback();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send feedback campaign.",
        variant: "destructive",
      });
    }
    setIsSendingFeedback(false);
  };

  const getScoreIcon = (score: string) => {
    switch (score) {
      case "bad": return <Frown className="h-5 w-5 text-red-500" />;
      case "ok": return <Meh className="h-5 w-5 text-amber-500" />;
      case "good": return <Smile className="h-5 w-5 text-emerald-600" />;
      default: return null;
    }
  };

  const getScoreBadge = (score: string) => {
    switch (score) {
      case "bad": return "bg-red-100 text-red-700 border-red-200";
      case "ok": return "bg-amber-100 text-amber-700 border-amber-200";
      case "good": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default: return "";
    }
  };

  // Score summary
  const scoreCounts = feedbackResponses.reduce((acc, r) => {
    acc[r.score] = (acc[r.score] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (activeTab !== "feedback") return null;

  return (
    <TabsContent value="feedback" className="mt-4 space-y-4" forceMount>
      {/* Summary + Trigger */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Smile className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground">{scoreCounts.good || 0}</div>
            <div className="text-xs text-muted-foreground">Good</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Meh className="h-8 w-8 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground">{scoreCounts.ok || 0}</div>
            <div className="text-xs text-muted-foreground">OK</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Frown className="h-8 w-8 text-red-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground">{scoreCounts.bad || 0}</div>
            <div className="text-xs text-muted-foreground">Bad</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <Button
              onClick={handleTriggerFeedbackCampaign}
              disabled={isSendingFeedback}
              className="bg-accent hover:bg-accent/90 text-accent-foreground w-full"
            >
              {isSendingFeedback ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Feedback Requests
                </>
              )}
            </Button>
             <p className="text-xs text-muted-foreground mt-2 text-center">
               Sent daily, 24hrs after first session
             </p>
          </CardContent>
        </Card>
      </div>

      {/* Responses list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feedback Responses</CardTitle>
          <CardDescription>
            {feedbackResponses.length} response{feedbackResponses.length !== 1 ? "s" : ""} received
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingFeedback ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : feedbackResponses.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No feedback yet. Send some requests!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbackResponses.map((response: any) => (
                <div
                  key={response.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                >
                  <div className="mt-0.5">{getScoreIcon(response.score)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">
                        {response.name || "Anonymous"}
                      </span>
                      <Badge variant="outline" className={`text-xs ${getScoreBadge(response.score)}`}>
                        {response.score.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(response.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                    {response.comment && (
                      <p className="text-sm text-muted-foreground mt-1">{response.comment}</p>
                    )}
                    {response.email && (
                      <p className="text-xs text-muted-foreground/70 mt-1">{response.email}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// ───── Sim Cup Registrations Tab ─────
interface SimCupRegistration {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  shirt_size: string | null;
  notes: string | null;
  created_at: string;
  preferred_timeslot: string | null;
  assigned_timeslot: string | null;
  payment_status: string;
  payment_method: string | null;
  amount_paid: number | null;
  paid_at: string | null;
  team_number: number | null;
  handicap: number | null;
  handicap_source: string | null;
}

const SHIRT_ORDER = ["S", "M", "L", "XL", "2XL", "3XL"];
const TIMESLOTS = ["8-11am", "11am-2pm", "2-5pm"];
const SLOT_CAPACITY = 6;
const TEAMS_PER_SLOT = 3;
const ENTRY_PRICE = 99;

/** Team numbers for a slot: 8-11am → 1,2,3 · 11am-2pm → 4,5,6 · 2-5pm → 7,8,9 */
function teamsForSlot(slot: string): number[] {
  const slotIndex = TIMESLOTS.indexOf(slot);
  if (slotIndex < 0) return [];
  return Array.from({ length: TEAMS_PER_SLOT }, (_, i) => slotIndex * TEAMS_PER_SLOT + i + 1);
}

function SimCupTab({ activeTab }: { activeTab: string }) {
  const { toast } = useToast();
  const [regs, setRegs] = useState<SimCupRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    if (activeTab === "sim-cup") fetchRegs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchRegs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("sim_cup_registrations")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) setRegs(data as unknown as SimCupRegistration[]);
    setIsLoading(false);
  };

  const patchReg = async (id: string, patch: Partial<SimCupRegistration>) => {
    const previous = regs;
    setRegs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase
      .from("sim_cup_registrations")
      .update(patch as never)
      .eq("id", id);
    if (error) {
      setRegs(previous);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const moveToSlot = (id: string, slot: string) =>
    patchReg(id, {
      assigned_timeslot: slot === "unassigned" ? null : slot,
      // Teams belong to a slot — moving slots clears the team.
      team_number: null,
    });

  const setTeam = (r: SimCupRegistration, value: string) => {
    if (value === "none") {
      patchReg(r.id, { team_number: null });
      return;
    }
    patchReg(r.id, { team_number: Number(value) });
  };

  const setHandicap = (r: SimCupRegistration, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      patchReg(r.id, { handicap: null, handicap_source: null });
      return;
    }
    const value = Number(trimmed);
    if (Number.isNaN(value)) return;
    patchReg(r.id, { handicap: value, handicap_source: "manual" });
  };

  const pullHandicaps = async () => {
    setIsPulling(true);
    try {
      const [{ data: members, error: mErr }, { data: tourMembers, error: tErr }] = await Promise.all([
        supabase.from("sgt_members").select("user_id, user_email"),
        supabase
          .from("sgt_tour_members")
          .select("user_id, tour_id, hcp_index, custom_hcp")
          .order("tour_id", { ascending: false }),
      ]);
      if (mErr || tErr) throw new Error(mErr?.message || tErr?.message);

      // Most recent tour row per player wins.
      const hcpByUser = new Map<number, number>();
      for (const tm of tourMembers ?? []) {
        if (hcpByUser.has(tm.user_id)) continue;
        const hcp = tm.custom_hcp ?? tm.hcp_index;
        if (hcp !== null && hcp !== undefined) hcpByUser.set(tm.user_id, Number(hcp));
      }
      const hcpByEmail = new Map<string, number>();
      for (const m of members ?? []) {
        const hcp = hcpByUser.get(m.user_id);
        if (m.user_email && hcp !== undefined) {
          hcpByEmail.set(m.user_email.trim().toLowerCase(), hcp);
        }
      }

      let matched = 0;
      for (const r of regs) {
        if (r.handicap_source === "manual") continue; // never overwrite hand-entered values
        const hcp = hcpByEmail.get(r.email.trim().toLowerCase());
        if (hcp === undefined || hcp === r.handicap) continue;
        await patchReg(r.id, { handicap: hcp, handicap_source: "league" });
        matched++;
      }

      toast({
        title: matched > 0 ? `${matched} handicap${matched === 1 ? "" : "s"} updated` : "No new matches",
        description:
          matched > 0
            ? "Pulled from the league. Players without a match can be entered manually."
            : "Nobody new matched a league member by email.",
      });
    } catch (err) {
      toast({
        title: "Could not pull handicaps",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsPulling(false);
    }
  };

  const togglePaid = (r: SimCupRegistration) =>
    r.payment_status === "paid"
      ? patchReg(r.id, {
          payment_status: "unpaid",
          amount_paid: null,
          paid_at: null,
        })
      : patchReg(r.id, {
          payment_status: "paid",
          payment_method: r.payment_method === "card" ? "card" : "venue",
          amount_paid: ENTRY_PRICE,
          paid_at: new Date().toISOString(),
        });

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("sim_cup_registrations").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setRegs((prev) => prev.filter((r) => r.id !== id));
    toast({ title: "Registration removed" });
  };

  const exportCsv = () => {
    const sorted = [...regs].sort((a, b) => {
      const slotA = a.assigned_timeslot ? TIMESLOTS.indexOf(a.assigned_timeslot) : 99;
      const slotB = b.assigned_timeslot ? TIMESLOTS.indexOf(b.assigned_timeslot) : 99;
      if (slotA !== slotB) return slotA - slotB;
      return (a.team_number ?? 99) - (b.team_number ?? 99);
    });
    const rows = [
      [
        "Name",
        "Email",
        "Phone",
        "Shirt Size",
        "Preferred",
        "Assigned",
        "Team Number",
        "Handicap",
        "Handicap Source",
        "Paid",
        "Method",
        "Registered",
      ],
      ...sorted.map((r) => [
        r.name,
        r.email,
        r.phone ?? "",
        r.shirt_size ?? "",
        r.preferred_timeslot ?? "",
        r.assigned_timeslot ?? "",
        r.team_number ?? "",
        r.handicap ?? "",
        r.handicap_source === "league" ? "League" : r.handicap_source === "manual" ? "Manual" : "",
        r.payment_status === "paid" ? "Yes" : "No",
        r.payment_method ?? "",
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sim-cup-registrations-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sizeCounts = SHIRT_ORDER.map((size) => ({
    size,
    count: regs.filter((r) => r.shirt_size === size).length,
  }));

  if (activeTab !== "sim-cup") return null;

  const SPOTS = 18;
  const paidCount = regs.filter((r) => r.payment_status === "paid").length;
  const unassigned = regs.filter((r) => !r.assigned_timeslot);

  const PlayerRow = ({ r }: { r: SimCupRegistration }) => (
    <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{r.name}</p>
          <p className="text-xs text-muted-foreground truncate">{r.email}</p>
        </div>
        <Badge variant={r.payment_status === "paid" ? "default" : "outline"}>
          {r.payment_status === "paid" ? "Paid" : "Unpaid"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {r.shirt_size && <Badge variant="secondary">{r.shirt_size}</Badge>}
        {r.preferred_timeslot && (
          <Badge
            variant="outline"
            className={
              r.assigned_timeslot && r.assigned_timeslot !== r.preferred_timeslot
                ? "border-destructive text-destructive"
                : ""
            }
          >
            Prefers {r.preferred_timeslot}
          </Badge>
        )}
        {r.payment_method && (
          <Badge variant="outline">
            {r.payment_method === "card" ? "Card" : "At venue"}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={r.assigned_timeslot ?? "unassigned"}
          onValueChange={(v) => moveToSlot(r.id, v)}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {TIMESLOTS.map((slot) => (
              <SelectItem key={slot} value={slot}>
                {slot}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8" onClick={() => togglePaid(r)}>
          {r.payment_status === "paid" ? "Unpay" : "Mark paid"}
        </Button>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => handleDelete(r.id)}>
          Remove
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={r.team_number ? String(r.team_number) : "none"}
          onValueChange={(v) => setTeam(r, v)}
          disabled={!r.assigned_timeslot}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="No team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No team</SelectItem>
            {teamsForSlot(r.assigned_timeslot ?? "").map((n) => (
              <SelectItem key={n} value={String(n)}>
                Team {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <HandicapInput reg={r} onCommit={setHandicap} />
        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
          {r.handicap_source === "league"
            ? "League"
            : r.handicap_source === "manual"
              ? "Manual"
              : "No HCP"}
        </Badge>
      </div>
    </div>
  );

  const TeamBlock = ({ teamNumber, players }: { teamNumber: number; players: SimCupRegistration[] }) => {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/30 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="whitespace-nowrap">Team {teamNumber}</Badge>
          <Badge variant={players.length === 2 ? "outline" : "destructive"} className="whitespace-nowrap">
            {players.length}/2
          </Badge>
        </div>
        {players.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">Empty team.</p>
        ) : (
          players.map((p) => <PlayerRow key={p.id} r={p} />)
        )}
      </div>
    );
  };


  return (
    <TabsContent value="sim-cup" className="mt-4 space-y-4" forceMount>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {regs.length}
              <span className="text-base text-muted-foreground font-normal"> / {SPOTS} spots</span>
            </div>
            <Progress value={Math.min((regs.length / SPOTS) * 100, 100)} className="h-2 mt-3" />
            <p className="text-xs text-muted-foreground mt-2">
              Forms: <span className="font-mono">/sim-cup</span> ·{" "}
              <span className="font-mono">/sim-cup-confirm</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entry Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {paidCount}
              <span className="text-base text-muted-foreground font-normal"> / {regs.length} paid</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ${paidCount * ENTRY_PRICE} collected · ${(regs.length - paidCount) * ENTRY_PRICE} outstanding
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Shirt Sizes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {sizeCounts.map(({ size, count }) => (
              <Badge key={size} variant="outline" className="text-sm">
                {size}: <span className="ml-1 font-bold text-primary">{count}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Timeslot Board</CardTitle>
            <CardDescription>
              Move players between slots and pair them into teams of two. {SLOT_CAPACITY} spots
              ({TEAMS_PER_SLOT} teams) per slot. Lunch break 12–1pm.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={fetchRegs} disabled={isLoading}>
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={pullHandicaps}
              disabled={isPulling || regs.length === 0}
            >
              {isPulling && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Pull handicaps from league
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={regs.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : regs.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No registrations yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {TIMESLOTS.map((slot) => {
                  const players = regs.filter((r) => r.assigned_timeslot === slot);
                  const full = players.length >= SLOT_CAPACITY;
                  return (
                    <div key={slot} className="rounded-lg border border-border p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground">{slot}</p>
                        <Badge variant={full ? "default" : "outline"}>
                          {players.length}/{SLOT_CAPACITY}
                          {full ? " · Full" : ""}
                        </Badge>
                      </div>
                      <Progress
                        value={Math.min((players.length / SLOT_CAPACITY) * 100, 100)}
                        className="h-1.5"
                      />
                      {players.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">
                          No players in this slot yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {teamsForSlot(slot).map((n) => (
                            <TeamBlock
                              key={n}
                              teamNumber={n}
                              players={players.filter((p) => p.team_number === n)}
                            />
                          ))}
                          {players.filter((p) => !p.team_number).length > 0 && (
                            <div className="rounded-lg border border-dashed border-border p-2 space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">No team yet</p>
                              {players
                                .filter((p) => !p.team_number)
                                .map((r) => (
                                  <PlayerRow key={r.id} r={r} />
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">Unassigned</p>
                  <Badge variant="outline">{unassigned.length}</Badge>
                </div>
                {unassigned.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Everyone has a timeslot.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {unassigned.map((r) => (
                      <PlayerRow key={r.id} r={r} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function HandicapInput({
  reg,
  onCommit,
}: {
  reg: SimCupRegistration;
  onCommit: (r: SimCupRegistration, value: string) => void;
}) {
  const [value, setValue] = useState(reg.handicap === null ? "" : String(reg.handicap));
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value === (reg.handicap === null ? "" : String(reg.handicap))) return;
        onCommit(reg, value);
      }}
      inputMode="decimal"
      placeholder="HCP"
      className="h-8 w-16 text-xs"
    />
  );
}

