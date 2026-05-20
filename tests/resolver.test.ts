import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { scanRegisteredRoots } from "../src/indexer";
import { resolveArtifactAsset } from "../src/resolver";
import { addOrUpdateRegistration, emptyState } from "../src/state";

async function indexedRoot() {
  const root = await mkdtemp(join(tmpdir(), "html-home-resolver-"));
  await mkdir(join(root, "dist", "sub"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "<h1>entry</h1>");
  await writeFile(join(root, "dist", "app.css"), "body{}");
  await writeFile(join(root, "dist", "sub", "image.txt"), "ok");
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
  return { root, index: result.index };
}

describe("resolver", () => {
  test("resolves artifact root to the declared entry file", async () => {
    const { index } = await indexedRoot();

    const result = await resolveArtifactAsset(index, "garden", "charts", "");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected resolved file");
    expect(result.path.endsWith("index.html")).toBe(true);
  });

  test("resolves nested asset files", async () => {
    const { index } = await indexedRoot();

    const result = await resolveArtifactAsset(index, "garden", "charts", "sub/image.txt");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected resolved file");
    expect(result.path.endsWith(join("sub", "image.txt"))).toBe(true);
  });

  test("blocks encoded traversal", async () => {
    const { index } = await indexedRoot();

    const result = await resolveArtifactAsset(index, "garden", "charts", "%2e%2e/secret.txt");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("unsafe_path");
  });

  test("blocks symlink escapes inside artifact directories", async () => {
    const { root, index } = await indexedRoot();
    const outside = join(root, "secret.txt");
    await writeFile(outside, "secret");
    await symlink(outside, join(root, "dist", "escape.txt"));

    const result = await resolveArtifactAsset(index, "garden", "charts", "escape.txt");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("unsafe_path");
  });

  test("does not serve nested directory indexes implicitly", async () => {
    const { root, index } = await indexedRoot();
    await writeFile(join(root, "dist", "sub", "index.html"), "<h1>nested</h1>");

    const result = await resolveArtifactAsset(index, "garden", "charts", "sub/");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("directory_not_served");
  });
});
