import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUiDirectory = new URL("./", import.meta.url);

test("Dashboard chrome is visually compact while retaining one semantic page heading", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.match(source, /const title = document\.createElement\("h1"\);/);
  assert.match(source, /title\.className = "pc-dashboard-visually-hidden";/);
  assert.match(source, /title\.textContent = "Dashboard";/);
  assert.doesNotMatch(source, /Operational overview/);
  assert.doesNotMatch(source, /createHeaderMeta/);
  assert.match(source, /title: "Activity list",[\s\S]*?visuallyHiddenTitle: true,/);
});

test("Dashboard toolbar has accessible icon Refresh without visible preset shortcuts", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.match(source, /const button = document\.createElement\("button"\);/);
  assert.match(source, /button\.type = "button";/);
  assert.match(source, /const icon = document\.createElement\("calcite-icon"\);/);
  assert.match(source, /icon\.icon = "refresh";/);
  assert.match(source, /icon\.scale = "s";/);
  assert.match(source, /icon\.setAttribute\("aria-hidden", "true"\);/);
  assert.match(source, /button\.appendChild\(icon\);/);
  assert.match(source, /button\.setAttribute\("aria-label", "Refresh dashboard"\);/);
  assert.doesNotMatch(source, /document\.createElement\("calcite-action"\)/);
  assert.doesNotMatch(source, /createQuickRangeButton/);
  assert.doesNotMatch(source, /Since yesterday/);
  assert.doesNotMatch(source, /Last 7 days/);
});

test("optional To remains clearable without a separate permanent Clear action", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.doesNotMatch(source, /pc-dashboard-range-date-clear/);
  assert.doesNotMatch(source, /clearButton\.textContent = "Clear"/);
  assert.match(source, /button\.setAttribute\("aria-keyshortcuts", "Delete Backspace"\);/);
  assert.match(source, /event\.key !== "Delete" && event\.key !== "Backspace"/);
  assert.match(source, /result\.onDateChange\?\.\(""\);/);
  assert.match(source, /clearButton\.className = "pc-dashboard-date-picker__clear";/);
  assert.match(source, /clearButton\.textContent = "Clear date";/);
});

test("range groups keep semantic labels and have no Apply control", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.match(source, /field\.setAttribute\("role", "group"\);/);
  assert.match(source, /field\.setAttribute\("aria-labelledby", labelElement\.id\);/);
  assert.doesNotMatch(
    source,
    /createRangeApplyButton|pc-dashboard-range-apply|textContent = "Apply"/
  );
  assert.match(source, /new CustomEvent\("pc-dashboard-range-change"/);
});

test("range controls keep keyboard time editing local until the range interaction commits", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.match(
    source,
    /datePicker\.onDateChange = \(dateValue\) => \{[\s\S]*?syncRangeDateTimeDraft\([\s\S]*?commitDashboardRangeDraft\(\);/
  );
  assert.match(source, /let timeEditingByKeyboard = false;/);
  assert.match(
    source,
    /timeInput\.addEventListener\("keydown", \(\) => \{\n {4}timeEditingByKeyboard = true;/
  );
  assert.match(
    source,
    /timeInput\.addEventListener\("input", \(\) => \{[\s\S]*?syncRangeDateTimeDraft\([\s\S]*?\n {2}\}\);/
  );
  assert.match(
    source,
    /if \(!timeEditingByKeyboard\) \{\n {6}scheduleDashboardTimeCommit\(timeInput\);/
  );
  assert.match(
    source,
    /wrapper\.addEventListener\("focusout", \(event\) => \{[\s\S]*?wrapper\.contains\(event\.relatedTarget\)[\s\S]*?commitDashboardRangeDraft\(\);/
  );
  assert.match(
    source,
    /activeElement !== timeInput &&[\s\S]*?rangeBuilder\.contains\(activeElement\)[\s\S]*?return;/
  );
  assert.match(source, /detail: \{ draft: \{ \.\.\.dashboardRangeDraft \} \}/);
});

test("Refresh participates in Dashboard focus restoration after a range auto-apply", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.match(source, /button\.dataset\.dashboardFocusKey = "refresh";/);
  assert.match(source, /const focusKey = activeElement\.dataset\.dashboardFocusKey;/);
  assert.match(source, /\[data-dashboard-focus-key=/);
});

test("range rerenders retain invalid drafts until the applied range changes", async () => {
  const source = await readFile(new URL("dashboardPage.js", dashboardUiDirectory), "utf8");

  assert.match(source, /const appliedRangeKey = getDashboardRangeKey\(range\);/);
  assert.match(
    source,
    /dashboardRangeDraft === null \|\| dashboardRangeDraftAppliedKey !== appliedRangeKey/
  );
  assert.match(source, /button\.focus\(\{ preventScroll: true \}\);/);
});
