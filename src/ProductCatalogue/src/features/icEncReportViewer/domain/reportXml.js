import { DOCUMENT_PART } from "./reportZip.js";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const STRICT_WORD = "http://purl.oclc.org/ooxml/wordprocessingml/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const MAIN_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const MAIN_REL = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
]);
const TEXTBOX_NAMESPACES = new Set([
  WORD,
  STRICT_WORD,
  "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  "urn:schemas-microsoft-com:vml",
]);
const MAX_DEPTH = 64;
const MAX_NODES = 40000;
const MAX_TEXT = 650000;
const MAX_BLOCKS = 6000;
const bodyWrappers = new Set(["sdt", "sdtContent", "customXml", "ins", "moveTo"]);
const inlineWrappers = new Set(["r", "hyperlink", "smartTag", "dir", "bdo", "fldSimple"]);
const metadataNodes = new Set([
  "pPr",
  "rPr",
  "tblPr",
  "tblGrid",
  "trPr",
  "tcPr",
  "sdtPr",
  "sdtEndPr",
  "customXmlPr",
  "sectPr",
  "bookmarkStart",
  "bookmarkEnd",
  "proofErr",
  "permStart",
  "permEnd",
  "lastRenderedPageBreak",
  "fldChar",
  "instrText",
  "delInstrText",
  "commentRangeStart",
  "commentRangeEnd",
]);
const inactiveNodes = new Set(["del", "delText", "moveFrom"]);
const drawingNodes = new Set(["drawing", "pict"]);

function invalidXml() {
  return new Error("Unsupported report XML.");
}

