import { useLocation, Link } from "wouter";
import { Map, Users, Plus, Wallet, User, Bell } from "lucide-react";
import { useState } from "react";
import { NotificationsDrawer } from "./NotificationsDrawer";

const tabs = [
  { path: "/", icon: Map, label: "Map" },
  { path: "/community", icon: Users, label: "Community" },
  { path: "/request/new", icon: Plus, label: "Request", center: true },
  { path: "/wallet", icon: Wallet, label: "Wallet" },
  { path: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const [location] = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border pb-safe shadow-[0_-4px_30px_rgba(0,0,0,0.4)]">
        <div className="flex items-end justify-around px-2 pt-2 pb-2">
          {tabs.map((tab) => {
            const isActive = tab.path === "/" ? location === "/" : location.startsWith(tab.path);
            if (tab.center) {
              return (
                <Link key={tab.path} href={tab.path}>
                  <div className="flex flex-col items-center -mt-5">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
                      isActive
                        ? "bg-primary shadow-[0_0_20px_rgba(0,212,255,0.5)]"
                        : "bg-primary/80 hover:bg-primary"
                    }`}>
                      <tab.icon className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider mt-1 text-muted-foreground">{tab.label}</span>
                  </div>
                </Link>
              );
            }
            return (
              <Link key={tab.path} href={tab.path}>
                <div className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all min-w-[52px]">
                  <tab.icon className={`w-5 h-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {tab.label}
                  </span>
                  {isActive && <div className="w-1 h-1 rounded-full bg-primary" />}
                </div>
              </Link>
            );
          })}

          {/* Notifications icon */}
          <button
            onClick={() => setNotifOpen(true)}
            className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all min-w-[52px] relative"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Alerts</span>
            <span className="absolute top-0 right-1 w-2 h-2 bg-destructive rounded-full" />
          </button>
        </div>
      </nav>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
