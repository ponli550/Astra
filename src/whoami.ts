/**
 * Preflight. Confirms the identities authenticate and the tenant is
 * admitted, before anything spends credits on a register.
 *
 *   npm run whoami
 *
 * Two keys are enough. The claim page issues one per work email, and
 * the official reference runs its grant as the tenant with the grant
 * subject set to the tenant's identity, so the data owner and the tenant
 * can be one identity.
 *
 * The agent is the separation that matters. An identity granting itself
 * is a self-grant, which demonstrates nothing, so this refuses to
 * continue if the agent is not distinct.
 */
import { getNodeUrl } from "@terminal3/t3n-sdk";
import { T3N_ENV, hasSeparateOwner } from "./config.js";
import { asTenantMe } from "./narrow.js";
import { openAgentSession, openOwnerSession, openTenantClient } from "./session.js";

async function main() {
  console.log(`environment: ${T3N_ENV}`);
  console.log(`node:        ${getNodeUrl()}`);
  console.log(
    `identities:  ${hasSeparateOwner ? "three, with a separate data owner" : "two, tenant also acts as the data owner"}`,
  );

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
  if (owner.did === tenantSession.did) {
    console.log(`        the tenant identity, acting as the data owner`);
  } else {
    console.log(`        address ${owner.address}`);
  }

  const agent = await openAgentSession();
  console.log(`\nagent   ${agent.did}`);
  console.log(`        address ${agent.address}`);

  if (agent.did === owner.did) {
    throw new Error(
      "the agent and the data owner resolve to the same identity.\n" +
        "AGENT_KEY must be its own key. An identity granting itself is a " +
        "self-grant, which proves nothing about delegated consent, and an " +
        "agent's credit balance is separate and starts at zero.",
    );
  }
  if (agent.did === tenantSession.did) {
    throw new Error(
      "the agent and the tenant resolve to the same identity.\n" +
        "AGENT_KEY must be its own key, with its own credits.",
    );
  }

  console.log(`\nthe agent is distinct from the data owner. ready to deploy.`);
  if (!hasSeparateOwner) {
    console.log(
      `\nNote: with two keys the demo reads as a developer delegating to their\n` +
        `own agent, not a third party delegating to someone else's. The\n` +
        `enforcement and the audit trail are the same, so say it that way.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\nwhoami failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
