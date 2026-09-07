/**
 * Entry point for the owner's console.
 *
 *   npm run monitor
 *
 * Run it beside OpenCode: the agent's own account of what it did on one
 * side, the enclave's record of what actually happened on the other.
 */
import { render } from "ink";
import React from "react";
import { App } from "./app.js";

// Ink demands raw mode to handle Ctrl+C, and raw mode needs a real
// terminal. Piped or redirected input has none, and asking for it
// anyway throws from inside a React effect, replacing the whole console
// with a stack trace. Where there is no terminal, drop the key handling
// and let the console still poll and render.
const interactive = process.stdin.isTTY === true;

render(<App />, { exitOnCtrlC: interactive });
