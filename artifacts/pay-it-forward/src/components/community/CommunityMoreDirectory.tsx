import { BookOpen, BriefcaseBusiness, Globe2, Image as ImageIcon, UserRound, Users, UsersRound, Wrench } from "lucide-react";
import { Link } from "wouter";

export function CommunityMoreDirectory() {
  const items = [
    { href: "/community/people", label: "People", description: "Neighbors active in your Hub", icon: Users },
    { href: "/community/hubs", label: "Hubs", description: "Your local and diaspora communities", icon: Globe2 },
    { href: "/community/stories", label: "Stories", description: "Moments shared by the community", icon: BookOpen },
    { href: "/community/requests", label: "Requests", description: "Give or receive help", icon: BriefcaseBusiness },
    { href: "/community/services", label: "Services", description: "Skills and offers", icon: Wrench },
    { href: "/community/circles", label: "Circles", description: "Live conversations", icon: UsersRound },
    { href: "/community/media", label: "Media", description: "Photos and shared moments", icon: ImageIcon },
    { href: "/diaspora", label: "Diaspora", description: "Global cultural communities", icon: Globe2 },
    { href: "/profile", label: "Profile", description: "Your identity, activity, and settings", icon: UserRound },
  ];

  return (
    <div className="grid gap-3 px-3 pb-4 sm:px-0">
      <div className="px-1">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Community</p>
        <h2 className="mt-1 text-xl font-black">Explore more</h2>
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:border-primary/50 transition">
             <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
               <item.icon className="h-5 w-5 text-primary" />
             </div>
             <div>
               <div className="font-bold text-sm">{item.label}</div>
               <div className="text-[11px] text-muted-foreground">{item.description}</div>
             </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
