#!/usr/bin/env bun
import { buildDemoState, defaultDemoStatePath } from "./demo";
import { serve } from "./server";
import { saveStateAtomic } from "./state";
import { resolveServeUrl } from "./url";

async function main(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText());
    return;
  }
  const host = flagValue(args, "--host") ?? "127.0.0.1";
  const portText = flagValue(args, "--port") ?? "3028";
  const baseUrl = flagValue(args, "--base-url") ?? process.env.HTML_HOME_DEMO_BASE_URL ?? "";
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port: ${portText}`);
  }

  const statePath = defaultDemoStatePath(process.env);
  const state = await buildDemoState();
  await saveStateAtomic(statePath, state);

  const urlPlan = resolveServeUrl({ host, port, baseUrl });
  const server = serve(
    {
      statePath,
      publicBaseUrl: urlPlan.baseUrl,
      catalogLabel: "Demo catalog"
    },
    { host, port }
  );

  console.log("html-home developer demo serving");
  console.log("demo state refreshed");
  console.log(`start page: ${urlPlan.baseUrl}`);
  if (server.hostname !== host || server.port !== port) console.log(`bound: http://${server.hostname}:${server.port}/`);
  for (const note of urlPlan.notes) console.log(`note: ${note}`);
  console.log(`state: ${statePath}`);
  console.log("Press Ctrl-C to stop.");
  await new Promise(() => undefined);
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function helpText(): string {
  return `usage: bun run demo -- [--host H] [--port P] [--base-url URL]

Developer-only demo catalog. Not part of the installed html-home CLI.
Defaults to port 3028 and writes an isolated demo state file.`;
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
