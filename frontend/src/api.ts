import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

export function getStoredToken() {
  return localStorage.getItem("visapp_token");
}

export function setStoredToken(token: string | null) {
  if (!token) {
    localStorage.removeItem("visapp_token");
    return;
  }
  localStorage.setItem("visapp_token", token);
}

export function authHeader() {
  const token = getStoredToken();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

