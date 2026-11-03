import { createFileRoute, Link } from "@tanstack/react-router";
import { Brand } from "@/components/brand";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy – PaidTasksHub" },
      { name: "description", content: "How PaidTasksHub collects, uses and protects your information." },
      { property: "og:title", content: "Privacy Policy – PaidTasksHub" },
      { property: "og:description", content: "How PaidTasksHub handles your data." },
    ],
  }),
  component: () => (
    <Legal
      title="Privacy Policy"
      items={[
        ["What we collect", "Your full name, email address, phone number, a securely hashed password, your task activity and proofs, wallet records, and M-Pesa payment references (amount, phone, receipt number, date)."],
        ["What we never collect", "We never see or store your M-Pesa PIN. You enter it only on your own phone."],
        ["How we use it", "To run your account, verify your email, process your activation payment and withdrawals, review task submissions, prevent fraud and contact you about your account."],
        ["Sharing", "We share only what is needed with Safaricom (M-Pesa payments). We do not sell your data."],
        ["Security", "Passwords are hashed, sessions are secured, and payment credentials stay on our server."],
        ["Your choices", "You can contact support to ask for your data or account deletion."],
      ]}
    />
  ),
});

export function Legal({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <main className="container-page max-w-3xl py-10">
      <Brand className="mb-8" />
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">Last updated: November 2026</p>
      <div className="space-y-5">
        {items.map(([h, b]) => (
          <section key={h}>
            <h2 className="text-lg font-bold">{h}</h2>
            <p className="text-muted-foreground">{b}</p>
          </section>
        ))}
      </div>
      <Link to="/" className="mt-8 inline-block font-bold text-primary">← Back to home</Link>
    </main>
  );
}
