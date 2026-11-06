import assert from "node:assert/strict";
import test from "node:test";
import { isSafeDescriptionUrl } from "./renderPackageDescriptions.js";

test("HTML description links allow HTTP and HTTPS but reject executable URLs", () => {
  assert.equal(isSafeDescriptionUrl("https://example.com/document"), true);
  assert.equal(isSafeDescriptionUrl("/about", "https://example.com/"), true);
  assert.equal(isSafeDescriptionUrl("mailto:contact@example.com"), true);
  assert.equal(isSafeDescriptionUrl("javascript:alert(1)"), false);
  assert.equal(isSafeDescriptionUrl("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isSafeDescriptionUrl("vbscript:msgbox(1)"), false);
});
