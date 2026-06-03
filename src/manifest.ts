import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { diagnostic, type Diagnostic, type HomeManifest, type ManifestAction } from "./types";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOP_LEVEL_FIELDS = new Set(["version", "project", "artifacts"]);
const PROJECT_FIELDS = new Set(["slug", "title"]);
const ARTIFACT_FIELDS_V1 = new Set(["slug", "title", "path", "entry", "tags"]);
const ARTIFACT_FIELDS_V2 = new Set([...ARTIFACT_FIELDS_V1, "actions"]);
const ACTION_FIELDS = new Set(["slug", "title", "command", "cwd", "input", "timeout_ms"]);
const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
const MAX_ACTION_TIMEOUT_MS = 60_000;

type ManifestParseResult =
  | { ok: true; manifest: HomeManifest }
  | { ok: false; diagnostics: Diagnostic[] };

export async function loadManifest(manifestRoot: string): Promise<ManifestParseResult> {
  const manifestPath = join(manifestRoot, ".html-home.json");
  try {
    const text = await readFile(manifestPath, "utf8");
    const result = parseManifest(text, manifestPath);
    if (result.ok) {
      result.manifest.manifestPath = manifestPath;
    }
    return result;
  } catch {
    return {
      ok: false,
      diagnostics: [
        diagnostic({
          severity: "blocked",
          code: "missing_manifest",
          message: "Manifest file does not exist.",
          hint: "Add .html-home.json to the manifest root.",
          scope: "manifest",
          path: manifestPath
        })
      ]
    };
  }
}

