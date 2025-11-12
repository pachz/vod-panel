import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const DEFAULT_EMAIL = "pach71@gmail.com";
const DEFAULT_NAME = "PACH";
const DEFAULT_PASSWORD = process.env.SEED_ACCOUNT_PASSWORD ?? "changeme123!";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    status: init.status ?? 200,
  });

export const ensureSeedAccount = httpAction(async ({ runAction }, request) => {
  if (request.method !== "GET") {
    return jsonResponse(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET" } },
    );
  }

  try {
    const result = await runAction(internal.auth.createAuthAccount, {
      email: DEFAULT_EMAIL,
      name: DEFAULT_NAME,
      password: DEFAULT_PASSWORD,
    });

    return jsonResponse({
      ok: true,
      email: DEFAULT_EMAIL,
      created: result.created,
      passwordUpdated: result.passwordUpdated,
    });
  } catch (error) {
    console.error("ensureSeedAccount failed", error);
    return jsonResponse(
      { ok: false, error: "Failed to ensure account" },
      { status: 500 },
    );
  }
});

