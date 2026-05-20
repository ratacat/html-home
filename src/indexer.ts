import { realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { loadManifest } from "./manifest";
import { diagnostic, type Diagnostic, type IndexedArtifact, type IndexedProject, type IndexSnapshot, type Registration } from "./types";

export type IndexResult = {
  index: IndexSnapshot;
  diagnostics: Diagnostic[];
};

export async function scanRegisteredRoots(
  registrations: Registration[],
  now = new Date(),
  previousIndex?: IndexSnapshot
): Promise<IndexResult> {
  const generatedAt = now.toISOString();
  const projects: IndexedProject[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const registration of registrations) {
    const rootResult = await canonicalDirectory(registration.manifestRoot);
    if (!rootResult.ok) {
      const code =
        rootResult.code === "artifact_path_not_directory" || rootResult.code === "missing_artifact_path"
          ? "missing_manifest_root"
          : rootResult.code;
      diagnostics.push(
        diagnostic({
          severity: "blocked",
          code,
          message: rootResult.message,
          hint: "Check the registered manifest root path.",
          scope: "registration",
          registrationId: registration.registrationId,
          path: registration.manifestRoot
        })
      );
      projects.push(
        ...staleProjectsForRegistration(
          previousIndex,
          registration,
          code,
          rootResult.message,
          "Check the registered manifest root path.",
          generatedAt
        )
      );
      continue;
    }

    const manifestResult = await loadManifest(rootResult.path);
    if (!manifestResult.ok) {
      diagnostics.push(
        ...manifestResult.diagnostics.map((diag) => ({
          ...diag,
          registrationId: registration.registrationId
        }))
      );
      const primary = manifestResult.diagnostics[0];
      projects.push(
        ...staleProjectsForRegistration(
          previousIndex,
          registration,
          primary?.code ?? "invalid_manifest",
          primary?.message ?? "Manifest could not be loaded.",
          primary?.hint,
          generatedAt
        )
      );
      continue;
    }

    const projectDiagnostics: Diagnostic[] = [];
    const artifacts: IndexedArtifact[] = [];
    for (const artifact of manifestResult.manifest.artifacts) {
      const artifactDiagnostics: Diagnostic[] = [];
      const artifactBaseResult = await canonicalDirectory(join(rootResult.path, artifact.path));
      let artifactBaseDirectory = join(rootResult.path, artifact.path);
      let status = "ok";

      if (!artifactBaseResult.ok) {
        status = artifactBaseResult.code;
        artifactDiagnostics.push(
          diagnostic({
            severity: "blocked",
            code: artifactBaseResult.code,
            message: artifactBaseResult.message,
            hint: "Create the artifact directory or update the manifest path.",
            scope: "artifact",
            registrationId: registration.registrationId,
            projectSlug: manifestResult.manifest.project.slug,
            artifactSlug: artifact.slug,
            routeKey: routeKey(manifestResult.manifest.project.slug, artifact.slug),
            path: artifactBaseDirectory,
            field: "path"
          })
        );
      } else {
        artifactBaseDirectory = artifactBaseResult.path;
        if (!isInside(rootResult.path, artifactBaseDirectory)) {
          status = "unsafe_path";
          artifactDiagnostics.push(
            diagnostic({
              severity: "blocked",
              code: "unsafe_path",
              message: "Artifact path resolves outside the manifest root.",
              hint: "Keep artifact directories under the manifest root.",
              scope: "artifact",
              registrationId: registration.registrationId,
              projectSlug: manifestResult.manifest.project.slug,
              artifactSlug: artifact.slug,
              routeKey: routeKey(manifestResult.manifest.project.slug, artifact.slug),
              path: artifactBaseDirectory,
              field: "path"
            })
          );
        } else {
          const entryResult = await canonicalFile(join(artifactBaseDirectory, artifact.entry));
          if (!entryResult.ok) {
            status = entryResult.code;
            artifactDiagnostics.push(
              diagnostic({
                severity: "blocked",
                code: entryResult.code,
                message: entryResult.message,
                hint: "Add the entry file or update the manifest entry field.",
                scope: "artifact",
                registrationId: registration.registrationId,
                projectSlug: manifestResult.manifest.project.slug,
                artifactSlug: artifact.slug,
                routeKey: routeKey(manifestResult.manifest.project.slug, artifact.slug),
                path: join(artifactBaseDirectory, artifact.entry),
                field: "entry"
              })
            );
          } else if (!isInside(artifactBaseDirectory, entryResult.path)) {
            status = "unsafe_path";
            artifactDiagnostics.push(
              diagnostic({
                severity: "blocked",
                code: "unsafe_path",
                message: "Entry file resolves outside the artifact base directory.",
                hint: "Keep symlink targets inside the artifact base directory.",
                scope: "artifact",
                registrationId: registration.registrationId,
                projectSlug: manifestResult.manifest.project.slug,
                artifactSlug: artifact.slug,
                routeKey: routeKey(manifestResult.manifest.project.slug, artifact.slug),
                path: entryResult.path,
                field: "entry"
              })
            );
          }
        }
      }

      diagnostics.push(...artifactDiagnostics);
      artifacts.push({
        projectSlug: manifestResult.manifest.project.slug,
        artifactSlug: artifact.slug,
        title: artifact.title,
        registrationId: registration.registrationId,
        manifestRoot: rootResult.path,
        artifactPath: artifact.path,
        artifactBaseDirectory,
        entry: artifact.entry,
        tags: artifact.tags,
        lastIndexedAt: generatedAt,
        status,
        stale: false,
        diagnostics: artifactDiagnostics
      });
    }

    projects.push({
      projectSlug: manifestResult.manifest.project.slug,
      title: manifestResult.manifest.project.title,
      registrationId: registration.registrationId,
      manifestRoot: rootResult.path,
      manifestPath: join(rootResult.path, ".html-home.json"),
      lastIndexedAt: generatedAt,
      status: "ok",
      stale: false,
      diagnostics: projectDiagnostics,
      artifacts
    });
  }

  applyDuplicateDiagnostics(projects, diagnostics);

  return {
    index: {
      generatedAt,
      projects: sortProjects(projects)
    },
    diagnostics
  };
}

export function routeKey(projectSlug: string, artifactSlug: string): string {
  return `${projectSlug}/${artifactSlug}`;
}

async function canonicalDirectory(path: string): Promise<{ ok: true; path: string } | { ok: false; code: string; message: string }> {
  try {
    const resolved = await realpath(path);
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      return { ok: false, code: "artifact_path_not_directory", message: "Path is not a directory." };
    }
    return { ok: true, path: resolved };
  } catch {
    return { ok: false, code: "missing_artifact_path", message: "Path does not exist." };
  }
}