export function parseManifest(text: string, sourceName: string): ManifestParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      diagnostics: [
        diagnostic({
          severity: "blocked",
          code: "invalid_manifest",
          message: "Manifest is not valid JSON.",
          scope: "manifest",
          path: sourceName
        })
      ]
    };
  }

  const diagnostics: Diagnostic[] = [];
  if (!isRecord(raw)) {
    diagnostics.push(manifestDiagnostic("invalid_manifest", "Manifest must be a JSON object.", sourceName));
    return { ok: false, diagnostics };
  }

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      diagnostics.push(
        manifestDiagnostic("invalid_manifest", `Unknown top-level field "${key}".`, sourceName, key)
      );
    }
  }

  if (raw.version !== 1 && raw.version !== 2) {
    diagnostics.push(
      manifestDiagnostic("unsupported_manifest_version", "Manifest version must be 1 or 2.", sourceName, "version")
    );
  }
  const version = raw.version === 2 ? 2 : 1;

  if (!isRecord(raw.project)) {
    diagnostics.push(manifestDiagnostic("invalid_manifest", "Project must be an object.", sourceName, "project"));
  } else {
    for (const key of Object.keys(raw.project)) {
      if (!PROJECT_FIELDS.has(key)) {
        diagnostics.push(
          manifestDiagnostic("invalid_manifest", `Unknown project field "${key}".`, sourceName, `project.${key}`)
        );
      }
    }
  }

  const projectSlug = isRecord(raw.project) && typeof raw.project.slug === "string" ? raw.project.slug : "";
  if (!validSlug(projectSlug)) {
    diagnostics.push(manifestDiagnostic("invalid_slug", "Project slug is invalid.", sourceName, "project.slug"));
  }

  if (isRecord(raw.project) && hasOwn(raw.project, "title") && !nonEmptyString(raw.project.title)) {
    diagnostics.push(manifestDiagnostic("invalid_manifest", "Project title must be a non-empty string.", sourceName, "project.title"));
  }

  const projectTitle =
    isRecord(raw.project) && nonEmptyString(raw.project.title)
      ? raw.project.title
      : projectSlug;

  if (!Array.isArray(raw.artifacts) || raw.artifacts.length === 0) {
    diagnostics.push(
      manifestDiagnostic("invalid_manifest", "Artifacts must be a non-empty array.", sourceName, "artifacts")
    );
  }

  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  const normalizedArtifacts = artifacts.map((artifact, index) => {
    const fieldPrefix = `artifacts[${index}]`;
    if (!isRecord(artifact)) {
      diagnostics.push(
        manifestDiagnostic("invalid_manifest", "Artifact must be an object.", sourceName, fieldPrefix)
      );
      return null;
    }

    const artifactFields = version === 2 ? ARTIFACT_FIELDS_V2 : ARTIFACT_FIELDS_V1;
    for (const key of Object.keys(artifact)) {
      if (!artifactFields.has(key)) {
        diagnostics.push(
          manifestDiagnostic("invalid_manifest", `Unknown artifact field "${key}".`, sourceName, `${fieldPrefix}.${key}`)
        );
      }
    }

    const slug = typeof artifact.slug === "string" ? artifact.slug : "";
    if (!validSlug(slug)) {
      diagnostics.push(manifestDiagnostic("invalid_slug", "Artifact slug is invalid.", sourceName, `${fieldPrefix}.slug`));
    }

    if (hasOwn(artifact, "title") && !nonEmptyString(artifact.title)) {
      diagnostics.push(manifestDiagnostic("invalid_manifest", "Artifact title must be a non-empty string.", sourceName, `${fieldPrefix}.title`));
    }

    const artifactPath = typeof artifact.path === "string" ? artifact.path : "";
    if (!safeRelativePath(artifactPath, { allowEmpty: false })) {
      diagnostics.push(
        manifestDiagnostic("unsafe_path", "Artifact path must be a safe relative directory path.", sourceName, `${fieldPrefix}.path`)
      );
    }

    if (hasOwn(artifact, "entry") && !nonEmptyString(artifact.entry)) {
      diagnostics.push(manifestDiagnostic("invalid_manifest", "Entry must be a non-empty string.", sourceName, `${fieldPrefix}.entry`));
    }

    const entry = nonEmptyString(artifact.entry) ? artifact.entry : "index.html";
    if (!safeRelativePath(entry, { allowEmpty: false })) {
      diagnostics.push(
        manifestDiagnostic("unsafe_path", "Entry file must be a safe relative file path.", sourceName, `${fieldPrefix}.entry`)
      );
    }

    if (hasOwn(artifact, "tags") && !Array.isArray(artifact.tags)) {
      diagnostics.push(manifestDiagnostic("invalid_manifest", "Tags must be an array.", sourceName, `${fieldPrefix}.tags`));
    }

    const tags = Array.isArray(artifact.tags) ? artifact.tags : [];
    for (let tagIndex = 0; tagIndex < tags.length; tagIndex += 1) {
      if (typeof tags[tagIndex] !== "string" || !validSlug(tags[tagIndex])) {
        diagnostics.push(
          manifestDiagnostic("invalid_slug", "Tag slug is invalid.", sourceName, `${fieldPrefix}.tags[${tagIndex}]`)
        );
      }
    }

    const actions = parseActions(artifact, version, fieldPrefix, sourceName, diagnostics);

    return {
      slug,
      title: nonEmptyString(artifact.title) ? artifact.title : slug,
      path: artifactPath,
      entry,
      tags: tags.filter((tag): tag is string => typeof tag === "string"),
      actions
    };
  });

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    manifest: {
      version,
      project: {
        slug: projectSlug,
        title: projectTitle
      },
      artifacts: normalizedArtifacts.filter((artifact): artifact is NonNullable<typeof artifact> => artifact !== null),
      manifestPath: sourceName
    }
  };
}

