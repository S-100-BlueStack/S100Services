import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";

import {
  DOCUMENT_PART,
  inspectReportZip,
  readReportZipPart,
  RELATIONSHIPS_PART,
  TYPES_PART,
} from "./reportZip.js";
import { checkReportPackage, extractReportBody, parseReportXml } from "./reportXml.js";
import { createIcEncReportPresentation } from "./icEncReportPresentation.js";

export async function readIcEncReportDocument(bytes, { signal } = {}) {
  signal?.throwIfAborted();
  const metadata = inspectReportZip(bytes);
  const archive = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const selected = new Map();
    const names = metadata.keys();
    for await (const entry of archive.getEntriesGenerator()) {
      signal?.throwIfAborted();
      if (entry.filename !== names.next().value) throw new Error("Unexpected archive entry.");
      if ([TYPES_PART, RELATIONSHIPS_PART, DOCUMENT_PART].includes(entry.filename)) {
        selected.set(entry.filename, entry);
      }
    }
    if (!names.next().done) throw new Error("Incomplete report archive.");

    async function readXml(name) {
      const part = await readReportZipPart(selected.get(name), metadata.get(name), signal);
      return parseReportXml(part);
    }
    checkReportPackage(await readXml(TYPES_PART), await readXml(RELATIONSHIPS_PART));
    const content = extractReportBody(await readXml(DOCUMENT_PART));
    signal?.throwIfAborted();
    return createIcEncReportPresentation(content);
  } finally {
    await archive.close();
  }
}
