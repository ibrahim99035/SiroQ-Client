import Link from "next/link";
import { LegalDocument } from "@/components/legal-document";

export const metadata = {
  title: "Cookie Policy — SiroQ",
  description:
    "The cookies SiroQ sets: one strictly necessary session cookie in the application, and none on the public website.",
};

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Cookie Policy"
      intro={
        <>
          <p>
            This is a short policy because the position is simple: the public website sets no
            cookies, and the application sets exactly one.
          </p>,
          <p>
            No analytics, advertising, tracking or third-party cookies are used anywhere on this
            site or in the service.
          </p>
        </>
      }
      sections={[
        {
          id: "what-we-set",
          heading: "1. What we set",
          body: [
            <div
              key="cookie-table"
              className="mt-4 overflow-hidden rounded-card border border-hairline bg-paper-raised"
            >
              <table className="ruled-table w-full text-left text-[13px]">
                <caption className="sr-only">Cookies set by SiroQ</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-4 py-3">Name</th>
                    <th scope="col" className="px-4 py-3">Purpose</th>
                    <th scope="col" className="px-4 py-3">Type</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink">Session cookie</td>
                    <td className="px-4 py-3 text-muted">
                      Keeps you signed in and carries an opaque identifier that the server resolves to
                      your session record.
                    </td>
                    <td className="px-4 py-3 text-muted">Strictly necessary</td>
                  </tr>
                </tbody>
              </table>
            </div>,
            <p key="1">
              Its name is configurable per deployment, so your instance may use a different name.
              Its lifetime is a configured session duration; after it expires you are asked to sign in
              again.
            </p>,
          ],
        },
        {
          id: "properties",
          heading: "2. How it is set",
          body: [
            <ul key="1">
              <li>
                <strong>httpOnly</strong> — inaccessible to client-side scripts, so a cross-site
                scripting flaw cannot read your session.
              </li>
              <li>
                <strong>SameSite</strong> — set so that another origin cannot cause your browser to
                attach it to a request, which is the main cross-site request forgery vector.
              </li>
              <li>
                <strong>Secure</strong> — set in production, so it is only sent over an encrypted
                connection.
              </li>
              <li>
                <strong>Opaque</strong> — the value is a random identifier. It encodes no user
                information, and the session record behind it is stored hashed.
              </li>
            </ul>
          ],
        },
        {
          id: "no-tracking",
          heading: "3. No tracking",
          body: [
            <p key="1">
              We do not use advertising cookies, cross-site tracking pixels, session recording,
              heatmaps, or third-party analytics scripts. We do not embed content from social networks
              or video platforms, because doing so would ordinarily set their cookies in your browser
              as a side effect of loading them.
            </p>,
            <p key="2">
              This means the site works without consent banners, and it means we cannot follow you
              around the internet. It also means we do not have analytics showing us which pages are
              read — which is a real cost to us, and the reason the content here is written to be
              useful rather than to be funnel-optimised.
            </p>
          ],
        },
        {
          id: "managing",
          heading: "4. Managing cookies",
          body: [
            <p key="1">
              Because the only cookie is the session cookie, clearing cookies for this site signs you
              out and nothing else. There is nothing to opt out of and no preference to manage, and we
              do not build consent tooling for a decision that does not arise.
            </p>,
            <p key="2">
              If your browser blocks cookies entirely, the application cannot keep you signed in.
            </p>
          ],
        },
        {
          id: "contact",
          heading: "5. Questions",
          body: [
            <p key="1">
              If anything here is unclear, or you believe we are setting a cookie we have not
              disclosed, please tell us through the{" "}
              <Link href="/contact">contact page</Link> — or report a suspected vulnerability through
              the <Link href="/responsible-disclosure">disclosure process</Link>, which is the
              correct route for anything security-related.
            </p>,
          ],
        },
      ]}
    />
  );
}