function parseActions(
  artifact: Record<string, unknown>,
  version: 1 | 2,
  fieldPrefix: string,
  sourceName: string,
  diagnostics: Diagnostic[]
): ManifestAction[] {
  if (!hasOwn(artifact, "actions")) return [];
  if (version !== 2) {
    diagnostics.push(
      manifestDiagnostic("invalid_manifest", "Artifact actions require manifest version 2.", sourceName, `${fieldPrefix}.actions`)
    );
    return [];
  }
  if (!Array.isArray(artifact.actions)) {
    diagnostics.push(manifestDiagnostic("invalid_manifest", "Actions must be an array.", sourceName, `${fieldPrefix}.actions`));
    return [];
  }

  return artifact.actions
    .map((rawAction, index) => {
      const actionPrefix = `${fieldPrefix}.actions[${index}]`;
      if (!isRecord(rawAction)) {
        diagnostics.push(manifestDiagnostic("invalid_manifest", "Action must be an object.", sourceName, actionPrefix));
        return null;
      }

      for (const key of Object.keys(rawAction)) {
        if (!ACTION_FIELDS.has(key)) {
          diagnostics.push(
            manifestDiagnostic("invalid_manifest", `Unknown action field "${key}".`, sourceName, `${actionPrefix}.${key}`)
          );
        }
      }

      const slug = typeof rawAction.slug === "string" ? rawAction.slug : "";
      if (!validSlug(slug)) {
        diagnostics.push(manifestDiagnostic("invalid_slug", "Action slug is invalid.", sourceName, `${actionPrefix}.slug`));
      }

      if (hasOwn(rawAction, "title") && !nonEmptyString(rawAction.title)) {
        diagnostics.push(manifestDiagnostic("invalid_manifest", "Action title must be a non-empty string.", sourceName, `${actionPrefix}.title`));
      }

      if (!Array.isArray(rawAction.command) || rawAction.command.length === 0) {
        diagnostics.push(manifestDiagnostic("invalid_manifest", "Action command must be a non-empty argv array.", sourceName, `${actionPrefix}.command`));
      }
      const command = Array.isArray(rawAction.command) ? rawAction.command : [];
      for (let commandIndex = 0; commandIndex < command.length; commandIndex += 1) {
        if (!nonEmptyString(command[commandIndex])) {
          diagnostics.push(
            manifestDiagnostic("invalid_manifest", "Action command entries must be non-empty strings.", sourceName, `${actionPrefix}.command[${commandIndex}]`)
          );
        }
      }

      if (hasOwn(rawAction, "cwd")) {
        if (!nonEmptyString(rawAction.cwd) || !safeActionCwd(rawAction.cwd)) {
          diagnostics.push(manifestDiagnostic("unsafe_path", "Action cwd must be a safe relative path or absolute path.", sourceName, `${actionPrefix}.cwd`));
        }
      }

      if (hasOwn(rawAction, "input") && rawAction.input !== "json-stdin") {
        diagnostics.push(manifestDiagnostic("invalid_manifest", "Action input must be json-stdin.", sourceName, `${actionPrefix}.input`));
      }

      if (hasOwn(rawAction, "timeout_ms") && !validTimeout(rawAction.timeout_ms)) {
        diagnostics.push(
          manifestDiagnostic("invalid_manifest", `Action timeout_ms must be an integer from 1 to ${MAX_ACTION_TIMEOUT_MS}.`, sourceName, `${actionPrefix}.timeout_ms`)
        );
      }

      return {
        slug,
        title: nonEmptyString(rawAction.title) ? rawAction.title : slug,
        command: command.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
        ...(nonEmptyString(rawAction.cwd) ? { cwd: rawAction.cwd } : {}),
        input: "json-stdin" as const,
        timeoutMs: typeof rawAction.timeout_ms === "number" ? rawAction.timeout_ms : DEFAULT_ACTION_TIMEOUT_MS
      };
    })
    .filter((action): action is ManifestAction => action !== null);
}

export function validSlug(value: string): boolean {
  return value.length > 0 && value.length <= 64 && SLUG_RE.test(value);
}

export function safeRelativePath(value: string, options: { allowEmpty: boolean }): boolean {
  if (value.length === 0) return options.allowEmpty;
  if (value.includes("\0")) return false;
  if (isAbsolute(value)) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (value.includes("\\")) return false;
  const normalized = normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith(`..${sep}`)) return false;
  return !normalized.split(/[\\/]/).includes("..");
}

function safeActionCwd(value: string): boolean {
  if (value.length === 0) return false;
  if (value === ".") return true;
  if (value.includes("\0")) return false;
  if (value.includes("\\")) return false;
  if (value.startsWith("~")) return false;
  if (isAbsolute(value)) return normalize(value).startsWith(sep);
  return safeRelativePath(value, { allowEmpty: false });
}

function validTimeout(value: unknown): value is number {
  return Number.isInteger(value) && value > 0 && value <= MAX_ACTION_TIMEOUT_MS;
}

function manifestDiagnostic(code: string, message: string, path: string, field?: string): Diagnostic {
  return diagnostic({
    severity: "blocked",
    code,
    message,
    scope: "manifest",
    path,
    field
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
