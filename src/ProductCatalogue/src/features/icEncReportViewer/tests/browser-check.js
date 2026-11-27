import { ZipWriter, TextReader, Uint8ArrayWriter } from "@zip.js/zip.js";
import { buildUrl } from "../../../shared/api/apiClient.js";
import { readIcEncReportDocument } from "../domain/icEncReportDocument.js";
import { checkReportPackage, extractReportBody, parseReportXml } from "../domain/reportXml.js";
import { appendIcEncReportViewerAction } from "../ui/icEncReportViewerAction.js";
import { openIcEncReportViewer } from "../ui/icEncReportViewer.js";

const results = document.getElementById("results");
const encode = (value) => new TextEncoder().encode(value);
const xml = (value) => parseReportXml(encode(value));
const fixture = async (name) =>
  new Uint8Array(await (await fetch(new URL(`./fixtures/${name}`, import.meta.url))).arrayBuffer());
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const mc = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const wrap = (body) =>
  `<w:document xmlns:w="${word}" xmlns:mc="${mc}" xmlns:u="urn:unknown"><w:body>${body}</w:body></w:document>`;
const types = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rejects(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

function textOf(blocks) {
  return blocks
    .map((block) =>
      block.type === "table"
        ? block.rows.map((row) => row.map(textOf).join("\t")).join("\n")
        : block.text
    )
    .join("\n");
}

async function waitFor(predicate, message) {
  for (let index = 0; index < 120; index++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function checkFixtures() {
  const real = await readIcEncReportDocument(await fixture("synthetic-real-layout.DOC"));
  const report = textOf(real.blocks);
  for (const token of [
    "SAMPLE57.000",
    "41",
    "A1B2C3D4",
    "10 Nov 2026",
    "11 Nov 2026",
    "Full",
    "Example Validator",
    "validator@example.invalid",
    "ERROR LG0002",
    "Related Object: FE0000000003",
    "S57 Reference",
    "Additional notes",
    "<empty>",
    "</Message>",
    "</Reference>",
    "§ and °",
  ]) {
    assert(report.includes(token), `Missing source text: ${token}`);
  }
  assert(real.metadata.length === 7, "Expected table metadata");
  assert(real.partial, "Omitted header and footer content was not disclosed");
  assert(report.match(/LG0001/g)?.length === 2, "Legitimate repeated warning changed");
  assert(report.match(/The following example data issues/g)?.length === 1, "Duplicate textbox");
  assert(
    report.indexOf("Acceptable errors:") < report.indexOf("The following example data issues"),
    "Textbox does not follow its heading"
  );
  const simulated = await readIcEncReportDocument(await fixture("synthetic-simulation.DOC"));
  assert(!simulated.partial, "The simple main body should be fully readable");
  const original = textOf(simulated.blocks);
  assert(original.startsWith("SIMULATION - not an IC-ENC decision"), "Disclaimer lost");
  assert(original.includes("SIMULATION: This example"), "Original comment lost");
}

async function checkXml() {
  const unusual = extractReportBody(
    xml(
      wrap(
        '<w:p><w:r><w:t>New forma</w:t><w:t>t</w:t><w:br/><w:tab/><w:t>A &lt;b&gt;</w:t></w:r><w:del><w:r><w:t>Hidden</w:t></w:r></w:del><mc:AlternateContent><mc:Choice Requires="u"><w:r><w:t>Unsupported</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t> fallback</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>'
      )
    )
  );
  assert(
    textOf(unusual.blocks) === "New format\n\tA <b> fallback",
    "Run or branch extraction changed"
  );
  const partial = extractReportBody(
    xml(wrap("<w:p><w:r><w:t>Readable</w:t><w:object/></w:r></w:p><w:altChunk/>"))
  );
  assert(
    partial.partial && textOf(partial.blocks) === "Readable",
    "Partial preview was not disclosed"
  );
  await rejects(() => xml("<unclosed>"), "Malformed XML accepted");
  await rejects(() => xml("<!DOCTYPE a [<!ENTITY e 'value'>]><a>&e;</a>"), "DTD accepted");
  await rejects(() => extractReportBody(xml(wrap("<w:p/>"))), "Empty document accepted");
  await rejects(() => extractReportBody(xml("<html/>")), "Foreign document accepted");
  await rejects(
    () =>
      checkReportPackage(
        xml(types),
        xml(rels.replace('Target="', 'TargetMode="External" Target="'))
      ),
    "External main target accepted"
  );
}

async function checkPackageFailures() {
  async function packed(parts) {
    const archive = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, zip64: false });
    for (const [name, value] of parts) {
      await archive.add(name, new TextReader(value), {
        useWebWorkers: false,
        zip64: false,
        extendedTimestamp: false,
      });
    }
    return archive.close();
  }
  const document = wrap("<w:p><w:r><w:t>Synthetic text</w:t></w:r></w:p>");
  const entries = [
    ["[Content_Types].xml", types],
    ["_rels/.rels", rels],
    ["word/document.xml", document],
  ];
  const small = await packed(entries);
  assert(
    textOf((await readIcEncReportDocument(small)).blocks) === "Synthetic text",
    "Writer fixture failed"
  );
  for (const changed of [
    entries.slice(1),
    [["[Content_Types].xml", types.replace("document.main", "template.main")], ...entries.slice(1)],
    [...entries.slice(0, 2), ["word/document.xml", "<invalid>"]],
  ]) {
    const bytes = await packed(changed);
    await rejects(() => readIcEncReportDocument(bytes), "Invalid report package accepted");
  }

  // Use a classic synthetic archive with known size fields. Corrupt the last
  // central and local declared sizes while keeping the actual deflate bytes.
  const real = (await fixture("synthetic-simulation.DOC")).slice();
  const view = new DataView(real.buffer);
  let entry = view.getUint32(real.length - 6, true);
  for (let index = 0; index < 2; index++) {
    entry +=
      46 +
      view.getUint16(entry + 28, true) +
      view.getUint16(entry + 30, true) +
      view.getUint16(entry + 32, true);
  }
  const local = view.getUint32(entry + 42, true);
  view.setUint32(entry + 24, 10, true);
  view.setUint32(local + 22, 10, true);
  await rejects(() => readIcEncReportDocument(real), "False ZIP output size accepted");
}

async function checkDialog() {
  const id = "11111111-1111-1111-1111-111111111111";
  const url = buildUrl(`electronicproducts/SAMPLE57/artifacts/${id}`);
  const artifact = {
    id,
    kind: "IcEncReport",
    datasetName: "SAMPLE57",
    fileName: "report.docx",
    url,
    originalReportUrl: url,
  };
  const wrapper = document.createElement("div");
  document.body.appendChild(wrapper);
  const bytes = await fixture("synthetic-real-layout.DOC");
  let requests = 0;
  appendIcEncReportViewerAction(wrapper, artifact, artifact.datasetName, url, {
    open: (verified, trigger) =>
      openIcEncReportViewer(verified, trigger, {
        async loadBytes() {
          requests++;
          return bytes;
        },
      }),
  });
  try {
    const trigger = wrapper.querySelector("button");
    assert(trigger, "Report viewer action was not created");
    assert(requests === 0, "Preview bytes requested eagerly");
    trigger.focus();
    trigger.click();
    trigger.click();
    const modal = document.querySelector("dialog[open]");
    assert(modal.querySelector("a").getAttribute("href") === url, "Original download changed");
    assert(document.activeElement.textContent === "Close", "Initial focus was not set");
    await waitFor(() => modal.querySelector("table"), "Structured content did not appear");
    assert(requests === 1, "Duplicate artifact request");
    assert(
      modal.textContent.includes("<empty>") && !modal.querySelector("empty"),
      "Content became markup"
    );
    modal.querySelector("button").click();
    assert(document.activeElement === trigger, "Original action did not regain focus");

    openIcEncReportViewer(artifact, trigger, { loadBytes: async () => new Uint8Array([1, 2]) });
    const fallback = document.querySelector("dialog[open]");
    await waitFor(
      () => fallback.textContent.includes("Preview unavailable"),
      "Fallback was missing"
    );
    assert(
      fallback.querySelector("a").getAttribute("href") === url,
      "Fallback download was missing"
    );
    fallback.querySelector("button").click();
  } finally {
    document.querySelector("dialog[open] button")?.click();
    wrapper.remove();
  }
}

const checks = [
  ["Both supplied fixtures and metadata", checkFixtures],
  ["Native XML contracts", checkXml],
  ["Pinned ZIP package failures", checkPackageFailures],
  ["Native dialog, text safety and download fallback", checkDialog],
];

let failures = 0;
results.textContent = "";
for (const [name, check] of checks) {
  try {
    await check();
    results.textContent += `PASS ${name}\n`;
  } catch (error) {
    failures++;
    results.textContent += `FAIL ${name}: ${error.message}\n`;
  }
}
results.dataset.result = failures ? "failed" : "passed";