export function parseReportXml(bytes) {
  // Only UTF-8 is accepted. Rule out other encodings and declarations before
  // passing any report string to the native XML parser.
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const encoding = /^<\?xml\s[^?]*\bencoding\s*=\s*(['"])([^'"]+)\1/i.exec(xml)?.[2];
  if (
    (encoding && !/^utf-8$/i.test(encoding)) ||
    xml.includes("\0") ||
    /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)
  ) {
    throw invalidXml();
  }

  let markup = 0;
  for (let index = xml.indexOf("<"); index !== -1; index = xml.indexOf("<", index + 1)) {
    if (++markup > MAX_NODES) throw invalidXml();
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document.documentElement || document.getElementsByTagNameNS("*", "parsererror").length)
    throw invalidXml();

  let count = 0;
  function checkTree(node, depth) {
    count += 1 + (node.attributes?.length ?? 0);
    if (count > MAX_NODES || depth > MAX_DEPTH) throw invalidXml();
    for (let child = node.firstChild; child; child = child.nextSibling) checkTree(child, depth + 1);
  }
  checkTree(document, 0);
  return document.documentElement;
}

function isElement(node, namespace, name) {
  return node.namespaceURI === namespace && node.localName === name;
}

export function checkReportPackage(types, relationships) {
  if (!isElement(types, TYPES, "Types") || !isElement(relationships, REL, "Relationships"))
    throw invalidXml();
  const overrides = [...types.children].filter(
    (child) =>
      isElement(child, TYPES, "Override") &&
      child.getAttribute("PartName")?.toLowerCase() === `/${DOCUMENT_PART}`
  );
  const main = [...relationships.children].filter(
    (child) => isElement(child, REL, "Relationship") && MAIN_REL.has(child.getAttribute("Type"))
  );
  if (
    overrides.length !== 1 ||
    overrides[0].getAttribute("PartName") !== `/${DOCUMENT_PART}` ||
    overrides[0].getAttribute("ContentType") !== MAIN_TYPE ||
    main.length !== 1 ||
    ![DOCUMENT_PART, `/${DOCUMENT_PART}`].includes(main[0].getAttribute("Target")) ||
    (main[0].hasAttribute("TargetMode") && main[0].getAttribute("TargetMode") !== "Internal")
  ) {
    throw invalidXml();
  }
}

function selectAlternate(node) {
  for (const child of node.children) {
    if (!isElement(child, MC, "Choice")) continue;
    const requires = child.getAttribute("Requires")?.trim();
    if (
      requires &&
      requires
        .split(/\s+/)
        .every((prefix) => TEXTBOX_NAMESPACES.has(child.lookupNamespaceURI(prefix)))
    ) {
      return child;
    }
  }
  return [...node.children].find((child) => isElement(child, MC, "Fallback"));
}

export function extractReportBody(root) {
  const ns = root.namespaceURI;
  const word = (node, name) => isElement(node, ns, name);
  if (![WORD, STRICT_WORD].includes(ns) || !word(root, "document")) throw invalidXml();
  const bodies = [...root.children].filter((child) => word(child, "body"));
  if (bodies.length !== 1) throw invalidXml();

  // Header and footer Parts may contain document notices as well as page fields.
  // Keep the preview within the main Part and disclose their omission.
  let partial =
    root.getElementsByTagNameNS(ns, "headerReference").length > 0 ||
    root.getElementsByTagNameNS(ns, "footerReference").length > 0;
  let textSize = 0;
  let blockCount = 0;
  const countBlock = () => {
    if (++blockCount > MAX_BLOCKS) throw invalidXml();
  };
  function* children(node, wrappers = bodyWrappers) {
    for (const child of node.children) {
      if (isElement(child, MC, "AlternateContent")) {
        const branch = selectAlternate(child);
        if (branch) yield* children(branch, wrappers);
        else partial = true;
      } else if (child.namespaceURI === ns && wrappers.has(child.localName)) {
        yield* children(child, wrappers);
      } else if (
        child.namespaceURI !== ns ||
        (!inactiveNodes.has(child.localName) && !metadataNodes.has(child.localName))
      ) {
        yield child;
      }
    }
  }

  function blocks(parent) {
    const contents = [];
    for (const child of children(parent)) {
      if (word(child, "p")) contents.push(...paragraph(child));
      else if (word(child, "tbl")) contents.push(table(child));
      else partial = true;
    }
    return contents;
  }

  function table(node) {
    countBlock();
    const rows = [];
    for (const row of children(node)) {
      if (!word(row, "tr")) {
        partial = true;
        continue;
      }
      countBlock();
      const cells = [];
      for (const cell of children(row)) {
        if (word(cell, "tc")) {
          countBlock();
          cells.push(blocks(cell));
        } else partial = true;
      }
      rows.push(cells);
    }
    return { type: "table", rows };
  }

  function paragraph(node) {
    const result = [];
    let runs = [];
    function flush() {
      if (!runs.length) return;
      countBlock();
      result.push({ type: "paragraph", text: runs.join("") });
      runs = [];
    }
    function append(text) {
      textSize += text.length;
      if (textSize > MAX_TEXT) throw invalidXml();
      runs.push(text);
    }
    function visit(parent) {
      for (const child of children(parent)) {
        if (word(child, "t")) {
          if (child.childElementCount) partial = true;
          else append(child.textContent);
        } else if (word(child, "tab") || word(child, "ptab")) append("\t");
        else if (word(child, "br") || word(child, "cr")) append("\n");
        else if (word(child, "noBreakHyphen")) append("\u2011");
        else if (word(child, "softHyphen")) append("\u00ad");
        else if (child.namespaceURI === ns && inlineWrappers.has(child.localName)) visit(child);
        else if (child.namespaceURI === ns && drawingNodes.has(child.localName)) {
          readDrawing(child);
        } else partial = true;
      }
    }
    function readDrawing(node) {
      let foundTextbox = false;
      function findBox(parent) {
        for (const child of children(parent)) {
          if (word(child, "txbxContent")) {
            foundTextbox = true;
            flush();
            result.push(...blocks(child));
          } else if (TEXTBOX_NAMESPACES.has(child.namespaceURI)) findBox(child);
          else partial = true;
        }
      }
      findBox(node);
      if (!foundTextbox) partial = true;
    }
    visit(node);
    // Word may anchor the explanatory box before its own heading. Put this
    // specific standalone heading above the note, preserving other block order.
    if (result.length && /^\s*acceptable errors:\s*$/i.test(runs.join(""))) {
      flush();
      result.unshift(result.pop());
    } else flush();
    return result;
  }

  const content = blocks(bodies[0]);
  if (!textSize || !hasReadableText(content)) throw invalidXml();
  return { blocks: content, partial };
}

function hasReadableText(blocks) {
  return blocks.some((block) =>
    block.type === "paragraph"
      ? block.text.trim()
      : block.rows.some((row) => row.some(hasReadableText))
  );
}
