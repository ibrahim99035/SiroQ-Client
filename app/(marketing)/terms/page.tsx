import Link from "next/link";
import { LegalDocument } from "@/components/legal-document";

export const metadata = {
  title: "Terms of Service — SiroQ",
  description:
    "The SiroQ terms of service: what the service is and is not, acceptable use, your data, intellectual property, liability and termination.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro={
        <p>
          These terms govern your use of the SiroQ service, including this website and the
          application. By creating an account or using the service you accept them. Where an order
          form or the{" "}
          <Link href="/dpa">data processing addendum</Link> says something different, that document
          prevails on the point it covers.
        </p>
      }
      sections={[
        {
          id: "service",
          heading: "1. The service",
          body: [
            <p key="1">
              SiroQ is a multi-tenant workspace for submitting, validating, reviewing and reporting on
              pharmacy dispensing records. It provides a filing reference, an intake verdict against a
              filing manifest, a status history, and a report attachment.
            </p>,
            <p key="2">
              The service is provided as-is. It is a tool for managing records and evidencing their
              handling; it is not a compliance programme, a clinical decision support system, and not
              an analysis engine. It does not certify that dispensing data is clinically appropriate,
              and a valid intake verdict means a file passed a structural and manifest check, not
              that its contents are correct.
            </p>,
          ],
        },
        {
          id: "accounts",
          heading: "2. Accounts and access",
          body: [
            <p key="1">
              Accounts are issued by invitation. You are responsible for the accuracy of the
              information in your account and for activity performed under it. Keep your
              credentials confidential.
            </p>,
            <p key="2">
              You must not share a single account between people. Role assignment is the mechanism
              for giving someone access, and using a shared account defeats the audit trail the
              service exists to produce.
            </p>,
            <p key="3">
              Tell us promptly if you believe your account has been compromised. Deactivating a user
              ends their sessions immediately.
            </p>,
          ],
        },
        {
          id: "acceptable-use",
          heading: "3. Acceptable use",
          body: [
            <p key="1">You agree not to use the service to:</p>,
            <ul key="2">
              <li>upload malware, or content you have no right to upload;</li>
              <li>
                attempt to access data belonging to another tenant, or to test the boundaries of a
                tenant boundary you were not authorised to test;
              </li>
              <li>circumvent rate limits, or use the service to send unsolicited bulk messages;</li>
              <li>reverse engineer the service except where that restriction is prohibited by law;</li>
              <li>
                use the service in a way that breaks applicable law, including data-protection law.
              </li>
            </ul>,
            <p key="3">
              The contact form has an abuse throttle. Application routes do not currently have
              distributed rate limiting — a documented gap — so the restriction above is a term you
              agree to rather than a control we can yet enforce.
            </p>
          ],
        },
        {
          id: "your-data",
          heading: "4. Your data",
          body: [
            <p key="1">
              You retain all rights in the data you upload. We claim no ownership of your dispensing
              records, and we do not licence them for any purpose beyond providing the service.
            </p>,
            <p key="2">
              You are responsible for having the rights and permissions necessary to upload the data
              you upload, including under any data-protection law that applies to it. In particular,
              uploading personal data relating to identifiable patients is your responsibility, and
              you should confirm your lawful basis before doing so.
            </p>,
            <p key="3">
              Files are stored so they can be retrieved, not as a backup service. We strongly
              recommend you keep your own copy of anything you would be unhappy to lose.
            </p>
          ],
        },
        {
          id: "availability",
          heading: "5. Availability and support",
          body: [
            <p key="1">
              We aim for high availability and publish current status on the{" "}
              <Link href="/status">status page</Link>. We do not currently offer a contractual
              availability SLA; that is negotiated on Enterprise agreements. The status page reflects
              what we actually observe and is not a commitment of future uptime.
            </p>,
            <p key="2">
              Support is provided by email. Severity and response targets are set out in your order
              form where one exists.
            </p>,
          ],
        },
        {
          id: "ip",
          heading: "6. Intellectual property",
          body: [
            <p key="1">
              We own the service, its source code, design, documentation and the SiroQ name and marks.
              You own your data. You grant us only the limited licence needed to host, process,
              transmit and display that data in order to run the service for you.
            </p>,
            <p key="2">
              Feedback you send may be used to improve the service without obligation to you. We will
              not identify you as its source without permission.
            </p>,
          ],
        },
        {
          id: "third-party",
          heading: "7. Third-party services",
          body: [
            <p key="1">
              The service depends on infrastructure providers listed on the{" "}
              <Link href="/subprocessors">subprocessors page</Link>. Your use of the service depends
              on those providers remaining available. We are not responsible for their acts or
              omissions, and their terms apply to you directly where relevant.
            </p>,
          ],
        },
        {
          id: "warranties",
          heading: "8. Disclaimers and liability",
          body: [
            <p key="1">
              Except where the law says otherwise, the service is provided without warranties of any
              kind, express or implied, including fitness for a particular purpose. We do not warrant
              that the service will be uninterrupted or error-free.
            </p>,
            <p key="2">
              Nothing in these terms excludes liability that cannot lawfully be excluded. Subject to
              that, neither party is liable for indirect or consequential loss, and each party&apos;s
              total liability is limited to the fees paid in the twelve months preceding the claim.
              Nothing here limits liability for death or personal injury caused by negligence, for
              fraud, or for anything else that cannot be limited by law.
            </p>,
            <p key="3">
              SiroQ&apos;s security posture includes known gaps, listed on the{" "}
              <Link href="/security">security page</Link> and in the{" "}
              <Link href="/compliance">compliance posture</Link>. You have assessed those gaps in
              deciding to use the service, and they inform the liability position above.
            </p>
          ],
        },
        {
          id: "termination",
          heading: "9. Suspension and termination",
          body: [
            <p key="1">
              You may stop using the service and close your account at any time. We may suspend or
              terminate access for breach of these terms, for non-payment, or where required by law.
              We will normally give notice and an opportunity to remedy before terminating for
              breach.
            </p>,
            <p key="2">
              On termination, your data is returned or deleted as set out in the{" "}
              <Link href="/dpa">addendum</Link> and the order form. Sections that by their nature
              should survive — including liability and governing law — do.
            </p>
          ],
        },
        {
          id: "changes",
          heading: "10. Changes",
          body: [
            <p key="1">
              We may update these terms. Material changes will be notified by email at least thirty
              days before taking effect. If you do not accept them, you may terminate and we will
              refund any prepaid fees for the unused period.
            </p>
          ],
        },
        {
          id: "general",
          heading: "11. General",
          body: [
            <p key="1">
              If a provision is found unenforceable, the rest continues in force. Failure to enforce a
              right is not a waiver of it. Neither party may assign these terms without the other&apos;s
              consent, except to a successor of substantially all of its business.
            </p>,
            <p key="2">
              These terms are governed by the law specified in your order form. Where no order form
              exists, disputes are subject to the courts of the operator&apos;s jurisdiction.
            </p>
          ],
        },
      ]}
    />
  );
}
