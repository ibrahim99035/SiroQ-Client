import { MarketingFooter, MarketingNav } from "@/components/marketing";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}