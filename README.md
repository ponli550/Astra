# Consent Vault

**An AI agent reads your data only while you allow it, and the hardware writes
the receipt.** A Rust contract running inside confidential-computing hardware on
the [T3 Network](https://docs.terminal3.io) evaluates a consent policy before
every access, refuses what the policy does not cover, and records each attempt
with provenance the caller cannot forge.

Built for the T3 Agent Developer Kit hackathon. Track: **private data access
with auditable consent**.

## Ninety seconds of it working 🎬

![Live demo](docs/media/demo.gif)

*Real run against testnet, generated from a script rather than captured, so
it re-renders when the code changes. Consent withdrawn, so the read is refused.
Consent granted, so the read is served. The write is refused anyway, because
consent covers reading only. Then the enclave's own record of all of it.*

```bash
npm run demo          # the same sequence live, about seventy seconds
vhs docs/demo.tape    # re-render the recording to docs/media/
```

There is a spoken walkthrough script in [docs/narration.md](docs/narration.md).

## The claim, stated narrowly

A call cannot reach the data without passing a check inside the enclave, and
cannot pass it without leaving a record the enclave wrote.

That is deliberately narrower than "your data is safe". Whoever can write the
tenant's maps can rewrite the policy, so this is not protection from the
operator. What it removes is the need to trust the agent's own account of what
it did.

## How it works

```
opencode                 decides what to do          holds a model, no network identity
  spawns
src/mcp/server.ts        acts on that decision       holds the caller's key
  calls
z:<tenant>:consent-vault evaluates consent, audits   runs inside the enclave
  reads
z:<tenant>:vault         the records
z:<tenant>:policy        who may call what, until when
z:<tenant>:audit         what was attempted, and how it went
```

Every value the access decision rests on is minted by the node, not supplied by
the caller:

- **The calling identity** comes from the host's tenant context, never from the
  request body, so a caller cannot claim to be someone else.
- **The clock** is the cluster-pinned timestamp, so a caller cannot move an
  expiry.
- **Policy administration** is restricted to the tenant identity by comparing
  two node-minted values.

Three further design points that took a wrong turn to find:

**Denials return successfully.** The host rolls back everything a failed call
wrote, an audit append included, so a refusal raised as an error would erase its
own record and leave a trail of successes only.

**The audit write shares the read's transaction.** A read that is not recorded
cannot commit.

**The delegation grant is not the gate.** The platform's enforcement point for a
tenant contract is outbound network access, and this contract makes none.
Verified: with the grant fully revoked, reads still succeeded. So the contract
enforces consent itself, which is the pattern Terminal 3's own reference
implementation names for itself.

## Run it

```bash
cp .env.example .env      # T3N_API_KEY and DID from the claim page
npm install
npm run whoami            # confirms the identity before spending credits
npm run contract:build
npm run deploy
npm run demo              # the whole sequence, about seventy seconds
```

Then, for the live view:

```bash
npm run monitor           # the owner's console, [r] withdraws consent
opencode                  # agent tools appear automatically
```

Full setup notes, the failure modes worth knowing, and what is *not* enforced
are in [SCAFFOLD.md](SCAFFOLD.md).

## Built with

| Layer | Choice |
| --- | --- |
| Enclave logic | Rust 1.98 to WebAssembly System Interface Preview 2, via `wit-bindgen` |
| Network | Terminal 3 SDK 5.2, pinned |
| Agent tools | Model Context Protocol, driven by OpenCode |
| Console | Ink and React, rendering to the terminal |
| Tests | `cargo test` for the contract, Node's test runner for the console |

No server, no database, no model API key. State lives in the tenant's maps
inside the network.

Vendor documentation for the developer kit is kept verbatim at
[docs/t3n-adk-reference.md](docs/t3n-adk-reference.md).
