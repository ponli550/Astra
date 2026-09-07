/**
 * Tests for the console's display helpers.
 *
 *   npm run test
 *
 * These are the parts that can be wrong in a way a screenshot hides: a
 * countdown that reads fine but is off, or a bar that is full when the
 * grant has nearly run out.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRemaining, progressBar, secondsRemaining, shortDid } from "./state.js";

test("secondsRemaining floors at zero rather than going negative", () => {
  assert.equal(secondsRemaining(100, 40), 60);
  assert.equal(secondsRemaining(100, 100), 0);
  // An expired grant must read as expired, not as a negative countdown.
  assert.equal(secondsRemaining(100, 5000), 0);
});

test("secondsRemaining distinguishes unbounded from expired", () => {
  // undefined means no expiry at all, which is not the same as 0.
  assert.equal(secondsRemaining(undefined, 1000), undefined);
});

test("formatRemaining separates no expiry from expired", () => {
  assert.equal(formatRemaining(undefined), "no expiry");
  assert.equal(formatRemaining(0), "expired");
});

test("formatRemaining pads seconds so the countdown does not jump width", () => {
  assert.equal(formatRemaining(702), "11m42s");
  assert.equal(formatRemaining(661), "11m01s");
  assert.equal(formatRemaining(45), "45s");
});

test("progressBar reflects the share of life left", () => {
  assert.equal(progressBar(900, 900), "##########");
  assert.equal(progressBar(450, 900), "#####-----");
  assert.equal(progressBar(0, 900), "----------");
});

test("progressBar stays fixed width in the cases that would divide badly", () => {
  // A zero or unknown denominator must not produce NaN or a ragged bar.
  assert.equal(progressBar(100, 0).length, 10);
  assert.equal(progressBar(undefined, 900).length, 10);
  // Remaining above total can happen right after a re-grant.
  assert.equal(progressBar(2000, 900), "##########");
});

test("shortDid keeps the distinguishing head and the prefix", () => {
  const did = "did:t3n:abe8e6dc8a4335ae0c2a97750185f3b25e880dba";
  const short = shortDid(did);
  assert.ok(short.startsWith("did:t3n:abe8e6dc8a"));
  assert.ok(short.endsWith("..."));
  // A DID short enough to fit is left alone rather than gaining an ellipsis.
  assert.equal(shortDid("did:t3n:abc"), "did:t3n:abc");
});

test("shortDid leaves a non-DID status string alone", () => {
  // Regression: the panel used to render "did:t3n:(not authe..." by
  // prefixing a status message as though it were an identity.
  assert.equal(shortDid("not authenticated"), "not authenticated");
  assert.equal(shortDid("unknown"), "unknown");
});
