import { ArrowRight, HandHeart, MapPin, Package, Store, Wrench } from "lucide-react";
import { Link } from "wouter";
import { SkillsMarketplaceTab } from "@/components/community/SkillsMarketplaceTab";

/**
 * Niakofa Exchange is the community marketplace doorway.
 * This initial surface intentionally routes to existing, data-backed requests
 * and skills rather than inventing a listings API or showing fabricated offers.
 */
const EXCHANGE_DESTINATIONS = [
  {
    title: "Goods & essentials",
    description: "Explore community-shared items and practical resources as listings roll out.",
    icon: Package,
    href: null,
    action: "Coming soon",
    status: "Planned — peer-to-peer listings and exchange checkout are not live yet",
  },
  {
    title: "Local services",
    description: "Find neighbors with skills, experience, and services to offer.",
    icon: Wrench,
    href: "/community/services",
    action: "Browse skills directory",
    status: "Available now",
  },
  {
    title: "Give or receive help",
    description: "Connect through the existing mutual-aid request and helper flow.",
    icon: HandHeart,
    href: "/community/requests",
    action: "Open Requests",
    status: "Available now",
  },
];

export function CommunityExchangeView() {
  return (
    <section aria-label="Niakofa Exchange marketplace" className="space-y-4 px-3 pb-6 sm:px-0">
      <header className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-7">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-primary">
          <Store className="h-4 w-4" aria-hidden="true" />
          The Niakofa Exchange
        </div>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">A marketplace built around community.</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Discover local services, exchange resources, and support neighbors. Exchange brings Niakofa's
          marketplace vision together with its existing pay-it-forward and skills network.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-2 text-xs font-semibold">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          Local-first • Community-powered
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXCHANGE_DESTINATIONS.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-3 font-black">{item.title}</h2>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              <p className="mt-3 text-[11px] font-semibold text-muted-foreground">{item.status}</p>
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
                >
                  {item.action}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : (
                <span className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 px-3 py-2 text-sm font-bold text-muted-foreground" aria-disabled="true">
                  {item.action}
                </span>
              )}
            </article>
          );
        })}
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">People-powered commerce</p>
          <h2 className="mt-1 text-xl font-black">Browse community skills</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Explore existing skill categories and connect them to open requests.
          </p>
        </div>
        <SkillsMarketplaceTab />
      </div>
    </section>
  );
}
