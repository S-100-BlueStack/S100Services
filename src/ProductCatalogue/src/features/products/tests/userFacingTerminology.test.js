import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import path from "node:path";

const PRODUCT_CATALOGUE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const USER_FACING_SOURCE_FILES = [
  "index.html",
  "public/components/navbar.html",
  "src/features/analyze/ui/analyzeSidebar.js",
  "src/features/dashboard/ui/dashboardPage.js",
  "src/features/map/filters/attributeFilterPanel.js",
  "src/features/map/popups/createPopup.js",
  "src/features/map/popups/popupActionConfig.js",
  "src/features/map/search/mainMapProductSearch.js",
  "src/features/onboarding/config/onboardingSteps.js",
  "src/features/preferences/ui/preferencesPanel.js",
  "src/features/productCollection/ui/productCollectionTray.js",
  "src/features/products/ui/productPicker.js",
  "src/features/review/ui/reviewBoard.js",
  "src/features/review/ui/reviewPage.js",
  "src/features/review/ui/reviewSidebar.js",
  "src/features/timeline/ui/productHistoryRenderers.js",
];

const FORBIDDEN_TERM_PATTERN = /\bdatasets?\b/i;
const USER_FACING_HTML_ATTRIBUTE_PATTERN =
  /\b(?:aria-label|label|placeholder|text|title)\s*=\s*(["'])([\s\S]*?)\1/gi;
const HTML_TEXT_PATTERN = />([^<>]+)</g;

function extractJavaScriptStrings(source) {
  const strings = [];
  const cursor = {
    index: 0,
    line: 1,
  };

  while (cursor.index < source.length) {
    const character = source[cursor.index];
    const nextCharacter = source[cursor.index + 1];

    if (character === "\n") {
      cursor.line += 1;
      cursor.index += 1;
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      skipLineComment(source, cursor);
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      skipBlockComment(source, cursor);
      continue;
    }

    if (character === "/" && isRegularExpressionStart(source, cursor.index)) {
      skipRegularExpression(source, cursor);
      continue;
    }

    if (character === '"' || character === "'") {
      strings.push(readQuotedString(source, cursor, character));
      continue;
    }

    if (character === "`") {
      readTemplateLiteral(source, cursor, strings);
      continue;
    }

    cursor.index += 1;
  }

  return strings;
}

function readQuotedString(source, cursor, quote) {
  const startLine = cursor.line;
  let value = "";
  cursor.index += 1;

  while (cursor.index < source.length) {
    const character = source[cursor.index];

    if (character === "\\") {
      value += character;
      cursor.index += 1;

      if (cursor.index < source.length) {
        value += source[cursor.index];

        if (source[cursor.index] === "\n") {
          cursor.line += 1;
        }

        cursor.index += 1;
      }

      continue;
    }

    if (character === quote) {
      cursor.index += 1;
      break;
    }

    if (character === "\n") {
      cursor.line += 1;
    }

    value += character;
    cursor.index += 1;
  }

  return {
    line: startLine,
    value,
  };
}

function readTemplateLiteral(source, cursor, strings) {
  let segmentLine = cursor.line;
  let value = "";
  cursor.index += 1;

  while (cursor.index < source.length) {
    const character = source[cursor.index];
    const nextCharacter = source[cursor.index + 1];

    if (character === "\\") {
      value += character;
      cursor.index += 1;

      if (cursor.index < source.length) {
        value += source[cursor.index];

        if (source[cursor.index] === "\n") {
          cursor.line += 1;
        }

        cursor.index += 1;
      }

      continue;
    }

    if (character === "`") {
      addStringSegment(strings, segmentLine, value);
      cursor.index += 1;
      return;
    }

    if (character === "$" && nextCharacter === "{") {
      addStringSegment(strings, segmentLine, value);
      value = "";
      cursor.index += 2;
      skipTemplateExpression(source, cursor);
      segmentLine = cursor.line;
      continue;
    }

    if (character === "\n") {
      cursor.line += 1;
    }

    value += character;
    cursor.index += 1;
  }

  addStringSegment(strings, segmentLine, value);
}

function skipTemplateExpression(source, cursor) {
  let braceDepth = 1;

  while (cursor.index < source.length && braceDepth > 0) {
    const character = source[cursor.index];
    const nextCharacter = source[cursor.index + 1];

    if (character === "\n") {
      cursor.line += 1;
      cursor.index += 1;
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      skipLineComment(source, cursor);
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      skipBlockComment(source, cursor);
      continue;
    }

    if (character === "/" && isRegularExpressionStart(source, cursor.index)) {
      skipRegularExpression(source, cursor);
      continue;
    }

    if (character === '"' || character === "'") {
      readQuotedString(source, cursor, character);
      continue;
    }

    if (character === "`") {
      readTemplateLiteral(source, cursor, []);
      continue;
    }

    if (character === "{") {
      braceDepth += 1;
      cursor.index += 1;
      continue;
    }

    if (character === "}") {
      braceDepth -= 1;
      cursor.index += 1;
      continue;
    }

    cursor.index += 1;
  }
}

function isRegularExpressionStart(source, slashIndex) {
  let previousIndex = slashIndex - 1;

  while (previousIndex >= 0 && /\s/.test(source[previousIndex])) {
    previousIndex -= 1;
  }

  if (previousIndex < 0) {
    return true;
  }

  const previousCharacter = source[previousIndex];
  const prefixCharacters = new Set(["(", "=", ":", ",", "!", "&", "|", "?", "{", "[", ";"]);

  if (prefixCharacters.has(previousCharacter)) {
    return true;
  }

  const prefix = source.slice(Math.max(0, previousIndex - 12), previousIndex + 1);
  return /\b(?:return|case|throw|yield|await)$/.test(prefix);
}

function skipRegularExpression(source, cursor) {
  let inCharacterClass = false;
  cursor.index += 1;

  while (cursor.index < source.length) {
    const character = source[cursor.index];

    if (character === "\\") {
      cursor.index += 2;
      continue;
    }

    if (character === "\n") {
      cursor.line += 1;
      cursor.index += 1;
      return;
    }

    if (character === "[") {
      inCharacterClass = true;
      cursor.index += 1;
      continue;
    }

    if (character === "]") {
      inCharacterClass = false;
      cursor.index += 1;
      continue;
    }

    if (character === "/" && !inCharacterClass) {
      cursor.index += 1;

      while (cursor.index < source.length && /[a-z]/i.test(source[cursor.index])) {
        cursor.index += 1;
      }

      return;
    }

    cursor.index += 1;
  }
}

function skipLineComment(source, cursor) {
  cursor.index += 2;

  while (cursor.index < source.length && source[cursor.index] !== "\n") {
    cursor.index += 1;
  }
}

function skipBlockComment(source, cursor) {
  cursor.index += 2;

  while (cursor.index < source.length) {
    if (source[cursor.index] === "\n") {
      cursor.line += 1;
    }

    if (source[cursor.index] === "*" && source[cursor.index + 1] === "/") {
      cursor.index += 2;
      return;
    }

    cursor.index += 1;
  }
}

function addStringSegment(strings, line, value) {
  if (!value) {
    return;
  }

  strings.push({
    line,
    value,
  });
}

function extractHtmlUserFacingStrings(source) {
  const strings = [];

  for (const match of source.matchAll(USER_FACING_HTML_ATTRIBUTE_PATTERN)) {
    strings.push({
      line: getLineNumber(source, match.index),
      value: match[2],
    });
  }

  for (const match of source.matchAll(HTML_TEXT_PATTERN)) {
    const value = match[1].replace(/\s+/g, " ").trim();

    if (!value) {
      continue;
    }

    strings.push({
      line: getLineNumber(source, match.index),
      value,
    });
  }

  return strings;
}

function findTerminologyViolations(strings) {
  return strings.filter(({ value }) => {
    return FORBIDDEN_TERM_PATTERN.test(value) && !isTechnicalIdentifier(value);
  });
}

function isTechnicalIdentifier(value) {
  const normalizedValue = String(value)
    .replace(/\$\{[\s\S]*?\}/g, "value")
    .trim();

  if (!normalizedValue) {
    return true;
  }

  if (normalizedValue === "dataset" || normalizedValue === "datasets") {
    return true;
  }

  return (
    !/\s/.test(normalizedValue) &&
    normalizedValue === normalizedValue.toLowerCase() &&
    /^[a-z0-9_./:#\-[\]{}()]+$/.test(normalizedValue)
  );
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

test("terminology scanner distinguishes UI labels from technical identifiers", () => {
  const source = `
    const id = "analyze-dataset-input";
    const key = "dataset";
    const label = "Dataset list";
    const message = "No datasets were found.";
    const property = "datasetName";
  `;

  const violations = findTerminologyViolations(extractJavaScriptStrings(source));

  assert.deepEqual(
    violations.map(({ value }) => value),
    ["Dataset list", "No datasets were found."]
  );
});

test("terminology scanner separates template text from JavaScript expressions", () => {
  const source = `
    const selector = \`[data-layer-id="\${details.dataset.layerId}"]\`;
    const message = \`No Datasets match \${getProductName(product)}.\`;
  `;

  const violations = findTerminologyViolations(extractJavaScriptStrings(source));

  assert.deepEqual(
    violations.map(({ value }) => value),
    ["No Datasets match "]
  );
});

test("terminology scanner ignores regular expressions containing quote characters", () => {
  const source = [
    `const escaped = value.replace(/[&<>"']/g, "");`,
    `const selector = \`[data-layer-id="\${details.dataset.layerId}"]\`;`,
    `const label = "Dataset list";`,
  ].join("\n");

  const violations = findTerminologyViolations(extractJavaScriptStrings(source));

  assert.deepEqual(
    violations.map(({ value }) => value),
    ["Dataset list"]
  );
});

test("user-facing Product Catalogue sources use Product terminology", async () => {
  const violations = [];

  for (const relativePath of USER_FACING_SOURCE_FILES) {
    const absolutePath = path.join(PRODUCT_CATALOGUE_ROOT, relativePath);
    const source = await readFile(absolutePath, "utf8");
    const strings = relativePath.endsWith(".html")
      ? extractHtmlUserFacingStrings(source)
      : extractJavaScriptStrings(source);

    for (const violation of findTerminologyViolations(strings)) {
      violations.push(`${relativePath}:${violation.line}: ${JSON.stringify(violation.value)}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Use Product/Products in user-facing text. Technical identifiers such as datasetName may remain.\n${violations.join("\n")}`
  );
});
