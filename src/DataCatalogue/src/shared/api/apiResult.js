import { normalizeError } from "../errors/normalizeError.js";

export function createSuccessResult(data, meta = {}) {
  return {
    ok: true,
    data,
    error: null,
    meta,
  };
}

export function createErrorResult(error, meta = {}) {
  return {
    ok: false,
    data: null,
    error: normalizeError(error),
    meta,
  };
}

export async function toApiResult(operation, meta = {}) {
  try {
    const data = await operation();

    return createSuccessResult(data, meta);
  } catch (error) {
    return createErrorResult(error, meta);
  }
}
