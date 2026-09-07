#!/usr/bin/env bash
#
# The full demo, in order, with the narration a viewer needs.
#
#   npm run demo
#
# Paced deliberately. Each step makes metered calls and the node
# enforces a per-minute fuel quota per tenant, so running the sequence
# flat out trips "quota exceeded" part way through and looks like a
# failure. The pauses are also what make it watchable.
set -uo pipefail
cd "$(dirname "$0")"

PAUSE="${DEMO_PAUSE:-9}"
step=0

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
note() { printf '\033[2m%s\033[0m\n' "$*"; }
head() {
  step=$((step + 1))
  printf '\n\033[1;44m  %d. %s  \033[0m\n' "$step" "$*"
}
run() {
  printf '\033[2m$ %s\033[0m\n' "$*"
  "$@" || printf '\033[1;31m(step failed, continuing so the rest still runs)\033[0m\n'
}
breathe() { sleep "$PAUSE"; }

say "T3N consent vault: an agent gets data only under live, enforced consent."
note "Every refusal below is decided inside the enclave, not by this script."

head "What consent is in force right now"
run npx tsx src/policy.ts show
breathe

head "Withdraw consent, so the starting state is honest"
note "Beginning from a permitted state would prove nothing."
run npx tsx src/policy.ts deny
breathe

head "Try to read with consent withdrawn"
note "Expect a refusal, and expect it to be recorded anyway."
run npx tsx src/invoke.ts
breathe

head "Grant consent, time-boxed"
note "The change itself lands in the audit trail."
run npx tsx src/policy.ts allow
breathe

head "Read again, and try a write consent does not cover"
note "The read is served. The write is refused inside the enclave."
run npx tsx src/invoke.ts
breathe

head "The enclave's own record of everything that just happened"
note "Caller, cluster time, sequence and contract come from node-minted context."
run npx tsx src/audit.ts
breathe

say "Done. Consent is in force again, so the console has something to show."
note "Live console:   npm run monitor"
note "Agent tools:    opencode      (then ask it to read the patient record)"
note "Withdraw again: npm run policy:deny"
