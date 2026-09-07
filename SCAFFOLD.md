# Auditable-consent data vault

A T3N Agent Developer Kit demo for the **private data access with auditable
consent** track. An agent reads a sensitive record only while its user's
time-boxed grant is live, and the read cannot commit without writing an
audit entry.

## What it demonstrates

- **Three separate identities.** Tenant, agent and user are distinct sessions
  with distinct keys and distinct credit balances.
- **Authentication is not authorisation.** The agent authenticates on its own
  key and still has no access. Only the data owner can grant it, and the grant
  names one contract, two functions and an expiry.
- **The audit record is inseparable from the access.** The contract resolves
  the caller, reads the record and appends the audit entry in one transaction.
  A read that is not recorded cannot commit.
- **Provenance cannot be forged.** Sequence number, cluster timestamp,
  contract id and calling identity all come from node-minted context inside
  the enclave, never from the caller's input.

## Layout

| Path | What it is |
| --- | --- |
| `contract/` | Rust crate compiled to a WebAssembly component |
| `contract/wit/world.wit` | Exported functions plus the host capabilities imported |
| `contract/wit/deps/` | Vendored host interface definitions |
| `src/` | TypeScript orchestration, one script per step |

The contract imports only `tenant-context`, `logging` and `kv-store`, so it
links against the base tenant world. There is no outbound HTTP, which means no
third-party API key and no egress grant to configure.

## Setup

Claim **three** keys from the T3N test-token page, one per identity, then:

```bash
cp .env.example .env      # fill in T3N_API_KEY, DID, AGENT_KEY, USER_KEY
npm install
npm run whoami            # confirms all three authenticate before spending credits
```

## Run

```bash
npm run contract:build    # cargo -> wasm32-wasip2 component
npm run contract:test     # 12 unit tests, native target
npm run deploy            # register contract, create maps, seed a record
npm run grant             # USER authorises the agent, time-boxed
npm run invoke            # agent reads the record; withheld function is refused
npm run audit             # read back the audit trail
```

`npm run contract:wit` prints the component's interface if you want to confirm
what it imports and exports.

## Contract functions

| Function | Purpose |
| --- | --- |
| `vault-put` | Write a record. Deliberately withheld from the agent's grant. |
| `vault-read` | Read a record. Refuses without a bound calling user, and audits. |
| `audit-list` | Enumerate audit entries in sequence order. |

## Things that will bite you

- **Re-registering a tail allocates a new contract id.** No API returns a
  tail's current id, so map rules scoped to the previous id keep pointing at
  it silently. Record every id the deploy step prints.
- **A map created without explicit `readers` is unreadable.** The access
  governor defaults to deny and creation still succeeds, so the failure
  surfaces much later as an access error.
- **Grant writes replace, not merge, at the document level.** The scripts use
  the read-merge-write path, which preserves this user's other grants. The
  lower-level document write revokes everything it does not restate.
- **A contract-only map is not tamper-proof against its tenant.** An owner's
  control-plane write bypasses the map's writers rule. That is how the deploy
  step seeds the vault.
- **`tenant_did()` returns raw bytes.** It must be hex-encoded before building
  a `z:<tid>:<tail>` map name.

## Where the README's docs are out of date

The bundled `README.md` is a documentation dump. Against SDK 5.2 it is wrong
in three ways worth knowing:

1. The grant shape it teaches is deprecated. `AgentAuthScriptGrant` and
   `agentAuthUpdate` are superseded by `BoundGrant` and
   `updateMemberDelegation`, which this scaffold uses.
2. It routes the grant through `tee:user/contracts`. The SDK dispatches it to
   `tee:authorisations/contracts`.
3. It omits grant validity windows entirely. `BoundGrant` carries a
   `window`, which is what makes a grant short-lived.
