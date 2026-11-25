export const VALIDATION_SEVERITIES = ["Critical", "Error", "Warning"];
const severityNames = new Map(VALIDATION_SEVERITIES.map((name) => [name.toLowerCase(), name]));

export function decodeValidationReport(bytes) {
  // Analyzer declares UTF-8 even in reports describing invalid UTF-8 input.
  // Replacement decoding is explicit; it must never change the download.
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encodingWarning: false,
    };
  } catch {
    return { text: new TextDecoder("utf-8").decode(bytes), encodingWarning: true };
  }
}

function children(node, name) {
  return Array.from(node?.children ?? []).filter((child) => child.tagName === name);
}

function text(node, name) {
  return children(node, name)[0]?.textContent?.trim() ?? "";
}

function readable(value) {
  // Only remove the formatting tags observed in Analyzer's CDATA. All report
  // strings are rendered with textContent, never interpreted as HTML.
  return value.replace(/<\/?(?:b|i|u|strong|em)>/gi, "").replace(/<br\s*\/?>/gi, "\n");
}

function safeCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid finding count.");
  return count;
}

function readTotals(value) {
  const totals = { Critical: 0, Error: 0, Warning: 0 };
  if (value === "No Errors") return totals;
  const seen = new Set();
  for (const part of value.split(/,\s*/)) {
    const match = part.match(/^(Critical|Error|Warning) (\d+)$/);
    if (!match || seen.has(match[1])) throw new Error("Unsupported SevenCs summary format.");
    seen.add(match[1]);
    totals[match[1]] = safeCount(match[2]);
  }
  return totals;
}

function checkTotals(expected, actual) {
  if (VALIDATION_SEVERITIES.some((severity) => expected[severity] !== actual[severity])) {
    throw new Error("The reported totals do not match the finding groups.");
  }
}

function readObject(node) {
  return {
    cellName: text(node, "Cellname"),
    name: text(node, "S57ClassDescription") || text(node, "S57ClassToken"),
    classToken: text(node, "S57ClassToken"),
    type: text(children(node, "EncObject")[0], "EncObjType"),
    id: text(children(node, "EncObject")[0], "EncObjId"),
    latitude: text(node, "PosLat"),
    longitude: text(node, "PosLon"),
  };
}

function readOccurrence(entry) {
  const severity = severityNames.get(entry.getAttribute("Severity")?.toLowerCase());
  if (!severity) throw new Error("Unsupported finding severity.");
  const occurrence = {
    severity,
    category: text(entry, "Category"),
    message: readable(text(entry, "Message")),
    solution: readable(text(entry, "SuggestedSolution")),
    references: children(entry, "Reference").map((reference) =>
      readable(reference.textContent.trim())
    ),
    objects: children(entry, "ObjName").map(readObject),
    relatedObjects: children(entry, "RelatedObject").flatMap((related) =>
      children(related, "ObjName").map(readObject)
    ),
  };
  occurrence.searchText = [
    occurrence.category,
    occurrence.message,
    occurrence.solution,
    ...occurrence.references,
    ...[...occurrence.objects, ...occurrence.relatedObjects].flatMap((object) =>
      Object.values(object)
    ),
  ]
    .join(" ")
    .toLowerCase();
  return occurrence;
}

function readCheck(group, section, index) {
  const title = group.getAttribute("Title") ?? "";
  const match = title.match(/^(.+?)\s+:\s+(Critical|Error|Warning) (\d+)(?: \((\d+) shown\))?$/);
  if (!match || children(group, "LogGroup").length)
    throw new Error("Unsupported SevenCs finding group.");
  const [, name, severity, count, shown] = match;
  const reportedCount = safeCount(count);
  const shownCount = safeCount(shown ?? count);
  const occurrences = children(group, "LogEntry").map(readOccurrence);
  if (
    shownCount > reportedCount ||
    occurrences.length !== shownCount ||
    occurrences.some((entry) => entry.severity !== severity)
  ) {
    throw new Error("A finding group does not match its reported count or severity.");
  }
  return {
    id: `check-${index}`,
    name,
    section,
    severity,
    reportedCount,
    occurrences,
    categories: [...new Set(occurrences.map((entry) => entry.category).filter(Boolean))],
    references: [...new Set(occurrences.flatMap((entry) => entry.references))],
  };
}

function readInformation(group) {
  const entries = children(group, "LogEntry");
  if (entries.some((entry) => entry.getAttribute("Severity") !== "information")) {
    throw new Error("Unexpected findings in report metadata.");
  }
  return entries.map((entry) => text(entry, "Message"));
}

function getInfo(entries, label) {
  return entries.find((entry) => entry.startsWith(`${label}: `))?.slice(label.length + 2) ?? "";
}

