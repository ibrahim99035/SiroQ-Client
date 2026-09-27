import { redirect } from "next/navigation";

import { AcceptInviteForm } from "@/components/forms/accept-invite-form";
import { prisma } from "@/lib/db";
import { hashInviteToken, inviteProblem } from "@/lib/invites";

/**
 * GET /invite/[token]
 *
 * Validates the invitation before rendering the form, so an expired or already
 * redeemed link never shows a password field. The token is carried to the
 * client so the browser can submit it; the SHA-256 digest is what we match on.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token || token.length < 20) {
    redirect("/login?error=invalid-invite");
  }

  const invite = await prisma.user.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: {
      name: true,
      email: true,
      role: true,
      status: true,
      inviteExpiresAt: true,
    },
  });

  if (!invite) {
    return <InviteUnavailable reason="This invitation link is not valid." />;
  }

  const problem = inviteProblem(invite);
  if (problem) {
    return <InviteUnavailable reason={problem} />;
  }

  return <AcceptInviteForm token={token} name={invite.name} email={invite.email} role={invite.role} />;
}

function InviteUnavailable({ reason }: { reason: string }) {
  return (
    <div className="card p-8">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Invitation unavailable</h1>
      <p role="alert" className="mt-2 text-sm leading-relaxed text-muted">
        {reason}
      </p>
      <p className="mt-4 text-[13px] text-muted">
        Ask an administrator to send a new invitation, or{" "}
        <a href="/login" className="text-accent hover:underline">
          sign in
        </a>{" "}
        if you already have a password.
      </p>
    </div>
  );
}
