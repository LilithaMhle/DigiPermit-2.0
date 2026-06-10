import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { subscribeToAlerts } from "@/lib/alerts-firestore";
import { Shield, LayoutDashboard, FileCheck2, ScanLine, FilePlus2, AlertTriangle, ListChecks, LogOut, PanelLeftClose, PanelLeftOpen, Users, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useCurrentUser } from "@/lib/auth-store";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const nav = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/verify", label: "Verify Permit", icon: ScanLine, roles: ["admin", "officer"] },
  { to: "/permit-holder", label: "My Permit", icon: Shield, roles: ["permit_holder"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/permits", label: "Permits", icon: FileCheck2, roles: ["admin"] },
  { to: "/issue", label: "Issue Permit", icon: FilePlus2, roles: ["admin"] },
  { to: "/renewals", label: "Renewal Requests", icon: ListChecks, roles: ["admin"] },
  { to: "/scans", label: "Scan Log", icon: ListChecks, roles: ["admin", "officer"] },
  { to: "/alerts", label: "DigiPermit AI", icon: AlertTriangle, roles: ["admin", "officer"] },
  { to: "/profile", label: "Profile", icon: UserCircle, roles: ["admin", "officer", "permit_holder"] },
];

export function AppLayout() {
  const [alerts, setAlerts] = useState(0);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("spvms.sidebar.collapsed") === "1";
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const liveUser = useCurrentUser();
  // Keep the last-known user so the sidebar nav stays visible during transient
  // auth-store updates (route navigation, token refresh, etc.). Without this,
  // a momentary null user would blank out the nav and avatar.
  const lastUserRef = useRef(liveUser);
  if (liveUser) lastUserRef.current = liveUser;
  const user = liveUser ?? lastUserRef.current;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const homePath = user
    ? user.role === "permit_holder"
      ? "/permit-holder"
      : user.role === "officer"
      ? "/verify"
      : "/overview"
    : "/overview";

  const visibleNav = nav.filter((item) => user ? item.roles.includes(user.role) : false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToAlerts((a) => setAlerts(a.filter((x) => !x.resolved).length));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("spvms.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <aside
        className={cn(
          "hidden md:flex h-screen sticky top-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("border-b border-border flex items-center gap-2", collapsed ? "px-2 py-4 justify-center" : "px-4 py-5 justify-between")}>
          <Link to={homePath} className="flex items-center gap-2 min-w-0">
            <div className="size-9 rounded-lg flex items-center justify-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-hero)" }}>
              <Shield className="size-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-semibold text-sm leading-tight truncate">DigiPermit</div>
                <div className="text-[11px] text-muted-foreground leading-tight truncate">Home Affairs · RSA</div>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="mx-2 mt-2 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md text-sm transition-colors",
                  collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/70 hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {item.to === "/alerts" && alerts > 0 && !collapsed && (
                  <span className="text-[10px] bg-destructive text-destructive-foreground rounded-full px-2 py-0.5 font-medium">
                    {alerts}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border shrink-0">
          {user && (
            <div className={cn("flex items-center gap-2 rounded-md bg-secondary/60", collapsed ? "p-1 flex-col" : "p-2")}>
              <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0" title={collapsed ? user.fullName : undefined}>
                {user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{user.fullName}</div>
                  <div className="text-[11px] text-muted-foreground capitalize truncate">{user.role} · {user.email}</div>
                </div>
              )}
              <button
                onClick={() => {
                  setSignOutOpen(true);
                }}
                title="Sign out"
                className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="md:hidden border-b border-border bg-card px-4 py-3 flex items-center justify-between">
          <Link to={homePath} className="flex items-center gap-2 font-semibold">
            <Shield className="size-5 text-primary" /> DigiPermit
          </Link>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the sign-in screen and need to log in again to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSignOutOpen(false);
                void logout().then(() => navigate({ to: "/auth" }));
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
