const MAX_ENTRIES = 256;
const MAX_CENTRAL_BYTES = 256 * 1024;
const MAX_DECLARED_BYTES = 64 * 1024 * 1024;
const MAX_RATIO = 300;
export const DOCUMENT_PART = "word/document.xml";
export const TYPES_PART = "[Content_Types].xml";
export const RELATIONSHIPS_PART = "_rels/.rels";
const partLimits = new Map([
  [DOCUMENT_PART, 2 * 1024 * 1024],
  [TYPES_PART, 64 * 1024],
  [RELATIONSHIPS_PART, 64 * 1024],
]);

function invalid() {
  return new Error("Unsupported report archive.");
}

// Check the on-disk metadata before handing untrusted offsets to zip.js. This
// viewer supports single-disk classic ZIP, with STORE or DEFLATE entries only.
export function inspectReportZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset) => view.getUint16(offset, true);
  const u32 = (offset) => view.getUint32(offset, true);
  if (bytes.length < 22 || u32(0) !== 0x04034b50) throw invalid();

  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 22 - 65535); end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 22 - 65535)) throw invalid();
  const count = u16(end + 10);
  const centralSize = u32(end + 12);
  const centralStart = u32(end + 16);
  if (
    u16(end + 4) !== 0 ||
    u16(end + 6) !== 0 ||
    u16(end + 8) !== count ||
    !count ||
    count > MAX_ENTRIES ||
    centralSize > MAX_CENTRAL_BYTES ||
    centralStart + centralSize !== end
  ) {
    throw invalid();
  }

  const entries = new Map();
  const names = new Set();
  const ranges = [];
  let selectedCount = 0;
  let cursor = centralStart;
  let declaredBytes = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw invalid();
    const flags = u16(cursor + 8);
    const method = u16(cursor + 10);
    const crc = u32(cursor + 16);
    const compressed = u32(cursor + 20);
    const size = u32(cursor + 24);
    const nameSize = u16(cursor + 28);
    const nameStart = cursor + 46;
    const disk = u16(cursor + 34);
    const local = u32(cursor + 42);
    const extraStart = nameStart + nameSize;
    const extraSize = u16(cursor + 30);
    cursor = extraStart + extraSize + u16(cursor + 32);
    declaredBytes += size;
    if (
      cursor > end ||
      nameSize < 1 ||
      nameSize > 256 ||
      disk !== 0 ||
      (flags & ~0x080e) !== 0 ||
      ![0, 8].includes(method) ||
      (method === 0 && compressed !== size) ||
      size > Math.max(64 * 1024, compressed * MAX_RATIO) ||
      declaredBytes > MAX_DECLARED_BYTES ||
      local + 30 > centralStart ||
      u32(local) !== 0x04034b50 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method ||
      u16(local + 26) !== nameSize
    ) {
      throw invalid();
    }

    const rawName = bytes.subarray(nameStart, nameStart + nameSize);
    const name = String.fromCharCode(...rawName);
    const key = name.replace(/\/$/, "").toLowerCase();
    if (
      !/^[\x21-\x7e]+$/.test(name) ||
      /[%:\\?#]/.test(name) ||
      key.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
      names.has(key) ||
      !rawName.every((byte, index) => byte === bytes[local + 30 + index])
    ) {
      throw invalid();
    }
    names.add(key);

    const localExtraStart = local + 30 + nameSize;
    const localExtraSize = u16(local + 28);
    let dataEnd = localExtraStart + localExtraSize + compressed;
    if (dataEnd > centralStart) throw invalid();
    checkExtraFields(extraStart, extraSize);
    checkExtraFields(localExtraStart, localExtraSize);
    if (flags & 8) {
      if (dataEnd + 4 <= centralStart && u32(dataEnd) === 0x08074b50) dataEnd += 4;
      if (
        dataEnd + 12 > centralStart ||
        u32(dataEnd) !== crc ||
        u32(dataEnd + 4) !== compressed ||
        u32(dataEnd + 8) !== size
      ) {
        throw invalid();
      }
      dataEnd += 12;
    } else if (
      u32(local + 14) !== crc ||
      u32(local + 18) !== compressed ||
      u32(local + 22) !== size
    ) {
      throw invalid();
    }
    ranges.push([local, dataEnd]);
    if (partLimits.has(name)) {
      if (!size || size > partLimits.get(name)) throw invalid();
      selectedCount++;
    }
    entries.set(name, { size, compressed });
  }
  ranges.sort(([left], [right]) => left - right);
  if (
    cursor !== end ||
    selectedCount !== partLimits.size ||
    ranges.some(([start], index) => index > 0 && start < ranges[index - 1][1])
  ) {
    throw invalid();
  }
  return entries;

  function checkExtraFields(start, length) {
    const limit = start + length;
    let offset = start;
    while (offset < limit) {
      if (offset + 4 > limit) throw invalid();
      // Reject extras that can override classic sizes, names or encryption metadata.
      if ([0x0001, 0x7075, 0x9901].includes(u16(offset))) throw invalid();
      offset += 4 + u16(offset + 2);
    }
    if (offset !== limit) throw invalid();
  }
}

export async function readReportZipPart(entry, metadata, signal) {
  signal?.throwIfAborted();
  if (
    !entry ||
    entry.directory ||
    entry.encrypted ||
    entry.uncompressedSize !== metadata.size ||
    entry.compressedSize !== metadata.compressed
  ) {
    throw invalid();
  }

  // A fixed buffer and the write-time count protect against false ZIP sizes.
  // Only selected parts reach the decoder, and no worker outlives this call.
  const bytes = new Uint8Array(metadata.size);
  let offset = 0;
  const writer = new WritableStream({
    write(chunk) {
      signal?.throwIfAborted();
      if (offset + chunk.byteLength > bytes.length) throw invalid();
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    },
  });
  await entry.getData(writer, { signal, checkSignature: true, useWebWorkers: false });
  signal?.throwIfAborted();
  if (offset !== bytes.length) throw invalid();
  return bytes;
}
