/**
 * MobileNavDrawer — off-canvas drawer that's the mobile equivalent of
 * DesktopSidebar, not a persistent rail. A permanent sidebar on a phone
 * would eat width the bottom-tab pattern doesn't need to give up, so this
 * stays hidden until summoned by the hamburger trigger (rendered in
 * App.tsx) and slides away again on selection or backdrop tap.
 *
 * Shares its item list with DesktopSidebar via lib/appNavItems.ts, so the
 * two surfaces never drift out of sync even though the presentation
 * (rail vs. drawer) differs by breakpoint.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { X, ChevronDown, LogOut } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { SEED_NOTIFICATIONS } from "./BottomNav";
import { getAppNavItems } from "@/lib/appNavItems";

export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { currentUser, logout } = useAppContext() as unknown;
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const items = getAppNavItems({ openNotifications: () => setNotifOpen(true) });

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 lg:hidden"
            onClick={onClose}
          >
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-r border-border flex flex-col"
              onClick={(e) => e.stopPropagation()}
              aria-label="Primary navigation"
            >
              {/* Brand */}
              <div className="px-5 py-5 border-b border-border flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🌳</span>
                    <span className="font-black tracking-wide text-primary">NIAKOFA</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-bold">
                    Help Today, Pay It Forward Tomorrow.
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted" aria-label="Close navigation">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Account */}
              <button
                onClick={() => setAccountOpen((v) => !v)}
                className="flex items-center gap-3 px-5 py-4 border-b border-border hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-xs font-black">
                  {currentUser?.avatar_url
                    ? <img src={currentUser.avatar_url} className="w-full h-full object-cover" alt="" />
                    : (currentUser?.name?.[0]?.toUpperCase() ?? "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{currentUser?.name ?? "Account"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    @{currentUser?.username ?? "you"}
                  </div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
              </button>
              {accountOpen && (
                <div className="px-5 py-2 border-b border-border space-y-1">
                  <Link href="/profile" onClick={onClose}>
                    <div className="text-xs font-bold py-1.5 cursor-pointer hover:text-primary">View Profile</div>
                  </Link>
                  {typeof logout === "function" && (
                    <button
                      onClick={() => { onClose(); logout(); }}
                      className="text-xs font-bold py-1.5 text-destructive flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Log Out
                    </button>
                  )}
                </div>
              )}

              {/* Nav items */}
              <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
                {items.map((item) => {
                  const active = item.isActive ? item.isActive(location) : false;
                  const content = (
                    <div
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors ${
                        active ? "bg-primary/15 text-primary" : "text-foreground/80"
                      }`}
                      style={{ touchAction: "manipulation" }}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  );
                  if (item.href) {
                    return (
                      <Link key={item.key} href={item.href} onClick={onClose}>
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={item.key}
                      onClick={() => { item.onClick?.(); onClose(); }}
                      className="w-full text-left"
                    >
                      {content}
                    </button>
                  );
                })}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={SEED_NOTIFICATIONS}
      />
    </>
  );
}
