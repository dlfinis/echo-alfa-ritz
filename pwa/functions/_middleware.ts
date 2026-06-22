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

  // Construir headers para el response al browser.
  //
  // El upstream.headers (Headers del fetch response) es INMUTABLE en
  // Cloudflare Workers. No podemos hacer upstream.headers.set() — tira
  // TypeError. Tampoco podemos copiarlos directo con new Headers() porque
  // descartarían los Set-Cookie (son "forbidden response-header names"
  // en la spec de la Fetch API, solo accesibles vía getSetCookie()).
  //
  // Approach:
  // 1. Leer las cookies con getSetCookie() en el original
  // 2. Crear un nuevo Headers NUESTRO (mutable)
  // 3. Copiar todos los headers del upstream EXCEPTO set-cookie
  // 4. Poner las cookies en un header custom 'x-set-cookie' (accesible
  //    al JS, mismo approach que Vite dev proxy)
  // 5. Agregar los CORS headers al nuestro
  //
  // El browser nunca ve los Set-Cookie reales (cross-origin), pero
  // InMemoryCookieJar tiene fallback que lee x-set-cookie.

  const setCookies = upstream.headers.getSetCookie();
  const headers = new Headers();

  // Copiar todos los headers del upstream (excepto set-cookie)
  for (const [k, v] of upstream.headers.entries()) {
    if (k.toLowerCase() !== "set-cookie") {
      headers.set(k, v);
    }
  }

  // Exponer las cookies vía header custom (mismo approach que Vite dev)
  if (setCookies.length > 0) {
    headers.set("x-set-cookie", encodeURIComponent(setCookies.join("||")));
  }

  // CORS headers
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
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