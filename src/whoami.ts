/**
 * Preflight. Confirms all three identities authenticate and that the
 * tenant is admitted, before anything spends credits on a register.
 *
 *   npm run whoami
 */
import { getNodeUrl } from "@terminal3/t3n-sdk";
import { T3N_ENV } from "./config.js";
import { asTenantMe } from "./narrow.js";
import { openAgentSession, openTenantClient, openUserSession } from "./session.js";

async function main() {
  console.log(`environment: ${T3N_ENV}`);
  console.log(`node:        ${getNodeUrl()}`);

  const { session: tenantSession, tenant } = await openTenantClient();
  const me = asTenantMe(await tenant.tenant.me());
  console.log(`\ntenant  ${tenantSession.did}`);
  console.log(`        address ${tenantSession.address}`);
  console.log(`        status  ${me.status}  label ${me.label || "(none)"}`);
  if (me.status !== "active") {
    console.warn(`        WARNING: tenant status is "${me.status}", not "active".`);
  }

  const agent = await openAgentSession();
  console.log(`\nagent   ${agent.did}`);
  console.log(`        address ${agent.address}`);
  if (agent.did === tenantSession.did) {
    throw new Error(
      "agent and tenant resolve to the same DID. AGENT_KEY must be a separate " +
        "key with its own credits, or metered agent calls fail with InsufficientCreditError.",
    );
  }

  const user = await openUserSession();
  console.log(`\nuser    ${user.did}`);
  console.log(`        address ${user.address}`);
  if (user.did === agent.did) {
    throw new Error(
      "user and agent resolve to the same DID. The demo needs a real " +
        "user-to-agent grant, which is a different edge from a self-grant.",
    );
  }

  console.log("\nthree distinct identities authenticated.");
}

main().catch((error: unknown) => {
  console.error(`\nwhoami failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
