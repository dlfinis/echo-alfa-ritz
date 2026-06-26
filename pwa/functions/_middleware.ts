// functions/_middleware.ts
//
// Cloudflare Pages Function (Worker) que actúa como proxy inverso hacia
// promoritz.com/ec. Server-to-server → no hay CORS.
//
// Cubre TODAS las rutas bajo /api/promoritz/* reescribiendo
// /api/promoritz → /ec.

interface Env {}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
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

    // Bufferear el body como ArrayBuffer (request.body es ReadableStream
    // one-time-use; si promoritz responde 3xx, Workers no puede replay el
    // stream → throws).
    let body: ArrayBuffer | undefined;
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      body = await request.arrayBuffer();
    }

    const init: RequestInit = {
      method: request.method,
      headers: buildUpstreamHeaders(request.headers),
      body,
      redirect: "manual",
    };

    const upstream = await fetch(upstreamUrl, init);

    // Mapear 3xx → 401 (sesión expirada) para que el PWA haga auto-relogin.
    if (upstream.status >= 300 && upstream.status < 400) {
      return new Response(
        JSON.stringify({
          error: "session_expired",
          message: `Promoritz redirect (${upstream.status})`,
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } },
      );
    }

    // Construir headers pasando todo lo del upstream. No tocamos set-cookie
    // porque en este runtime getSetCookie no existe y los Headers no lo
    // exponen vía entries(). El PWA usa body fallback para capturar el
    // token desde la respuesta JSON.
    const outHeaders: Record<string, string> = {};
    for (const [k, v] of upstream.headers.entries()) {
      if (k.toLowerCase() !== "set-cookie") {
        outHeaders[k] = v;
      }
    }
    Object.entries(corsHeaders()).forEach(([k, v]) => (outHeaders[k] = v));

    // DEBUG: exponer qué Cookie header se mandó a promoritz
    try {
      const sentCookie = (init.headers as Headers).get("cookie") ?? "";
      if (sentCookie) {
        outHeaders["x-debug-sent-cookie"] = sentCookie.slice(0, 500);
      }
    } catch {}

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch (e) {
    // Catch-all: cualquier error inesperado lo reportamos con JSON
    // estructurado en vez de tirar 500 opaco.
    return new Response(
      JSON.stringify({
        error: "worker_crash",
        message: e instanceof Error ? `${e.message}\n${e.stack}` : String(e),
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

function buildUpstreamHeaders(original: Headers): Headers {
  // Pasar todo lo del browser. El Worker no debe filtrar nada salvo
  // host/origin/referer (que no tienen sentido server-to-server).
  // El filtrado de CF_* cookies se hace dentro de la sección Cookie
  // abajo.
  const headers = new Headers(original);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");

  // Filtrar cookies de Cloudflare Access (CF_AppSession, CF_Authorization)
  // — son JWT de Access, no de promoritz. Si pasan, promoritz ve dos JWT
  // y se confunde. Solo dejamos token + user (las de promoritz).
  const cookie = original.get("cookie");
  if (cookie) {
    const filtered = cookie
      .split(";")
      .map((c) => c.trim())
      .filter((c) => {
        const name = c.split("=", 1)[0]?.trim().toLowerCase();
        return name === "token" || name === "user";
      })
      .join("; ");
    if (filtered) headers.set("Cookie", filtered);
    else headers.delete("Cookie");
  }

  return headers;
}