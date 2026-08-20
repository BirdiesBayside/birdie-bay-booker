import { useMemo, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu } from "lucide-react";

const PASSWORD = "Holeinone1";
const STORAGE_KEY = "training_unlocked";

const files = import.meta.glob("../../docs/training/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Doc = { key: string; slug: string; title: string; content: string };

const docs: Doc[] = Object.entries(files)
  .map(([path, content]) => {
    const file = path.split("/").pop() || path;
    const slug = file.replace(/\.md$/, "");
    const heading = content.match(/^#\s+(.+)$/m)?.[1];
    return {
      key: path,
      slug,
      title: heading || slug.replace(/^\d+-/, "").replace(/-/g, " "),
      content,
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

export default function Training() {
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [active, setActive] = useState(docs[0]?.slug ?? "");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") setUnlocked(true);
  }, []);

  const doc = useMemo(() => docs.find((d) => d.slug === active), [active]);

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Training</h1>
            <p className="text-sm text-muted-foreground">
              Enter the password to access the training course.
            </p>
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pw === PASSWORD) {
                sessionStorage.setItem(STORAGE_KEY, "1");
                setUnlocked(true);
              } else {
                setError("Incorrect password");
              }
            }}
          >
            <Input
              type="password"
              value={pw}
              autoFocus
              placeholder="Password"
              onChange={(e) => {
                setPw(e.target.value);
                setError("");
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Unlock
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-20 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setNavOpen((v) => !v)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-bold text-lg">Platform Training</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto flex gap-6 px-4 py-6">
        <aside
          className={`${navOpen ? "block" : "hidden"} md:block w-full md:w-64 shrink-0`}
        >
          <ScrollArea className="md:h-[calc(100vh-8rem)] md:sticky md:top-20">
            <nav className="space-y-1 pr-2">
              {docs.map((d) => (
                <button
                  key={d.slug}
                  onClick={() => {
                    setActive(d.slug);
                    setNavOpen(false);
                    window.scrollTo({ top: 0 });
                  }}
                  className={`w-full text-left text-sm rounded-md px-3 py-2 transition-colors ${
                    active === d.slug
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {d.title}
                </button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        <main className={`${navOpen ? "hidden" : "block"} md:block flex-1 min-w-0`}>
          <Card className="p-6">
            <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {doc?.content ?? ""}
              </ReactMarkdown>
            </article>
          </Card>
        </main>
      </div>
    </div>
  );
}
