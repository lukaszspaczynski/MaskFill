const passwordField = document.getElementById("password");
const state = document.getElementById("state");
const message = document.getElementById("message");

refreshState();

document.getElementById("save").addEventListener("click", async () => {
  const password = passwordField.value;
  if (!password) return fail("Wpisz hasło.");

  try {
    await browser.runtime.sendMessage({ type: "savePassword", password });
    passwordField.value = "";
    say(`Zapisano hasło (${password.length} znaków).`);
    refreshState();
  } catch (error) {
    fail(error.message);
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  try {
    await browser.runtime.sendMessage({ type: "clearPassword" });
    say("Usunięto hasło z pęku kluczy.");
    refreshState();
  } catch (error) {
    fail(error.message);
  }
});

async function refreshState() {
  try {
    const status = await browser.runtime.sendMessage({ type: "status" });
    state.textContent = status.stored
      ? `Zapisane hasło: ${status.length} znaków.`
      : "Brak zapisanego hasła.";
  } catch (error) {
    state.textContent = error.message;
  }
}

function say(text) {
  message.classList.remove("error");
  message.textContent = text;
  message.hidden = false;
}

function fail(text) {
  message.classList.add("error");
  message.textContent = text;
  message.hidden = false;
}
