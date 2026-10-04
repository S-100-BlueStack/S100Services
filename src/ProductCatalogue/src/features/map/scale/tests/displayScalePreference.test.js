import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DISPLAY_SCALE_HIDING_DISABLED,
  parsePersistedDisplayScaleHidingDisabled,
  serializeDisplayScaleHidingDisabled,
} from "../displayScalePreference.js";

test("Scale hiding defaults off when no explicit preference exists", () => {
  assert.equal(DEFAULT_DISPLAY_SCALE_HIDING_DISABLED, true);
  assert.equal(parsePersistedDisplayScaleHidingDisabled(null), true);
});

test("existing explicit Scale hiding choices retain their inverse storage semantics", () => {
  assert.equal(parsePersistedDisplayScaleHidingDisabled("false"), false);
  assert.equal(parsePersistedDisplayScaleHidingDisabled("true"), true);
  assert.equal(serializeDisplayScaleHidingDisabled(false), "false");
  assert.equal(serializeDisplayScaleHidingDisabled(true), "true");
});

test("malformed Scale hiding preferences fail safely to off", () => {
  for (const value of [undefined, "", "FALSE", "0", "null", "invalid"]) {
    assert.equal(parsePersistedDisplayScaleHidingDisabled(value), true);
  }
});
