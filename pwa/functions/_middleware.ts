// functions/_middleware.ts
//
// Cloudflare Pages Function (Worker) que actúa como proxy inverso hacia
// promoritz.com/ec. Server-to-server → no hay CORS.
//
// Cubre TODAS las rutas bajo /api/promoritz/* (login, lotes, perfil, etc.)
// reescribiendo /api/promoritz → /ec.
//
// En desarrollo, este proxy lo hace Vite (ver vite.config.ts).
// La PWA llama siempre a /api/promoritz/* — el entorno decide quién proxy.

interface Env {
  // Acá podrías agregar secrets si en algún momento los necesitás
  // (e.g. PROMOritz_API_KEY, SUPABASE_SERVICE_ROLE, etc.)
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);

  // Solo interceptamos /api/promoritz/*; el resto va al handler siguiente
  // (que sirve los assets estáticos del build de Vite).
  if (!url.pathname.startsWith("/api/promoritz/")) {
    return next();
  }

  // CORS preflight — el browser lo manda antes del POST real
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Rewrite: /api/promoritz/api/users/login → /ec/api/users/login
  const upstreamPath = url.pathname.replace(/^\/api\/promoritz/, "/ec");
  const upstreamUrl = `https://promoritz.com${upstreamPath}${url.search}`;

  // Reenviar el request. Importante: NO usar `request.body` directamente
  // porque puede ser un ReadableStream que se consume una sola vez.
  const init: RequestInit = {
    method: request.method,
    headers: buildUpstreamHeaders(request.headers),
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (e) {
    // upstream caído o error de red
    return new Response(
      JSON.stringify({
        error: "upstream_unreachable",
        message: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      },
    );
  }

  // Devolver la respuesta del upstream, agregando CORS headers
  // para que el browser la acepte.
  //
  // IMPORTANTE: NO crear `new Headers(upstream.headers)` porque en la Fetch
  // API de los Cloudflare Workers eso descarta los `Set-Cookie` (son
  // "forbidden response-header names" según spec, solo accesibles vía
  // getSetCookie() en el response original). Modificamos los headers
  // existentes IN-PLACE para preservar las cookies.
  const cors = corsHeaders();
  for (const [k, v] of Object.entries(cors)) {
    upstream.headers.set(k, v);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, cookie, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function buildUpstreamHeaders(original: Headers): Headers {
  // Passthrough casi todo, pero removemos headers que no tienen sentido
  // en una llamada server-to-server.
  const headers = new Headers(original);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  // Cloudflare agrega `cf-connecting-ip` y otros — los dejamos, promoritz los ignora.
  return headers;
}