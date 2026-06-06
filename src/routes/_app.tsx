import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
  const liveUser = useCurrentUser();
  const lastUserRef = useRef(liveUser);
  if (liveUser) lastUserRef.current = liveUser;
  const user = liveUser ?? lastUserRef.current;
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

  return <AppLayout />;
}
