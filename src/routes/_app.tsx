import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuthStore, canAccess, useCurrentUser } from "@/lib/auth-store";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    await useAuthStore.getState().init();
    const user = useAuthStore.getState().user;
    if (!user) {
      throw redirect({ to: "/auth" });
    }
    if (!canAccess(location.pathname, user.role)) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: GuardedAppLayout,
});

function GuardedAppLayout() {
  const user = useCurrentUser();
  const initialized = useAuthStore((s) => s.initialized);
  const init = useAuthStore((s) => s.init);
  const navigate = useNavigate();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (initialized && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [initialized, user, navigate]);

  if (!initialized || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return <AppLayout />;
}