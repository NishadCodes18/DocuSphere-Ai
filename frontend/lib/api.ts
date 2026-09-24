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
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return "";
  }
  return "http://localhost:8000";
};

export const API = getApiUrl();
