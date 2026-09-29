// Reference vectors produced by pylgate 1.2.2 (fixed timestamps so they're reproducible).
// If PalGate changes the algorithm, re-port palgateToken.ts and regenerate these with pylgate.
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateToken } = require("../lib/palgateToken");

const KEY_A = "000102030405060708090a0b0c0d0e0f";
const KEY_B = "00112233445566778899aabbccddeeff";

test("matches pylgate for every token type", () => {
  assert.equal(generateToken(KEY_A, "972500000000", 2, 1_700_000_000), "2100E26D845D009D5046C334E5D64A4B21D74F0DE80208");
  assert.equal(generateToken(KEY_A, "972500000000", 1, 1_700_000_000), "1100E26D845D009D5046C334E5D64A4B21D74F0DE80208");
  assert.equal(generateToken(KEY_A, "972500000000", 0, 1_700_000_000), "0100E26D845D009D5046C334E5D64A4B21D74F0DE80208");
});

test("matches pylgate for a different key, phone and time", () => {
  assert.equal(generateToken(KEY_B, "972541234567", 2, 1_699_999_999), "2100E26FF98D8768ADACCF649CA486F131FA1FA49F1C15");
});

test("rejects a session token that is not 16 bytes", () => {
  assert.throws(() => generateToken("abcd", "972500000000", 1, 1_700_000_000));
});
