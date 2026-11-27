const metadataLabels = [
  "Cell name",
  "Edition number",
  "CRC",
  "Date received",
  "Date validated",
  "Service level",
  "Validated by",
];
const labels = new Map(metadataLabels.map((label) => [label.toLowerCase(), label]));
const headings =
  /^(?:validation conclusion|validation comments|acceptable errors|validation software error messages?):?$/i;
const labelAndValue =
  /^(cell name|edition number|crc|date received|date validated|service level|validated by)\s*[-–:]\s*(.+)$/i;

function singleLine(blocks) {
  if (
    !blocks.every((block) => block.type === "paragraph") ||
    blocks.filter((block) => block.text.trim()).length !== 1
  ) {
    return "";
  }
  return blocks.find((block) => block.text.trim()).text.trim();
}

export function createIcEncReportPresentation({ blocks, partial }) {
  const values = new Map();
  let beforeSections = true;

  function record(label, value) {
    if (!value || /\n/.test(value) || value.length > 250) return;
    if (values.has(label) && values.get(label) !== value) values.set(label, null);
    else values.set(label, value);
  }

  function annotate(entries) {
    return entries.map((block) => {
      if (block.type === "table") {
        if (beforeSections) readTableFields(block.rows);
        return { ...block, rows: block.rows.map((row) => row.map(annotate)) };
      }

      const text = block.text.trim();
      if (headings.test(text)) {
        beforeSections = false;
        return { ...block, type: "heading" };
      }
      if (beforeSections) {
        const match = labelAndValue.exec(text);
        if (match) record(labels.get(match[1].toLowerCase()), match[2]);
      }
      return block;
    });
  }

  function readTableFields(rows) {
    for (const [index, row] of rows.entries()) {
      const [labelCell, valueCell] = row;
      if (!labelCell) continue;
      const label = labels.get(
        singleLine(labelCell)
          .replace(/\s*[:–-]$/, "")
          .toLowerCase()
      );
      if (!label) continue;
      if (row.length === 2) record(label, singleLine(valueCell));
      const next = rows[index + 1];
      if (row.length !== 1 || next?.length !== 1) continue;
      if (label === "Service level") {
        const value = singleLine(next[0]);
        if (/^(?:full|reduced)$/i.test(value)) record(label, value);
      } else if (label === "Validated by") {
        for (const block of next[0]) {
          const name = block.type === "paragraph" && /^\s*Name\s*[-–:]\s*(.+)$/i.exec(block.text);
          if (name) record(label, name[1].trim());
        }
      }
    }
  }

  const content = annotate(blocks);
  return {
    blocks: content,
    metadata: metadataLabels.flatMap((label) => {
      const value = values.get(label);
      return value ? [{ label, value }] : [];
    }),
    partial,
  };
}
