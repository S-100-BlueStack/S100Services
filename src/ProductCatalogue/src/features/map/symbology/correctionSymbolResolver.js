import { projectMemberStatusRenderState } from "../../dataSources/domain/memberStatusRenderingProjection.js";
import { getCorrectionSymbol, getMixedCorrectionSymbol } from "./correctionSymbols.js";

export const WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION = Object.freeze({
  type: "work-unit-member-status",
});

export function resolveCorrectionSymbol({ attributes, geometry, symbolization } = {}) {
  const representativeStatus = attributes?.status;

  if (!supportsMemberStatusSymbolization(symbolization, geometry)) {
    return getCorrectionSymbol(representativeStatus);
  }

  const renderState = projectMemberStatusRenderState({
    representativeStatus,
    workUnitStatus: attributes?.workUnitStatus,
  });

  if (renderState.kind !== "mixed") {
    return getCorrectionSymbol(renderState.status);
  }

  return getMixedCorrectionSymbol(renderState.memberStatuses);
}

export function canResolveCorrectionSymbol({ attributes, geometry, symbolization } = {}) {
  if (attributes?.status !== undefined && attributes?.status !== null) {
    return true;
  }

  if (!supportsMemberStatusSymbolization(symbolization, geometry)) {
    return false;
  }

  return (
    projectMemberStatusRenderState({
      representativeStatus: attributes?.status,
      workUnitStatus: attributes?.workUnitStatus,
    }).memberStatuses.length > 0
  );
}

export function resolveGraphicSymbolization(graphic) {
  return graphic?.layer?.appSymbolization ?? null;
}

export function areCorrectionSymbolsEquivalent(left, right) {
  if (left === right) {
    return true;
  }

  try {
    return (
      stableSerialize(normalizeCorrectionSymbol(left)) ===
      stableSerialize(normalizeCorrectionSymbol(right))
    );
  } catch {
    return false;
  }
}

function supportsMemberStatusSymbolization(symbolization, geometry) {
  return (
    symbolization?.type === WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION.type &&
    String(geometry?.type ?? "").toLowerCase() === "polygon"
  );
}

function normalizeCorrectionSymbol(symbol) {
  const value = readPublicJson(symbol);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalizeComparableValue(value);
  }

  const symbolType = normalizeSymbolType(value.type);

  if (symbolType === "cim") {
    return normalizeCimSymbol(value);
  }

  if (symbolType !== "simple-fill") {
    return normalizeComparableValue(value);
  }

  return {
    type: "simple-fill",
    color: normalizeColor(value.color),
    style: normalizeFillStyle(value.style),
    outline: normalizeSimpleLine(value.outline),
  };
}

function normalizeCimSymbol(symbol) {
  const data = readPublicJson(symbol?.data) ?? {};
  const cimSymbol = readPublicJson(data?.symbol) ?? {};

  return {
    type: "cim",
    data: {
      type: "CIMSymbolReference",
      symbol: {
        type: String(cimSymbol?.type ?? "").trim(),
        symbolLayers: Array.isArray(cimSymbol?.symbolLayers)
          ? cimSymbol.symbolLayers.map(normalizeCimSymbolLayer)
          : [],
      },
    },
  };
}

function normalizeCimSymbolLayer(layer) {
  const value = readPublicJson(layer) ?? {};
  const type = normalizeToken(value.type);

  if (type === "cimsolidfill") {
    return {
      type: "CIMSolidFill",
      enable: value.enable !== false,
      color: normalizeCimColor(value.color),
    };
  }

  if (type === "cimsolidstroke") {
    return {
      type: "CIMSolidStroke",
      enable: value.enable !== false,
      width: normalizeFiniteNumber(value.width),
      color: normalizeCimColor(value.color),
    };
  }

  if (type === "cimhatchfill") {
    return {
      type: "CIMHatchFill",
      enable: value.enable !== false,
      rotation: normalizeFiniteNumber(value.rotation ?? 0),
      separation: normalizeFiniteNumber(value.separation),
      lineSymbol: normalizeCimLineSymbol(value.lineSymbol),
    };
  }

  return normalizeComparableValue(value);
}

function normalizeCimLineSymbol(lineSymbol) {
  const value = readPublicJson(lineSymbol) ?? {};

  return {
    type: String(value?.type ?? "").trim(),
    symbolLayers: Array.isArray(value?.symbolLayers)
      ? value.symbolLayers.map(normalizeCimSymbolLayer)
      : [],
  };
}

function normalizeCimColor(value) {
  const normalized = normalizeColor(value);

  if (!Array.isArray(normalized)) {
    return normalized;
  }

  return normalized.map(normalizeFiniteNumber);
}

function normalizeSimpleLine(outline) {
  const value = readPublicJson(outline);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalizeComparableValue(value);
  }

  return {
    color: normalizeColor(value.color),
    width: normalizeFiniteNumber(value.width),
    style: normalizeLineStyle(value.style),
  };
}

function normalizeSymbolType(value) {
  const token = normalizeToken(value);

  if (token === "simplefill" || token === "esrisfs") {
    return "simple-fill";
  }

  return token;
}

function normalizeFillStyle(value) {
  const token = normalizeToken(value);

  if (!token || token === "solid" || token === "esrisfssolid") {
    return "solid";
  }

  const aliases = {
    esrisfsbackwarddiagonal: "backward-diagonal",
    esrisfsforwarddiagonal: "forward-diagonal",
    esrisfscross: "cross",
    esrisfsdiagonalcross: "diagonal-cross",
    esrisfshorizontal: "horizontal",
    esrisfsvertical: "vertical",
  };

  return (
    aliases[token] ??
    String(value ?? "")
      .trim()
      .toLowerCase()
  );
}

function normalizeLineStyle(value) {
  const token = normalizeToken(value);

  if (!token || token === "solid" || token === "esrislssolid") {
    return "solid";
  }

  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeColor(value) {
  const normalized = readPublicJson(value);

  if (Array.isArray(normalized)) {
    return normalized.map(normalizeFiniteNumber);
  }

  if (normalized && typeof normalized === "object") {
    const red = normalized.r ?? normalized.red;
    const green = normalized.g ?? normalized.green;
    const blue = normalized.b ?? normalized.blue;
    const alpha = normalized.a ?? normalized.alpha;

    if ([red, green, blue].every((entry) => Number.isFinite(Number(entry)))) {
      return [Number(red), Number(green), Number(blue), alpha === undefined ? 1 : Number(alpha)];
    }

    return normalizeComparableValue(normalized);
  }

  const text = String(normalized ?? "").trim();
  const rgbaMatch = text.match(
    /^rgba?\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,)]+)\s*(?:,\s*([^)]+)\s*)?\)$/i
  );

  if (rgbaMatch) {
    return [
      Number(rgbaMatch[1]),
      Number(rgbaMatch[2]),
      Number(rgbaMatch[3]),
      rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]),
    ];
  }

  return text.toLowerCase();
}

function normalizeFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function stableSerialize(value) {
  return JSON.stringify(normalizeComparableValue(value));
}

function normalizeComparableValue(value) {
  const normalized = readPublicJson(value);

  if (Array.isArray(normalized)) {
    return normalized.map(normalizeComparableValue);
  }

  if (!normalized || typeof normalized !== "object") {
    return normalized;
  }

  return Object.fromEntries(
    Object.keys(normalized)
      .sort()
      .map((key) => [key, normalizeComparableValue(normalized[key])])
  );
}

function readPublicJson(value) {
  return value && typeof value.toJSON === "function" ? value.toJSON() : value;
}
