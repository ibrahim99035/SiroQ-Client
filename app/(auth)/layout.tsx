import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <div className="relative hidden w-[38%] overflow-hidden border-r border-hairline bg-[linear-gradient(165deg,#193935,#0d221f)] p-8 text-paper-raised lg:flex lg:flex-col">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(46,111,106,0.5),transparent_65%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(201,122,61,0.25),transparent_65%)]"
        />
        <Link href="/" className="relative z-10 inline-flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
            <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Requis</span>
        </Link>
        <div className="relative z-10 my-auto">
          <p className="max-w-xs font-mono text-xs leading-relaxed text-paper-raised/70">
            rig of a review floor: a visible chain of custody from staging to stamped report.
          </p>
        </div>
        <p className="relative z-10 font-mono text-[11px] text-paper-raised/60">
          mock data layer · no signups stored
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}