import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2, UserSearch, Phone, Mail } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PartnerListing {
  id: string;
  user_id: string;
  player_name: string;
  contact_info: string;
  handicap: number | null;
  created_at: string;
}

const CompFindPartner = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myListing, setMyListing] = useState<PartnerListing | null>(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [handicap, setHandicap] = useState("");

  const fetchListings = async () => {
    const { data, error } = await supabase
      .from("comp_partner_board")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setListings(data);
      if (user) {
        const mine = data.find((l) => l.user_id === user.id);
        setMyListing(mine || null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchListings();
  }, [user]);

  const handleSubmit = async () => {
    const trimName = name.trim();
    const trimContact = contact.trim();
    if (!trimName || !trimContact) {
      toast({ title: "Name and contact info are required", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "You must be logged in", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("comp_partner_board").insert({
      user_id: user.id,
      player_name: trimName,
      contact_info: trimContact,
      handicap: handicap ? parseFloat(handicap) : null,
    });

    if (error) {
      toast({ title: "Failed to add listing", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "You're on the board! 🏌️" });
      setShowForm(false);
      setName("");
      setContact("");
      setHandicap("");
      fetchListings();
    }
    setSubmitting(false);
  };

  const handleRemove = async () => {
    if (!myListing) return;
    const { error } = await supabase
      .from("comp_partner_board")
      .delete()
      .eq("id", myListing.id);

    if (error) {
      toast({ title: "Failed to remove listing", variant: "destructive" });
    } else {
      toast({ title: "Listing removed" });
      setMyListing(null);
      fetchListings();
    }
  };

  const isContactPhone = (c: string) => /^[\d\s+()-]+$/.test(c);

  return (
    <div className="min-h-screen bg-background safe-area-top">
      <div className="max-w-lg mx-auto p-4 pt-6 space-y-6">
        <button
          onClick={() => navigate("/comp")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Comp Area
        </button>

        <div>
          <h1 className="font-display text-3xl text-primary font-bold">FIND A PARTNER</h1>
          <p className="text-muted-foreground mt-1">
            Need a teammate for the 2-Man Ambrose? Add yourself to the board or
            reach out to someone below.
          </p>
        </div>

        {/* My listing or add button */}
        {myListing ? (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <p className="text-sm font-medium text-primary mb-2">You're on the board</p>
            <p className="text-sm text-foreground">{myListing.player_name}</p>
            <p className="text-xs text-muted-foreground">{myListing.contact_info}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleRemove}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remove My Listing
            </Button>
          </div>
        ) : showForm ? (
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold text-sm">Add Yourself</h2>
            <Input
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <Input
              placeholder="Phone or email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={100}
            />
            <Input
              placeholder="Handicap (optional)"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
              type="number"
              step="0.1"
            />
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Adding..." : "Add Me"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Myself to the Board
          </Button>
        )}

        {/* Listings */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <UserSearch className="h-5 w-5 text-primary" />
            Available Players
            <span className="text-sm font-normal text-muted-foreground">
              ({listings.length})
            </span>
          </h2>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : listings.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-lg border border-border">
              <UserSearch className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-muted-foreground text-sm">No one on the board yet.</p>
              <p className="text-muted-foreground text-xs mt-1">Be the first to add yourself!</p>
            </div>
          ) : (
            listings.map((listing) => (
              <div
                key={listing.id}
                className={`bg-card rounded-lg p-4 border ${
                  listing.user_id === user?.id
                    ? "border-primary/30"
                    : "border-border"
                } shadow-sm`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{listing.player_name}</p>
                    {listing.handicap !== null && (
                      <p className="text-xs text-muted-foreground">
                        HCP: {listing.handicap}
                      </p>
                    )}
                  </div>
                  <a
                    href={
                      isContactPhone(listing.contact_info)
                        ? `tel:${listing.contact_info}`
                        : `mailto:${listing.contact_info}`
                    }
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {isContactPhone(listing.contact_info) ? (
                      <Phone className="h-4 w-4" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {listing.contact_info}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CompFindPartner;
