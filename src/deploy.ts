/**
 * Deploy. Registers the contract, creates the two maps it uses, and
 * seeds one demo record.
 *
 *   npm run contract:build && npm run deploy
 *
 * Order matters: a map's access rules name a numeric contract id, and
 * that id only exists once registration has returned it.
 */
import { readFile } from "node:fs/promises";
import {
  AUDIT_MAP_TAIL,
  CONTRACT_TAIL,
  CONTRACT_VERSION,
  DEMO_RECORD,
  VAULT_MAP_TAIL,
  WASM_PATH,
} from "./config.js";
import { asMapResponse } from "./narrow.js";
import { openTenantClient } from "./session.js";

async function main() {
  const { session, tenant } = await openTenantClient();
  console.log(`tenant ${session.did}`);

  let wasm: Buffer;
  try {
    wasm = await readFile(WASM_PATH);
  } catch {
    throw new Error(
      `no WASM component at ${absolutePath(WASM_PATH)}.\n` +
        `Build it first: npm run contract:build`,
    );
  }
  console.log(`wasm   ${WASM_PATH} (${(wasm.byteLength / 1024).toFixed(0)} KiB)`);

  const registered = await tenant.contracts.register({
    tail: CONTRACT_TAIL,
    version: CONTRACT_VERSION,
    wasm: new Uint8Array(wasm),
  });
  const contractId = registered.contract_id;

  console.log(`\nregistered ${registered.name}`);
  console.log(`  version     ${CONTRACT_VERSION}`);
  console.log(`  contract_id ${contractId}`);
  console.log(
    `\nRecord that contract_id. Re-registering this tail allocates a new id,\n` +
      `and there is no API to look the current one up, so map rules scoped to\n` +
      `an older id keep pointing at it with no error.`,
  );

  // `readers` must be set explicitly. The access governor defaults to
  // deny, so omitting it creates a map nobody can read: no error now,
  // an access failure much later.
  for (const tail of [VAULT_MAP_TAIL, AUDIT_MAP_TAIL]) {
    try {
      const created = await tenant.maps.create({
        tail,
        visibility: "private",
        writers: { only: [contractId] },
        readers: { only: [contractId] },
      });
      console.log(`created map ${asMapResponse(created).name}`);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(detail)) throw error;
      // Idempotent on redeploy. The real hazard is a surviving map whose
      // rules still name a contract id from an earlier registration.
      console.log(`map ${tenant.canonicalName(tail)} already exists`);
      console.log(
        `  on a re-registration its rules may still name an older contract id.\n` +
          `  Update them with tenant.maps.update to include ${contractId}.`,
      );
    }
  }

  // Seed the demo record. An owner's control-plane entry write bypasses
  // the map's writers rule, which is how you populate a map that is
  // otherwise contract-only. Worth stating plainly: that also means a
  // contract-only map is not tamper-proof against its own tenant.
  await tenant.maps.entrySet(
    VAULT_MAP_TAIL,
    DEMO_RECORD,
    JSON.stringify({
      diagnosis: "hypertension, stage 1",
      prescribed: "amlodipine 5mg",
      clinician: "Dr. A. Rahman",
    }),
  );
  console.log(`seeded vault record ${DEMO_RECORD}`);

  console.log(`\nnext: npm run grant`);
}

/** Show the path actually tried, so a bad relative path is obvious. */
function absolutePath(path: string): string {
  return path.startsWith("/") ? path : `${process.cwd()}/${path}`;
}

main().catch((error: unknown) => {
  console.error(`\ndeploy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
