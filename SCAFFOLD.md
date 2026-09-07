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
| `src/mcp/` | Tool server that lets an agent drive the contract |
| `src/monitor/` | The data owner's console: grant state, audit trail, revoke |
| `opencode.jsonc` | Registers the tool server with OpenCode |

The contract imports only `tenant-context`, `logging` and `kv-store`, so it
links against the base tenant world. There is no outbound HTTP, which means no
third-party API key and no egress grant to configure.

## Setup

Claim keys for **three** identities, one each for the tenant, the agent and
the user. The tenant key is self-serve from the test-token page. Be aware that
a key-only agent identity may have no self-serve path to its own credit
balance, and balances are generally not transferable between identities, so
budget for asking for a manual grant. Then:

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
npm run revoke            # remove the grant; invoke fails until you re-grant
npm run monitor           # the owner's console, run beside opencode
npm run test              # display-helper tests, no credentials needed
```

`npm run contract:wit` prints the component's interface if you want to confirm
what it imports and exports.

## Driving it with an agent

The scripts above prove the guardrails work, but they call the contract in a
fixed order, so they demonstrate enforcement rather than an agent subject to
it. The tool server closes that gap: it exposes the contract's functions over
the Model Context Protocol, so an existing agent drives them.

```bash
npm run mcp:probe    # verify the tool surface; needs no credentials
opencode             # the tools appear automatically, see opencode.jsonc
```

No model key is required. OpenCode ships several models at no cost, listed by
`opencode models`, and `opencode mcp list` should show the server connected.
Any client that speaks the protocol works, so this is not tied to OpenCode.

| Tool | Purpose |
| --- | --- |
| `vault_status` | Which identity the agent acts as, and under whose grant |
| `vault_read` | Retrieve a record, subject to the grant |
| `audit_list` | Read the enclave's record of access attempts |
| `vault_put` | Offered but withheld by the grant, so the node refuses |

`vault_put` is exposed on purpose. A model that decides to write is refused by
the node, not by the tool layer. Tool availability is not authorization: the
tool list is a menu, and the enclave decides what is actually served. Hiding
the withheld tool would make the tool server look like the security boundary.

The server holds the agent's key and nothing else. It never holds the tenant's
key or the data owner's key. A refusal comes back as a readable tool result
rather than an exception, because one thrown error can take down an agent loop
on a tool's first failure.

## The owner's console

Run this beside OpenCode. The agent's own account of what it did sits on one
side, the enclave's record of what actually happened on the other.

```bash
npm run monitor
```

```
+- opencode -----------------+ +- consent monitor ---------+
| > check the patient record | | GRANT    active           |
| * vault_read(medical-1)    | | agent    did:t3n:1a2b...  |
|   -> hypertension stage 1  | | subject  did:t3n:9f0c...  |
| * vault_put(smuggled-1)    | | allowed  vault-read       |
|   x refused by the node    | |          audit-list       |
|                            | | expires  11m42s [####--]  |
| I could read but not write.| |                           |
| Read is all the grant      | | ENCLAVE AUDIT TRAIL       |
| covers.                    | | 7  served  vault-read     |
|                            | | 8  denied  no such record |
|                            | | [r] revoke   [q] quit     |
+----------------------------+ +---------------------------+
   what the agent CLAIMS          what the ENCLAVE RECORDED
```

Press `r` to withdraw the agent's grant and watch its next call fail, with no
redeploy and no code change. Restore it with `npm run grant`.

The console authenticates as the **data owner**, not the agent, and reads the
trail through the owner's own self-grant. That is why `npm run grant` issues a
second grant to the user for `audit-list`. Reading the trail through the
agent's grant would mean revoking the agent blinded the very console you revoke
from, so the owner's console must not depend on the authority it can withdraw.

The console is read-mostly. Its one write is the revoke, which is the owner's
decision to make.

## Contract functions

| Function | Purpose |
| --- | --- |
| `vault-put` | Write a record. Deliberately withheld from the agent's grant. |
| `vault-read` | Read a record. Refuses without a bound calling user, and audits the attempt whether served or denied. |
| `audit-list` | Enumerate audit entries in sequence order, with a count of any that could not be decoded. |

## Things that will bite you

Most of these come from Terminal 3's own
[gotchas doc](https://github.com/Terminal-3/adk-circle-call-centre-agent-demo/blob/main/docs/GOTCHAS.md),
written from bugs hit against live infrastructure. Read it before extending
this project.

- **A delegated call must name whose grant to check.** Omit the subject and
  the call is treated as a self-call by the caller's own identity, so the node
  checks the agent's own grants, which are empty. It surfaces as a permission
  or egress denial that reads like a misconfigured allowlist. Grant read-backs
  look correct the whole time, because a diagnostic read is authenticated as
  the granting identity and checks the right place. The scripts pass it
  explicitly and `npm run grant` prints the value.
- **A call that returns an error has its writes rolled back.** An audit append
  included. So an expected denial must be a successful return carrying a
  denial status, not an error, or it erases its own audit entry and the trail
  records successes only. A local test harness has no rollback concept and
  will not catch this.
- **Re-registering a tail allocates a new contract id.** No API returns a
  tail's current id, so map rules scoped to the previous id keep pointing at
  it silently. The deploy step re-points them on every run; record the ids it
  prints anyway.
- **Metering charges on attempt, not on success.** A debugging session chasing
  a failure burns credit on every failed call.
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
