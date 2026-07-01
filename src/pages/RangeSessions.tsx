import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ChevronDown, Target, TrendingUp } from "lucide-react";
import {
  statsByClub, swingStatsByClub, sortClubs, fmt, mean, max,
  detectDistanceUnit, detectSpeedUnit, convertDistance, convertSpeed,
  trimOutliers, fitEllipse, clubColor,
  type Shot, type DistanceUnit, type SpeedUnit,
} from "@/lib/range-stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter, ReferenceLine, Customized,
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

export default function RangeSessions() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [distUnit, setDistUnit] = useState<DistanceUnit | null>(null);
  const [spdUnit, setSpdUnit] = useState<SpeedUnit | null>(null);
  const [trim, setTrim] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

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

  const { data: allShotsRaw = [] } = useQuery({
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

  // Detect source units once when data first loads
  const sourceDistUnit = useMemo(() => detectDistanceUnit(allShotsRaw), [allShotsRaw]);
  const sourceSpdUnit = useMemo(() => detectSpeedUnit(allShotsRaw), [allShotsRaw]);
  useEffect(() => { if (distUnit === null && allShotsRaw.length) setDistUnit(sourceDistUnit); }, [sourceDistUnit, allShotsRaw.length, distUnit]);
  useEffect(() => { if (spdUnit === null && allShotsRaw.length) setSpdUnit(sourceSpdUnit); }, [sourceSpdUnit, allShotsRaw.length, spdUnit]);

  const activeDist: DistanceUnit = distUnit ?? sourceDistUnit;
  const activeSpd: SpeedUnit = spdUnit ?? sourceSpdUnit;

  // Convert every shot to the display unit, then optionally trim outliers.
  const allShots = useMemo(() => {
    const converted = allShotsRaw.map((s) => ({
      ...s,
      ball_speed: convertSpeed(s.ball_speed, sourceSpdUnit, activeSpd),
      club_speed: convertSpeed(s.club_speed, sourceSpdUnit, activeSpd),
      carry: convertDistance(s.carry, sourceDistUnit, activeDist),
      total: convertDistance(s.total, sourceDistUnit, activeDist),
      side_carry: convertDistance(s.side_carry, sourceDistUnit, activeDist),
      side_total: convertDistance(s.side_total, sourceDistUnit, activeDist),
      apex_height: convertDistance(s.apex_height, sourceDistUnit, activeDist),
    }));
    return trim ? trimOutliers(converted) : converted;
  }, [allShotsRaw, sourceDistUnit, sourceSpdUnit, activeDist, activeSpd, trim]);

  const dLbl = activeDist;
  const sLbl = activeSpd;

  const totalShots = allShots.length;
  const bestCarry = max(allShots.map((s) => s.carry));
  const avgBallSpeed = mean(allShots.map((s) => s.ball_speed));
  const avgSmash = mean(allShots.map((s) => s.smash_factor));
  const clubCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allShots) m.set(s.club_type || "Unknown", (m.get(s.club_type || "Unknown") ?? 0) + 1);
    return m;
  }, [allShots]);
  const mostUsedClub = useMemo(() => {
    let best = ""; let n = 0;
    for (const [c, cnt] of clubCounts) if (cnt > n) { best = c; n = cnt; }
    return best;
  }, [clubCounts]);

  const clubStats = useMemo(() => statsByClub(allShots), [allShots]);
  const swingStats = useMemo(() => swingStatsByClub(allShots), [allShots]);

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

  const unitBar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <div className="inline-flex rounded-full border border-border overflow-hidden">
        {(["m", "yd"] as DistanceUnit[]).map((u) => (
          <button
            key={u}
            onClick={() => setDistUnit(u)}
            className={`px-3 py-1 font-medium ${activeDist === u ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground"}`}
          >{u}</button>
        ))}
      </div>
      <div className="inline-flex rounded-full border border-border overflow-hidden">
        {(["kph", "mph"] as SpeedUnit[]).map((u) => (
          <button
            key={u}
            onClick={() => setSpdUnit(u)}
            className={`px-3 py-1 font-medium ${activeSpd === u ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground"}`}
          >{u}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Switch id="trim" checked={trim} onCheckedChange={setTrim} />
        <Label htmlFor="trim" className="cursor-pointer text-muted-foreground text-xs">
          {trim ? "Outliers hidden" : "All shots"}
        </Label>
      </div>
    </div>
  );

  const TABS: { value: string; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "gapping", label: "Gapping" },
    { value: "dispersion", label: "Dispersion" },
    { value: "swing", label: "Swing" },
    { value: "consistency", label: "Consistency" },
    { value: "sessions", label: "Sessions" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <header className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10 safe-area-top">
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-2 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="font-anton text-lg md:text-xl tracking-wide uppercase text-primary">
              Range Hub
            </h1>
            <div className="w-16" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 space-y-4">
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
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedSessionId(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> All sessions
              </Button>
              {unitBar}
            </div>
            <SessionDetail
              session={selectedSession}
              shots={selectedShots}
              dLbl={dLbl}
              sLbl={sLbl}
            />
          </>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              {/* Menu-style top nav — dropdown */}
              <div className="flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm active:scale-[0.98] transition-transform">
                      <span className="font-anton text-xl uppercase tracking-wide text-primary">
                        {TABS.find((t) => t.value === activeTab)?.label}
                      </span>
                      <ChevronDown className="h-5 w-5 text-accent" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    {TABS.map((t) => (
                      <DropdownMenuItem
                        key={t.value}
                        onSelect={() => setActiveTab(t.value)}
                        className={`font-medium cursor-pointer ${
                          activeTab === t.value ? "text-accent bg-accent/10" : "text-foreground"
                        }`}
                      >
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Context row: averages label + units */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">My Averages</div>
                  <div className="text-sm text-foreground">
                    {totalShots} shots · {sessions.length} sessions
                  </div>
                </div>
                {unitBar}
              </div>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Kpi label="Sessions" value={sessions.length.toString()} icon={<TrendingUp className="h-4 w-4" />} />
                  <Kpi label="Shots" value={totalShots.toString()} icon={<Target className="h-4 w-4" />} />
                  <Kpi label="Best carry" value={fmt(bestCarry, 0, ` ${dLbl}`)} />
                  <Kpi label="Avg smash" value={fmt(avgSmash, 2)} />
                  <Kpi label="Avg ball speed" value={fmt(avgBallSpeed, 0, ` ${sLbl}`)} />
                  <Kpi label="Most used" value={mostUsedClub || "—"} />
                </div>

                <Card className="overflow-hidden">
                  <CardHeader><CardTitle className="text-base">Avg carry per session</CardTitle></CardHeader>
                  <CardContent className="min-w-0">
                    <SessionTrendChart sessions={sessions.slice(0, 20).reverse()} shots={allShots} dLbl={dLbl} sLbl={sLbl} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="gapping" className="space-y-4">
                <Card className="overflow-hidden">
                  <CardHeader><CardTitle className="text-base">Carry by club ({dLbl})</CardTitle></CardHeader>
                  <CardContent className="min-w-0">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={clubStats.map((c) => ({ club: c.club, avg: Math.round(c.avgCarry ?? 0), max: Math.round(c.maxCarry ?? 0) }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="club" />
                        <YAxis label={{ value: dLbl, angle: -90, position: "insideLeft" }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="avg" fill="#1F4C25" name="Avg carry" />
                        <Bar dataKey="max" fill="#EC622D" name="Max carry" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <ClubStatsTable rows={clubStats} dLbl={dLbl} sLbl={sLbl} />
              </TabsContent>

              <TabsContent value="dispersion" className="space-y-4">
                <DispersionChart shots={allShots} dLbl={dLbl} />
              </TabsContent>

              <TabsContent value="swing" className="space-y-4">
                <SwingStatsTable rows={swingStats} />
              </TabsContent>

              <TabsContent value="consistency" className="space-y-4">
                <Card className="overflow-hidden">
                  <CardHeader><CardTitle className="text-base">Strike consistency (lower = tighter)</CardTitle></CardHeader>
                  <CardContent className="min-w-0">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={clubStats.map((c) => ({ club: c.club, smashSd: c.smashSd ?? 0, lateralSd: c.lateralSd ?? 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="club" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="smashSd" fill="#1F4C25" name="Smash factor SD" />
                        <Bar dataKey="lateralSd" fill="#EC622D" name={`Lateral SD (${dLbl})`} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sessions" className="space-y-3">
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
            </Tabs>
          </>
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

function ClubStatsTable({ rows, dLbl, sLbl }: { rows: ReturnType<typeof statsByClub>; dLbl: string; sLbl: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Per-club statistics</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">Shots</TableHead>
              <TableHead className="text-right">Avg carry ({dLbl})</TableHead>
              <TableHead className="text-right">Max carry ({dLbl})</TableHead>
              <TableHead className="text-right">Avg total ({dLbl})</TableHead>
              <TableHead className="text-right">Ball ({sLbl})</TableHead>
              <TableHead className="text-right">Club ({sLbl})</TableHead>
              <TableHead className="text-right">Smash</TableHead>
              <TableHead className="text-right">Launch°</TableHead>
              <TableHead className="text-right">Spin</TableHead>
              <TableHead className="text-right">Lat. SD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.club}>
                <TableCell className="font-medium" style={{ color: clubColor(r.club) }}>{r.club}</TableCell>
                <TableCell className="text-right">{r.shots}</TableCell>
                <TableCell className="text-right">{fmt(r.avgCarry, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.maxCarry, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgTotal, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgBallSpeed, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgClubSpeed, 0)}</TableCell>

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

function SwingStatsTable({ rows }: { rows: ReturnType<typeof swingStatsByClub> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Swing dynamics</CardTitle>
        <p className="text-xs text-muted-foreground">
          Positive = right / out-to-in for right-handers. Face-to-path shows shape tendency.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">Shots</TableHead>
              <TableHead className="text-right">Path°</TableHead>
              <TableHead className="text-right">Face°</TableHead>
              <TableHead className="text-right">Face-to-Path°</TableHead>
              <TableHead className="text-right">AoA°</TableHead>
              <TableHead className="text-right">Launch°</TableHead>
              <TableHead className="text-right">Spin axis°</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.club}>
                <TableCell className="font-medium" style={{ color: clubColor(r.club) }}>{r.club}</TableCell>
                <TableCell className="text-right">{r.shots}</TableCell>
                <TableCell className="text-right">{fmt(r.avgPath, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgFace, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgFaceToPath, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgAoA, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgLaunch, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgSpinAxis, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DispersionChart({ shots, dLbl }: { shots: Shot[]; dLbl: string }) {
  const allClubs = useMemo(
    () => sortClubs(Array.from(new Set(shots.map((s) => s.club_type || "Unknown")))),
    [shots]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());


  const toggle = (c: string) => {
    const next = new Set(selected);
    next.has(c) ? next.delete(c) : next.add(c);
    setSelected(next);
  };

  // Build per-club data + ellipse
  const clubData = useMemo(() => {
    return Array.from(selected).map((club) => {
      const pts = shots
        .filter((s) => (s.club_type || "Unknown") === club)
        .map((s) => ({
          side: (s.side_carry ?? s.side_total ?? 0) as number,
          carry: (s.carry ?? s.total ?? 0) as number,
        }))
        .filter((p) => Number.isFinite(p.side) && Number.isFinite(p.carry) && p.carry > 0);
      const ellipse = fitEllipse(pts, 2);
      return { club, color: clubColor(club), pts, ellipse };
    });
  }, [selected, shots]);

  // Chart bounds
  const bounds = useMemo(() => {
    const all = clubData.flatMap((c) => c.pts);
    if (all.length === 0) return { xMin: -20, xMax: 20, yMin: 0, yMax: 100 };
    const sides = all.map((p) => p.side);
    const carries = all.map((p) => p.carry);
    const pad = 10;
    const xMin = Math.min(...sides) - pad;
    const xMax = Math.max(...sides) + pad;
    const spread = Math.max(Math.abs(xMin), Math.abs(xMax));
    return {
      xMin: -spread, xMax: spread,
      yMin: Math.max(0, Math.min(...carries) - pad),
      yMax: Math.max(...carries) + pad,
    };
  }, [clubData]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Shot dispersion ({dLbl})</CardTitle>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setSelected(new Set(allClubs))}
              className="px-2 py-1 rounded border border-border hover:bg-muted"
            >Select all</button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded border border-border hover:bg-muted"
            >Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allClubs.map((c) => {
            const on = selected.has(c);
            const color = clubColor(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                className="text-xs px-2 py-1 rounded-full border transition"
                style={{
                  borderColor: color,
                  backgroundColor: on ? color : "transparent",
                  color: on ? "white" : color,
                }}
              >{c}</button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={560}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid opacity={0.15} />
            <XAxis
              type="number" dataKey="side"
              domain={[bounds.xMin, bounds.xMax]}
              hide
            />
            <YAxis
              type="number" dataKey="carry"
              domain={[bounds.yMin, bounds.yMax]}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              width={44}
              label={{ value: `Carry (${dLbl})`, angle: -90, position: "insideLeft", style: { textAnchor: "middle" } }}
            />
            <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(v: number) => Math.round(v)}
            />

            {/* Ellipses drawn via SVG using axis scales */}
            <Customized component={(props: any) => {
              const { xAxisMap, yAxisMap } = props;
              const xAxis = xAxisMap && Object.values(xAxisMap)[0] as any;
              const yAxis = yAxisMap && Object.values(yAxisMap)[0] as any;
              if (!xAxis || !yAxis) return null;
              const xScale = xAxis.scale;
              const yScale = yAxis.scale;
              return (
                <g>
                  {clubData.map(({ club, color, ellipse }) => {
                    if (!ellipse) return null;
                    const cx = xScale(ellipse.cx);
                    const cy = yScale(ellipse.cy);
                    // Convert world semi-axes to pixel space via scale slope
                    const xUnit = Math.abs(xScale(1) - xScale(0));
                    const yUnit = Math.abs(yScale(1) - yScale(0));
                    const rxPx = ellipse.rx * xUnit;
                    const ryPx = ellipse.ry * yUnit;
                    const angleDeg = (ellipse.angleRad * 180) / Math.PI;
                    return (
                      <g key={club} transform={`translate(${cx} ${cy}) rotate(${-angleDeg})`}>
                        <ellipse
                          cx={0} cy={0} rx={rxPx} ry={ryPx}
                          fill={color} fillOpacity={0.12}
                          stroke={color} strokeOpacity={0.6} strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                        <circle cx={0} cy={0} r={3} fill={color} />
                      </g>
                    );
                  })}
                </g>
              );
            }} />
            {clubData.map(({ club, color, pts }) => (
              <Scatter key={club} name={club} data={pts} fill={color} />
            ))}
            <Legend />
          </ScatterChart>
        </ResponsiveContainer>

        {/* Shape summary per selected club */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
          {clubData.map(({ club, color, ellipse, pts }) => (
            <div key={club} className="border border-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="font-medium">{club}</span>
                <span className="text-xs text-muted-foreground ml-auto">{pts.length} shots</span>
              </div>
              {ellipse ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    Pattern: <span className="text-foreground font-medium">{ellipse.shape}</span>
                    {" "}({ellipse.shapePct.toFixed(0)}%)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Landing zone: {(ellipse.rx * 2).toFixed(0)} × {(ellipse.ry * 2).toFixed(0)} {dLbl} (95%)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Centre: {ellipse.cx.toFixed(0)} side / {ellipse.cy.toFixed(0)} carry
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Need at least 3 shots for a pattern.</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionTrendChart({
  sessions, shots, dLbl, sLbl,
}: { sessions: Session[]; shots: Shot[]; dLbl: string; sLbl: string }) {
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
        <Line type="monotone" dataKey="carry" stroke="#1F4C25" name={`Avg carry (${dLbl})`} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ball" stroke="#EC622D" name={`Avg ball spd (${sLbl})`} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SessionDetail({
  session, shots, dLbl, sLbl,
}: { session: Session; shots: Shot[]; dLbl: string; sLbl: string }) {
  const stats = useMemo(() => statsByClub(shots), [shots]);
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {format(parseISO(session.session_date), "EEE d MMM yyyy")}
        {session.started_at ? ` · ${format(parseISO(session.started_at), "h:mma").toLowerCase()}` : ""}
        {session.duration_minutes ? ` · ${Math.round(session.duration_minutes)} min` : ""}
        {" · "}{session.shot_count} shots
      </div>

      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="dispersion">Dispersion</TabsTrigger>
          <TabsTrigger value="shots">Every shot</TabsTrigger>
        </TabsList>
        <TabsContent value="stats" className="pt-4">
          <ClubStatsTable rows={stats} dLbl={dLbl} sLbl={sLbl} />
        </TabsContent>
        <TabsContent value="dispersion" className="pt-4">
          <DispersionChart shots={shots} dLbl={dLbl} />
        </TabsContent>
        <TabsContent value="shots" className="pt-4">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-right">Ball ({sLbl})</TableHead>
                    <TableHead className="text-right">Club ({sLbl})</TableHead>
                    <TableHead className="text-right">Smash</TableHead>
                    <TableHead className="text-right">Launch°</TableHead>
                    <TableHead className="text-right">Spin</TableHead>
                    <TableHead className="text-right">Carry ({dLbl})</TableHead>
                    <TableHead className="text-right">Total ({dLbl})</TableHead>
                    <TableHead className="text-right">Side ({dLbl})</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shots.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.shot_number ?? ""}</TableCell>
                      <TableCell style={{ color: clubColor(s.club_type || "") }}>{s.club_type ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmt(s.ball_speed, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.club_speed, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.smash_factor, 2)}</TableCell>
                      <TableCell className="text-right">{fmt(s.launch_angle, 1)}</TableCell>
                      <TableCell className="text-right">{fmt(s.spin_rate, 0)}</TableCell>

                      <TableCell className="text-right">{fmt(s.carry, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.total, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.side_carry ?? s.side_total, 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
