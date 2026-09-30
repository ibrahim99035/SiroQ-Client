import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHeader } from "@/components/marketing";
import { POSTS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Writing — SiroQ",
  description:
    "Notes on audit trails, dispensing data and the engineering behind SiroQ's chain of custody.",
};

export default function BlogIndexPage() {
  return (
    <>
      <PageHeader
        eyebrow="Writing"
        title="On audit trails and dispensing data."
        lede="Short pieces about the parts of the problem that are dull, specific and worth getting right."
      />

      <section className="section pb-24">
        <ul className="divide-y divide-hairline border-y border-hairline">
          {POSTS.map((post) => (
            <li key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="group block py-7">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
                  <span>{post.category}</span>
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                  <span>{post.readingTime}</span>
                </div>
                <h2 className="mt-3 text-lg font-medium tracking-tight text-ink group-hover:text-accent-strong">
                  {post.title}
                </h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
                  {post.excerpt}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <CtaBand
        title="Prefer reading the code path?"
        body="The documentation covers the request contract, the authorization specification and the dispensing format spec — the things we would otherwise have to explain here."
        primary={{ href: "/docs", label: "Read the docs" }}
        secondary={{ href: "/how-it-works", label: "How it works" }}
      />
    </>
  );
}
