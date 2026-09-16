// Round-trips the sealing scheme end to end: signs a rule with the vendor tool's
// crypto, then opens it with the extension's real seal.js, and proves that
// tampering and forgery are rejected. Run by tools/test-content.sh.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const check = (label, ok) => {
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures++;
};

// Load the extension's seal.js in a Node context by supplying the globals it
// expects (MaskFillKeys, atob). crypto is already a Node global. This is the
// SAME file that ships.
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
const keysSrc = readFileSync("src/crypto/keys.js", "utf8").replace("globalThis.MaskFillKeys", "globalThis.MaskFillKeys");
new Function(keysSrc)();
new Function(readFileSync("src/crypto/seal.js", "utf8"))();
const { Seal } = globalThis;

// Produce a package with the real vendor tool.
const ruleFile = join(tmpdir(), "maskfill-test-rule.json");
writeFileSync(
  ruleFile,
  JSON.stringify({
    matches: ["https://login.example.pl/*"],
    field: "input.pw",
    position: { from: "label" },
    disabledWhen: "[readonly]",
  })
);
const pkg = JSON.parse(execFileSync("node", ["tools/sign-rule.mjs", ruleFile], { encoding: "utf8" }));

check("package exposes only matches in the clear",
  JSON.stringify(Object.keys(pkg).sort()) === JSON.stringify(["matches", "sealed", "sig"]));
check("field selector is not present in cleartext",
  !JSON.stringify(pkg).includes("input.pw"));

const opened = await Seal.open(pkg);
check("opens to the original rule",
  opened.field === "input.pw" && opened.position.from === "label" && opened.disabledWhen === "[readonly]");
check("carries the cleartext matches through",
  JSON.stringify(opened.matches) === JSON.stringify(["https://login.example.pl/*"]));

// matches is outside the signature: the user may change which sites a rule
// covers, and the package still verifies.
const movedHost = { ...pkg, matches: ["https://login.example.pl/other/*"] };
check("accepts a package whose matches were changed", await Seal.isSignatureValid(movedHost));
const openedMoved = await Seal.open(movedHost);
check("open() honours the caller's matches",
  JSON.stringify(openedMoved.matches) === JSON.stringify(["https://login.example.pl/other/*"]));

// Tampering with the ciphertext must break the signature.
const flipped = { ...pkg, sealed: pkg.sealed.slice(0, -2) + (pkg.sealed.endsWith("A") ? "B" : "A") + "=" };
check("rejects a package whose ciphertext was altered", !(await Seal.isSignatureValid(flipped)));

// A rule signed with a DIFFERENT key must not be trusted.
const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const forgedSig = Buffer.from(
  await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    other.privateKey,
    new TextEncoder().encode(pkg.sealed)
  )
).toString("base64");
check("rejects a rule signed with an unknown key",
  !(await Seal.isSignatureValid({ ...pkg, sig: forgedSig })));

console.log(failures === 0 ? "   ALL TESTS PASSED" : `   ${failures} TEST FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
