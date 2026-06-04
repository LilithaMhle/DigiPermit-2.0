import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { Database } from "@/integrations/supabase/types";

const ensureAdmin = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Server missing Supabase env vars");
  }

  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: no request headers");

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.replace("Bearer ", "");
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims || !data.claims.sub) throw new Error("Unauthorized: invalid token");

  const userId = data.claims.sub;

  const { data: hasRoleData, error: hasRoleError } = await supabaseAdmin.rpc("has_role", {
    _role: "admin",
    _user_id: userId,
  });

  if (hasRoleError || !hasRoleData) throw new Error("Forbidden: admin role required");
  // Postgres function returns boolean
  if (hasRoleData !== true && !(Array.isArray(hasRoleData) && hasRoleData[0] === true)) {
    throw new Error("Forbidden: admin role required");
  }
  return userId;
};

export const listUsers = createServerFn({ method: "POST" })
  .handler(async () => {
    // NOTE: For now we use the server-side Supabase admin client directly so
    // the dev UI can list users. Replace or re-enable `ensureAdmin()` with
    // a proper Firebase/Supabase token verification for production.
    // await ensureAdmin();

    // Fetch auth users via admin API
    // @ts-ignore - admin methods are available on the server admin client
    const usersRes = await (supabaseAdmin as any).auth.admin.listUsers();
    const users = usersRes?.data?.users ?? [];

    // Fetch roles from public.user_roles
    const { data: rolesData } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string>();
    (rolesData ?? []).forEach((r: any) => rolesByUser.set(r.user_id, r.role));

    const out = users.map((u: any) => ({
      id: u.id,
      email: u.email ?? u.user_metadata?.email ?? null,
      created_at: u.created_at,
      role: rolesByUser.get(u.id) ?? "user",
      disabled: !!u.disabled,
    }));

    return { users: out };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1), role: z.enum(["admin", "moderator", "user"]) }))
  .handler(async ({ data }) => {
    // TODO: enforce server-side admin check
    // await ensureAdmin();

    const { userId, role } = data;
    const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role }, { onConflict: ["user_id"] });
    if (error) throw error;
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    // TODO: enforce server-side admin check
    // await ensureAdmin();
    const { userId } = data;
    // @ts-ignore - admin delete API
    const res = await (supabaseAdmin as any).auth.admin.deleteUser(userId).catch((e: any) => ({ error: e }));
    if (res?.error) throw res.error;
    // Remove any user_roles entries
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    return { ok: true };
  });
