// functions/_middleware.ts
//
// Cloudflare Pages Function (Worker) que actúa como proxy inverso hacia
// promoritz.com/ec. Server-to-server → no hay CORS.

interface Env {}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/promoritz/")) {
    return next();
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const upstreamPath = url.pathname.replace(/^\/api\/promoritz/, "/ec");
  const upstreamUrl = `https://promoritz.com${upstreamPath}${url.search}`;

  // Bufferear el body. request.body es ReadableStream one-time-use.
  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    body = await request.arrayBuffer();
  }

  // Filtrar Cookie: descartar CF_AppSession y CF_Authorization (JWTs de
  // Cloudflare Access que confunden a promoritz si llegan).
  const outHeaders = new Headers();
  outHeaders.set("Content-Type", "application/json");
  const originalCookie = request.headers.get("cookie");
  if (originalCookie) {
    const filtered = originalCookie
      .split(";")
      .map((c) => c.trim())
      .filter((c) => {
        const name = c.split("=", 1)[0]?.trim().toLowerCase();
        return name === "token" || name === "user";
      })
      .join("; ");
    if (filtered) outHeaders.set("Cookie", filtered);
  }

  const init: RequestInit = {
    method: request.method,
    headers: outHeaders,
    body,
    redirect: "manual",
  };

  try {
    const upstream = await fetch(upstreamUrl, init);

    // DEBUG: exponer qué headers se mandaron a promoritz
    const debugHeaders: Record<string, string> = {};
    for (const [k, v] of (init.headers as Headers).entries()) {
      debugHeaders[k] = v;
    }

    // 3xx → 401 session_expired para auto-relogin en el PWA
    if (upstream.status >= 300 && upstream.status < 400) {
      return new Response(
        JSON.stringify({
          error: "session_expired",
          message: `Promoritz redirect (${upstream.status})`,
          sentHeaders: debugHeaders,
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } },
      );
    }

    // Pasar la respuesta de promoritz al browser
    const responseHeaders = new Headers();
    for (const [k, v] of upstream.headers.entries()) {
      if (k.toLowerCase() !== "set-cookie") {
        responseHeaders.set(k, v);
      }
    }
    responseHeaders.set("x-debug-upstream-status", String(upstream.status));
    responseHeaders.set("x-debug-sent-cookie", (init.headers as Headers).get("cookie") ?? "(none)");
    Object.entries(corsHeaders()).forEach(([k, v]) => responseHeaders.set(k, v));

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "worker_crash",
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } },
    );
  }
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, cookie, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "x-set-cookie",
  };
}