// functions/_middleware.ts
//
// Cloudflare Pages Function (Worker) que actúa como proxy inverso hacia
// promoritz.com/ec. Server-to-server → no hay CORS.
//
// Cubre TODAS las rutas bajo /api/promoritz/* reescribiendo
// /api/promoritz → /ec. La PWA llama siempre a /api/promoritz/* — el
// entorno (Vite dev o este Worker en prod) decide quién proxy.

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

  // Bufferear el body como ArrayBuffer. request.body es un ReadableStream
  // (one-time-use); si promoritz responde 3xx, Workers no puede replay el
  // stream → throws upstream_unreachable.
  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    try {
      body = await request.arrayBuffer();
    } catch (e) {
      return jsonError(400, "body_read_failed", String(e));
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers: buildUpstreamHeaders(request.headers),
    body,
    redirect: "manual",
  };

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (e) {
    return jsonError(502, "upstream_unreachable", String(e));
  }

  // Mapear 3xx → 401 (sesión expirada) para que el PWA haga auto-relogin.
  if (upstream.status >= 300 && upstream.status < 400) {
    return jsonError(
      401,
      "session_expired",
      `Promoritz redirect (${upstream.status})`,
    );
  }

  // Construir headers para el browser.
  //
  // Truco clave para este runtime: NO usar new Headers() y .set()
  // (porque bloquea "set-cookie"). En su lugar, crear un plain object,
  // agregar los CORS headers, y pasar ese objeto al constructor de Response.
  const outHeaders: Record<string, string> = {};

  try {
    for (const [k, v] of upstream.headers.entries()) {
      if (k.toLowerCase() !== "set-cookie") {
        outHeaders[k] = v;
      }
    }
  } catch (e) {
    return jsonError(500, "headers_iter_failed", String(e));
  }

  Object.entries(corsHeaders()).forEach(([k, v]) => (outHeaders[k] = v));

  try {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch (e) {
    return jsonError(500, "response_build_failed", String(e));
  }
};

function jsonError(status: number, error: string, message: string): Response {
  return new Response(
    JSON.stringify({ error, message }),
    { status, headers: { "Content-Type": "application/json", ...corsHeaders() } },
  );
}

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
  // Construir a mano para evitar problemas con `new Headers(original)`
  // cuando el request viene detrás de Cloudflare Access (que añade
  // headers como Cf-Access-Client-Id, Cf-Warp-Tag-Id, etc.).
  const headers = new Headers();
  for (const [k, v] of original.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === "host" ||
      lower === "origin" ||
      lower === "referer" ||
      lower.startsWith("cf-") ||
      lower === "cf-connecting-ip" ||
      lower === "x-forwarded-for" ||
      lower === "x-forwarded-proto" ||
      lower === "x-real-ip"
    ) {
      continue;
    }
    headers.set(k, v);
  }
  return headers;
}