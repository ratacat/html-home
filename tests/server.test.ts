import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanRegisteredRoots } from "../src/indexer";
import { handleRequest } from "../src/server";
import { addOrUpdateRegistration, emptyState, saveStateAtomic } from "../src/state";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "html-home-server-root-"));
  const statePath = join(await mkdtemp(join(tmpdir(), "html-home-server-state-")), "state.json");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "<h1>Artifact</h1><script src=\"/app.js\"></script>");
  await writeFile(join(root, "dist", "app.css"), "body{}");
  await writeFile(
    join(root, ".html-home.json"),
    JSON.stringify({
      version: 1,
      project: { slug: "garden", title: "Garden <Project>" },
      artifacts: [{ slug: "charts", title: "Charts <One>", path: "dist", tags: ["local"] }]
    })
  );
  let state = addOrUpdateRegistration(emptyState(), root);
  const result = await scanRegisteredRoots(state.registrations);
  state = { ...state, index: result.index, diagnostics: result.diagnostics };
  await saveStateAtomic(statePath, state);
  return { root, statePath };
}

async function request(path: string, statePath: string, init?: RequestInit) {
  return handleRequest(new Request(`http://127.0.0.1${path}`, init), { statePath });
}

describe("server", () => {
  test("serves read-only state JSON", async () => {
    const { statePath } = await fixture();

    const response = await request("/api/state", statePath);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(json.index.projects[0].projectSlug).toBe("garden");
  });

  test("serves artifact entry bytes without rewriting root-relative URLs", async () => {
    const { statePath } = await fixture();

    const response = await request("/a/garden/charts/", statePath);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("<script src=\"/app.js\"></script>");
  });

  test("returns JSON route failures without local filesystem paths", async () => {
    const { statePath } = await fixture();

    const response = await request("/a/garden/charts/missing.js", statePath);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("asset_not_found");
    expect(JSON.stringify(json)).not.toContain("/tmp/");
  });

  test("rejects encoded traversal that reaches asset routing", async () => {
    const { statePath } = await fixture();

    const response = await request("/a/garden/charts/..%2fsecret.txt", statePath);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("unsafe_path");
  });

  test("rejects mutation methods on read-only routes", async () => {
    const { statePath } = await fixture();

    const response = await request("/api/state", statePath, { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  test("renders escaped start and project pages", async () => {
    const { statePath } = await fixture();

    const home = await request("/", statePath);
    const project = await request("/p/garden/", statePath);
    const homeText = await home.text();
    const projectText = await project.text();

    expect(home.status).toBe(200);
    expect(homeText).toContain("Recently opened in this browser");
    expect(homeText).toContain("data-status-filter=\"blocked\"");
    expect(homeText).toContain("Garden &lt;Project&gt;");
    expect(project.status).toBe(200);
    expect(projectText).toContain("Charts &lt;One&gt;");
  });

  test("reloads state on each request", async () => {
    const { statePath } = await fixture();
    const first = await (await request("/api/state", statePath)).json();
    expect(first.index.projects[0].projectSlug).toBe("garden");

    const state = emptyState();
    await saveStateAtomic(statePath, state);
    const second = await (await request("/api/state", statePath)).json();

    expect(second.index.projects).toEqual([]);
  });
});
