const passwordField = document.getElementById("password");
const message = document.getElementById("message");

refreshState();

document.getElementById("save").addEventListener("click", async () => {
  const password = passwordField.value;
  if (!password) return fail("Wpisz hasło.");

  try {
    await browser.runtime.sendMessage({ type: "savePassword", password });
    passwordField.value = "";
    say(`Zapisano hasło (${password.length} ${plural(password.length)}).`);
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

// The field's placeholder doubles as the status line: an empty box that says
// what is currently stored.
async function refreshState() {
  try {
    const status = await browser.runtime.sendMessage({ type: "status" });
    passwordField.placeholder = status.stored
      ? `Zapisane hasło: ${status.length} ${plural(status.length)}`
      : "Brak zapisanego hasła";
  } catch (error) {
    passwordField.placeholder = "Brak zapisanego hasła";
    fail(error.message);
  }
}

function plural(count) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (count === 1) return "znak";
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "znaki";
  return "znaków";
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
