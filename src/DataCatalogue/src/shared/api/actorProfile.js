const WINDOWS_ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\\[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTO_BYTES = 102400;

export function isDirectoryActor(actor) {
  return typeof actor === "string" && WINDOWS_ACCOUNT.test(actor) && !/\s/.test(actor);
}

export function validateProfileRequest(eventId, actor) {
  if (typeof eventId !== "string" || !GUID.test(eventId) || !isDirectoryActor(actor)) {
    throw new Error("Invalid Package history profile request.");
  }
}

// The API owns identity and access. Only bounded, recognized image data may
// become an image source; never allow a backend-provided arbitrary URL.
export function normalizeActorProfile(value, actor) {
  if (value === null) return null;
  const invalid = () => new Error("API returned an invalid actor profile.");
  if (value?.actor !== actor) throw invalid();
  const { displayName, photoMediaType, photoBase64 } = value;
  if (
    displayName !== null &&
    (typeof displayName !== "string" || !displayName.trim() || displayName.length > 256)
  ) {
    throw invalid();
  }
  let photoSrc = null;
  if (photoMediaType !== null || photoBase64 !== null) {
    if (
      !["image/jpeg", "image/png"].includes(photoMediaType) ||
      typeof photoBase64 !== "string" ||
      photoBase64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(photoBase64) ||
      photoBase64.length % 4 !== 0
    ) {
      throw invalid();
    }
    const bytes = atob(photoBase64);
    const signature = photoMediaType === "image/jpeg" ? "\xff\xd8\xff" : "\x89PNG\r\n\x1a\n";
    if (bytes.length > MAX_PHOTO_BYTES || !bytes.startsWith(signature)) throw invalid();
    photoSrc = `data:${photoMediaType};base64,${photoBase64}`;
  }
  if (!displayName && !photoSrc) throw invalid();
  return { displayName, photoSrc };
}
