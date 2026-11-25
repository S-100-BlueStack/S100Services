import { getValidationViewerArtifact } from "../domain/validationViewerArtifact.js";

export const MAX_VALIDATION_REPORT_BYTES = 16 * 1024 * 1024;

export async function fetchValidationReportBytes(artifact, { signal, request = fetch, maxBytes = MAX_VALIDATION_REPORT_BYTES } = {}) {
  const verified = getValidationViewerArtifact(artifact, artifact?.datasetName);
  if (!verified) throw new Error("The validation file could not be verified.");
  signal?.throwIfAborted();
  const response = await request(verified.url, {
    credentials: "include",
    redirect: "error",
    signal,
    headers: { Accept: "application/xml, text/xml, text/plain, application/octet-stream" },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`Validation file could not be loaded (HTTP ${response.status}).`);
  }
  const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType && !["application/xml", "text/xml", "text/plain", "application/octet-stream"].includes(mediaType)) {
    await response.body?.cancel();
    throw new Error("The server did not return a supported validation file.");
  }
  const tooLarge = () => new Error("The file is too large to preview. Download the original file instead.");
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  // Bound the decoded transfer even when the server omits Content-Length or
  // sends compressed content. Never build an unbounded DOM from a report.
  if (!response.body) throw new Error("The validation file was empty.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
    signal?.throwIfAborted();
  } finally {
    reader.releaseLock();
  }
  if (!length) throw new Error("The validation file was empty.");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
