import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadManifest, parseManifest } from "../src/manifest";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "html-home-manifest-"));
}

describe("manifest", () => {
  test("loads a valid manifest and applies defaults", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, ".html-home.json"),
      JSON.stringify({
        version: 1,
        project: { slug: "garden", title: "Garden" },
        artifacts: [{ slug: "charts", title: "Charts", path: "dist" }]
      })
    );

    const result = await loadManifest(root);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected manifest to parse");
    expect(result.manifest.project.slug).toBe("garden");
    expect(result.manifest.artifacts[0]).toMatchObject({
      slug: "charts",
      title: "Charts",
      path: "dist",
      entry: "index.html",
      tags: []
    });
  });

  test("rejects malformed manifests with field-specific diagnostics", () => {
    const result = parseManifest(
      JSON.stringify({
        version: 1,
        project: { slug: "Bad_Slug", title: "Bad" },
        artifacts: [
          {
            slug: "ok",
            path: "../dist",
            entry: "index.html",
            extra: true
          }
        ],
        extraTop: true
      }),
      "/tmp/root/.html-home.json"
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected manifest to fail");
    expect(result.diagnostics.map((d) => d.code)).toContain("invalid_slug");
    expect(result.diagnostics.map((d) => d.code)).toContain("unsafe_path");
    expect(result.diagnostics.map((d) => d.code)).toContain("invalid_manifest");
    expect(result.diagnostics.some((d) => d.field === "extraTop")).toBe(true);
    expect(result.diagnostics.some((d) => d.field === "artifacts[0].extra")).toBe(true);
  });

  test("rejects invalid optional field shapes when present", () => {
    const result = parseManifest(
      JSON.stringify({
        version: 1,
        project: { slug: "garden", title: 12 },
        artifacts: [
          {
            slug: "charts",
            title: "",
            path: "dist",
            entry: "",
            tags: "debug"
          }
        ]
      }),
      "/tmp/root/.html-home.json"
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected manifest to fail");
    expect(result.diagnostics.some((d) => d.field === "project.title")).toBe(true);
    expect(result.diagnostics.some((d) => d.field === "artifacts[0].title")).toBe(true);
    expect(result.diagnostics.some((d) => d.field === "artifacts[0].entry")).toBe(true);
    expect(result.diagnostics.some((d) => d.field === "artifacts[0].tags")).toBe(true);
  });
});
