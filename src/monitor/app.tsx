/**
 * The data owner's console. Run it beside OpenCode so the agent's own
 * account of what it did sits next to the enclave's record of what
 * actually happened.
 *
 *   npm run monitor
 *
 * Read-mostly by design. The one write is revoking the agent, which is
 * the owner's decision to make and the fastest way to show that
 * consent is live rather than decorative.
 */
import { Box, Text, useApp, useInput, useStdin } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import {
  formatRemaining,
  poll,
  progressBar,
  revokeConsent,
  secondsRemaining,
  shortDid,
  type Snapshot,
} from "./state.js";

/**
 * Poll interval.
 *
 * Each poll makes three metered calls, and the node enforces a
 * per-minute fuel quota per tenant. A two-second interval tripped
 * `quota exceeded (fuel_per_minute)` during testing, which is a poor
 * trade for a console watching state that changes when a person acts.
 * Ten seconds keeps it responsive enough to watch a withdrawal land.
 */
const POLL_MS = Number(process.env["MONITOR_POLL_MS"] ?? 10_000);

function outcomeColor(outcome: string): string {
  if (outcome === "served") return "green";
  if (outcome === "denied") return "yellow";
  return "gray";
}

function Header({ snapshot }: { snapshot: Snapshot }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>ENCLAVE AUDIT TRAIL</Text>
      <Text dimColor>
        {snapshot.contract}@{snapshot.version}
      </Text>
    </Box>
  );
}

/**
 * Consent as the contract enforces it.
 *
 * The delegation grant is shown underneath, deliberately labelled as not
 * the gate: the platform's enforcement point is egress and this contract
 * makes no outbound call, so the grant here is intent rather than
 * enforcement. The policy is what every call is evaluated against.
 */
function ConsentPanel({
  snapshot,
  nowSecs,
  policyTotal,
  busy,
}: {
  snapshot: Snapshot;
  nowSecs: number;
  policyTotal: number;
  busy: boolean;
}) {
  const { policy, grant } = snapshot;
  const remaining = secondsRemaining(policy.validUntilSecs, nowSecs);
  // A failed poll must not be reported as "no consent". Not knowing and
  // knowing there is none are different claims, and confusing them would
  // make a rate-limited console look like a revoked one.
  const known = snapshot.authenticated && snapshot.error === undefined;
  const inForce =
    known && policy.version > 0 && policy.allowedCallers.length > 0 && !policy.expired;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
      <Box>
        <Text bold>CONSENT </Text>
        {busy ? (
          <Text color="cyan">withdrawing...</Text>
        ) : !known ? (
          <Text color="red">unknown</Text>
        ) : inForce ? (
          <Text color="green">in force</Text>
        ) : policy.expired ? (
          <Text color="yellow">lapsed</Text>
        ) : policy.version === 0 ? (
          <Text color="red">none ever set</Text>
        ) : (
          <Text color="red">withdrawn</Text>
        )}
        <Text dimColor>  {known ? `policy v${policy.version}` : "state not read"}</Text>
      </Box>
      <Text>
        <Text dimColor>caller  </Text>
        {shortDid(snapshot.agentDid)}
      </Text>
      <Text>
        <Text dimColor>allows  </Text>
        {policy.allowedFunctions.length > 0
          ? policy.allowedFunctions.join(", ")
          : "(nothing)"}
      </Text>
      {inForce && policy.validUntilSecs !== undefined && (
        <Text>
          <Text dimColor>expires </Text>
          {formatRemaining(remaining)} [{progressBar(remaining, policyTotal)}]
        </Text>
      )}
      {policy.delegations.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>chain</Text>
          {policy.delegations.map((d) => (
            <Text key={`${d.from}-${d.to}`}>
              <Text dimColor>  {d.from.slice(0, 8)}... </Text>
              <Text>-&gt; {d.to.slice(0, 8)}...  </Text>
              <Text color="cyan">[{d.functions.join(", ")}]</Text>
              <Text dimColor>  {formatRemaining(secondsRemaining(d.validUntilSecs, nowSecs))}</Text>
            </Text>
          ))}
        </Box>
      )}
      <Text dimColor>
        grant   {grant.present ? grant.functions.join(", ") : "none"} (intent, not the gate)
      </Text>
      {!known ? (
        <Text dimColor>consent state unread, so nothing here is a claim about it</Text>
      ) : (
        !inForce &&
        !busy && (
          <Text dimColor>every gated call fails. restore with: npm run policy:allow</Text>
        )
      )}
    </Box>
  );
}