export function parseSevenCsValidationReport(
  raw,
  { parser = new DOMParser(), expectedDatasetName } = {}
) {
  // Disallow DTDs/entities; the viewer needs only the observed plain XML format.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw))
    throw new Error("XML document type declarations are not supported.");
  const encoding = raw.match(/^\s*<\?xml[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding))
    throw new Error("Unsupported XML character encoding.");
  const document = parser.parseFromString(raw, "application/xml");
  const root = document.documentElement;
  if (
    document.getElementsByTagName("parsererror").length ||
    root?.tagName !== "LogDocument" ||
    root.getAttribute("Toolname") !== "7Cs Analyzer"
  ) {
    throw new Error("The file is not a readable SevenCs Analyzer XML report.");
  }
  const groups = children(root, "LogGroup");
  const parameters = groups.find(
    (group) => group.getAttribute("Title") === "Validation Parameters"
  );
  const metadata = groups.find((group) => group.getAttribute("Title") === "Dataset Metadata");
  const validationParameters = readInformation(parameters);
  const datasetMetadata = readInformation(metadata);
  const datasetFile = getInfo(datasetMetadata, "Dataset File Identifier");
  const datasetName = datasetFile.replace(/\.\d{3}$/, "");
  if (
    expectedDatasetName &&
    datasetName &&
    datasetName.toUpperCase() !== expectedDatasetName.toUpperCase()
  ) {
    throw new Error("The report identifies a different Product than the selected artifact.");
  }
  const sections = groups.filter((group) =>
    /^(?:Dataset Entries|Feature and Geometry Entries)\s+:\s+/.test(
      group.getAttribute("Title") ?? ""
    )
  );
  const summary = groups.find((group) => {
    const title = group.getAttribute("Title") ?? "";
    return datasetName && title.startsWith(`${datasetName} : `);
  });
  if (!parameters || !metadata || !summary || sections.length !== 2)
    throw new Error("Unsupported SevenCs report structure.");
  const totals = readTotals(summary.getAttribute("Title").slice(datasetName.length + 3));
  const checks = [];
  const aggregate = { Critical: 0, Error: 0, Warning: 0 };
  for (const section of sections) {
    const [sectionName, sectionSummary] = section.getAttribute("Title").split(/\s+:\s+/, 2);
    if (children(section, "LogEntry").length) throw new Error("Unsupported ungrouped findings.");
    const sectionTotals = { Critical: 0, Error: 0, Warning: 0 };
    for (const group of children(section, "LogGroup")) {
      const check = readCheck(group, sectionName, checks.length);
      checks.push(check);
      sectionTotals[check.severity] += check.reportedCount;
      aggregate[check.severity] += check.reportedCount;
    }
    checkTotals(readTotals(sectionSummary), sectionTotals);
  }
  checkTotals(totals, aggregate);
  const actualEntries = Array.from(root.getElementsByTagName("LogEntry"));
  const shownCount = checks.reduce((count, check) => count + check.occurrences.length, 0);
  // Detect unknown nested sections instead of silently omitting their findings.
  if (
    actualEntries.filter((entry) => entry.getAttribute("Severity") !== "information").length !==
    shownCount
  ) {
    throw new Error("The report contains unsupported finding entries.");
  }
  return {
    datasetName,
    datasetFile,
    tool:
      groups
        .find((group) => group.getAttribute("Title")?.startsWith("7Cs Analyzer"))
        ?.getAttribute("Title") ?? "7Cs Analyzer",
    validationStart: getInfo(validationParameters, "Validation Start"),
    validationParameters,
    datasetMetadata,
    totals,
    checks,
    shownCount,
    reportedCount: Object.values(totals).reduce((sum, count) => sum + count, 0),
  };
}

export function selectValidationChecks(report, severity, query) {
  const term = query.trim().toLowerCase();
  return report.checks
    .flatMap((check) => {
      if (
        severity === "failures"
          ? check.severity === "Warning"
          : severity !== "all" && check.severity !== severity
      )
        return [];
      const groupMatches =
        !term || [check.name, check.section, check.severity].join(" ").toLowerCase().includes(term);
      const occurrences = groupMatches
        ? check.occurrences
        : check.occurrences.filter((entry) => entry.searchText.includes(term));
      return groupMatches || occurrences.length ? [{ check, occurrences }] : [];
    })
    .sort(
      (a, b) =>
        VALIDATION_SEVERITIES.indexOf(a.check.severity) -
          VALIDATION_SEVERITIES.indexOf(b.check.severity) ||
        b.check.reportedCount - a.check.reportedCount
    );
}
