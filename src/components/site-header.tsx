import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/session";

const links = [
  { href: "#tasks", label: "Tasks" },
  { href: "#categories", label: "Categories" },
  { href: "#how", label: "How it works" },
  { href: "#reviews", label: "Reviews" },
  { href: "#faq", label: "FAQs" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-navy-foreground/10 bg-navy/95 backdrop-blur">
      <div className="container-page flex min-h-16 items-center justify-between gap-3">
        <Brand light />
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] font-semibold text-navy-muted transition-colors hover:text-navy-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {me ? (
            <Button asChild size="sm">
              <Link to="/dashboard">My dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="hero" className="hidden sm:inline-flex">
                <Link to="/auth" search={{ tab: "login" }}>Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth" search={{ tab: "register" }}>Join now</Link>
              </Button>
            </>
          )}
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-navy-foreground/25 text-navy-foreground md:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="container-page flex flex-col gap-1 pb-4 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 font-semibold text-navy-muted hover:bg-navy-2 hover:text-navy-foreground">
              {l.label}
            </a>
          ))}
          {!me && (
            <Link to="/auth" search={{ tab: "login" }} className="rounded-lg px-2 py-2.5 font-semibold text-navy-muted hover:bg-navy-2">
              Log in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter({ email, phone }: { email?: string | undefined; phone?: string | undefined }) {
  return (
    <footer className="bg-navy py-10 text-sm text-navy-muted">
      <div className="container-page flex flex-wrap justify-between gap-6">
        <div className="max-w-xs">
          <Brand light />
          <p className="mt-3">Tasks, referrals and M-Pesa withdrawals. Earnings depend on task availability and your activity.</p>
          {(email || phone) && (
            <p className="mt-2">
              Support: {email} {email && phone ? "·" : ""} {phone}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/auth" search={{ tab: "login" }} className="hover:text-navy-foreground">Log in</Link>
            <Link to="/auth" search={{ tab: "register" }} className="hover:text-navy-foreground">Create account</Link>
            <Link to="/privacy" className="hover:text-navy-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-navy-foreground">Terms</Link>
          </p>
          <p>© {new Date().getFullYear()} PaidTasksHub. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
