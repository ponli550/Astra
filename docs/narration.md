# Three-minute narration

Shot list and script for a spoken walkthrough. Timings are cumulative and
assume an unhurried read, roughly 140 words a minute.

The visual bed is `docs/media/demo.mp4`, rendered from `docs/demo.tape`. Where a
segment needs something the terminal recording does not show, the shot column
says so.

Read it as written or feed it to a narration pipeline. Nothing here needs a
person on camera.

---

## 0:00 – 0:22 · The problem

**Shot:** title card, or the console with consent showing "none ever set".

> An AI agent that acts for you needs your data. The usual answer is to hand it
> over and hope. You get a log written by the same software you are trying to
> check, which is not evidence, it is a claim.
>
> This is a data vault where the agent gets nothing by default, every access
> decision happens inside confidential-computing hardware, and the record of
> what happened is written by that hardware rather than by the agent.

---

## 0:22 – 0:45 · What is running

**Shot:** split view, `contract/src/` on one side and the interface definition
file on the other. Or a simple architecture card.

> Three pieces. A small Rust program compiled to WebAssembly, running inside a
> trusted execution environment on the Terminal 3 network. The tenant's private
> key-value maps, holding the records, the audit trail, and the consent policy.
> And an agent, which here is an ordinary coding agent driving the contract
> through tool calls.
>
> The contract imports three host capabilities and nothing else. It cannot reach
> the network at all.

---

## 0:45 – 1:12 · Consent withdrawn, and the refusal

**Shot:** recording segment one and two. Consent withdrawn, then the read
refused.

> Start with consent withdrawn, because starting from a permitted state proves
> nothing.
>
> Now the agent asks for the record. It is refused, and the reason is specific:
> this caller is not permitted by the consent policy. That decision was made
> inside the enclave. Nothing outside it was consulted and nothing outside it
> could have changed the answer.
>
> Notice the refusal was recorded. That matters more than it sounds, and I will
> come back to why.

---

## 1:12 – 1:38 · Consent granted, narrowly

**Shot:** recording segment three, the policy grant.

> Consent is granted now, and look at how narrow it is. One caller, named by its
> network identity. Two functions, read and audit. An expiry fifteen minutes out.
>
> The change itself is written to the audit trail, so widening permission leaves
> the same kind of mark as using it. You cannot quietly give yourself more access.

---

## 1:38 – 2:10 · Served, and still refused

**Shot:** recording segment four. The read succeeds, the write is refused.

> Same request as before, and now the record comes back.
>
> Then the agent tries to write. Consent covers reading, not writing, and the
> contract refuses it inside the enclave with the reason stated. The tool was
> available the whole time. Tool availability is not authorization, and this is
> the difference made visible.

---

## 2:10 – 2:40 · The record

**Shot:** recording segment five, the audit trail.

> Here is what the enclave recorded. Every attempt, served and refused, with the
> caller, the cluster-pinned timestamp, the sequence number, and the contract
> that ran.
>
> None of those come from the request. They are minted by the node, so a caller
> cannot claim to be someone else or move a clock. And the audit entry is written
> in the same transaction as the access, so a read that is not recorded cannot
> commit. That is why the earlier refusal appeared in the trail: denials are
> recorded as faithfully as successes.

---

## 2:40 – 3:00 · What this is and is not

**Shot:** the console, consent in force with the countdown running.

> Withdrawing consent takes effect on the next call, with no redeploy.
>
> One honest limit. Whoever can write the tenant's maps can rewrite the policy,
> so this is not protection from the operator. What it guarantees is narrower and
> still useful: a call cannot reach the data without passing the check inside the
> enclave, and cannot pass it without leaving a record that the enclave wrote.
>
> Evidence, rather than a promise.

---

## Word counts

| Segment | Words | Read at 140 wpm |
| --- | --- | --- |
| The problem | 79 | 0:34 |
| What is running | 84 | 0:36 |
| Consent withdrawn | 92 | 0:39 |
| Consent granted | 63 | 0:27 |
| Served and refused | 71 | 0:30 |
| The record | 103 | 0:44 |
| What this is not | 82 | 0:35 |

Total is around 574 words, so about four minutes read straight through. Cut the
"What is running" segment and trim the closing to land near three. The segments
are written to be independently droppable for that reason.
