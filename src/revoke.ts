/**
 * Revocation. Removes the user's grant to the agent, so the agent's
 * next call fails with no redeploy and no code change.
 *
 *   npm run revoke
 *
 * Run `npm run invoke` after this to watch it fail, then `npm run
 * grant` to restore access.
 *
 * Note on a technique that does NOT apply here. The published
 * reference revokes by clearing the grant's allowed hosts while
 * keeping its function list populated, because setting an empty
 * function list is rejected outright by the node. That works when the
 * thing being revoked is the contract's ability to reach the network.
 * This contract makes no outbound call, so clearing its allowed hosts
 * would change nothing. Removing the grant row is the real revocation
 * here.
 */
import { CONTRACT_TAIL, DECLARED_TENANT_DID } from "./config.js";
import { canonicalName, openAgentSession, openUserSession } from "./session.js";

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  const agent = await openAgentSession();
  const user = await openUserSession();
  const contractName = canonicalName(DECLARED_TENANT_DID, CONTRACT_TAIL);

  const before = await user.client.getMemberDelegation();
  const matching = before.grants.filter(
    (g) => g.grantee === agent.did && g.contract_id === contractName,
  );

  if (matching.length === 0) {
    console.log(`no grant from ${user.did} to ${agent.did} for ${contractName}`);
    console.log(`nothing to revoke. Run: npm run grant`);
    return;
  }

  // Naming the contract removes only this grant. Omitting it would
  // remove the agent's whole delegation edge, including grants for
  // other contracts and its discovery authority.
  await user.client.removeMemberDelegationGrants([
    { grantee: agent.did, contract_id: contractName },
  ]);

  const after = await user.client.getMemberDelegation();
  const remaining = after.grants.filter(
    (g) => g.grantee === agent.did && g.contract_id === contractName,
  );

  console.log(`revoked ${agent.did} -> ${contractName}`);
  console.log(`grant rows for this pair: ${matching.length} before, ${remaining.length} after`);
  console.log(`other grants preserved:   ${after.grants.length - remaining.length}`);

  if (remaining.length > 0) {
    console.error(`the grant is still present after removal, which should not happen`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nThe agent's next call fails now. No redeploy, no code change.`);
  console.log(`Verify with: npm run invoke`);
  console.log(`Restore with: npm run grant`);
}

main().catch((error: unknown) => {
  console.error(`\nrevoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
