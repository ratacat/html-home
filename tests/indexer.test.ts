import { describe, expect, test } from "bun:test";
import { mkdir, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { scanRegisteredRoots } from "../src/indexer";
import { addOrUpdateRegistration, emptyState } from "../src/state";

async function fixtureRoot(projectSlug = "garden", artifactSlug = "charts") {
  const root = await mkdtemp(join(tmpdir(), "html-home-indexer-"));
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "<h1>ok</h1>");
  await writeFile(
    join(root, ".html-home.json"),
    JSON.stringify({
      version: 1,
      project: { slug: projectSlug, title: projectSlug },
      artifacts: [{ slug: artifactSlug, title: artifactSlug, path: "dist" }]
    })
  );
  return root;
}

describe("indexer", () => {
  test("indexes one registered manifest root as routable", async () => {
    const root = await fixtureRoot();
    const state = addOrUpdateRegistration(emptyState(), root);

    const result = await scanRegisteredRoots(state.registrations);

    expect(result.index.projects).toHaveLength(1);
    expect(result.index.projects[0].artifacts[0]).toMatchObject({
      projectSlug: "garden",
      artifactSlug: "charts",
      status: "ok",
      artifactPath: "dist",
      entry: "index.html"
    });
    expect(result.diagnostics).toEqual([]);
  });

  test("reports missing entry files as non-routable artifacts", async () => {
    const root = await fixtureRoot();
    await writeFile(
      join(root, ".html-home.json"),
      JSON.stringify({
        version: 1,
        project: { slug: "garden" },
        artifacts: [{ slug: "charts", path: "dist", entry: "missing.html" }]
      })
    );
    const state = addOrUpdateRegistration(emptyState(), root);

    const result = await scanRegisteredRoots(state.registrations);

    const artifact = result.index.projects[0].artifacts[0];
    expect(artifact.status).toBe("missing_entry");
    expect(result.diagnostics.map((d) => d.code)).toContain("missing_entry");
  });

  test("marks duplicate route keys as visible but non-routable", async () => {
    const rootA = await fixtureRoot("garden", "charts");
    const rootB = await fixtureRoot("garden", "charts");
    let state = addOrUpdateRegistration(emptyState(), rootA);
    state = addOrUpdateRegistration(state, rootB);

    const result = await scanRegisteredRoots(state.registrations);

    const artifacts = result.index.projects.flatMap((project) => project.artifacts);
    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((artifact) => artifact.status === "duplicate_artifact_slug")).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain("duplicate_artifact_slug");
  });

  test("marks duplicate project slugs as non-routable even with different artifact slugs", async () => {
    const rootA = await fixtureRoot("garden", "charts");
    const rootB = await fixtureRoot("garden", "tables");
    let state = addOrUpdateRegistration(emptyState(), rootA);
    state = addOrUpdateRegistration(state, rootB);

    const result = await scanRegisteredRoots(state.registrations);

    const artifacts = result.index.projects.flatMap((project) => project.artifacts);
    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((artifact) => artifact.status === "duplicate_project_slug")).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain("duplicate_project_slug");
  });

  test("reports missing manifest roots with registration-level status", async () => {
    const state = addOrUpdateRegistration(emptyState(), "/tmp/html-home-does-not-exist-for-test");

    const result = await scanRegisteredRoots(state.registrations);

    expect(result.index.projects).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toContain("missing_manifest_root");
  });

  test("preserves last-known artifacts as stale when a later scan cannot read the root", async () => {
    const root = await fixtureRoot();
    const state = addOrUpdateRegistration(emptyState(), root);
    const first = await scanRegisteredRoots(state.registrations);
    await rename(root, `${root}-moved`);

    const second = await scanRegisteredRoots(state.registrations, new Date(), first.index);
    const artifact = second.index.projects[0].artifacts[0];

    expect(second.index.projects).toHaveLength(1);
    expect(second.index.projects[0]).toMatchObject({
      projectSlug: "garden",
      stale: true,
      status: "missing_manifest_root"
    });
    expect(artifact).toMatchObject({
      artifactSlug: "charts",
      stale: true,
      status: "missing_manifest_root"
    });
    expect(resultCodes(second.diagnostics)).toContain("missing_manifest_root");
  });

  test("blocks artifact directories that resolve outside the manifest root", async () => {
    const root = await mkdtemp(join(tmpdir(), "html-home-indexer-"));
    const outside = await mkdtemp(join(tmpdir(), "html-home-outside-"));
    await writeFile(join(outside, "index.html"), "<h1>secret</h1>");
    await symlink(outside, join(root, "dist"));
    await writeFile(
      join(root, ".html-home.json"),
      JSON.stringify({
        version: 1,
        project: { slug: "garden" },
        artifacts: [{ slug: "charts", path: "dist" }]
      })
    );
    const state = addOrUpdateRegistration(emptyState(), root);

    const result = await scanRegisteredRoots(state.registrations);

    expect(result.index.projects[0].artifacts[0].status).toBe("unsafe_path");
    expect(result.diagnostics.map((d) => d.code)).toContain("unsafe_path");
  });
});

function resultCodes(result: { code: string }[]) {
  return result.map((d) => d.code);
}
