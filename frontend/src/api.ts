import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL?.trim() || "/api";
const apiKey = import.meta.env.VITE_API_KEY?.trim();

export const api = axios.create({
  baseURL
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
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  return headers;
}
