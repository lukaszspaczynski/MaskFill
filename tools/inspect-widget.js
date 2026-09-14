// Paste into Safari's Web Inspector console on the ING masked-password step to
// see how the bank currently marks up the widget. Useful if filling breaks
// after ING changes their frontend.
//
// Reports structure only -- never reads .value -- so the output is safe to share.

(() => {
  // Same traversal content.js uses: descend into open shadow roots.
  const deepQueryAll = (selector, root = document) => {
    const found = [...root.querySelectorAll(selector)];
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) found.push(...deepQueryAll(selector, element.shadowRoot));
    }
    return found;
  };

  const shallow = document.querySelectorAll('input[name^="password-"]').length;
  const fields = deepQueryAll('input[name^="password-"]');

  console.log("fields without piercing shadow DOM:", shallow);
  console.log("fields with piercing:", fields.length);

  if (!fields.length) {
    // Selector stopped matching. Dump every input anywhere in the tree so the
    // new shape is visible, plus the chain of shadow hosts above each one.
    const all = deepQueryAll("input");
    console.warn("selector matched nothing; inputs found anywhere:", all.length);
    console.table(
      all.map((el, i) => ({
        i,
        name: el.name,
        id: el.id,
        type: el.type,
        maxLength: el.maxLength,
        disabled: el.disabled,
        parent: el.parentElement?.tagName.toLowerCase(),
      }))
    );
    return;
  }

  // Where the fields actually live, so the traversal can be checked.
  const hostChain = (node) => {
    const chain = [];
    for (let current = node; current; current = current.parentNode) {
      if (current instanceof ShadowRoot) {
        chain.unshift(current.host.tagName.toLowerCase() + "::shadow");
        current = current.host;
      }
    }
    return chain.join(" > ") || "(document, no shadow roots)";
  };
  console.log("shadow path to the fields:", hostChain(fields[0]));

  console.table(
    fields.map((el) => {
      const host = el.closest("ing-input-masked-password-field");
      return {
        name: el.name,
        position: Number(/^password-(\d+)$/.exec(el.name)?.[1] ?? NaN) + 1,
        disabled: el.disabled,
        readOnly: el.readOnly,
        ariaDisabled: el.getAttribute("aria-disabled"),
        printed: host?.querySelector('[slot="after"]')?.textContent.trim(),
        label: host?.querySelector("label")?.textContent.trim(),
      };
    })
  );

  const editable = fields
    .filter((el) => !el.disabled && !el.readOnly)
    .map((el) => Number(el.name.slice("password-".length)) + 1);

  console.log("positions content.js would report:", editable);
  console.log("compare against the bold numbers shown on the page");
})();
