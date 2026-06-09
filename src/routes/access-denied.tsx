import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthStore, useCurrentUser } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/access-denied")({
  head: () => ({
    meta: [
      { title: "Access denied · DigiPermit" },
      { name: "description", content: "You do not have permission to view this page." },
    ],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const user = useCurrentUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto size-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
          <p className="text-muted-foreground">
            {user
              ? `Your role (${user.role}) does not permit access to that page.`
              : "You must be signed in to access this page."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {user ? (
            <>
              <Button asChild>
                <Link to="/overview">Go to overview</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void logout().then(() => navigate({ to: "/auth" }));
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}