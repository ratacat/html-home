import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleActionRequest } from "./actions";
import { resolveArtifactAsset } from "./resolver";
import { renderHomePage, renderProjectPage } from "./start_page";
import { loadState } from "./state";
import { originBaseUrl } from "./url";

const UI_ASSET_ROOT = fileURLToPath(new URL("../assets", import.meta.url));

export type ServerConfig = {
  statePath: string;
  publicBaseUrl?: string;
  catalogLabel?: string;
  actionsEnabled?: boolean;
  requestBodyLimitBytes?: number;
  stdoutLimitBytes?: number;
  stderrLimitBytes?: number;
  auditPath?: string;
};

export async function handleRequest(request: Request, config: ServerConfig): Promise<Response> {
  const pathname = rawPathnameFromRequestUrl(request.url);
  const loaded = await loadState(config.statePath);
  const state = loaded.state;

  const actionMatch = /^\/api\/actions\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (actionMatch) {
    const projectSlug = decodeRouteSegment(actionMatch[1]);
    const artifactSlug = decodeRouteSegment(actionMatch[2]);
    const actionSlug = decodeRouteSegment(actionMatch[3]);
    if (projectSlug === null || artifactSlug === null || actionSlug === null) {
      return jsonError("unsafe_path", "Unsafe path.", 404, undefined, request.method);
    }
    return handleActionRequest(request, state.index, { projectSlug, artifactSlug, actionSlug }, config);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError("method_not_allowed", "Method not allowed.", 405, { Allow: "GET, HEAD" }, request.method);
  }

  if (pathname.startsWith("/_html-home/assets/")) {
    return builtinAssetResponse(pathname.slice("/_html-home/assets/".length), request.method);
  }

  const renderOptions = {
    baseUrl: config.publicBaseUrl ?? originBaseUrl(request.url),
    catalogLabel: config.catalogLabel
  };

  if (pathname === "/api/state") {
    return jsonResponse(state, request.method);
  }

  if (pathname === "/") {
    return htmlResponse(renderHomePage(state, renderOptions), request.method);
  }

  const projectMatch = /^\/p\/([^/]+)\/$/.exec(pathname);
  if (projectMatch) {
    const projectSlug = decodeRouteSegment(projectMatch[1]);
    if (projectSlug === null) return jsonError("unsafe_path", "Unsafe path.", 404, undefined, request.method);
    const project = state.index.projects.find((item) => item.projectSlug === projectSlug);
    if (!project) return jsonError("project_not_found", "Project not found.", 404, undefined, request.method);
    return htmlResponse(renderProjectPage(project, state, renderOptions), request.method);
  }

  const artifactMatch = /^\/home\/([^/]+)\/([^/]+)\/(.*)$/.exec(pathname);
  if (artifactMatch) {
    const projectSlug = decodeRouteSegment(artifactMatch[1]);
    const artifactSlug = decodeRouteSegment(artifactMatch[2]);
    if (projectSlug === null || artifactSlug === null) {
      return jsonError("unsafe_path", "Unsafe path.", 404, undefined, request.method);
    }
    const assetPath = artifactMatch[3] ?? "";
    const resolved = await resolveArtifactAsset(state.index, projectSlug, artifactSlug, assetPath);
    if (!resolved.ok) {
      return jsonError(resolved.code, resolved.message, resolved.status, undefined, request.method);
    }
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: commonHeaders(contentTypeFor(resolved.path)) });
    }
    try {
      const bytes = await readFile(resolved.path);
      return new Response(bytes, { status: 200, headers: commonHeaders(contentTypeFor(resolved.path)) });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "EACCES" || code === "EPERM") {
        return jsonError("unreadable", "File is unreadable.", 403, undefined, request.method);
      }
      return jsonError("asset_not_found", "Asset not found.", 404, undefined, request.method);
    }
  }

  return jsonError("route_not_found", "Route not found.", 404, undefined, request.method);
}

async function builtinAssetResponse(assetPath: string, method: string): Promise<Response> {
  const resolved = await resolveBuiltinAsset(assetPath);
  if (!resolved.ok) {
    return jsonError(resolved.code, resolved.message, resolved.status, undefined, method);
  }
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers: commonHeaders(contentTypeFor(resolved.path)) });
  }
  try {
    const bytes = await readFile(resolved.path);
    return new Response(bytes, { status: 200, headers: commonHeaders(contentTypeFor(resolved.path)) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EACCES" || code === "EPERM") {
      return jsonError("unreadable", "File is unreadable.", 403, undefined, method);
    }
    return jsonError("asset_not_found", "Asset not found.", 404, undefined, method);
  }
}

async function resolveBuiltinAsset(assetPath: string): Promise<{ ok: true; path: string } | { ok: false; code: string; message: string; status: number }> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(assetPath);
  } catch {
    return { ok: false, code: "unsafe_path", message: "Unsafe path.", status: 404 };
  }
  if (decoded.includes("\0") || decoded.includes("\\") || decoded.length === 0) {
    return { ok: false, code: "unsafe_path", message: "Unsafe path.", status: 404 };
  }
  const parts = decoded.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    return { ok: false, code: "unsafe_path", message: "Unsafe path.", status: 404 };
  }
  try {
    const root = await realpath(UI_ASSET_ROOT);
    const target = await realpath(join(root, ...parts));
    if (!isInside(root, target)) {
      return { ok: false, code: "unsafe_path", message: "Unsafe path.", status: 404 };
    }
    return { ok: true, path: target };
  } catch {
    return { ok: false, code: "asset_not_found", message: "Asset not found.", status: 404 };
  }
}

export function serve(config: ServerConfig, options: { host: string; port: number }) {
  return Bun.serve({
    hostname: options.host,
    port: options.port,
    fetch(request) {
      return handleRequest(request, config);
    }
  });
}

function jsonResponse(value: unknown, method: string): Response {
  return new Response(method === "HEAD" ? null : JSON.stringify(value, null, 2), {
    status: 200,
    headers: commonHeaders("application/json; charset=utf-8")
  });
}

function htmlResponse(html: string, method: string): Response {
  return new Response(method === "HEAD" ? null : html, {
    status: 200,
    headers: commonHeaders("text/html; charset=utf-8")
  });
}

function jsonError(code: string, message: string, status: number, headers?: HeadersInit, method = "GET"): Response {
  return new Response(
    method === "HEAD"
      ? null
      : JSON.stringify({
          error: { code, message, status }
        }),
    {
      status,
      headers: {
        ...commonHeaders("application/json; charset=utf-8"),
        ...(headers ?? {})
      }
    }
  );
}

function commonHeaders(contentType: string): HeadersInit {
  return {
    "content-type": contentType,
    "cache-control": "no-store"
  };
}

function contentTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function rawPathnameFromRequestUrl(requestUrl: string): string {
  const authorityStart = requestUrl.indexOf("://");
  if (authorityStart === -1) return "/";
  const pathStart = requestUrl.indexOf("/", authorityStart + 3);
  if (pathStart === -1) return "/";
  const suffix = requestUrl.slice(pathStart);
  const end = suffix.search(/[?#]/);
  return end === -1 ? suffix : suffix.slice(0, end);
}

function decodeRouteSegment(segment: string): string | null {
  if (/%2f/i.test(segment) || /%5c/i.test(segment)) return null;
  try {
    const decoded = decodeURIComponent(segment);
    if (decoded.includes("\0") || decoded.includes("/") || decoded.includes("\\")) return null;
    return decoded;
  } catch {
    return null;
  }
}
