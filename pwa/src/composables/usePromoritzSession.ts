import { ref, watch } from "vue";
import {
  InMemoryCookieJar,
  HttpInjector,
  ProfileReader,
} from "../api/index.js";
import { useConfiguracion } from "./useConfiguracion.js";

const LS_KEY_PREFIX = "promoritz_session:";

interface UserData {
  id: string;
  name: string;
  lastname: string;
  email: string;
  phone?: string;
  city?: string;
  referralCode?: string;
  typedoc?: string;
  numdoc?: string;
}

/** Decodifica el payload del JWT (parte 2) sin verificar firma. */
function decodeJwt(token: string): { exp?: number; iat?: number; id?: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded));
    return payload;
  } catch {
    return {};
  }
}

function lsKey(accountId: string): string {
  return `${LS_KEY_PREFIX}${accountId}`;
}

function saveJar(jar: InMemoryCookieJar, accountId: string) {
  try {
    const data = {
      cookies: jar.cookies,
      exp: decodeJwt(jar.cookies["token"] ?? "").exp ?? null,
    };
    localStorage.setItem(lsKey(accountId), JSON.stringify(data));
  } catch {
    // localStorage lleno o deshabilitado — ignorar
  }
}

function loadJar(jar: InMemoryCookieJar, accountId: string) {
  try {
    const raw = localStorage.getItem(lsKey(accountId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as { cookies?: Record<string, string> };
    if (parsed.cookies && typeof parsed.cookies === "object") {
      jar.cookies = parsed.cookies;
    }
  } catch {
    localStorage.removeItem(lsKey(accountId));
  }
}

function clearJar(accountId: string) {
  try {
    localStorage.removeItem(lsKey(accountId));
  } catch {
    // ignorar
  }
}

// ── Singleton: una sesión por pestaña del browser, una cuenta activa a la vez ──
let _globalJar = new InMemoryCookieJar();
let _activeAccountId: string | null = null;
let _loginPromise: Promise<boolean> | null = null;
let _autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;

// Estado reactivo
const isLoggedIn = ref(_globalJar.hasSession());
const sessionExpiresAt = ref<number | null>(null);

export function usePromoritzSession() {
  const { config } = useConfiguracion();
  const loading = ref(false);
  const error = ref<string | null>(null);
  const userData = ref<UserData | null>(null);
  const promoritzLotesHoy = ref(0);
  const promoritzLimite = ref(12);
  const profileLoading = ref(false);

  function updateIsLoggedIn() {
    isLoggedIn.value = _globalJar.hasSession();
  }

  function parseUserCookie(): UserData | null {
    const raw = _globalJar.cookies["user"];
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw)) as UserData;
    } catch {
      return null;
    }
  }

  function setupAutoRefresh() {
    if (_autoRefreshTimer) {
      clearTimeout(_autoRefreshTimer);
      _autoRefreshTimer = null;
    }
    const exp = decodeJwt(_globalJar.cookies["token"] ?? "").exp;
    if (!exp) {
      sessionExpiresAt.value = null;
      return;
    }
    const expiresAtMs = exp * 1000;
    sessionExpiresAt.value = expiresAtMs;
    const msUntilExp = expiresAtMs - Date.now();
    // Auto-refresh 1 minuto antes de expirar
    const refreshIn = Math.max(0, msUntilExp - 60_000);
    _autoRefreshTimer = setTimeout(() => {
      // Silencioso, sin UI de error
      login().catch(() => {
        // Si falla el auto-refresh, no hacer nada — el próximo inyectar
        // disparará auto-relogin reactivo
      });
    }, refreshIn);
  }

  // Reaccionar al cambio de cuenta activa: cargar/limpiar sesión
  watch(
    () => config.value?.activeAccountId,
    (newId) => {
      if (newId) {
        // Guardar sesión de la cuenta ANTERIOR (si hay y es diferente) antes
        // de cambiar. Esto incluye el caso de primera carga (no-op).
        if (_activeAccountId && _activeAccountId !== newId) {
          saveJar(_globalJar, _activeAccountId);
        }
        // SIEMPRE limpiar el jar en memoria antes de cargar la nueva
        // sesión. Sin esto, las cookies de la cuenta anterior se filtran
        // a la nueva cuenta cuando la cuenta nueva no tiene sesión guardada.
        _globalJar.clear();
        _activeAccountId = newId;
        loadJar(_globalJar, newId);
        updateIsLoggedIn();
        if (_globalJar.hasSession()) {
          userData.value = parseUserCookie();
          setupAutoRefresh();
        } else {
          userData.value = null;
          sessionExpiresAt.value = null;
        }
      } else {
        // No hay cuenta activa
        _globalJar.clear();
        userData.value = null;
        sessionExpiresAt.value = null;
        if (_autoRefreshTimer) {
          clearTimeout(_autoRefreshTimer);
          _autoRefreshTimer = null;
        }
        _activeAccountId = null;
      }
    },
    { immediate: true },
  );

  // Cargar sesión inicial de la cuenta activa al montar
  if (config.value?.activeAccountId && !_activeAccountId) {
    _activeAccountId = config.value.activeAccountId;
    loadJar(_globalJar, _activeAccountId);
    updateIsLoggedIn();
    if (_globalJar.hasSession()) {
      userData.value = parseUserCookie();
      setupAutoRefresh();
    }
  }

  async function login(): Promise<boolean> {
    if (_loginPromise) return _loginPromise;
    error.value = null;
    loading.value = true;
    const accountId = config.value?.activeAccountId;
    const email = config.value?.email;
    if (!accountId || !email) {
      error.value = "Cuenta no configurada. Ve a Configuración.";
      loading.value = false;
      return false;
    }
    _activeAccountId = accountId;
    _loginPromise = (async () => {
      const injector = new HttpInjector({ email, cookieJar: _globalJar });
      const ok = await injector.login();
      updateIsLoggedIn();
      if (ok) {
        userData.value = parseUserCookie();
        saveJar(_globalJar, accountId);
        setupAutoRefresh();
        error.value = null;
      } else {
        error.value = "Login falló contra promoritz.";
      }
      return ok;
    })();
    const result = await _loginPromise;
    _loginPromise = null;
    loading.value = false;
    return result;
  }

  function logout() {
    if (_activeAccountId) clearJar(_activeAccountId);
    _globalJar.clear();
    updateIsLoggedIn();
    userData.value = null;
    sessionExpiresAt.value = null;
    promoritzLotesHoy.value = 0;
    error.value = null;
    if (_autoRefreshTimer) {
      clearTimeout(_autoRefreshTimer);
      _autoRefreshTimer = null;
    }
  }

  async function fetchProfile() {
    if (!_globalJar.hasSession()) {
      const logged = await login();
      if (!logged) return;
    }
    profileLoading.value = true;
    try {
      const reader = new ProfileReader({ cookieJar: _globalJar });
      const snap = await reader.leer();
      promoritzLotesHoy.value = snap.lotesHoy;
      promoritzLimite.value = snap.limite;
    } catch (e) {
      console.error("Error al leer perfil:", e);
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      profileLoading.value = false;
    }
  }

  return {
    jar: _globalJar,
    isLoggedIn,
    loading,
    error,
    userData,
    promoritzLotesHoy,
    promoritzLimite,
    profileLoading,
    sessionExpiresAt,
    login,
    logout,
    fetchProfile,
  };
}
