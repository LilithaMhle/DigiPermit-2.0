import { createFileRoute } from "@tanstack/react-router";
import PermitHolderProfile from "@/pages/PermitHolderProfile";

export const Route = createFileRoute("/_app/permit-holder")({
  head: () => ({ meta: [{ title: "My Permit · Permit Holder" }] }),
  component: PermitHolderProfile,
});
