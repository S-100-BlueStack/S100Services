import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assignmentMapLegendMarkup } from "./assignmentMapLegend.js";
import { ASSIGNMENT_SAVED_WORKSPACE_OUTLINE } from "../../map/workspaces/workspaceCoverageSymbol.js";

test("Live map legend is expanded, collapsible and names authoritative map geometry", () => {
  const markup = assignmentMapLegendMarkup(true);
  assert.match(markup, /<details[^>]+open>/);
  assert.match(markup, /<summary[^>]*>Map legend<\/summary>/);
  assert.match(markup, />Package AOI</);
  assert.match(markup, />Detailed features</);
  assert.match(markup, />Current auto-matched Workspaces</);
  assert.match(
    markup,
    /is-context is-saved-match[^>]*style="[^"]*--dc-assignment-workspace-color:/
  );
  assert.match(markup, new RegExp(ASSIGNMENT_SAVED_WORKSPACE_OUTLINE.rgb.join(", ")));
  assert.doesNotMatch(markup, /Saved Workspaces|Proposed|Preview|checkbox|localStorage/);
});

test("Mock map retains Feature and Work stream semantics with the same disclosure", () => {
  const markup = assignmentMapLegendMarkup(false);
  assert.match(markup, /<details[^>]+open>/);
  assert.match(markup, /Selected feature/);
  assert.match(markup, /Assigned Work stream/);
  assert.match(markup, /Unassigned context/);
  assert.doesNotMatch(markup, /is-saved-match/);
  assert.doesNotMatch(markup, /Package AOI|auto-matched Workspaces/);
});

test("Mock dashed context and saved solid-orange matches have distinct legend styles", () => {
  const css = readFileSync(new URL("../../../styles/assignment.css", import.meta.url), "utf8");
  const mockStyle = css.match(/\.dc-assignment-legend__line\.is-context\s*\{([^}]*)\}/)?.[1];
  const liveStyle = css.match(
    /\.dc-assignment-legend__line\.is-context\.is-saved-match\s*\{([^}]*)\}/
  )?.[1];
  assert.match(mockStyle ?? "", /border-top-style:\s*dashed/);
  assert.match(liveStyle ?? "", /border-top-style:\s*solid/);
  assert.match(liveStyle ?? "", /--dc-assignment-workspace-color:\s*rgb\(245, 141, 35\)/);
});
