// Opens a sealed rule package: verifies its signature against the embedded
// public key, then decrypts its contents. Loaded in the background worker via
// importScripts after keys.js, so MaskFillKeys is already present.
//
// A package looks like:
//   { matches: [...], sealed: "<base64 iv|ciphertext>", sig: "<base64>" }
// Only `matches` is in the clear. The signature covers matches + sealed, so
// neither can be altered without invalidating it.

(() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // The bytes the signature is computed over. Tool and extension must build
  // this identically, so the shape is fixed here and mirrored in sign-rule.mjs.
  const signedBytes = (matches, sealed) =>
    enc.encode(JSON.stringify(matches) + "." + sealed);

  let verifyKeyPromise;
  let aesKeyPromise;

  function verifyKey() {
    return (verifyKeyPromise ??= crypto.subtle.importKey(
      "jwk",
      MaskFillKeys.verifyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    ));
  }

  function aesKey() {
    return (aesKeyPromise ??= crypto.subtle.importKey(
      "raw",
      fromB64(MaskFillKeys.aesKey),
      "AES-GCM",
      false,
      ["decrypt"]
    ));
  }

  async function isSignatureValid(pkg) {
    if (!pkg || !Array.isArray(pkg.matches) || !pkg.sealed || !pkg.sig) return false;
    try {
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        await verifyKey(),
        fromB64(pkg.sig),
        signedBytes(pkg.matches, pkg.sealed)
      );
    } catch {
      return false;
    }
  }

  // Verify first, then decrypt. Returns the runnable rule (payload + the
  // cleartext matches), or throws if the package is not one we issued.
  async function open(pkg) {
    if (!(await isSignatureValid(pkg))) {
      throw new Error("Podpis reguły jest nieprawidłowy.");
    }
    const raw = fromB64(pkg.sealed);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      await aesKey(),
      raw.slice(12)
    );
    const payload = JSON.parse(dec.decode(plaintext));
    return { ...payload, matches: pkg.matches };
  }

  globalThis.Seal = { isSignatureValid, open };
})();
