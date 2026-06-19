import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

async function actionFixture(script: string | undefined, timeoutMs = 10000, command = ["bun", "action.ts"]) {
  const root = await mkdtemp(join(tmpdir(), "html-home-server-action-root-"));
  const statePath = join(await mkdtemp(join(tmpdir(), "html-home-server-action-state-")), "state.json");
  const auditPath = join(await mkdtemp(join(tmpdir(), "html-home-server-action-audit-")), "actions.jsonl");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "<h1>Artifact</h1>");
  if (script !== undefined) await writeFile(join(root, "action.ts"), script);
  await writeFile(
    join(root, ".html-home.json"),
    JSON.stringify({
      version: 2,
      project: { slug: "garden", title: "Garden" },
      artifacts: [{
        slug: "charts",
        title: "Charts",
        path: "dist",
        actions: [{
          slug: "echo",
          title: "Echo",
          command,
          timeout_ms: timeoutMs
        }]
      }]
    })
  );
  let state = addOrUpdateRegistration(emptyState(), root);
  const result = await scanRegisteredRoots(state.registrations);
  state = { ...state, index: result.index, diagnostics: result.diagnostics };
  await saveStateAtomic(statePath, state);
  return { root, statePath, auditPath };
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

    const response = await request("/home/garden/charts/", statePath);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("<script src=\"/app.js\"></script>");
  });

  test("returns JSON route failures without local filesystem paths", async () => {
    const { statePath } = await fixture();

    const response = await request("/home/garden/charts/missing.js", statePath);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("asset_not_found");
    expect(JSON.stringify(json)).not.toContain("/tmp/");
  });

  test("rejects encoded traversal that reaches asset routing", async () => {
    const { statePath } = await fixture();

    const response = await request("/home/garden/charts/..%2fsecret.txt", statePath);
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

  test("serves built-in UI assets from a namespaced route", async () => {
    const { statePath } = await fixture();

    const response = await request("/_html-home/assets/bench.jpg", statePath);
    const stylesheet = await request("/_html-home/assets/start-page.css", statePath);
    const stylesheetText = await stylesheet.text();
    const script = await request("/_html-home/assets/start-page.js", statePath);
    const scriptText = await script.text();
    const blocked = await request("/_html-home/assets/..%2fpackage.json", statePath);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(stylesheetText).toContain("html[data-skin=\"ozalid\"]");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(scriptText).toContain("mountPreviews");
    expect(blocked.status).toBe(404);
  });

  test("renders configured public base URLs into copy controls", async () => {
    const { statePath } = await fixture();

    const response = await handleRequest(new Request("http://127.0.0.1/"), {
      statePath,
      publicBaseUrl: "http://home.html:8765/",
      catalogLabel: "Demo catalog"
    });
    const text = await response.text();

    expect(text).toContain("http://home.html:8765/");
    expect(text).toContain("http://home.html:8765/home/garden/charts/");
    expect(text).toContain("Demo catalog. Local artifact catalog.");
  });

  test("rejects action posts unless actions are enabled", async () => {
    const { statePath } = await actionFixture("console.log(JSON.stringify({ok:true}))");

    const response = await request("/api/actions/garden/charts/echo", statePath, { method: "POST" });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("actions_disabled");
  });

  test("runs enabled action commands with JSON stdin and audit logging", async () => {
    const { statePath, auditPath } = await actionFixture(`
const input = await new Response(Bun.stdin.stream()).json();
console.log(JSON.stringify({
  status: 201,
  body: {
    ok: true,
    name: input.name,
    action: process.env.HTML_HOME_ACTION
  }
}));
`);

    const response = await handleRequest(new Request("http://127.0.0.1/api/actions/garden/charts/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-html-home-action": "1"
      },
      body: JSON.stringify({ name: "Ada" })
    }), { statePath, auditPath, actionsEnabled: true });
    const json = await response.json();
    const audit = await readFile(auditPath, "utf8");

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, name: "Ada", action: "echo" });
    expect(audit).toContain("\"project\":\"garden\"");
    expect(audit).toContain("\"body_bytes\"");
    expect(audit).not.toContain("Ada");
  });

  test("times out long-running action commands", async () => {
    const { statePath, auditPath } = await actionFixture(`
await new Promise((resolve) => setTimeout(resolve, 1000));
console.log(JSON.stringify({ ok: true }));
`, 1);

    const response = await handleRequest(new Request("http://127.0.0.1/api/actions/garden/charts/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-html-home-action": "1"
      },
      body: "{}"
    }), { statePath, auditPath, actionsEnabled: true });
    const json = await response.json();

    expect(response.status).toBe(504);
    expect(json.error).toBe("action_timeout");
  });

  test("audits action command launch failures", async () => {
    const { statePath, auditPath } = await actionFixture(undefined, 10000, ["html-home-missing-command-for-test"]);

    const response = await handleRequest(new Request("http://127.0.0.1/api/actions/garden/charts/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-html-home-action": "1"
      },
      body: "{}"
    }), { statePath, auditPath, actionsEnabled: true });
    const json = await response.json();
    const audit = await readFile(auditPath, "utf8");

    expect(response.status).toBe(502);
    expect(json.error).toBe("action_launch_failed");
    expect(audit).toContain("\"status\":502");
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
    expect(homeText).toContain("data-preview-key=\"garden/charts\"");
    expect(homeText).toContain("id=\"html-home-preview-data\"");
    expect(homeText).toContain("/_html-home/assets/start-page.css");
    expect(homeText).toContain("/_html-home/assets/start-page.js");
    expect(homeText).toContain("Garden &lt;Project&gt;");
    expect(homeText).not.toContain("window.ARTIFACTS");
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
