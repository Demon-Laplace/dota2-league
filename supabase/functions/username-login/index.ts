/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServerAnonClient, createServiceRoleClient, parseJson } from "../_shared/client.ts";
import { assertValidUsername } from "../_shared/identity.ts";

type UsernameLoginBody = {
  username?: string;
  identifier?: string;
  password?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const bodyResult = await parseJson<UsernameLoginBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  const identifier = String(bodyResult.data?.username ?? bodyResult.data?.identifier ?? "").trim();
  if (!identifier) {
    return jsonResponse({ error: "用户名、邮箱或密码错误。" }, { status: 401 });
  }

  const password = String(bodyResult.data?.password ?? "");
  if (!password) {
    return jsonResponse({ error: "用户名、邮箱或密码错误。" }, { status: 401 });
  }

  let authEmail = identifier;

  if (!identifier.includes("@")) {
    let username: string;
    try {
      username = assertValidUsername(identifier);
    } catch (_error) {
      return jsonResponse({ error: "用户名、邮箱或密码错误。" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();
    const { data: identityRows, error: identityError } = await serviceClient.rpc("resolve_auth_identity_for_login", {
      p_username: username,
    });

    if (identityError) {
      return jsonResponse({ error: identityError.message }, { status: 500 });
    }

    const identity = Array.isArray(identityRows) ? (identityRows[0] ?? null) : identityRows;

    if (!identity || !identity.is_active) {
      return jsonResponse({ error: "用户名、邮箱或密码错误。" }, { status: 401 });
    }

    authEmail = identity.auth_email;
  }

  const authClient = createServerAnonClient();
  const { data, error } = await authClient.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (error || !data.session || !data.user) {
    return jsonResponse({ error: "用户名、邮箱或密码错误。" }, { status: 401 });
  }

  return jsonResponse({
    session: data.session,
    user: data.user,
  });
});