function Trail({ snapshot }: { snapshot: Snapshot }) {
  const recent = snapshot.audit.entries.slice(-12);

  if (recent.length === 0) {
    return <Text dimColor>nothing recorded yet. have the agent read a record.</Text>;
  }

  return (
    <Box flexDirection="column">
      {recent.map((entry) => (
        <Box key={entry.seq_no} flexDirection="column">
          <Box>
            <Text dimColor>{String(entry.seq_no).padStart(3, " ")} </Text>
            <Text color={outcomeColor(entry.outcome)}>
              {(entry.outcome || "?").padEnd(7, " ")}
            </Text>
            <Text> {entry.action} </Text>
            <Text dimColor>{entry.record_id}</Text>
          </Box>
          {entry.reason !== "" && (
            <Text dimColor>      {entry.reason}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  // Keyboard input needs a real terminal. Piped or redirected input has
  // no raw mode, and asking for it anyway throws from inside a React
  // effect, which replaces the whole console with a stack trace. Poll
  // and render regardless; only the key bindings go quiet.
  //
  // The strict boolean matters: Ink only skips raw mode when isActive is
  // exactly false, so an undefined here would still throw.
  const { isRawModeSupported } = useStdin();
  const interactive = isRawModeSupported === true && process.stdin.isTTY === true;
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>();
  const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000));
  const [policyTotal, setPolicyTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const next = await poll();
    setSnapshot(next);
    // Remember the longest life this policy was ever seen with, so the
    // bar has a denominator. Remaining time alone cannot give one.
    const until = next.policy.validUntilSecs;
    if (until !== undefined) {
      const seen = until - Math.floor(Date.now() / 1000);
      setPolicyTotal((prev) => Math.max(prev, seen));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poller = setInterval(() => void refresh(), POLL_MS);
    const clock = setInterval(() => setNowSecs(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(poller);
      clearInterval(clock);
    };
  }, [refresh]);

  useInput(
    (input) => {
      if (input === "q") exit();
      if (input === "r" && !busy) {
        setBusy(true);
        setNotice(undefined);
        void revokeConsent()
          .then(() =>
            setNotice("consent withdrawn. the next gated call fails inside the enclave."),
          )
          .catch((error: unknown) =>
            setNotice(
              `withdraw failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          )
          .finally(() => {
            setBusy(false);
            void refresh();
          });
      }
    },
    { isActive: interactive },
  );

  if (!snapshot) {
    return <Text dimColor>authenticating as the data owner...</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <ConsentPanel
        snapshot={snapshot}
        nowSecs={nowSecs}
        policyTotal={policyTotal}
        busy={busy}
      />
      <Header snapshot={snapshot} />
      <Trail snapshot={snapshot} />
      {snapshot.audit.malformed_entries > 0 && (
        <Text color="yellow">
          {snapshot.audit.malformed_entries} stored entries were not decodable
        </Text>
      )}
      {snapshot.error !== undefined && (
        <Box marginTop={1}>
          <Text color="red">poll failed: {snapshot.error}</Text>
        </Box>
      )}
      {notice !== undefined && (
        <Box marginTop={1}>
          <Text color="cyan">{notice}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        {interactive ? (
          <Text dimColor>[r] withdraw consent   [q] quit</Text>
        ) : (
          <Text dimColor>read-only: no terminal attached, so keys are off</Text>
        )}
      </Box>
    </Box>
  );
}
