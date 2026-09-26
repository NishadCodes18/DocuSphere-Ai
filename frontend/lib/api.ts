/**
 * DocuSphere AI - Dynamic API Configuration
 * 
 * - In local development: defaults to http://localhost:8000
 * - In production on Vercel: defaults to "" (same-origin relative paths) 
 *   or uses process.env.NEXT_PUBLIC_API_URL if configured in Vercel environment variables.
 */
export const getApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }
    return "";
  }
  return "";
};

// Dynamic string proxy so `${API}/path` evaluates at runtime in the browser
export const API = {
  toString: () => getApiUrl(),
  valueOf: () => getApiUrl(),
  [Symbol.toPrimitive]: () => getApiUrl(),
} as unknown as string;
