export type DiagnosticSeverity = "blocked" | "warning" | "info";

export type Diagnostic = {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  hint?: string;
  scope: "state" | "registration" | "manifest" | "project" | "artifact" | "action" | "route" | "file";
  registrationId?: string;
  projectSlug?: string;
  artifactSlug?: string;
  actionSlug?: string;
  routeKey?: string;
  path?: string;
  field?: string;
  relatedPaths?: string[];
  observedAt: string;
};

export type ActionInputMode = "json-stdin";

export type ManifestAction = {
  slug: string;
  title: string;
  command: string[];
  cwd?: string;
  input: ActionInputMode;
  timeoutMs: number;
};

export type ArtifactManifest = {
  slug: string;
  title: string;
  path: string;
  entry: string;
  tags: string[];
  actions: ManifestAction[];
};

export type ProjectManifest = {
  slug: string;
  title: string;
};

export type HomeManifest = {
  version: 1 | 2;
  project: ProjectManifest;
  artifacts: ArtifactManifest[];
  manifestPath?: string;
};

export type Registration = {
  registrationId: string;
  manifestRoot: string;
  manifestPath: string;
  addedAt: string;
  lastScanAt: string | null;
  status: string;
  diagnostics: Diagnostic[];
};

export type IndexedProject = {
  projectSlug: string;
  title: string;
  registrationId: string;
  manifestRoot: string;
  manifestPath: string;
  lastIndexedAt: string;
  status: string;
  stale: boolean;
  diagnostics: Diagnostic[];
  artifacts: IndexedArtifact[];
};

export type IndexedArtifact = {
  projectSlug: string;
  artifactSlug: string;
  title: string;
  registrationId: string;
  manifestRoot: string;
  artifactPath: string;
  artifactBaseDirectory: string;
  entry: string;
  tags: string[];
  actions: IndexedAction[];
  lastIndexedAt: string;
  status: string;
  stale: boolean;
  diagnostics: Diagnostic[];
};

export type IndexedAction = {
  projectSlug: string;
  artifactSlug: string;
  actionSlug: string;
  title: string;
  command: string[];
  cwd: string;
  input: ActionInputMode;
  timeoutMs: number;
  lastIndexedAt: string;
  status: string;
  stale: boolean;
  diagnostics: Diagnostic[];
};

export type IndexSnapshot = {
  generatedAt: string | null;
  projects: IndexedProject[];
};

export type StateDoc = {
  schemaVersion: 1;
  registrations: Registration[];
  index: IndexSnapshot;
  diagnostics: Diagnostic[];
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: Diagnostic[] };

export function diagnostic(input: Omit<Diagnostic, "observedAt">): Diagnostic {
  return {
    ...input,
    observedAt: new Date().toISOString()
  };
}
