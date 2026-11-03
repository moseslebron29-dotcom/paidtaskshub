import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { cn } from "@/lib/utils";

export function ReviewDialog() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (body.trim().length < 10) { toast.error("Please write at least 10 characters."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("submit_review", { _rating: rating, _body: body.trim().slice(0, 600), _consent: consent });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Thanks! Your review will appear once it's approved.");
    setOpen(false);
    setBody("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" size="lg">
          <Star /> LEAVE A REVIEW
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave a review</DialogTitle>
          <DialogDescription>Reviews are checked before they're published. Members with completed activity get a "Verified member" label.</DialogDescription>
        </DialogHeader>
        {!me ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please log in so we know the review comes from a real member.</p>
            <Button asChild className="w-full">
              <Link to="/auth" search={{ tab: "login", next: "/#reviews" }}>Log in to review</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)}>
                  <Star className={cn("h-8 w-8", n <= rating ? "fill-gold text-gold" : "text-input")} />
                </button>
              ))}
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} rows={5} placeholder="Tell others about your experience…" />
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
              <span>I allow PaidTasksHub to publish this review with my first name.</span>
            </label>
            <Button onClick={submit} disabled={busy || !consent} className="w-full">
              {busy && <Loader2 className="animate-spin" />} Submit review
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
