import axios from "axios";

// Used by the login / "who am I" calls. Paths are relative to /api (e.g. api.get("/me")).
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Used by the pages for every other call. Paths are written in full (e.g. "/api/get_all_students"),
// exactly like plain axios, but the login token is attached and renewed automatically.
// Pages import it as:  import { authAxios as axios } from "../api";
export const authAxios = axios.create({
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// The access token lives in memory only (it is lost on a page reload and
// renewed from the HttpOnly refresh cookie).
let accessToken = null;
let refreshPromise = null;

export const setAccessToken = (token) => {
  accessToken = token || null;
};

export const getAccessToken = () => accessToken;

const isRefreshRequest = (config) => {
  const url = config?.url || "";
  return url.includes("/auth/refresh");
};

const refreshAccessToken = async () => {
  const response = await refreshClient.post("/auth/refresh");
  const token = response.data?.access_token;
  if (token) {
    setAccessToken(token);
  }
  return token;
};

// The session could not be renewed (refresh cookie missing or expired): go back to the login page.
const redirectToLogin = () => {
  const path = window.location.pathname.toLowerCase();
  if (path !== "/login" && path !== "/") {
    window.location.assign("/login");
  }
};

// The server requires a login token on every route (see require_login in server/server.py).
// These interceptors attach the token to each request and, when the server answers
// 401 (missing/expired token), renew it once and repeat the request.
const attachAuthInterceptors = (instance) => {
  instance.interceptors.request.use(
    (config) => {
      if (accessToken && !isRefreshRequest(config)) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      const status = error.response?.status;

      if ((status === 401 || status === 422) && original && !original._retry && !isRefreshRequest(original)) {
        original._retry = true;
        try {
          // Several requests can fail at the same moment: they all wait for one refresh
          if (!refreshPromise) {
            refreshPromise = refreshAccessToken().finally(() => {
              refreshPromise = null;
            });
          }
          await refreshPromise;
          return instance(original);
        } catch (refreshError) {
          setAccessToken(null);
          redirectToLogin();
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );
};

attachAuthInterceptors(api);
attachAuthInterceptors(authAxios);

export const apiFetch = (config) => api(config);

export const logout = async () => {
  setAccessToken(null);
  try {
    await api.post("/auth/logout");
  } catch (error) {
    // Ignore logout errors; client already cleared the token.
  }
};

export const initAuth = async () => {
  try {
    if (accessToken) {
      const response = await api.get("/me");
      return response.data;
    }
    await refreshAccessToken();
    const response = await api.get("/me");
    return response.data;
  } catch (error) {
    return null;
  }
};

export default api;
