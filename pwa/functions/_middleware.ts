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
    body = await request.arrayBuffer();
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
    return new Response(
      JSON.stringify({
        error: "upstream_unreachable",
        message: e instanceof Error ? e.message : String(e),
      }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } },
    );
  }

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

  // Construir headers para el browser.
  //
  // Truco clave para este runtime: NO usar new Headers() y .set()
  // (porque bloquea "set-cookie"). En su lugar, usar Object.fromEntries
  // para crear un plain object, agregar set-cookie como string, agregar
  // los CORS headers, y pasar ese objeto al constructor de Response.
  //
  // Esto preserva las Set-Cookie originales del upstream sin invocar el
  // método bloqueado. El browser las recibe normalmente porque
  // credentials: 'include' + Access-Control-Allow-Credentials: true
  // está en los CORS headers.
  const outHeaders: Record<string, string> = {};

  // Pasar todos los headers del upstream EXCEPTO set-cookie (lo manejamos aparte)
  for (const [k, v] of upstream.headers.entries()) {
    if (k.toLowerCase() !== "set-cookie") {
      outHeaders[k] = v;
    }
  }

  // Agregar CORS + expose
  Object.entries(corsHeaders()).forEach(([k, v]) => (outHeaders[k] = v));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
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
  const headers = new Headers(original);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  return headers;
}