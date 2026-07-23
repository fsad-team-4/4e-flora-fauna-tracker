import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global auth-expiry handling: if a request 401s while we hold a token, that
// token is dead (expired/invalid) - clear it and send the user to login once,
// so an expired session fails loudly instead of silently erroring every page.
// Login/register 401s are left alone (those are "wrong credentials", not expiry).
http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register');
    if (status === 401 && !isAuthCall && localStorage.getItem('accessToken')) {
      localStorage.removeItem('accessToken');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default http;
