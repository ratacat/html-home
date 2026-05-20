import { realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { IndexedArtifact, IndexSnapshot } from "./types";

export type ResolveFailureCode =
  | "project_not_found"
  | "artifact_not_found"
  | "duplicate_route"
  | "non_routable_artifact"
  | "unsafe_path"
  | "asset_not_found"
  | "directory_not_served"
  | "unreadable";

export type ResolveResult =
  | { ok: true; path: string; artifact: IndexedArtifact }
  | { ok: false; code: ResolveFailureCode; message: string; status: number };

export async function resolveArtifactAsset(
  index: IndexSnapshot,
  projectSlug: string,
  artifactSlug: string,
  assetPath: string
): Promise<ResolveResult> {
  const projectMatches = index.projects.filter((project) => project.projectSlug === projectSlug);
  if (projectMatches.length === 0) {
    return failure("project_not_found", "Project not found.", 404);
  }

  const artifactMatches = projectMatches.flatMap((project) =>
    project.artifacts.filter((artifact) => artifact.artifactSlug === artifactSlug)
  );
  if (artifactMatches.length === 0) {
    return failure("artifact_not_found", "Artifact not found.", 404);
  }

  if (
    artifactMatches.length > 1 ||
    artifactMatches.some((artifact) => artifact.status === "duplicate_artifact_slug" || artifact.status === "duplicate_project_slug")
  ) {
    return failure("duplicate_route", "Artifact route is duplicated.", 409);
  }

  const artifact = artifactMatches[0];
  if (artifact.status !== "ok") {
    return failure("non_routable_artifact", "Artifact is not routable.", 404);
  }

  const decoded = decodeAssetPath(assetPath);
  if (!decoded.ok) {
    return failure("unsafe_path", "Unsafe path.", 404);
  }

  if (decoded.path !== "" && decoded.path.endsWith("/")) {
    return failure("directory_not_served", "Directory requests are not served.", 404);
  }

  const relativeFile = decoded.path === "" ? artifact.entry : decoded.path;
  const targetPath = join(artifact.artifactBaseDirectory, relativeFile);

  try {
    const canonicalBase = await realpath(artifact.artifactBaseDirectory);
    const canonicalTarget = await realpath(targetPath);
    if (!isInside(canonicalBase, canonicalTarget)) {
      return failure("unsafe_path", "Unsafe path.", 404);
    }

    const stats = await stat(canonicalTarget);
    if (stats.isDirectory()) {
      return failure("directory_not_served", "Directory requests are not served.", 404);
    }
    if (!stats.isFile()) {
      return failure("asset_not_found", "Asset not found.", 404);
    }
    return { ok: true, path: canonicalTarget, artifact };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EACCES" || code === "EPERM") {
      return failure("unreadable", "File is unreadable.", 403);
    }
    return failure("asset_not_found", "Asset not found.", 404);
  }
}

function decodeAssetPath(input: string): { ok: true; path: string } | { ok: false } {
  const trimmed = input.replace(/^\/+/, "");
  if (/%2f/i.test(trimmed) || /%5c/i.test(trimmed)) return { ok: false };
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return { ok: false };
  }
  if (decoded.includes("\0")) return { ok: false };
  if (decoded.includes("\\")) return { ok: false };
  if (decoded.startsWith("/") || /^[a-zA-Z]:/.test(decoded)) return { ok: false };
  const segments = decoded.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return { ok: false };
  return { ok: true, path: decoded };
}

function failure(code: ResolveFailureCode, message: string, status: number): ResolveResult {
  return { ok: false, code, message, status };
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !/^[a-zA-Z]:/.test(rel));
}
