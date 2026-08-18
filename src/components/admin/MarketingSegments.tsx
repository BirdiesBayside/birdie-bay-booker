import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Search, Sparkles, Trash2, Upload, Users, X, Pencil } from "lucide-react";

export interface SegmentPerson {
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface Segment {
  id: string;
  name: string;
  emails: SegmentPerson[];
  created_at: string;
}

interface AiMatch extends SegmentPerson {
  membership_tier: string | null;
  reason: string;
}

const displayName = (p: SegmentPerson) =>
  `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email;

export function MarketingSegments({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<SegmentPerson[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Customer search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SegmentPerson[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // AI import
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [aiMatches, setAiMatches] = useState<AiMatch[]>([]);
  const [aiUnmatched, setAiUnmatched] = useState<string[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSegments();
  }, []);

  const fetchSegments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("marketing_segments")
      .select("id, name, emails, created_at")
      .order("name");
    setIsLoading(false);
    if (error) {
      toast({ title: "Couldn't load segments", description: error.message, variant: "destructive" });
      return;
    }
    setSegments(
      ((data as any[]) || []).map((s) => ({
        ...s,
        emails: Array.isArray(s.emails) ? s.emails.filter((p: any) => p?.email) : [],
      })),
    );
  };

  const openEditor = (seg?: Segment) => {
    setEditingId(seg?.id ?? null);
    setName(seg?.name ?? "");
    setMembers(seg?.emails ?? []);
    setSearch("");
    setResults([]);
    setEditorOpen(true);
  };

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setIsSearching(true);
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      let query = supabase
        .from("profiles")
        .select("email, first_name, last_name")
        .not("email", "is", null)
        .limit(200);
      for (const term of terms) {
        query = query.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }
      const { data } = await query;
      setIsSearching(false);
      setResults(((data as SegmentPerson[]) || []).slice(0, 25));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const addMember = (p: SegmentPerson) => {
    setMembers((prev) =>
      prev.some((m) => m.email.toLowerCase() === p.email.toLowerCase()) ? prev : [...prev, p],
    );
  };

  const removeMember = (email: string) =>
    setMembers((prev) => prev.filter((m) => m.email.toLowerCase() !== email.toLowerCase()));

  const saveSegment = async () => {
    const trimmed = name.trim();
    if (!trimmed || members.length === 0) {
      toast({
        title: "Missing details",
        description: "Give the segment a name and at least one customer.",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    const payload = { name: trimmed, emails: members as any };
    const { error } = editingId
      ? await supabase.from("marketing_segments").update(payload).eq("id", editingId)
      : await supabase.from("marketing_segments").insert([payload]);
    setIsSaving(false);
    if (error) {
      toast({ title: "Couldn't save segment", description: error.message, variant: "destructive" });
      return;
    }
    setEditorOpen(false);
    await fetchSegments();
    onChanged?.();
    toast({ title: "Segment saved", description: `"${trimmed}" — ${members.length} customers.` });
  };

  const deleteSegment = async (seg: Segment) => {
    if (!confirm(`Delete segment "${seg.name}"?`)) return;
    const { error } = await supabase.from("marketing_segments").delete().eq("id", seg.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    await fetchSegments();
    onChanged?.();
    toast({ title: "Segment deleted" });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setAiText((prev) => (prev ? `${prev}\n${text}` : text));
    if (fileRef.current) fileRef.current.value = "";
  };

  const runMatch = async () => {
    if (!aiText.trim()) return;
    setIsMatching(true);
    setAiMatches([]);
    setAiUnmatched([]);
    const { data, error } = await supabase.functions.invoke("segment-ai-match", {
      body: { text: aiText },
    });
    setIsMatching(false);
    if (error) {
      toast({ title: "Matching failed", description: error.message, variant: "destructive" });
      return;
    }
    if ((data as any)?.error) {
      toast({ title: "Matching failed", description: (data as any).error, variant: "destructive" });
      return;
    }
    const matches: AiMatch[] = (data as any)?.matches ?? [];
    setAiMatches(matches);
    setAiUnmatched((data as any)?.unmatched ?? []);
    setApproved(new Set(matches.map((m) => m.email.toLowerCase())));
    if (matches.length === 0) {
      toast({ title: "No matches found", description: "Try adding emails or more detail." });
    }
  };

  const applyApproved = () => {
    const picked = aiMatches.filter((m) => approved.has(m.email.toLowerCase()));
    picked.forEach((p) =>
      addMember({ email: p.email, first_name: p.first_name, last_name: p.last_name }),
    );
    setAiOpen(false);
    setAiText("");
    setAiMatches([]);
    setAiUnmatched([]);
    if (!editorOpen) setEditorOpen(true);
    toast({ title: `${picked.length} customers added`, description: "Review and save the segment." });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wide text-foreground">Segments</h2>
          <p className="text-sm text-muted-foreground">
            Saved customer lists you can reuse in any campaign.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditingId(null); setName(""); setMembers([]); setAiOpen(true); }}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Import
          </Button>
          <Button onClick={() => openEditor()}>
            <Plus className="h-4 w-4 mr-2" />
            New Segment
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : segments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No segments yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {segments.map((seg) => (
            <Card key={seg.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{seg.name}</CardTitle>
                    <CardDescription>{seg.emails.length} customers</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditor(seg)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSegment(seg)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {seg.emails.slice(0, 6).map((p) => (
                    <Badge key={p.email} variant="secondary" className="text-xs">
                      {displayName(p)}
                    </Badge>
                  ))}
                  {seg.emails.length > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{seg.emails.length - 6} more
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit segment" : "New segment"}</DialogTitle>
            <DialogDescription>Search customers to add, or use AI import.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Segment name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sim Cup interest" />
            </div>

            <div className="space-y-2">
              <Label>Add customers</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                />
              </div>
              {isSearching && <p className="text-xs text-muted-foreground">Searching…</p>}
              {results.length > 0 && (
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {results.map((p) => (
                    <button
                      key={p.email}
                      type="button"
                      onClick={() => addMember(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50"
                    >
                      <span className="text-sm">{displayName(p)}</span>
                      <span className="block text-xs text-muted-foreground">{p.email}</span>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI Import
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Members ({members.length})</Label>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {members.map((p) => (
                  <Badge key={p.email} variant="secondary" className="gap-1">
                    {displayName(p)}
                    <button type="button" onClick={() => removeMember(p.email)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {members.length === 0 && (
                  <p className="text-sm text-muted-foreground">No customers added yet.</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSegment} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI import */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI segment import</DialogTitle>
            <DialogDescription>
              Paste a CSV, a list of names/emails, or describe who you want (e.g. "eagle members
              with more than 5 bookings"). We'll match them to customer accounts for you to approve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              rows={8}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={"Jane Smith, jane@example.com\nTim C\nAll weekday members who joined this year"}
            />
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={handleFile} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              <Button size="sm" onClick={runMatch} disabled={isMatching || !aiText.trim()}>
                {isMatching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Find matches
              </Button>
            </div>

            {aiMatches.length > 0 && (
              <div className="space-y-2">
                <Label>Proposed matches ({approved.size} approved)</Label>
                <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                  {aiMatches.map((m) => {
                    const key = m.email.toLowerCase();
                    return (
                      <label key={key} className="flex items-start gap-3 px-3 py-2 cursor-pointer">
                        <Checkbox
                          checked={approved.has(key)}
                          onCheckedChange={(c) =>
                            setApproved((prev) => {
                              const next = new Set(prev);
                              c ? next.add(key) : next.delete(key);
                              return next;
                            })
                          }
                        />
                        <div className="min-w-0">
                          <p className="text-sm">
                            {displayName(m)}{" "}
                            {m.membership_tier && (
                              <Badge variant="outline" className="ml-1 text-[10px] uppercase">
                                {m.membership_tier}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          <p className="text-xs text-muted-foreground">{m.reason}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {aiUnmatched.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Not matched: {aiUnmatched.join(", ")}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyApproved} disabled={approved.size === 0}>
              Add {approved.size} to segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
