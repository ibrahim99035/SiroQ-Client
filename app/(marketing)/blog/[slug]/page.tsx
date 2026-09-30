import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/marketing";
import { POSTS } from "@/lib/marketing-content";

/**
 * Statically rendered article pages.
 *
 * `POSTS` is a module-level constant, so `generateStaticParams` covers every
 * article and an unknown slug 404s rather than rendering an empty shell.
 */

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((entry) => entry.slug === slug);
  if (!post) return { title: "Not found — SiroQ" };

  return {
    title: `${post.title} — SiroQ`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = POSTS.find((entry) => entry.slug === slug);
  if (!post) notFound();

  return (
    <>
      <article className="section pb-24 pt-14 sm:pt-20">
        <Link
          href="/blog"
          className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Writing
        </Link>

        <div className="mt-8 max-w-2xl">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
            <span>{post.category}</span>
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
            <span>{post.readingTime}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
            {post.title}
          </h1>
          <div className="signature-rule mt-8" />
        </div>

        <div className="prose-doc mt-10 max-w-2xl">
          {post.body.map((block, index) => (
            <div key={index}>
              {block.heading ? <h2>{block.heading}</h2> : null}
              {block.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
              {block.list ? (
                <ul>
                  {block.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </article>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow">Keep reading</p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                More on audit trails and dispensing data.
              </h2>
            </div>
            <Link
              href="/blog"
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              All articles →
            </Link>
          </div>
          <ul className="mt-8 divide-y divide-hairline border-y border-hairline">
            {POSTS.filter((entry) => entry.slug !== post.slug)
              .slice(0, 2)
              .map((entry) => (
                <li key={entry.slug}>
                  <Link href={`/blog/${entry.slug}`} className="group block py-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      {entry.category} · {entry.readingTime}
                    </p>
                    <p className="mt-2 text-[14px] font-medium text-ink group-hover:text-accent-strong">
                      {entry.title}
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </section>

      <CtaBand
        title="See it in the product."
        body="Every claim in these articles is something the platform either does or documents as missing."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/compliance", label: "Compliance posture" }}
      />
    </>
  );
}
