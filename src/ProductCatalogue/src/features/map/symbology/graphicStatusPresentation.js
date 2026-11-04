import {
  packageStatusColorConfig,
  statusColorConfig,
} from "../../../shared/config/colorsConfig.js";
import {
  getEncPackageStatusLabel,
  normalizeEncPackageStatus,
} from "../../dataSources/domain/encPackageStatus.js";
import {
  resolveGraphicSymbolization,
  WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION,
} from "./correctionSymbolResolver.js";

// A Package's display state belongs to the whole work unit, not its export candidates.
// Use the source's symbolization contract instead of inferring the source from its name.
export function resolveGraphicStatusPresentation(graphic) {
  const isPackage =
    resolveGraphicSymbolization(graphic)?.type === WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION.type;

  if (isPackage) {
    const status = normalizeEncPackageStatus(graphic?.attributes?.workUnitStatus?.packageStatus);
    return {
      isPackage: true,
      status,
      label: getEncPackageStatusLabel(status),
      colors: packageStatusColorConfig[status] ?? null,
    };
  }

  const status = graphic?.attributes?.status;
  return {
    isPackage: false,
    status,
    label: null,
    colors: statusColorConfig[status] ?? null,
  };
}
