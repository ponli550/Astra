/**
 * Preflight. Confirms the identities authenticate and the tenant is
 * admitted, before anything spends credits on a register.
 *
 *   npm run whoami
 *
 * One funded identity is enough. The claim page issues one key and one
 * DID per work email, and a delegated call is billed to the
 * authenticated caller, so an unfunded second identity fails every call
 * on credit before consent is ever consulted. With one identity the
 * demo runs as a self-grant, which the platform documents for direct
 * calls.
 */
import { getNodeUrl } from "@terminal3/t3n-sdk";
import { MODE, T3N_ENV, describeMode } from "./config.js";
import { asTenantMe } from "./narrow.js";
import { openCallerSession, openOwnerSession, openTenantClient } from "./session.js";

async function main() {
  console.log(`environment: ${T3N_ENV}`);
  console.log(`node:        ${getNodeUrl()}`);
  console.log(`mode:        ${describeMode()}`);

  const { session: tenantSession, tenant } = await openTenantClient();
  const me = asTenantMe(await tenant.tenant.me());
  console.log(`\ntenant  ${tenantSession.did}`);
  console.log(`        address ${tenantSession.address}`);
  console.log(`        status  ${me.status}  label ${me.label || "(none)"}`);
  if (me.status !== "active") {
    console.warn(`        WARNING: tenant status is "${me.status}", not "active".`);
  }

  const owner = await openOwnerSession();
  console.log(`\nowner   ${owner.did}`);
  console.log(
    owner.did === tenantSession.did
      ? `        the tenant identity, acting as the data owner`
      : `        address ${owner.address}`,
  );

  const caller = await openCallerSession();
  console.log(`\ncaller  ${caller.did}`);
  console.log(
    caller.did === owner.did
      ? `        the owner identity, calling its own contract`
      : `        address ${caller.address}`,
  );

  if (MODE === "delegated" && caller.did === owner.did) {
    throw new Error(
      "AGENT_KEY is set but resolves to the same identity as the data owner.\n" +
        "A delegated run needs a distinct agent key. Clear AGENT_KEY to run as a " +
        "self-grant instead.",
    );
  }

  console.log(`\nready to deploy.`);

  if (MODE === "self") {
    console.log(
      `\nOne identity, so the grant is a self-grant. That still shows the\n` +
        `contract refusing a call it cannot attribute, every attempt recorded\n` +
        `with provenance set inside the enclave, and the grant being\n` +
        `load-bearing: withdraw it and calls that worked stop working.\n` +
        `\nWhat it does not show is a second party receiving access it did not\n` +
        `have. That needs a funded agent identity, which is a second work\n` +
        `email on the claim page or a request to devrel@terminal3.io. Do not\n` +
        `generate a keypair locally for this: it authenticates, but starts at\n` +
        `zero credits, and a delegated call bills the caller, so every step\n` +
        `would fail on credit rather than on consent.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\nwhoami failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
