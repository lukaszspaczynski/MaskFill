// Bridge between the extension's UI and the container app, which is the only
// component that touches the Keychain.
//
// The password is never sent here in full: the popup asks for the characters at
// specific positions and the native handler returns only those. Nothing in the
// JavaScript side of the extension, and nothing in the page, ever holds the
// whole secret.

const NATIVE_APP_ID = "com.example.INGMaskFill";

browser.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case "status":
      return native({ action: "status" });
    case "savePassword":
      return native({ action: "save", password: message.password });
    case "clearPassword":
      return native({ action: "delete" });
    case "charsFor":
      return native({ action: "chars", positions: message.positions });
    default:
      return false;
  }
});

async function native(request) {
  let reply;
  try {
    reply = await browser.runtime.sendNativeMessage(NATIVE_APP_ID, request);
  } catch (cause) {
    // Almost always means the container app is not installed or not signed
    // consistently with the extension.
    throw new Error(`Native handler unreachable: ${cause.message}`);
  }

  if (reply?.error) throw new Error(reply.error);
  return reply;
}
