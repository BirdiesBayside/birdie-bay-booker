import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

export default function AdminFranchiseEnquiries() {
  const [allowed, setAllowed] = useState(false);
  const [page, setPage] = useState(0);
  const navigate = useNavigate();
  useEffect(() => { void (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/"); return; }
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!data) { navigate("/"); return; }
    setAllowed(true);
  })(); }, [navigate]);
  const query = useQuery({ queryKey: ["franchise-enquiries", page], enabled: allowed, queryFn: async () => {
    const { data, error, count } = await supabase.from("franchise_enquiries").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (error) throw error;
    return { rows: data, count: count ?? 0 };
  } });
  if (!allowed) return null;
  return <AdminLayout><div className="p-6 w-full min-w-0"><div className="flex justify-between gap-4 mb-8"><h1 className="text-3xl">Franchise enquiries</h1><Button variant="outline" size="icon" onClick={() => query.refetch()} aria-label="Refresh enquiries"><RefreshCw /></Button></div>{query.isLoading ? <p>Loading enquiries…</p> : query.error ? <p role="alert">Unable to load enquiries. Please try again.</p> : !query.data?.rows.length ? <p className="text-muted-foreground">No franchise enquiries yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{["Received (Brisbane)", "Name", "Contact", "State / Region", "Desired location", "Budget", "Email"].map(label => <th className="p-3 whitespace-nowrap" key={label}>{label}</th>)}</tr></thead><tbody>{query.data.rows.map(row => <tr key={row.id} className="border-b"><td className="p-3 whitespace-nowrap">{formatInTimeZone(row.created_at, "Australia/Brisbane", "d MMM yyyy, h:mm a")}</td><td className="p-3">{row.name}</td><td className="p-3"><a href={`mailto:${row.email}`} className="text-accent">{row.email}</a><br /><a href={`tel:${row.phone}`}>{row.phone}</a></td><td className="p-3">{row.region}</td><td className="p-3">{row.location}</td><td className="p-3 whitespace-nowrap">{row.budget}</td><td className="p-3">{row.email_status === "sent" ? "Sent" : row.email_status === "failed" ? "Needs attention" : "Pending"}</td></tr>)}</tbody></table></div>}<div className="flex items-center gap-4 mt-6"><Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><ArrowLeft /></Button><span>Page {page + 1} · {query.data?.count ?? 0} enquiries</span><Button variant="outline" size="icon" disabled={(page + 1) * 50 >= (query.data?.count ?? 0)} onClick={() => setPage(p => p + 1)} aria-label="Next page"><ArrowRight /></Button></div></div></AdminLayout>;
}