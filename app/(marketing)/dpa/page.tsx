import { LegalDocument } from "@/components/legal-document";

export const metadata = {
  title: "Data Processing Addendum — SiroQ",
  description:
    "The SiroQ DPA: processing instructions, subprocessor commitments, security measures, data subject support, breach notification, deletion and audit terms.",
};

export default function DpaPage() {
  return (
    <LegalDocument
      title="Data Processing Addendum"
      intro={
        <p>
          This addendum forms part of the agreement between you and SiroQ for the provision of the
          SiroQ service. It describes how we process personal data on your behalf. Where it conflicts
          with the main agreement, this addendum prevails on the subject of personal data.
        </p>
      }
      sections={[
        {
          id: "scope",
          heading: "1. Scope and roles",
          body: [
            <p key="1">
              You are the controller of the personal data submitted to the service. SiroQ is the
              processor of that data. SiroQ acts only on your documented instructions, which are the
              configuration and use of the service by your authorised users.
            </p>,
            <p key="2">
              Data categories include: your organisation&apos;s name, the names and email addresses
              of its users, session records, and the contents of dispensing files you upload —
              together with derived metadata such as file checksums, row and column counts, detected
              columns, intake verdicts, findings and report contents.
            </p>,
          ],
        },
        {
          id: "processing",
          heading: "2. Processing instructions",
          body: [
            <p key="1">
              We process personal data only to provide the service: storing the files you upload,
              parsing them against the filing manifest, presenting them to the users you authorise,
              recording status events you instruct, and producing reports your administrators attach.
            </p>,
            <p key="2">
              We do not use your data to train models, to build profiles, or for any independent
              purpose. We do not sell it. We do not use it for advertising.
            </p>,
          ],
        },
        {
          id: "subprocessors",
          heading: "3. Subprocessors",
          body: [
            <p key="1">
              We use the subprocessors listed on our subprocessors page. That list is incorporated
              by reference and forms part of this addendum.
            </p>,
            <p key="2">
              We will give you at least thirty days&apos; notice before adding or replacing a
              subprocessor. If you object on reasonable data-protection grounds, you may terminate
              the affected service without penalty before the change takes effect.
            </p>,
          ],
        },
        {
          id: "security",
          heading: "4. Security measures",
          body: [
            <p key="1">
              We maintain the technical and organisational measures described on our security page,
              including: hashed password storage, opaque hashed server-side sessions, per-request
              tenant scoping derived from the session, server-written audit events committed within
              the transaction they describe, checksum integrity on stored files, short-lived
              presigned upload URLs, and authorised streaming for raw documents.
            </p>,
            <p key="2">
              That page also lists the measures not currently in place, including the absence of
              rate limiting on application routes, the absence of application-layer encryption, and
              the absence of an external penetration test. We will not remove a disclosure from that
              page without also removing or implementing the underlying control.
            </p>,
          ],
        },
        {
          id: "support",
          heading: "5. Data subject support",
          body: [
            <p key="1">
              Taking into account the nature of the processing, we assist you — by appropriate
              technical and organisational measures — in responding to requests from a data subject
              to exercise their rights. Because filing contents and user records live in the same
              tenant-scoped system, access and deletion requests can largely be actioned through the
              service itself.
            </p>,
            <p key="2">
              Where a request requires action we cannot perform through the interface, contact us and
              we will respond within a reasonable period, and in any case within the timeframe your
              supervisory authority requires of you as controller.
            </p>,
          ],
        },
        {
          id: "breach",
          heading: "6. Personal data breaches",
          body: [
            <p key="1">
              We will notify you without undue delay, and in any event within seventy-two hours of
              becoming aware, where a personal data breach affecting your data is likely to result in
              a risk to the rights and freedoms of natural persons. We do not currently maintain a
              formal incident response plan with committed notification SLAs, and this clause
              reflects a commitment we are making prospectively rather than a process we have
              documented and tested.
            </p>,
            <p key="2">
              The notice will describe the nature of the breach, the categories and approximate
              number of data subjects involved, the likely consequences, and the measures taken or
              proposed. Where information is not available at the same time, it may be provided in
              phases.
            </p>,
          ],
        },
        {
          id: "deletion",
          heading: "7. Return and deletion",
          body: [
            <p key="1">
              On termination we will, at your choice, return or delete your personal data within
              thirty days, and delete working copies thereafter. The retention window and the point
              at which deletion occurs are agreed in the order form, because different retention
              obligations apply to different categories of record.
            </p>,
            <p key="2">
              We may retain data where retention is required by law, or to establish, exercise or
              defend legal claims. Retained data is isolated and no longer used for any other purpose.
            </p>,
          ],
        },
        {
          id: "audit",
          heading: "8. Information and audits",
          body: [
            <p key="1">
              We will make available the information necessary to demonstrate compliance with this
              addendum, including this addendum itself, the current subprocessor list, and the
              security and compliance pages.
            </p>,
            <p key="2">
              We do not currently hold an independent audit report, because we have not been
              audited. We will not represent one as existing. If your policy requires third-party
              assurance rather than documentation, this is a gap and we would rather you identify it
              than assume it away.
            </p>,
          ],
        },
        {
          id: "transfers",
          heading: "9. International transfers",
          body: [
            <p key="1">
              Our infrastructure providers process data in the regions in which they operate. Where
              personal data is transferred outside your jurisdiction, the relevant provider&apos;s own
              transfer mechanism applies. We do not currently operate region pinning for all
              providers; residency arrangements are made in an order form where required.
            </p>,
          ],
        },
        {
          id: "changes",
          heading: "10. Changes to this addendum",
          body: [
            <p key="1">
              We may update this addendum to reflect changes in the service or in law. Material
              changes will be notified by email at least thirty days before taking effect. Continuing
              to use the service after that date constitutes acceptance.
            </p>,
          ],
        },
      ]}
    />
  );
}
