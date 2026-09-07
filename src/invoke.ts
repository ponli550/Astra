/**
 * The action. Reads a gated record, and the attempt produces an audit
 * entry it cannot suppress.
 *
 *   npm run invoke
 *
 * # What enforces this
 *
 * Not the delegation grant. The platform's enforcement point for a
 * tenant contract is egress, and this contract makes no outbound call,
 * so there is nothing there to deny. Verified: with the grant revoked,
 * reads still succeeded.
 *
 * The contract evaluates a consent policy itself, inside the enclave,
 * against values the node mints: the calling identity from tenant
 * context and the cluster-pinned clock. A caller cannot claim to be
 * someone else and cannot move an expiry. Change consent with
 * `npm run policy:allow` and `npm run policy:deny`.
 *
 * Three calls, and only the first should return a payload:
 *
 *   1. Read the seeded record. Served, and audited.
 *   2. Read a record that does not exist. Denied, and still audited.
 *   3. Write, which consent does not cover. Refused inside the enclave.
 */
import { DECLARED_TENANT_DID, DEMO_RECORD } from "./config.js";
import { openCaller } from "./caller.js";
import { resolveGrantSubject } from "./session.js";

interface VaultReadResponse {
  record_id: string;
  status: "served" | "denied";
  payload?: string;
  reason?: string;
  audit_key: string;
}

interface VaultPutResponse {
  record_id: string;
  status: "served" | "denied";
  reason?: string;
  audit_key: string;
}

async function main() {
  if (!DECLARED_TENANT_DID) {
    throw new Error("DID is not set in .env. It names the tenant that owns the contract.");
  }

  const caller = await openCaller();

  // Whose grant this call is checked against. Omitting it makes the node
  // check the caller's own grants, and the resulting denial reads like a
  // misconfigured allowlist.
  const subject = await resolveGrantSubject();

  console.log(`caller   ${caller.did}   (${caller.role}, ${caller.kind})`);
  console.log(`subject  ${subject}   (whose grant authorises this)`);
  console.log(`contract ${caller.contract}@${caller.version}\n`);

  const call = <T,>(functionName: string, input: unknown) =>
    caller.call<T>(functionName, input, subject);

  // --- a record that exists ----------------------------------------
  const served = await call<VaultReadResponse>("vault-read", {
    record_id: DEMO_RECORD,
    purpose: "demo: retrieving a record under a live grant",
  });
  console.log(`vault-read ${DEMO_RECORD}: ${served.status}`);
  console.log(`  payload   ${served.payload ?? "(none)"}`);
  console.log(`  audit_key ${served.audit_key}`);
  // What this run is expected to show. The demo runs the same script
  // twice, once with consent withdrawn and once with it granted, so the
  // expectation is a parameter rather than a constant.
  const expect = (process.env["EXPECT"] ?? "served").toLowerCase();
  if (served.status !== expect) {
    console.warn(`  expected this read to be ${expect}, got ${served.status}: ${served.reason ?? ""}`);
    process.exitCode = 1;
  } else if (expect === "denied") {
    console.log(`  refused inside the enclave, as expected with consent withdrawn`);
  }

  // --- a record that does not exist --------------------------------
  const denied = await call<VaultReadResponse>("vault-read", {
    record_id: "does-not-exist",
    purpose: "demo: showing a denial is recorded too",
  });
  console.log(`\nvault-read does-not-exist: ${denied.status}`);
  console.log(`  reason    ${denied.reason ?? "(none)"}`);
  console.log(`  audit_key ${denied.audit_key}`);
  if (denied.status !== "denied") {
    console.warn(`  expected a denial, got ${denied.status}`);
    process.exitCode = 1;
  }
  console.log(
    `\nThat denial kept its audit entry. The host rolls back everything a call\n` +
      `wrote if the call returns an error, so a denial raised as an error would\n` +
      `have erased its own record and left a trail of successes only.`,
  );

  // --- the function consent does not cover -------------------------
  //
  // Asserted, not merely reported. The contract now evaluates the policy
  // itself, so this is a real gate rather than a statement of intent.
  console.log(`\nvault-put, which consent does not cover:`);
  try {
    const smuggled = await call<VaultPutResponse>("vault-put", {
      record_id: "probe-unauthorised",
      payload: "written by a call consent does not cover",
    });
    console.log(`  status    ${smuggled.status}`);
    console.log(`  reason    ${smuggled.reason ?? "(none)"}`);
    console.log(`  audit_key ${smuggled.audit_key}`);
    if (smuggled.status !== "denied") {
      console.error(`  UNEXPECTED: the write was permitted.`);
      process.exitCode = 1;
    } else {
      console.log(
        `\n  Refused by the CONTRACT, inside the enclave, and recorded. On a self-call\n` +
          `  this is the only layer that decides.`,
      );
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/agent_auth_not_found|not permitted to act on behalf/i.test(detail)) {
      console.log(`  refused by the PLATFORM before the contract ran:`);
      console.log(`  ${detail.split("[")[0]?.trim()}`);
      console.log(
        `\n  On a delegated call the node checks the owner's grant per function\n` +
          `  first. This never reached the contract, so it is not in the trail:\n` +
          `  two layers, and either one can refuse.`,
      );
    } else {
      throw error;
    }
  }

  console.log(`\nnext: npm run audit`);
}

main().catch((error: unknown) => {
  console.error(`\ninvoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
