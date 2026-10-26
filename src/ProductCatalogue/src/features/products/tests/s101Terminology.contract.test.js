import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productCatalogueRoot = new URL("../../../../", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, productCatalogueRoot), "utf8");
}

test("S-101 presentation stays separate from the normalized product-resolved export contract", async () => {
  const [
    popup,
    popupMetadata,
    metadata,
    exportApi,
    productContext,
    exportTarget,
    tooltips,
    productJob,
    exportConfig,
    actionConfig,
    actionDom,
    actionDropdown,
    popupHelpText,
    actionSignature,
    productActions,
    exportState,
    dataSourceRegistry,
    popupCss,
  ] = await Promise.all([
    readSource("src/features/map/popups/createPopup.js"),
    readSource("src/features/map/popups/popupProductMetadata.js"),
    readSource("src/features/data/normalizers/productExportMetadata.js"),
    readSource("src/features/data/api/exportApi.js"),
    readSource("src/features/products/domain/productContext.js"),
    readSource("src/features/data/domain/exportTarget.js"),
    readSource("src/shared/ui/tooltips/globalHelpTooltips.js"),
    readSource("src/features/products/domain/productJob.js"),
    readSource("src/features/map/popups/popupExportConfig.js"),
    readSource("src/features/map/popups/popupActionConfig.js"),
    readSource("src/features/map/popups/popupActionDom.js"),
    readSource("src/features/map/popups/popupActionDropdown.js"),
    readSource("src/features/map/popups/popupActionHelpText.js"),
    readSource("src/features/map/popups/popupActionConfigSignature.js"),
    readSource("src/features/map/popups/popupProductActions.js"),
    readSource("src/features/map/popups/popupExportState.js"),
    readSource("src/features/dataSources/config/dataSourceRegistry.js"),
    readSource("src/styles/popup.css"),
  ]);

  assert.match(
    popup,
    /import \{ createPopupProductMetadataColumns \} from "\.\/popupProductMetadata\.js";/
  );
  assert.match(popup, /createPopupProductMetadataColumns\(attributes, productContext\)/);
  assert.match(
    popupMetadata,
    /label: attributes\?\.sourceLabel \?\? selectedExport\?\.label \?\? "Product"/
  );
  assert.match(metadata, /label: createProductExportStandardLabel\(standard\)/);
  assert.doesNotMatch(exportApi, /exportTarget=/);
  assert.match(exportApi, /PRODUCT_JOB_OPERATION\.EXPORT_EDITION/);
  assert.match(productContext, /createElectronicExportConfiguration\("S101", "S-101"\)/);

  assert.match(
    exportConfig,
    /presentationLabel: createPresentationLabel\(displayLabel, operationKind\)/
  );
  // S-101 export normalization remains tested above; FI-029 no longer renders legacy export actions.
  assert.match(
    actionConfig,
    /const actions = packagePresentation\?\.actions \?\? createPopupWorkflowActions\(\)/
  );
  assert.match(actionConfig, /action\.availability\.backendAuthorized === true/);
  assert.match(actionConfig, /typeof packageActions\?\.invoke === "function"/);
  assert.match(
    actionConfig,
    /id: "tools",[\s\S]*?ariaLabel: "Tools",[\s\S]*?icon: "wrench",[\s\S]*?textEnabled: false/
  );
  assert.doesNotMatch(
    actionConfig,
    /createFreezeAction|createSendAction|createExportAction|createRollbackAction/
  );
  assert.match(actionConfig, /return \[\[\.\.\.actions, \.\.\.\(tools \? \[tools\] : \[\]\)\]\];/);
  assert.doesNotMatch(actionConfig, /sourceId\s*===\s*["'](?:paper-charts|s102)["']/);
  assert.match(actionDom, /state\.help\.update\(tooltipText\)/);
  assert.match(actionDom, /const textEnabled = actionConfig\.textEnabled !== false/);
  assert.match(actionDom, /action\.toggleAttribute\("text-enabled", textEnabled\)/);
  assert.match(actionDom, /action\.setAttribute\("aria-label", ariaLabel\)/);
  assert.match(actionDom, /configuredAriaLabel: false/);
  assert.match(actionDom, /else if \(state\.configuredAriaLabel\)/);
  assert.match(actionDropdown, /bindPopupActionHelp\(tooltipAnchor, helpText\)/);
  assert.match(actionSignature, /helpText: actionConfig\?\.helpText \?\? null/);
  assert.match(productActions, /label: `Exporting \${exportLabel}`/);
  assert.match(productActions, /presentationLabel: exportLabel/);
  assert.match(productActions, /Network error while exporting \${exportLabel} for \${datasetName}/);
  assert.match(
    exportState,
    /exportAction\.presentationLabel \?\? exportAction\.exportType \?\? "Export"/
  );
  assert.match(dataSourceRegistry, /helpText: availabilityReason/);
  assert.match(
    popupCss,
    /\.popup-action-bar__action\[data-popup-action-id="tools"\]\s*\{[^}]*margin-inline-start:\s*auto;/
  );
  assert.doesNotMatch(productActions, /target === ["']S100["']/);
  assert.match(exportTarget, /S101: "S101"/);
  assert.match(productJob, /S101: "S-101"/);

  assert.match(tooltips, /"export-s100": "Export S-101"/);
  assert.match(tooltips, /"s100-export-edition": "Export S-101 Edition"/);
  assert.match(tooltips, /"s100-export-update": "Export S-101 Update"/);
  assert.match(popupHelpText, /tools: "More actions\."/);
  assert.match(actionDom, /action\.removeAttribute\("title"\)/);
});