async function canonicalFile(path: string): Promise<{ ok: true; path: string } | { ok: false; code: string; message: string }> {
  try {
    const resolved = await realpath(path);
    const stats = await stat(resolved);
    if (!stats.isFile()) {
      return { ok: false, code: "entry_not_file", message: "Entry path is not a file." };
    }
    return { ok: true, path: resolved };
  } catch {
    return { ok: false, code: "missing_entry", message: "Entry file does not exist." };
  }
}

function applyDuplicateDiagnostics(projects: IndexedProject[], diagnostics: Diagnostic[]) {
  const projectBuckets = new Map<string, IndexedProject[]>();
  const routeBuckets = new Map<string, IndexedArtifact[]>();

  for (const project of projects) {
    if (project.stale) continue;
    projectBuckets.set(project.projectSlug, [...(projectBuckets.get(project.projectSlug) ?? []), project]);
    for (const artifact of project.artifacts) {
      routeBuckets.set(routeKey(artifact.projectSlug, artifact.artifactSlug), [
        ...(routeBuckets.get(routeKey(artifact.projectSlug, artifact.artifactSlug)) ?? []),
        artifact
      ]);
    }
  }

  for (const [slug, bucket] of projectBuckets.entries()) {
    if (bucket.length <= 1) continue;
    for (const project of bucket) {
      const diag = diagnostic({
        severity: "blocked",
        code: "duplicate_project_slug",
        message: `Project slug "${slug}" is declared by multiple manifest roots.`,
        hint: "Change one project slug.",
        scope: "project",
        registrationId: project.registrationId,
        projectSlug: project.projectSlug,
        path: project.manifestRoot,
        relatedPaths: bucket.map((item) => item.manifestRoot)
      });
      project.status = "duplicate_project_slug";
      project.diagnostics.push(diag);
      diagnostics.push(diag);
      for (const artifact of project.artifacts) {
        const artifactDiag = {
          ...diag,
          scope: "artifact" as const,
          artifactSlug: artifact.artifactSlug,
          routeKey: routeKey(artifact.projectSlug, artifact.artifactSlug),
          path: artifact.artifactBaseDirectory
        };
        artifact.status = "duplicate_project_slug";
        artifact.diagnostics.push(artifactDiag);
        diagnostics.push(artifactDiag);
      }
    }
  }

  for (const [key, bucket] of routeBuckets.entries()) {
    if (bucket.length <= 1) continue;
    for (const artifact of bucket) {
      const diag = diagnostic({
        severity: "blocked",
        code: "duplicate_artifact_slug",
        message: `Route key "${key}" is declared by multiple artifacts.`,
        hint: "Change one artifact slug or project slug.",
        scope: "artifact",
        registrationId: artifact.registrationId,
        projectSlug: artifact.projectSlug,
        artifactSlug: artifact.artifactSlug,
        routeKey: key,
        path: artifact.artifactBaseDirectory,
        relatedPaths: bucket.map((item) => item.artifactBaseDirectory)
      });
      artifact.status = "duplicate_artifact_slug";
      artifact.diagnostics.push(diag);
      diagnostics.push(diag);
    }
  }
}

