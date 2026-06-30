import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

import { jsonResponse } from "./cors.ts";

type ErrorResult = { error: Response };
type DataResult<T> = { data: T };

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createServerAnonClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function createServiceRoleClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function createUserScopedClient(req: Request): ErrorResult | { supabase: ReturnType<typeof createClient> } {
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return {
      error: jsonResponse({ error: "Missing Authorization header." }, { status: 401 }),
    };
  }

  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_ANON_KEY"),
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    },
  );

  return { supabase };
}

export async function requireUser(
  supabase: ReturnType<typeof createClient>,
): Promise<ErrorResult | { user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      error: jsonResponse({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  return { user: data.user };
}

export async function requireAdmin(
  supabase: ReturnType<typeof createClient>,
): Promise<ErrorResult | { user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] }> {
  const userResult = await requireUser(supabase);
  if ("error" in userResult) return userResult;

  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    return {
      error: jsonResponse({ error: error.message }, { status: 500 }),
    };
  }

  if (!data) {
    return {
      error: jsonResponse({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return userResult;
}

export async function parseJson<T>(req: Request): Promise<ErrorResult | DataResult<T>> {
  try {
    return { data: await req.json() };
  } catch (_error) {
    return {
      error: jsonResponse({ error: "Request body must be valid JSON." }, { status: 400 }),
    };
  }
}
