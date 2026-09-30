import Link from "next/link";
import { LegalDocument } from "@/components/legal-document";

export const metadata = {
  title: "Privacy Policy — SiroQ",
  description:
    "How SiroQ handles personal data: what we collect, why, who we share it with, how long we keep it, and the rights you have over it.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro={
        <>
          <p>
            This policy describes what SiroQ does with personal data. It covers both the public
            website and the application, and it distinguishes data about{" "}
            <strong>you as a user</strong> from data your organisation uploads{" "}
            <strong>through</strong> the service.
          </p>,
          <p>
            If your organisation uses SiroQ, your organisation is the controller of the dispensing
            data it uploads. That data is handled on your organisation&apos;s instructions, and the
            terms are in the{" "}
            <Link href="/dpa">data processing addendum</Link> rather than here.
          </p>
        </>
      }
      sections={[
        {
          id: "who-we-are",
          heading: "1. Who we are",
          body: [
            <p key="1">
              SiroQ provides a review workspace for pharmacy dispensing records. In this policy
              &ldquo;SiroQ&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; refer to the SiroQ operator,
              which is the entity named in your agreement or order form.
            </p>,
          ],
        },
        {
          id: "what-we-collect",
          heading: "2. What we collect",
          body: [
            <p key="1">There are three distinct categories, and they are not treated the same way.</p>,
            <h3 key="h3a">Account data</h3>,
            <p key="2">
              Your name, email address, password hash, organisation, role and account status. Also
              your session records, which are stored hashed so that a database copy cannot be used to
              replay an active session.
            </p>,
            <h3 key="h3b">Customer data submitted through the service</h3>,
            <p key="3">
              The contents of dispensing files your organisation uploads, together with derived
              metadata: file names, sizes, checksums, row and column counts, detected columns, intake
              verdicts, findings, status history and report contents. This is your
              organisation&apos;s data, processed on your organisation&apos;s instructions.
            </p>,
            <h3 key="h3c">Data you send us directly</h3>,
            <p key="4">
              If you use the contact form we receive the name, email address, organisation, topic and
              message you submit. Contact submissions are delivered to our team inbox and are not
              stored in the application database.
            </p>,
          ],
        },
        {
          id: "why",
          heading: "3. Why we process it",
          body: [
            <ul key="1">
              <li>
                <strong>Account data</strong> — to authenticate you, maintain your session, and apply
                the permissions that decide what you can see.
              </li>
              <li>
                <strong>Customer data</strong> — to store, parse and present the filings your
                organisation submits, and to record the status history and reports you instruct.
              </li>
              <li>
                <strong>Contact submissions</strong> — to reply to you.
              </li>
            </ul>,
            <p key="2">
              Our lawful bases are performance of a contract for the first two, and legitimate
              interests in responding to enquiries for the third. Where we rely on legitimate
              interests we have assessed that the processing is necessary for that purpose and that
              your rights do not outweigh it.
            </p>,
          ],
        },
        {
          id: "sharing",
          heading: "4. Who we share it with",
          body: [
            <p key="1">
              We share personal data only with the subprocessors listed on the{" "}
              <Link href="/subprocessors">subprocessors page</Link>: our infrastructure providers for
              the database, file storage and email, and, where a deployment has explicitly enabled
              it, an optional analysis service.
            </p>,
            <p key="2">
              We do not sell personal data. We do not share it with advertisers or data brokers, and
              we do not use it for advertising. We load no third-party analytics or tracking scripts
              on this website or in the application.
            </p>,
            <p key="3">
              We may disclose data if required by law or a valid legal process, and will notify you
              unless prohibited from doing so. We do not disclose data in response to demands from
              one customer about another&apos;s data.
            </p>,
          ],
        },
        {
          id: "international",
          heading: "5. International transfers",
          body: [
            <p key="1">
              Our infrastructure providers process data in the regions in which they operate, which
              may be outside your jurisdiction. Where that happens, the provider&apos;s own transfer
              mechanism applies. Region pinning and residency arrangements are agreed in an order
              form where they are required; they are not currently a self-service feature.
            </p>,
          ],
        },
        {
          id: "retention",
          heading: "6. How long we keep it",
          body: [
            <p key="1">
              Account data is kept for as long as the account is active, and for a defined period
              after deactivation so that a reactivated account retains its history. Session records
              are kept for the session lifetime and then deleted.
            </p>,
            <p key="2">
              Customer data is kept for the term of the agreement and for the retention period agreed
              in it. Different categories of record may have different retention obligations, which
              is why the period is specified in the order form rather than being a single number
              here.
            </p>,
            <p key="3">
              Contact submissions are kept for as long as needed to deal with the enquiry.
            </p>
          ],
        },
        {
          id: "security",
          heading: "7. Security",
          body: [
            <p key="1">
              We apply the measures described on our{" "}
              <Link href="/security">security page</Link>, which also lists the measures we have not
              implemented — including rate limiting on application routes, application-layer
              encryption and external penetration testing. We publish that list rather than omitting
              it, and we consider it part of this policy that you know about it.
            </p>
          ],
        },
        {
          id: "cookies",
          heading: "8. Cookies",
          body: [
            <p key="1">
              The service uses a single session cookie, which is httpOnly and SameSite and is required
              to stay signed in. The public website sets no analytics, advertising or tracking
              cookies. Details are on the{" "}
              <Link href="/cookies">cookie policy</Link>.
            </p>
          ],
        },
        {
          id: "rights",
          heading: "9. Your rights",
          body: [
            <p key="1">
              Depending on your jurisdiction, you may have the right to access, correct, delete,
              restrict or port your personal data, to object to processing, and to complain to a
              supervisory authority.
            </p>,
            <p key="2">
              For account data, most of these can be actioned directly in the service. For data your
              organisation uploaded, your organisation decides — write to us and we will direct the
              request to the right place, or handle it if your organisation has asked us to.
            </p>,
            <p key="3">We will respond within the period your applicable law requires, and we will not charge for a request.</p>
          ],
        },
        {
          id: "children",
          heading: "10. Children",
          body: [
            <p key="1">
              The service is intended for organisations and their authorised users. It is not
              directed at children, and we do not knowingly collect personal data from anyone under
              the age of sixteen.
            </p>,
          ],
        },
        {
          id: "changes",
          heading: "11. Changes to this policy",
          body: [
            <p key="1">
              We will update this policy when the service or the law changes, and will publish the
              effective date above. Material changes affecting your rights will be notified by email
              before taking effect.
            </p>,
          ],
        },
      ]}
    />
  );
}
