/**
 * The chain. Agent A hands agent B a subset of what A holds.
 *
 *   npm run delegate                 # A -> B: vault-read only, shorter expiry
 *   npm run delegate -- widen        # A tries to hand on vault-put too; refused
 *
 * The delegator is whoever the caller configuration resolves to, which
 * by default is the first minted agent. The delegatee is AGENT2_DID.
 *
 * What to watch for: the narrowing is enforced inside the enclave at
 * the moment of delegation, and again at every call B makes. And if the
 * owner withdraws consent from A, B's permission empties with it, with
 * nothing deleted, because B holds the intersection of what it was
 * given and what A still holds.
 */
import { GRANT_TTL_SECS } from "./config.js";
import { openCaller } from "./caller.js";
import { resolveGrantSubject } from "./session.js";

interface DelegateResponse {
  status: "served" | "denied";
  reason?: string;
  version: number;
  from: string;
  to: string;
  functions: string[];
  valid_until_secs: number | null;
  depth: number;
  audit_key: string;
}

function didBody(did: string): string {
  return did.startsWith("did:t3n:") ? did.slice("did:t3n:".length) : did;
}

async function main() {
  const widen = process.argv.includes("widen");
  const to = process.env["AGENT2_DID"];
  if (!to) throw new Error("AGENT2_DID is not set. Mint it with: npm run agent:mint -- second");

  const caller = await openCaller();
  const subject = await resolveGrantSubject();

  // Shorter than the delegator's own window on purpose, so the handoff
  // is visibly narrower in time as well as in scope.
  const until = Math.floor(Date.now() / 1000) + Math.floor(GRANT_TTL_SECS / 2);
  const functions = widen ? ["vault-read", "vault-put"] : ["vault-read"];

  console.log(`delegator ${caller.did}   (${caller.role})`);
  console.log(`delegatee ${to}`);
  console.log(`hands on  ${functions.join(", ")}${widen ? "   <- vault-put is NOT held by the delegator" : ""}`);
  console.log(`until     ${new Date(until * 1000).toISOString()}\n`);

  const result = await caller.call<DelegateResponse>(
    "policy-delegate",
    { to: didBody(to), functions, valid_until_secs: until },
    subject,
  );

  console.log(`policy-delegate: ${result.status}`);
  if (result.status === "denied") {
    console.log(`  reason    ${result.reason}`);
    console.log(`  audit_key ${result.audit_key}`);
    console.log(
      widen
        ? `\nRefused inside the enclave, and recorded. A delegator cannot hand on\nwhat it does not hold, and the attempt to do so is in the trail.`
        : `\nRefused. Check that the delegator currently holds consent (npm run policy).`,
    );
    if (!widen) process.exitCode = 1;
    return;
  }

  console.log(`  version   ${result.version}`);
  console.log(`  depth     ${result.depth}   (0 is a root caller)`);
  console.log(`  audit_key ${result.audit_key}`);
  console.log(
    `\nB now holds the intersection of this handoff and whatever A holds at\n` +
      `the moment B calls. Withdraw consent from A and B's permission empties\n` +
      `with it, nothing deleted.\n\n` +
      `Try B:   CALLER=second npm run invoke\n` +
      `Cascade: npm run policy:deny && CALLER=second npm run invoke`,
  );
}

main().catch((error: unknown) => {
  console.error(`\ndelegate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
