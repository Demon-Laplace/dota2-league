/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceRoleClient, createUserScopedClient, requireAdmin } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const clientResult = createUserScopedClient(req);
  if ("error" in clientResult) return clientResult.error;

  const adminResult = await requireAdmin(clientResult.supabase);
  if ("error" in adminResult) return adminResult.error;

  const serviceClient = createServiceRoleClient();
  const { data, error } = await clientResult.supabase.rpc("admin_list_auth_identities");

  if (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  const authUsers = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data: authPage, error: authError } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (authError) {
      return jsonResponse({ error: authError.message }, { status: 400 });
    }

    const users = authPage?.users ?? [];
    authUsers.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }

  const currentAdminEmail = adminResult.user.email?.trim().toLowerCase() || "";
  const authUserRows = authUsers
    .map((user) => ({
      id: user.id,
      email: user.email ?? "",
      created_at: user.created_at ?? "",
      last_sign_in_at: user.last_sign_in_at ?? "",
    }))
    .filter((user) => user.email);

  if (currentAdminEmail && !authUserRows.some((user) => String(user.email).trim().toLowerCase() === currentAdminEmail)) {
    authUserRows.unshift({
      id: adminResult.user.id,
      email: adminResult.user.email ?? currentAdminEmail,
      created_at: "",
      last_sign_in_at: "",
    });
  }

  return jsonResponse({
    accounts: data ?? [],
    authUsers: authUserRows,
  });
});
