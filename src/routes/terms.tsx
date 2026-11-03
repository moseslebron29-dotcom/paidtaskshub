import { createFileRoute } from "@tanstack/react-router";
import { Legal } from "./privacy";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms and Conditions – PaidTasksHub" },
      { name: "description", content: "The rules for using PaidTasksHub tasks, wallet and withdrawals." },
      { property: "og:title", content: "Terms and Conditions – PaidTasksHub" },
      { property: "og:description", content: "Rules for using PaidTasksHub." },
    ],
  }),
  component: () => (
    <Legal
      title="Terms and Conditions"
      items={[
        ["1. Accounts", "You must give accurate details and keep one account per person. You are responsible for keeping your password safe."],
        ["2. Activation", "Your email must be confirmed, and a one-time activation fee (shown in KES on the activation page) must be paid via M-Pesa before you can start tasks or withdraw. Your account is activated only after M-Pesa confirms the payment."],
        ["3. Tasks and rewards", "Rewards are shown on each task and credited only when a submission is approved. We may change or remove tasks at any time. Earnings are not guaranteed."],
        ["4. Withdrawals", "Withdrawals are paid to M-Pesa, subject to the minimum amount and any withdrawal fee shown in your wallet."],
        ["5. Fair use", "Bots, multiple accounts, fake proofs or fake referrals may lead to suspension and loss of unpaid rewards."],
        ["6. Refunds", "The activation fee is non-refundable once your account is activated, except where a payment was taken in error. Contact support if you were charged but not activated."],
        ["7. Changes", "We may update these terms. Continued use means you accept the updated terms."],
      ]}
    />
  ),
});
