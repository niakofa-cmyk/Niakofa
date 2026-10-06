import "./_group.css";
import {
  Archive,
  BookOpen,
  Camera,
  ChevronRight,
  Gift,
  Heart,
  MapPin,
  Settings,
  Shield,
  Star,
  Users,
} from "lucide-react";

export function Current() {
  return (
    <main className="nia-profile nia-profile--embedded flex min-h-screen flex-col" data-testid="current-profile">
      <div className="nia-profile__container flex-1 w-full px-4 py-4 space-y-4">
        <nav className="nia-profile__tabs flex gap-2" aria-label="Profile sections">
          <button type="button" aria-current="page" className="flex-1 px-3 py-2.5 text-xs font-black uppercase tracking-wider">
            Overview
          </button>
          <button type="button" className="flex-1 px-3 py-2.5 text-xs font-black uppercase tracking-wider">
            History
          </button>
          <button type="button" className="flex-1 px-3 py-2.5 text-xs font-black uppercase tracking-wider">
            Settings
          </button>
        </nav>

        <section className="nia-profile__hero flex items-center gap-4 p-5">
          <div className="nia-profile__avatar flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 text-2xl font-black" aria-label="Maya Okafor profile photo">
            MO
          </div>
          <div className="min-w-0">
            <div className="nia-profile__eyebrow mb-1">A member of Niakofa</div>
            <h1 className="nia-profile__identity truncate text-2xl font-black tracking-tight">Maya Okafor</h1>
            <p className="text-sm font-bold text-primary">@mayaokafor</p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Fort Worth Community
            </p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
              <Heart className="h-3 w-3" aria-hidden="true" />
              Trusted neighbor
            </span>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3" aria-label="Your Community activity">
          <div className="nia-profile__stat flex flex-col items-center p-4 text-center">
            <Shield className="mb-1.5 h-4 w-4 text-blue-500" aria-hidden="true" />
            <strong className="nia-profile__stat-value text-xl">94%</strong>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Trust</span>
          </div>
          <div className="nia-profile__stat flex flex-col items-center p-4 text-center">
            <Heart className="mb-1.5 h-4 w-4 text-primary" aria-hidden="true" />
            <strong className="nia-profile__stat-value text-xl">18</strong>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Helped</span>
          </div>
          <div className="nia-profile__stat flex flex-col items-center p-4 text-center">
            <Star className="mb-1.5 h-4 w-4 text-amber-500" aria-hidden="true" />
            <strong className="nia-profile__stat-value text-xl">240</strong>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Goodwill</span>
          </div>
        </section>

        <section className="nia-profile__appearance space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Appearance
          </h2>
          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
            <span>Dark appearance</span>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">On</span>
          </div>
        </section>

        <section className="nia-profile__account-details p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Account details</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your profile and contact details are managed in Settings.</p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
        </section>

        <button type="button" className="w-full rounded-2xl border border-border bg-card p-4 text-left">
          <span className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Billing</span>
          <span className="mt-1 block font-black">Wallet · $42.00</span>
          <span className="mt-1 block text-xs text-muted-foreground">Payouts and repayment stay on the wallet.</span>
        </button>

        <section>
          <div className="mb-2">
            <div className="nia-profile__eyebrow">Beyond the profile</div>
            <h2 className="text-lg font-bold tracking-tight">Family &amp; Legacy</h2>
          </div>
          <div className="nia-profile__heritage">
            <button type="button" className="nia-profile__heritage-link">
              <span className="nia-profile__heritage-mark"><Users className="h-5 w-5" aria-hidden="true" /></span>
              <span className="flex-1">
                <span className="block font-bold">Family</span>
                <span className="mt-1 block text-xs text-muted-foreground">Your family spaces and connections</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <button type="button" className="nia-profile__heritage-link">
              <span className="nia-profile__heritage-mark"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
              <span className="flex-1">
                <span className="block font-bold">Legacy</span>
                <span className="mt-1 block text-xs text-muted-foreground">Stories across generations</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="space-y-3 pb-5" aria-label="Explore Community">
          <div className="nia-profile__heritage-link">
            <span className="nia-profile__heritage-mark"><Camera className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1">
              <span className="block font-bold">Moments</span>
              <span className="mt-1 block text-xs text-muted-foreground">Visit community stories and Sparks</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="nia-profile__heritage-link">
            <span className="nia-profile__heritage-mark"><Archive className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1">
              <span className="block font-bold">My Moments Archive</span>
              <span className="mt-1 block text-xs text-muted-foreground">Private copies only you can browse</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="nia-profile__heritage-link">
            <span className="nia-profile__heritage-mark"><Gift className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex-1">
              <span className="block font-bold">Exchange</span>
              <span className="mt-1 block text-xs text-muted-foreground">Offers, needs and local exchange</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </section>
      </div>
    </main>
  );
}
