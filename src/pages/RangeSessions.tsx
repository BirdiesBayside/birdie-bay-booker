import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ArrowLeft, Target, TrendingUp, LineChart as LineIcon } from "lucide-react";
import { statsByClub, sortClubs, fmt, mean, max, type Shot } from "@/lib/range-stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter, ReferenceLine, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

type Session = {
  id: string;
  session_date: string;
  started_at: string | null;
  ended_at: string | null;
  shot_count: number;
  duration_minutes: number | null;
  bay_id: string | null;
  source_filename: string | null;
  created_at: string;
};

const CLUB_COLOR = (club: string) => {
  // Deterministic color per club using brand-adjacent palette
  const palette = ["#1F4C25", "#EC622D", "#3E7C40", "#B8480F", "#5FA365", "#F7A26B", "#2E623A", "#D24E1F", "#7BB682"];
  let h = 0; for (let i = 0; i < club.length; i++) h = (h * 31 + club.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

export default function RangeSessions() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/");
  }, [isLoading, isAuthenticated, navigate]);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["range-sessions", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Session[]> => {
      const { data, error } = await supabase
        .from("range_sessions")
        .select("id, session_date, started_at, ended_at, shot_count, duration_minutes, bay_id, source_filename, created_at")
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Session[];
    },
  });

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  const { data: allShots = [] } = useQuery({
    queryKey: ["range-shots-all", user?.id, sessionIds.length],
    enabled: !!user?.id && sessionIds.length > 0,
    queryFn: async (): Promise<Shot[]> => {
      const { data, error } = await supabase
        .from("range_shots")
        .select("*")
        .in("session_id", sessionIds);
      if (error) throw error;
      return data as Shot[];
    },
  });

  const totalShots = allShots.length;
  const bestCarry = max(allShots.map((s) => s.carry));
  const avgBallSpeed = mean(allShots.map((s) => s.ball_speed));
  const avgSmash = mean(allShots.map((s) => s.smash_factor));
  const clubCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allShots) {
      const c = s.club_type || "Unknown";
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [allShots]);
  const mostUsedClub = useMemo(() => {
    let best = ""; let n = 0;
    for (const [c, cnt] of clubCounts) if (cnt > n) { best = c; n = cnt; }
    return best;
  }, [clubCounts]);

  const clubStats = useMemo(() => statsByClub(allShots), [allShots]);

  // Selected session view
  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );
  const selectedShots = useMemo(
    () => (selectedSessionId ? allShots.filter((s) => s.session_id === selectedSessionId) : []),
    [allShots, selectedSessionId]
  );

  if (isLoading || sessionsLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading range data…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="font-anton text-2xl tracking-wide" style={{ color: "hsl(var(--foreground))" }}>
            My Range Sessions
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Target className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">No range sessions yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Range data is captured when you hit <strong>Export</strong> in the GSPro driving range and finish your session.
                Your shots will appear here automatically after your booking ends.
              </p>
            </CardContent>
          </Card>
        ) : selectedSession ? (
          <SessionDetail
            session={selectedSession}
            shots={selectedShots}
            onBack={() => setSelectedSessionId(null)}
          />
        ) : (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="gapping">Club Gapping</TabsTrigger>
              <TabsTrigger value="dispersion">Dispersion</TabsTrigger>
              <TabsTrigger value="consistency">Consistency</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Sessions" value={sessions.length.toString()} icon={<TrendingUp className="h-4 w-4" />} />
                <Kpi label="Shots" value={totalShots.toString()} icon={<Target className="h-4 w-4" />} />
                <Kpi label="Best carry" value={fmt(bestCarry, 0, " yd")} />
                <Kpi label="Avg smash" value={fmt(avgSmash, 2)} />
                <Kpi label="Avg ball speed" value={fmt(avgBallSpeed, 1, " mph")} />
                <Kpi label="Most used" value={mostUsedClub || "—"} />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Avg carry per session</CardTitle></CardHeader>
                <CardContent>
                  <SessionTrendChart sessions={sessions.slice(0, 20).reverse()} shots={allShots} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sessions" className="space-y-3 pt-4">
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className="w-full text-left border border-border rounded-md p-3 hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-medium">
                          {format(parseISO(s.session_date), "EEE d MMM yyyy")}
                          {s.started_at && (
                            <span className="text-muted-foreground text-sm ml-2">
                              {format(parseISO(s.started_at), "h:mma").toLowerCase()}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.shot_count} shots
                          {s.duration_minutes ? ` · ${Math.round(s.duration_minutes)} min` : ""}
                          {s.source_filename ? ` · ${s.source_filename}` : ""}
                        </div>
                      </div>
                      <Badge variant="secondary">View</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="gapping" className="space-y-4 pt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Carry by club</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={clubStats.map((c) => ({ club: c.club, avg: c.avgCarry ?? 0, max: c.maxCarry ?? 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="club" />
                      <YAxis label={{ value: "yards", angle: -90, position: "insideLeft" }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="avg" fill="#1F4C25" name="Avg carry" />
                      <Bar dataKey="max" fill="#EC622D" name="Max carry" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <ClubStatsTable rows={clubStats} />
            </TabsContent>

            <TabsContent value="dispersion" className="space-y-4 pt-4">
              <DispersionChart shots={allShots} />
            </TabsContent>

            <TabsContent value="consistency" className="space-y-4 pt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Strike consistency (lower = tighter)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={clubStats.map((c) => ({ club: c.club, smashSd: c.smashSd ?? 0, lateralSd: c.lateralSd ?? 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="club" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="smashSd" fill="#1F4C25" name="Smash factor SD" />
                      <Bar dataKey="lateralSd" fill="#EC622D" name="Lateral SD (yd)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {icon}{label}
        </div>
        <div className="text-2xl font-anton mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function ClubStatsTable({ rows }: { rows: ReturnType<typeof statsByClub> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Per-club statistics</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">Shots</TableHead>
              <TableHead className="text-right">Avg carry</TableHead>
              <TableHead className="text-right">Max carry</TableHead>
              <TableHead className="text-right">Avg total</TableHead>
              <TableHead className="text-right">Ball spd</TableHead>
              <TableHead className="text-right">Club spd</TableHead>
              <TableHead className="text-right">Smash</TableHead>
              <TableHead className="text-right">Launch</TableHead>
              <TableHead className="text-right">Spin</TableHead>
              <TableHead className="text-right">Lat. SD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.club}>
                <TableCell className="font-medium">{r.club}</TableCell>
                <TableCell className="text-right">{r.shots}</TableCell>
                <TableCell className="text-right">{fmt(r.avgCarry, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.maxCarry, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgTotal, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgBallSpeed, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgClubSpeed, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgSmash, 2)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgLaunch, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgSpin, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.lateralSd, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DispersionChart({ shots }: { shots: Shot[] }) {
  const clubs = sortClubs(Array.from(new Set(shots.map((s) => s.club_type || "Unknown"))));
  const [club, setClub] = useState<string>(clubs[0] ?? "");
  useEffect(() => { if (!club && clubs[0]) setClub(clubs[0]); }, [clubs, club]);

  const points = shots
    .filter((s) => (s.club_type || "Unknown") === club)
    .map((s) => ({
      side: s.side_carry ?? s.side_total ?? 0,
      carry: s.carry ?? s.total ?? 0,
    }))
    .filter((p) => Number.isFinite(p.side) && Number.isFinite(p.carry) && p.carry > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Dispersion — {club}</CardTitle>
        <div className="flex gap-1 flex-wrap">
          {clubs.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === club ? "default" : "outline"}
              onClick={() => setClub(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart>
            <CartesianGrid opacity={0.2} />
            <XAxis type="number" dataKey="side" name="Side (yd)" label={{ value: "Side (yd)", position: "insideBottom", offset: -5 }} />
            <YAxis type="number" dataKey="carry" name="Carry (yd)" label={{ value: "Carry (yd)", angle: -90, position: "insideLeft" }} />
            <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={points} fill={CLUB_COLOR(club)} />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function SessionTrendChart({ sessions, shots }: { sessions: Session[]; shots: Shot[] }) {
  const data = sessions.map((s) => {
    const ss = shots.filter((x) => x.session_id === s.id);
    return {
      label: format(parseISO(s.session_date), "d/M"),
      carry: mean(ss.map((x) => x.carry)) ?? 0,
      ball: mean(ss.map((x) => x.ball_speed)) ?? 0,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="carry" stroke="#1F4C25" name="Avg carry (yd)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ball" stroke="#EC622D" name="Avg ball spd (mph)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SessionDetail({
  session, shots, onBack,
}: { session: Session; shots: Shot[]; onBack: () => void }) {
  const stats = useMemo(() => statsByClub(shots), [shots]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> All sessions</Button>
        <div className="text-sm text-muted-foreground">
          {format(parseISO(session.session_date), "EEE d MMM yyyy")}
          {session.started_at ? ` · ${format(parseISO(session.started_at), "h:mma").toLowerCase()}` : ""}
          {session.duration_minutes ? ` · ${Math.round(session.duration_minutes)} min` : ""}
          {" · "}{session.shot_count} shots
        </div>
      </div>

      <ClubStatsTable rows={stats} />

      <Card>
        <CardHeader><CardTitle className="text-base">Every shot</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Club</TableHead>
                <TableHead className="text-right">Ball spd</TableHead>
                <TableHead className="text-right">Club spd</TableHead>
                <TableHead className="text-right">Smash</TableHead>
                <TableHead className="text-right">Launch</TableHead>
                <TableHead className="text-right">Spin</TableHead>
                <TableHead className="text-right">Carry</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Side</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shots.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.shot_number ?? ""}</TableCell>
                  <TableCell>{s.club_type ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(s.ball_speed, 1)}</TableCell>
                  <TableCell className="text-right">{fmt(s.club_speed, 1)}</TableCell>
                  <TableCell className="text-right">{fmt(s.smash_factor, 2)}</TableCell>
                  <TableCell className="text-right">{fmt(s.launch_angle, 1)}</TableCell>
                  <TableCell className="text-right">{fmt(s.spin_rate, 0)}</TableCell>
                  <TableCell className="text-right">{fmt(s.carry, 0)}</TableCell>
                  <TableCell className="text-right">{fmt(s.total, 0)}</TableCell>
                  <TableCell className="text-right">{fmt(s.side_carry ?? s.side_total, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
