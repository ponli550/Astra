/**
 * Deploy. Registers the contract, creates the two maps it uses, and
 * seeds one demo record.
 *
 *   npm run contract:build && npm run deploy
 *
 * Order matters: a map's access rules name a numeric contract id, and
 * that id only exists once registration has returned it.
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  AUDIT_MAP_TAIL,
  CONTRACT_TAIL,
  CONTRACT_VERSION,
  DEMO_RECORD,
  KNOWN_CONTRACT_ID,
  POLICY_MAP_TAIL,
  VAULT_MAP_TAIL,
  WASM_PATH,
} from "./config.js";
import { mapNameFrom } from "./narrow.js";
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

  let contractId: number;
  try {
    const registered = await tenant.contracts.register({
      tail: CONTRACT_TAIL,
      version: CONTRACT_VERSION,
      wasm: new Uint8Array(wasm),
    });
    contractId = registered.contract_id;
    console.log(`\nregistered ${registered.name}`);
    console.log(`  version     ${CONTRACT_VERSION}`);
    console.log(`  contract_id ${contractId}`);
    // Persist it immediately. Nothing can look this up afterwards, and a
    // truncated terminal is enough to lose it, which then costs a
    // re-registration to recover.
    await rememberContractId(contractId);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/not higher than current version/i.test(detail)) throw error;

    // This version is already registered. Re-registering would allocate
    // a new id and churn every map rule for nothing, so reuse the known
    // one instead. There is no API that returns a tail's current
    // contract id, which is exactly why it has to come from config.
    if (KNOWN_CONTRACT_ID === undefined) {
      throw new Error(
        `${CONTRACT_TAIL} is already registered at version ${CONTRACT_VERSION}.\n` +
          `Either bump CONTRACT_VERSION to register a new build, or set\n` +
          `CONTRACT_ID to the id the earlier deploy printed so this run can\n` +
          `finish provisioning the maps. There is no API that looks it up.`,
      );
    }
    contractId = KNOWN_CONTRACT_ID;
    console.log(`\n${CONTRACT_TAIL} already registered at ${CONTRACT_VERSION}`);
    console.log(`  reusing contract_id ${contractId} from CONTRACT_ID`);
  }
  console.log(
    `\nRecord that contract_id. Re-registering this tail allocates a new id,\n` +
      `and there is no API to look the current one up, so map rules scoped to\n` +
      `an older id keep pointing at it with no error.`,
  );

  // `readers` must be set explicitly. The access governor defaults to
  // deny, so omitting it creates a map nobody can read: no error now,
  // an access failure much later.
  for (const tail of [VAULT_MAP_TAIL, AUDIT_MAP_TAIL, POLICY_MAP_TAIL]) {
    try {
      const created = await tenant.maps.create({
        tail,
        visibility: "private",
        writers: { only: [contractId] },
        readers: { only: [contractId] },
      });
      console.log(`created map ${mapNameFrom(created, tail)}`);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(detail)) throw error;

      // The map survived from an earlier registration, so its rules still
      // name that registration's contract id. Re-point them at the id this
      // run just received. Doing this as a standard step, rather than
      // leaving it to be noticed later, is the whole fix: re-registration
      // alone does not carry access forward, and the symptom is a map the
      // contract owns but cannot touch.
      await tenant.maps.update(tail, {
        writers: { only: [contractId] },
        readers: { only: [contractId] },
      });
      console.log(`map ${tenant.canonicalName(tail)} existed, re-pointed to contract ${contractId}`);
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

  console.log(
    `\nThe policy map is empty, which denies everyone. That is deliberate:\n` +
      `a missing policy must not mean "allow", or forgetting this step would\n` +
      `silently disable the gate.`,
  );

  console.log(`\nnext: npm run policy:allow`);
  console.log(`contract_id ${contractId}`);
}

/**
 * Write CONTRACT_ID into .env, replacing any earlier value.
 *
 * The id is returned exactly once, at registration, and no API returns
 * it later. Losing it means the map rules cannot be re-pointed on the
 * next deploy without registering yet another version.
 */
async function rememberContractId(id: number): Promise<void> {
  let env = "";
  try {
    env = await readFile(".env", "utf8");
  } catch {
    return; // no .env to update; the value was printed above
  }
  const line = `CONTRACT_ID=${id}`;
  const next = /^CONTRACT_ID=.*$/m.test(env)
    ? env.replace(/^CONTRACT_ID=.*$/m, line)
    : `${env.trimEnd()}\n${line}\n`;
  await writeFile(".env", next, "utf8");
  console.log(`  saved to .env as ${line}`);
}

/** Show the path actually tried, so a bad relative path is obvious. */
function absolutePath(path: string): string {
  return path.startsWith("/") ? path : `${process.cwd()}/${path}`;
}

main().catch((error: unknown) => {
  console.error(`\ndeploy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
