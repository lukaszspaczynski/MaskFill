// Turns a plaintext rule into a sealed package customers can import. This is the
// vendor-side tool; it needs the private signing key, so it only runs where
// keys/signing-private.jwk exists -- never ships.
//
//   node tools/sign-rule.mjs path/to/rule.json > package.json
//
// Input is an ordinary rule, e.g.
//   {
//     "matches": ["https://login.example.pl/*"],
//     "field": "input.pw",
//     "position": { "from": "label" }
//   }
// Everything except `matches` is encrypted. `matches` ships as a suggestion
// only -- it is not signed, so the importer can change which of their sites the
// rule covers. The signature covers the encrypted contents, which cannot be
// altered.

import { webcrypto as crypto } from "node:crypto";
import { readFileSync } from "node:fs";

const b64 = (buf) => Buffer.from(buf).toString("base64");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const enc = new TextEncoder();

const rulePath = process.argv[2];
if (!rulePath) {
  console.error("usage: node tools/sign-rule.mjs path/to/rule.json > package.json");
  process.exit(2);
}

const rule = JSON.parse(readFileSync(rulePath, "utf8"));
if (!Array.isArray(rule.matches) || !rule.matches.length) {
  console.error("rule must have a non-empty matches array");
  process.exit(2);
}
if (!rule.field) {
  console.error("rule must have a field selector");
  process.exit(2);
}

const priv = JSON.parse(readFileSync("keys/signing-private.jwk", "utf8"));

// keys/aes.key mirrors the AES key embedded in src/crypto/keys.js.
const aesRaw = fromB64(readFileSync("keys/aes.key", "utf8").trim());

const aesKey = await crypto.subtle.importKey("raw", aesRaw, "AES-GCM", false, ["encrypt"]);
const signKey = await crypto.subtle.importKey(
  "jwk",
  priv,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"]
);

// Encrypt everything except matches.
const { matches, ...payload } = rule;
const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = new Uint8Array(
  await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(JSON.stringify(payload)))
);
const sealed = b64(Uint8Array.from([...iv, ...ciphertext]));

// Sign the ciphertext only. Must match seal.js's signedBytes() exactly.
const sig = b64(
  new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signKey, enc.encode(sealed))
  )
);

process.stdout.write(JSON.stringify({ matches, sealed, sig }, null, 2) + "\n");