function staleProjectsForRegistration(
  previousIndex: IndexSnapshot | undefined,
  registration: Registration,
  code: string,
  message: string,
  hint: string | undefined,
  generatedAt: string
): IndexedProject[] {
  const previousProjects =
    previousIndex?.projects.filter((project) => project.registrationId === registration.registrationId) ?? [];

  return previousProjects.map((project) => {
    const projectDiag = diagnostic({
      severity: "blocked",
      code,
      message,
      hint,
      scope: "project",
      registrationId: registration.registrationId,
      projectSlug: project.projectSlug,
      path: project.manifestRoot
    });

    return {
      ...project,
      status: code,
      stale: true,
      lastIndexedAt: generatedAt,
      diagnostics: [projectDiag],
      artifacts: project.artifacts.map((artifact) => {
        const artifactDiag = diagnostic({
          severity: "blocked",
          code,
          message,
          hint,
          scope: "artifact",
          registrationId: registration.registrationId,
          projectSlug: artifact.projectSlug,
          artifactSlug: artifact.artifactSlug,
          routeKey: routeKey(artifact.projectSlug, artifact.artifactSlug),
          path: artifact.artifactBaseDirectory
        });
        return {
          ...artifact,
          status: code,
          stale: true,
          lastIndexedAt: generatedAt,
          diagnostics: [artifactDiag]
        };
      })
    };
  });
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !/^[a-zA-Z]:/.test(rel));
}

function sortProjects(projects: IndexedProject[]): IndexedProject[] {
  return projects
    .map((project) => ({
      ...project,
      artifacts: [...project.artifacts].sort((a, b) => routeKey(a.projectSlug, a.artifactSlug).localeCompare(routeKey(b.projectSlug, b.artifactSlug)))
    }))
    .sort((a, b) => a.projectSlug.localeCompare(b.projectSlug) || a.manifestRoot.localeCompare(b.manifestRoot));
}
