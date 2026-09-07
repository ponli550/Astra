/**
 * Mint a funded second identity: an organisation you administer, and an
 * agent that organisation owns.
 *
 *   npm run agent:mint
 *
 * This is what makes delegated mode real. A locally generated keypair
 * authenticates but starts at zero credits, and a delegated call bills
 * the caller, so it fails on credit before consent is consulted. An
 * org-owned agent is minted by the network and its credential is an
 * opaque bearer token presented on a stateless invoke.
 *
 * The token is shown exactly once and cannot be recovered, so this
 * writes it to .env the moment it is returned, before printing anything.
 *
 * Idempotency: an organisation is minted on every call to org create,
 * so this refuses to run if ORG_DID is already set. Clear it to mint
 * another, knowingly.
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { T3N_ENV, keys } from "./config.js";

const AGENT_NAME = process.env["AGENT_NAME"] ?? "Vault Reader";
const ORG_NAME = process.env["ORG_NAME"] ?? "Consent Vault";

function cli(args: string[]): unknown {
  const out = execFileSync("npx", ["t3n", ...args, "--env", T3N_ENV, "--json"], {
    env: { ...process.env, T3N_API_KEY: keys.tenant },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

async function setEnv(pairs: Record<string, string>): Promise<void> {
  let env = await readFile(".env", "utf8");
  for (const [k, v] of Object.entries(pairs)) {
    const line = `${k}=${v}`;
    env = new RegExp(`^${k}=.*$`, "m").test(env)
      ? env.replace(new RegExp(`^${k}=.*$`, "m"), line)
      : `${env.trimEnd()}\n${line}\n`;
  }
  await writeFile(".env", env, "utf8");
}

function str(o: unknown, ...keysToTry: string[]): string {
  if (typeof o !== "object" || o === null) throw new Error("unexpected CLI output shape");
  const r = o as Record<string, unknown>;
  for (const k of keysToTry) if (typeof r[k] === "string") return r[k] as string;
  throw new Error(`CLI output lacks ${keysToTry.join("/")}: ${JSON.stringify(Object.keys(r))}`);
}

async function main() {
  if (process.env["ORG_DID"]) {
    throw new Error(
      `ORG_DID is already set. Minting is not idempotent: every org create mints a new ` +
        `organisation. Clear ORG_DID and AGENT_API_KEY to mint again, knowingly.`,
    );
  }

  console.log(`minting organisation "${ORG_NAME}"...`);
  const org = cli(["org", "create", "--name", ORG_NAME]);
  const orgDid = str(org, "organisationDid", "orgDid", "did");
  await setEnv({ ORG_DID: orgDid });
  console.log(`  org  ${orgDid}   (saved to .env)`);

  console.log(`minting agent "${AGENT_NAME}" owned by that organisation...`);
  // No --card: the network hosts a default card that names the agent's
  // own DID. A hand-written card here would have to know that DID first.
  const agent = cli(["agent", "create", "--org", orgDid, "--name", AGENT_NAME]);
  const agentDid = str(agent, "did", "agentDid");
  const apiKey = str(agent, "apiKey");
  const keyId = str(agent, "keyId");

  // Persist BEFORE printing. The key is shown once by the network and
  // never again; if this process died after printing but before saving,
  // the identity would be unusable.
  await setEnv({ AGENT_DID: agentDid, AGENT_API_KEY: apiKey, AGENT_KEY_ID: keyId });

  console.log(`  agent ${agentDid}   (saved to .env)`);
  console.log(`  key id ${keyId}   (safe to log; the secret half was saved, not printed)`);
  console.log(
    `\nDelegated mode is now available. The agent starts with no access;\n` +
      `grant it with: npm run policy:allow\n` +
      `then prove funding with: npm run agent:probe`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nmint failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
