import { getIcEncReportArtifact } from "../domain/icEncReportArtifact.js";

export const MAX_REPORT_BYTES = 16 * 1024 * 1024;

export async function fetchIcEncReportBytes(
  artifact,
  { signal, request = fetch, maxBytes = MAX_REPORT_BYTES } = {}
) {
  const verified = getIcEncReportArtifact(artifact, artifact?.datasetName, artifact?.url);
  if (!verified) throw new Error("Unverified report download.");
  signal?.throwIfAborted();
  const response = await request(verified.url, {
    credentials: "include",
    redirect: "error",
    signal,
    headers: { Accept: "*/*" },
  });
  if (
    response.status !== 200 ||
    response.redirected ||
    !response.body ||
    Number(response.headers.get("content-length")) > maxBytes
  ) {
    await response.body?.cancel();
    throw new Error("Report response is unavailable or too large.");
  }

  const reader = response.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  let bytes = new Uint8Array(Math.min(maxBytes, 64 * 1024));
  let length = 0;
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      const nextLength = length + value.byteLength;
      if (nextLength > maxBytes) throw new Error("Report response is too large.");
      if (nextLength > bytes.length) {
        const expanded = new Uint8Array(Math.min(maxBytes, Math.max(nextLength, bytes.length * 2)));
        expanded.set(bytes);
        bytes = expanded;
      }
      bytes.set(value, length);
      length = nextLength;
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      signal?.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  }
  return bytes.subarray(0, length);
}
