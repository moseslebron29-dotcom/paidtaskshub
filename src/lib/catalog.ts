import {
  Music2,
  Youtube,
  Film,
  ClipboardList,
  Brain,
  MessageCircle,
  Share2,
  Gamepad2,
  Megaphone,
  RotateCw,
  PenLine,
  ShoppingBag,
  Users,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type CategoryKey =
  | "tiktok"
  | "youtube"
  | "movies"
  | "surveys"
  | "trivia"
  | "chatting"
  | "social"
  | "games"
  | "ads"
  | "spin"
  | "writing"
  | "promotion"
  | "referral"
  | "general";

export const CATEGORIES: { key: CategoryKey; label: string; icon: LucideIcon; blurb: string }[] = [
  { key: "tiktok", label: "TikTok videos", icon: Music2, blurb: "Watch and react to short clips." },
  { key: "youtube", label: "YouTube videos", icon: Youtube, blurb: "Watch listed videos in full." },
  { key: "movies", label: "Movies & videos", icon: Film, blurb: "Trailers, reviews and clips." },
  { key: "surveys", label: "Online surveys", icon: ClipboardList, blurb: "Share honest opinions." },
  { key: "trivia", label: "Trivia quizzes", icon: Brain, blurb: "Test your general knowledge." },
  { key: "chatting", label: "Chatting tasks", icon: MessageCircle, blurb: "Friendly scripted chats." },
  { key: "social", label: "Social media", icon: Share2, blurb: "Like, follow and share." },
  { key: "games", label: "Playing games", icon: Gamepad2, blurb: "Finish casual game levels." },
  { key: "ads", label: "Advert viewing", icon: Megaphone, blurb: "Watch partner adverts." },
  { key: "spin", label: "Daily spin", icon: RotateCw, blurb: "One bonus claim per day." },
  { key: "writing", label: "Article writing", icon: PenLine, blurb: "Short original articles." },
  { key: "promotion", label: "Product promotion", icon: ShoppingBag, blurb: "Share product promos." },
  { key: "referral", label: "Referrals", icon: Users, blurb: "Invite friends who activate." },
  { key: "general", label: "General assignments", icon: Briefcase, blurb: "Simple online jobs." },
];

export function categoryMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1]!;
}

export function kes(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return "KES " + v.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function rewardLabel(r: number | string | null | undefined) {
  return r == null || Number(r) <= 0 ? "Reward not set yet" : kes(r);
}

export function durationLabel(m: number | null | undefined) {
  if (!m) return "Time not set";
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `~${h}h${r ? ` ${r}m` : ""}`;
}

export const SUBMISSION_STATUS: Record<string, { label: string; tone: "info" | "warn" | "ok" | "bad" | "muted" }> = {
  available: { label: "Available", tone: "muted" },
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Submitted", tone: "warn" },
  under_review: { label: "Under review", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
  pending: { label: "Pending", tone: "warn" },
  processing: { label: "Processing", tone: "info" },
  paid: { label: "Paid", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
  open: { label: "Open", tone: "warn" },
  answered: { label: "Answered", tone: "ok" },
  closed: { label: "Closed", tone: "muted" },
};

export function normalizeKePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(d)) d = "254" + d.slice(1);
  if (/^[17]\d{8}$/.test(d)) d = "254" + d;
  return /^254[17]\d{8}$/.test(d) ? d : null;
}

export function safeNext(next: unknown, fallback = "/dashboard"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
