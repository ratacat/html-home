import { hostname } from "node:os";

export type ServeUrlPlan = {
  baseUrl: string;
  notes: string[];
};

export function resolveServeUrl(input: { host: string; port: number; baseUrl?: string }): ServeUrlPlan {
  if (input.baseUrl && input.baseUrl.trim().length > 0) {
    return {
      baseUrl: normalizeBaseUrl(input.baseUrl),
      notes: ["custom base URL configured"]
    };
  }

  const notes: string[] = [];
  const host = displayHostForBindHost(input.host);
  if (isWildcardHost(input.host)) {
    notes.push("bound to all interfaces; use --base-url for a LAN or Tailscale name");
  }

  return {
    baseUrl: `http://${formatUrlHost(host)}:${input.port}/`,
    notes
  };
}

export function normalizeBaseUrl(raw: string): string {
  const withProtocol = raw.includes("://") ? raw : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`invalid base URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("base URL must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("base URL must not include credentials");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("base URL must be an origin, for example http://home.html:8765/");
  }
  return parsed.href;
}

export function originBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/`;
}

function displayHostForBindHost(host: string): string {
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") return "localhost";
  if (isWildcardHost(host)) return hostname() || "localhost";
  return host;
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function formatUrlHost(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) return `[${host}]`;
  return host;
}
