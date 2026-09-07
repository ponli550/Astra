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
  revokeAgent,
  secondsRemaining,
  shortDid,
  type Snapshot,
} from "./state.js";

const POLL_MS = 2000;

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

function GrantPanel({
  snapshot,
  nowSecs,
  grantTotal,
  busy,
}: {
  snapshot: Snapshot;
  nowSecs: number;
  grantTotal: number;
  busy: boolean;
}) {
  const { grant } = snapshot;
  const remaining = secondsRemaining(grant.validUntilSecs, nowSecs);
  const expired = remaining === 0;
  const live = grant.present && !expired;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
      <Box>
        <Text bold>GRANT   </Text>
        {busy ? (
          <Text color="cyan">revoking...</Text>
        ) : !snapshot.authenticated ? (
          <Text color="red">unknown</Text>
        ) : live ? (
          <Text color="green">active</Text>
        ) : expired ? (
          <Text color="yellow">expired</Text>
        ) : (
          <Text color="red">none</Text>
        )}
      </Box>
      <Text>
        <Text dimColor>agent   </Text>
        {shortDid(snapshot.agentDid)}
      </Text>
      <Text>
        <Text dimColor>subject </Text>
        {shortDid(snapshot.ownerDid)}
      </Text>
      <Text>
        <Text dimColor>allowed </Text>
        {grant.functions.length > 0 ? grant.functions.join(", ") : "(nothing)"}
      </Text>
      {live && (
        <Text>
          <Text dimColor>expires </Text>
          {formatRemaining(remaining)} [{progressBar(remaining, grantTotal)}]
        </Text>
      )}
      {!snapshot.authenticated ? (
        <Text dimColor>cannot read the grant until the keys authenticate</Text>
      ) : (
        !grant.present &&
        !busy && (
          <Text dimColor>the agent's next call fails. restore with: npm run grant</Text>
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
  const [grantTotal, setGrantTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const next = await poll();
    setSnapshot(next);
    // Remember the longest life this grant was ever seen with, so the
    // bar has a denominator. Remaining time alone cannot give one.
    const until = next.grant.validUntilSecs;
    if (until !== undefined) {
      const seen = until - Math.floor(Date.now() / 1000);
      setGrantTotal((prev) => Math.max(prev, seen));
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
        void revokeAgent()
          .then(() => setNotice("grant withdrawn. the agent's next call fails."))
          .catch((error: unknown) =>
            setNotice(`revoke failed: ${error instanceof Error ? error.message : String(error)}`),
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
      <GrantPanel snapshot={snapshot} nowSecs={nowSecs} grantTotal={grantTotal} busy={busy} />
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
          <Text dimColor>[r] revoke the agent   [q] quit</Text>
        ) : (
          <Text dimColor>read-only: no terminal attached, so keys are off</Text>
        )}
      </Box>
    </Box>
  );
}
