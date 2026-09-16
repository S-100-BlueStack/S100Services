import assert from "node:assert/strict";
import test from "node:test";

import { bindDisplayScaleOverrideSwitch } from "../displayScaleOverrideControlBinding.js";

class FakeSwitch extends EventTarget {
  checked = false;
  title = "";
}

test("Preferences Scale hiding control reflects current state and updates it immediately", () => {
  let hidingDisabled = false;
  let listener = null;
  const changes = [];
  const switchElement = new FakeSwitch();
  const handle = bindDisplayScaleOverrideSwitch(switchElement, {
    readHidingDisabled: () => hidingDisabled,
    setHidingDisabled(disabled, options) {
      hidingDisabled = disabled;
      changes.push({ disabled, options });
      listener?.();
    },
    subscribe(callback) {
      listener = callback;
      return {
        remove() {
          listener = null;
        },
      };
    },
  });

  assert.equal(switchElement.checked, true);

  switchElement.checked = false;
  switchElement.dispatchEvent(new Event("calciteSwitchChange"));
  assert.equal(hidingDisabled, true);
  assert.deepEqual(changes.at(-1), {
    disabled: true,
    options: { source: "manual" },
  });

  switchElement.checked = true;
  switchElement.dispatchEvent(new Event("calciteSwitchChange"));
  assert.equal(hidingDisabled, false);
  assert.deepEqual(changes.at(-1), {
    disabled: false,
    options: { source: "manual" },
  });

  handle.remove();
});
