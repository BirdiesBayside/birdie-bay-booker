import { useEffect, useRef, useState } from "react";
import { Send, Plus, Trash2, Loader2, Wrench, AlertTriangle, Download, FileSpreadsheet } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import caddyIcon from "@/assets/ai-caddy-face.png";

type Thread = { id: string; title: string; updated_at: string };
type ToolCall = { id: string; name: string; args: any; result: any };
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[];
  created_at: string;
};

export function AiCaddy() {
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setAllowed(false);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = roles?.some((r) => r.role === "admin");
      if (isAdmin) return setAllowed(true);
      const { data: prof } = await supabase.from("profiles").select("custom_segment").eq("user_id", user.id).maybeSingle();
      setAllowed(prof?.custom_segment === "staff");
    })();
  }, []);

  if (!allowed) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen(true)}
              className="fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full bg-background/60 hover:bg-background border border-border/50 hover:border-border shadow-sm flex items-center justify-center transition-all overflow-hidden opacity-60 hover:opacity-100"
              aria-label="Open AI Caddy"
            >
              <img src={caddyIcon} alt="AI Caddy" className="h-9 w-9 object-contain" loading="lazy" width={36} height={36} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">AI Caddy — support assistant</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col">
          <CaddyPanel onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function CaddyPanel({ onClose }: { onClose: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // load threads
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_caddy_threads")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      setThreads(data ?? []);
      if (data && data.length && !activeId) setActiveId(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load messages when active thread changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from("ai_caddy_messages")
        .select("id,role,parts,created_at")
        .eq("thread_id", activeId)
        .order("created_at", { ascending: true });
      const ms: Msg[] = (data ?? []).map((r: any) => ({
        id: r.id,
        role: r.role,
        content: r.parts?.content ?? "",
        tool_calls: r.parts?.tool_calls,
        created_at: r.created_at,
      }));
      setMessages(ms);
    })();
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => { taRef.current?.focus(); }, [activeId]);

  async function newThread() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("ai_caddy_threads")
      .insert({ user_id: user.id, title: "New conversation" })
      .select("id,title,updated_at")
      .single();
    if (error) { toast({ title: "Couldn't create thread", description: error.message, variant: "destructive" }); return; }
    setThreads((t) => [data!, ...t]);
    setActiveId(data!.id);
    setShowThreads(false);
  }

  async function deleteThread(id: string) {
    await supabase.from("ai_caddy_threads").delete().eq("id", id);
    setThreads((t) => t.filter((x) => x.id !== id));
    if (activeId === id) setActiveId(threads.find((t) => t.id !== id)?.id ?? null);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    let threadId = activeId;
    if (!threadId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("ai_caddy_threads")
        .insert({ user_id: user.id, title: text.slice(0, 60) })
        .select("id,title,updated_at")
        .single();
      threadId = data!.id;
      setThreads((t) => [data!, ...t]);
      setActiveId(threadId);
    } else if (messages.length === 0) {
      // first message — set the title
      await supabase.from("ai_caddy_threads").update({ title: text.slice(0, 60) }).eq("id", threadId);
      setThreads((t) => t.map((x) => x.id === threadId ? { ...x, title: text.slice(0, 60) } : x));
    }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text, created_at: new Date().toISOString() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    // persist user message
    await supabase.from("ai_caddy_messages").insert({
      thread_id: threadId, role: "user", parts: { content: text },
    });

    try {
      const payload = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("ai-caddy", {
        body: { messages: payload, thread_id: threadId },
      });
      if (error) throw error;
      const assistantMsg: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.assistant || "",
        tool_calls: data.tool_calls || [],
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      await supabase.from("ai_caddy_messages").insert({
        thread_id: threadId, role: "assistant",
        parts: { content: assistantMsg.content, tool_calls: assistantMsg.tool_calls },
      });
      await supabase.from("ai_caddy_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    } catch (e: any) {
      toast({ title: "AI Caddy error", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
      setTimeout(() => taRef.current?.focus(), 0);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-4 py-3 pr-12 border-b flex-row items-center justify-between space-y-0 gap-2">
        <button
          onClick={() => setShowThreads((s) => !s)}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
        >
          {showThreads ? "Hide" : `History (${threads.length})`}
        </button>
        <SheetTitle className="text-sm font-semibold flex-1 text-center">AI Caddy</SheetTitle>
        <Button size="sm" variant="ghost" onClick={newThread} className="h-7 px-2 shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </SheetHeader>

      {showThreads && (
        <div className="border-b max-h-48 overflow-y-auto bg-muted/30">
          {threads.length === 0 && <div className="p-3 text-xs text-muted-foreground">No conversations yet.</div>}
          {threads.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center justify-between px-3 py-2 text-xs hover:bg-muted cursor-pointer border-b",
                activeId === t.id && "bg-muted"
              )}
              onClick={() => { setActiveId(t.id); setShowThreads(false); }}
            >
              <span className="truncate flex-1 mr-2">{t.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div ref={scrollRef as any} className="px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8 space-y-3">
              <img src={caddyIcon} alt="AI Caddy" className="h-20 w-20 mx-auto" width={80} height={80} />
              <div className="font-medium text-foreground">Hi — I'm AI Caddy.</div>
              <div className="text-xs max-w-[280px] mx-auto">
                Ask me to look up customers, bookings, payments, or SGT data. I can also refund a booking or adjust a customer's credit — I'll ask you to confirm first.
              </div>
            </div>
          )}
          {messages.map((m) => <MsgRow key={m.id} msg={m} />)}
          {sending && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-3 bg-background">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask AI Caddy…"
            rows={2}
            className="resize-none text-base sm:text-sm min-h-[44px]"
            style={{ fontSize: "16px" }}
            disabled={sending}
          />
          <Button onClick={send} disabled={sending || !input.trim()} size="icon" className="h-10 w-10 shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

const DESTRUCTIVE = new Set(["refund_booking", "adjust_customer_credit"]);

function MsgRow({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {msg.tool_calls?.map((tc) => <ToolCard key={tc.id} tc={tc} />)}
      {msg.content && (
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ToolCard({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  const isDestructive = DESTRUCTIVE.has(tc.name);
  const pending = tc.result?.pending_confirmation;
  const errored = !!tc.result?.error;

  return (
    <div className={cn(
      "border rounded-md text-xs overflow-hidden",
      pending && "border-amber-500/40 bg-amber-500/5",
      errored && "border-destructive/40 bg-destructive/5",
      !pending && !errored && "border-border bg-muted/30"
    )}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 text-left"
      >
        {pending ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <Wrench className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-mono">{tc.name}</span>
        {isDestructive && !pending && !errored && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">action</span>}
        {pending && <span className="text-amber-600 dark:text-amber-400 text-[11px]">awaiting confirm</span>}
        {errored && <span className="text-destructive text-[11px]">error</span>}
        <span className="ml-auto text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mt-2 mb-1">Args</div>
            <pre className="bg-background/60 rounded p-2 overflow-x-auto text-[11px]">{JSON.stringify(tc.args, null, 2)}</pre>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Result</div>
            <pre className="bg-background/60 rounded p-2 overflow-x-auto text-[11px] max-h-64">{JSON.stringify(tc.result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
