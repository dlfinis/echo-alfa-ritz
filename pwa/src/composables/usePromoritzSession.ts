import { ref } from "vue";
import {
  InMemoryCookieJar,
  HttpInjector,
  ProfileReader,
} from "../api/index.js";
import { useConfiguracion } from "./useConfiguracion.js";

const LS_KEY = "promoritz_session";

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

/** Persiste el jar en localStorage para sobrevivir al refresh. */
function saveJar(jar: InMemoryCookieJar) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(jar.cookies));
  } catch {
    // localStorage lleno o deshabilitado — ignorar
  }
}

function loadJar(jar: InMemoryCookieJar) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        jar.cookies = parsed;
      }
    }
  } catch {
    localStorage.removeItem(LS_KEY);
  }
}

function clearJar() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignorar
  }
}

const _globalJar = new InMemoryCookieJar();
let _loginPromise: Promise<boolean> | null = null;

// Hidratar desde localStorage en el módulo (antes de cualquier render)
loadJar(_globalJar);

export function usePromoritzSession() {
  const { config } = useConfiguracion();
  const loading = ref(false);
  const error = ref<string | null>(null);
  const userData = ref<UserData | null>(null);
  const promoritzLotesHoy = ref(0);
  const promoritzLimite = ref(12);
  const profileLoading = ref(false);

  const isLoggedIn = ref(_globalJar.hasSession());

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

  // Si ya había sesión en localStorage, poblar userData
  if (isLoggedIn.value) {
    userData.value = parseUserCookie();
  }

  async function login(): Promise<boolean> {
    if (_loginPromise) return _loginPromise;
    error.value = null;
    loading.value = true;
    const email = config.value?.email;
    if (!email) {
      error.value = "Email no configurado. Ve a Configuración.";
      loading.value = false;
      return false;
    }
    _loginPromise = (async () => {
      const injector = new HttpInjector({ email, cookieJar: _globalJar });
      const ok = await injector.login();
      updateIsLoggedIn();
      if (ok) {
        userData.value = parseUserCookie();
        saveJar(_globalJar);
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
    _globalJar.clear();
    clearJar();
    updateIsLoggedIn();
    userData.value = null;
    promoritzLotesHoy.value = 0;
    error.value = null;
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
    login,
    logout,
    fetchProfile,
  };
}
