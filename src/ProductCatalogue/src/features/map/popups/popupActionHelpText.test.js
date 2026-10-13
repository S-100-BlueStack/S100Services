import assert from "node:assert/strict";
import test from "node:test";
import { getPopupActionHelpText } from "./popupActionHelpText.js";

test("simple popup action help avoids technical disabled-state explanations", () => {
  assert.equal(
    getPopupActionHelpText({ id: "freeze-feature", label: "Freeze" }),
    "Freeze this product."
  );
  assert.equal(getPopupActionHelpText({ id: "tools", label: "Tools" }), "More actions.");
  assert.equal(
    getPopupActionHelpText({
      id: "rollback",
      disabled: true,
      disabledReason: "Cancel Export requires an unverified candidate for the selected source.",
    }),
    "No export is available to cancel."
  );
  assert.equal(
    getPopupActionHelpText({
      id: "rollback",
      disabled: true,
      disabledReason: "Wait until the current export finishes.",
    }),
    "Wait for the current action to finish."
  );
  assert.equal(
    getPopupActionHelpText({
      id: "export",
      disabled: true,
      disabledReason: "Unfreeze the product before exporting.",
    }),
    "Unfreeze the product first."
  );
  assert.equal(
    getPopupActionHelpText({
      id: "s57-export-update",
      disabled: true,
      disabledReason: "backend unsupported",
    }),
    "This action is not available right now."
  );
});

test("available package tooltip is its direct description, but disabled uses the reason alone", () => {
  const config = {
    id: "package-discard-export",
    label: "Discard",
    helpText: "Discard the S-101 and S-57 package. This cannot be undone.",
  };
  assert.equal(getPopupActionHelpText(config), config.helpText);
  assert.equal(
    getPopupActionHelpText({
      ...config,
      disabled: true,
      disabledReason: "No S-101 and S-57 package is available to discard.",
    }),
    "No S-101 and S-57 package is available to discard."
  );
});
