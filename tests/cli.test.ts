import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../src/cli";

async function fixtureRoot(project = "garden", artifact = "charts") {
  const root = await mkdtemp(join(tmpdir(), "html-home-cli-root-"));
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "<h1>ok</h1>");
  await writeFile(
    join(root, ".html-home.json"),
    JSON.stringify({
      version: 1,
      project: { slug: project, title: project },
      artifacts: [{ slug: artifact, title: artifact, path: "dist" }]
    })
  );
  return root;
}

async function statePath() {
  return join(await mkdtemp(join(tmpdir(), "html-home-cli-state-")), "state.json");
}

async function run(args: string[], state: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, {
    env: { HTML_HOME_STATE: state },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("cli", () => {
  test("register writes state and list prints indexed artifact", async () => {
    const root = await fixtureRoot();
    const state = await statePath();

    const registered = await run(["register", root], state);
    const listed = await run(["list"], state);
    const stored = JSON.parse(await readFile(state, "utf8"));
    const canonicalRoot = await realpath(root);

    expect(registered.exitCode).toBe(0);
    expect(registered.stdout).toContain("registered");
    expect(stored.registrations[0].manifestRoot).toBe(canonicalRoot);
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toContain("garden/charts");
  });

  test("rescan updates state after manifest changes", async () => {
    const root = await fixtureRoot();
    const state = await statePath();
    await run(["register", root], state);
    await writeFile(
      join(root, ".html-home.json"),
      JSON.stringify({
        version: 1,
        project: { slug: "garden" },
        artifacts: [{ slug: "new-report", path: "dist" }]
      })
    );

    const rescanned = await run(["rescan"], state);
    const listed = await run(["list"], state);

    expect(rescanned.exitCode).toBe(0);
    expect(listed.stdout).toContain("garden/new-report");
  });

  test("doctor performs live validation without writing state", async () => {
    const root = await fixtureRoot();
    const state = await statePath();
    await run(["register", root], state);
    const before = (await stat(state)).mtimeMs;
    await writeFile(
      join(root, ".html-home.json"),
      JSON.stringify({
        version: 1,
        project: { slug: "Bad" },
        artifacts: [{ slug: "charts", path: "dist" }]
      })
    );

    const doctored = await run(["doctor"], state);
    const after = (await stat(state)).mtimeMs;

    expect(doctored.exitCode).toBe(1);
    expect(doctored.stdout).toContain("invalid_slug");
    expect(after).toBe(before);
  });

  test("unregister removes a manifest root", async () => {
    const root = await fixtureRoot();
    const state = await statePath();
    await run(["register", root], state);

    const unregistered = await run(["unregister", root], state);
    const listed = await run(["list"], state);

    expect(unregistered.exitCode).toBe(0);
    expect(listed.exitCode).toBe(1);
    expect(listed.stdout).toContain("No registered manifest roots");
  });
});
