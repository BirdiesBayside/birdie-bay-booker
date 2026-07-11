import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Pencil, Copy, Check } from "lucide-react";

interface SmsTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  message: string;
  is_active: boolean;
}

// Available merge tags per template key
const SMS_TAGS: Record<string, { tag: string; description: string }[]> = {
  booking_confirmation: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{booking_date}", description: "Booking date (e.g. Monday, 15 January 2025)" },
    { tag: "{short_date}", description: "Short date (e.g. 15/01/2025)" },
    { tag: "{booking_time}", description: "Start time, 12-hour (e.g. 2:00 PM)" },
    { tag: "{end_time}", description: "End time, 12-hour" },
    { tag: "{bay_number}", description: "Bay number (e.g. 3)" },
    { tag: "{bay_name}", description: "Bay name (e.g. Bay 3)" },
    { tag: "{door_code}", description: "Door code (from Settings)" },
  ],
  booking_confirmation_first_unstaffed: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{short_date}", description: "Short date (e.g. 15/01/2025)" },
    { tag: "{booking_time}", description: "Start time, 12-hour (e.g. 2:00 PM)" },
    { tag: "{end_time}", description: "End time, 12-hour" },
    { tag: "{bay_number}", description: "Bay number" },
    { tag: "{door_code}", description: "Door code (from Settings)" },
  ],

  booking_reschedule: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{last_name}", description: "Customer's last name" },
    { tag: "{booking_date}", description: "New booking date" },
    { tag: "{short_date}", description: "New short date (e.g. 15/01/2025)" },
    { tag: "{booking_time}", description: "New start time, 12-hour" },
    { tag: "{end_time}", description: "New end time, 12-hour" },
    { tag: "{bay_number}", description: "Bay number" },
    { tag: "{bay_name}", description: "Bay name" },
    { tag: "{door_code}", description: "Door code (from Settings)" },
  ],
  booking_cancellation: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{short_date}", description: "Booking date (e.g. 15/01/2025)" },
    { tag: "{start_time_24}", description: "Start time, 24-hour (e.g. 14:00)" },
    { tag: "{end_time_24}", description: "End time, 24-hour" },
    { tag: "{bay_number}", description: "Bay number" },
  ],
  boom_gate_access: [
    { tag: "{first_name}", description: "Customer's first name" },
    { tag: "{booking_time}", description: "Start time, 12-hour" },
    { tag: "{short_date}", description: "Booking date (e.g. 15/01/2025)" },
  ],
};

// SMS Broadcast charges per 160-char segment
const estimateSegments = (text: string) => {
  if (!text) return 0;
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
};

export function SmsTemplatesSection() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [doorCode, setDoorCode] = useState("7675#");
  const [doorCodeInput, setDoorCodeInput] = useState("7675#");
  const [savingDoorCode, setSavingDoorCode] = useState(false);

  const [editing, setEditing] = useState<SmsTemplate | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    const [{ data: tpls }, { data: sys }] = await Promise.all([
      supabase.from("sms_templates").select("*").order("name"),
      supabase.from("system_settings").select("door_code").eq("id", "global").maybeSingle(),
    ]);
    if (tpls) setTemplates(tpls as SmsTemplate[]);
    const dc = (sys as any)?.door_code || "7675#";
    setDoorCode(dc);
    setDoorCodeInput(dc);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (t: SmsTemplate) => {
    const { error } = await supabase
      .from("sms_templates")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    toast({
      title: t.is_active ? "SMS disabled" : "SMS enabled",
      description: `${t.name} ${t.is_active ? "will no longer be sent" : "is now active"}.`,
      duration: 3000,
    });
    load();
  };

  const openEditor = (t: SmsTemplate) => {
    setEditing(t);
    setDraftMessage(t.message);
  };

  const saveMessage = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("sms_templates")
      .update({ message: draftMessage })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    toast({ title: "Saved", description: `${editing.name} updated.`, duration: 3000 });
    setEditing(null);
    load();
  };

  const insertTag = (tag: string) => {
    setDraftMessage((m) => m + tag);
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1500);
  };

  const saveDoorCode = async () => {
    setSavingDoorCode(true);
    const { error } = await supabase
      .from("system_settings")
      .update({ door_code: doorCodeInput })
      .eq("id", "global");
    setSavingDoorCode(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    setDoorCode(doorCodeInput);
    toast({
      title: "Door code updated",
      description: "All SMS templates using {door_code} now use the new value.",
      duration: 3000,
    });
  };

  const previewMessage = (msg: string) =>
    msg
      .replace(/{first_name}/g, "Alex")
      .replace(/{last_name}/g, "Smith")
      .replace(/{booking_date}/g, "Friday, 26 June 2026")
      .replace(/{short_date}/g, "26/06/2026")
      .replace(/{booking_time}/g, "2:00 PM")
      .replace(/{end_time}/g, "4:00 PM")
      .replace(/{start_time_24}/g, "14:00")
      .replace(/{end_time_24}/g, "16:00")
      .replace(/{bay_number}/g, "3")
      .replace(/{bay_name}/g, "Bay 3")
      .replace(/{door_code}/g, doorCode);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            SMS Templates
          </CardTitle>
          <CardDescription>
            Messages sent to customers via SMS Broadcast. Edit the wording, toggle each on/off,
            and use merge tags like <code className="text-xs">{"{first_name}"}</code>. Messages
            over 160 characters are split into multiple SMS segments (each segment is billed).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : templates.length === 0 ? (

            <p className="text-sm text-muted-foreground">No SMS templates found.</p>
          ) : (
            templates.map((t) => {
              const rendered = previewMessage(t.message);
              const segments = estimateSegments(rendered);
              return (
                <div
                  key={t.id}
                  className={`border rounded-lg p-4 space-y-3 ${
                    t.is_active ? "" : "opacity-60 bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{t.name}</h4>
                        {!t.is_active && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Disabled
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {rendered.length} chars · {segments} SMS
                        </Badge>
                      </div>
                      {t.description && (
                        <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditor(t)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={t.is_active ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleActive(t)}
                        className={t.is_active ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        {t.is_active ? "On" : "Off"}
                      </Button>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded p-3 text-sm whitespace-pre-wrap font-mono">
                    {rendered}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Door Code</CardTitle>
          <CardDescription>
            Used by any SMS template containing <code className="text-xs">{"{door_code}"}</code>.
            Change it once here and every template updates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 max-w-sm">
            <div className="flex-1 space-y-2">
              <Label>Current door code</Label>
              <Input
                value={doorCodeInput}
                onChange={(e) => setDoorCodeInput(e.target.value)}
                placeholder="e.g. 7675#"
              />
            </div>
            <Button
              onClick={saveDoorCode}
              disabled={savingDoorCode || doorCodeInput === doorCode}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit: {editing?.name}</DialogTitle>
            <DialogDescription>{editing?.description}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {draftMessage.length} characters · {estimateSegments(previewMessage(draftMessage))} SMS
                    segment(s)
                  </span>
                  <span>Each segment is billed by SMS Broadcast</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Available merge tags (click to insert)</Label>
                <div className="flex flex-wrap gap-2">
                  {(SMS_TAGS[editing.template_key] || []).map(({ tag, description }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTag(tag)}
                      title={description}
                      className="inline-flex items-center gap-1 rounded-md border bg-muted/40 hover:bg-muted px-2 py-1 text-xs font-mono"
                    >
                      {copiedTag === tag ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preview (sample data)</Label>
                <div className="bg-muted/40 rounded p-3 text-sm whitespace-pre-wrap font-mono">
                  {previewMessage(draftMessage)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveMessage} disabled={saving || !draftMessage.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
