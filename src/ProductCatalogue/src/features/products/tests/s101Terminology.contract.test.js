import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productCatalogueRoot = new URL("../../../../", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, productCatalogueRoot), "utf8");
}

test("S-101 presentation stays separate from the legacy S100 export wire target", async () => {
  const [
    popup,
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
    actionSignature,
    productActions,
    exportState,
    dataSourceRegistry,
    popupCss,
  ] = await Promise.all([
    readSource("src/features/map/popups/createPopup.js"),
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
    readSource("src/features/map/popups/popupActionConfigSignature.js"),
    readSource("src/features/map/popups/popupProductActions.js"),
    readSource("src/features/map/popups/popupExportState.js"),
    readSource("src/features/dataSources/config/dataSourceRegistry.js"),
    readSource("src/styles/popup.css"),
  ]);

  assert.match(popup, /label: "S-101"/);
  assert.match(popup, /createExportColumnLabel\(item\.label \?\? standard, columns\)/);
  assert.match(metadata, /standard === PRODUCT_EXPORT_STANDARD\.S100 \? "S-101" : standard/);
  assert.match(exportApi, /exportTarget: EXPORT_TARGET\.S100/);
  assert.match(exportApi, /label: "Exporting S-101 Edition"/);
  assert.match(productContext, /displayLabel: "S-101"/);
  assert.match(productContext, /helpText: "Open S-101 export actions\."/);
  assert.match(productContext, /backendTarget: EXPORT_TARGET\.S100/);
  assert.match(
    exportConfig,
    /presentationLabel: createPresentationLabel\(displayLabel, operationKind\)/
  );
  assert.match(actionConfig, /helpText: context\.exportConfiguration\?\.helpText \?\? null/);
  assert.match(actionConfig, /presentationLabel: exportAction\.presentationLabel/);
  assert.match(
    actionConfig,
    /id: "tools",[\s\S]*?ariaLabel: "Tools",[\s\S]*?icon: "wrench",[\s\S]*?textEnabled: false/
  );
  assert.match(
    actionConfig,
    /compactActions\(\[[\s\S]*?createFreezeAction\([\s\S]*?createSendAction\([\s\S]*?\]\),\s*compactActions\(\[[\s\S]*?createExportAction\([\s\S]*?createRollbackAction\([\s\S]*?createToolsAction\(/
  );
  assert.doesNotMatch(actionConfig, /sourceId\s*===\s*["'](?:paper-charts|s102)["']/);
  assert.match(
    actionDom,
    /actionConfig\.disabledReason \?\? actionConfig\.helpText \?\? actionConfig\.label/
  );
  assert.match(actionDom, /const textEnabled = actionConfig\.textEnabled !== false/);
  assert.match(actionDom, /action\.toggleAttribute\("text-enabled", textEnabled\)/);
  assert.match(actionDom, /action\.setAttribute\("aria-label", ariaLabel\)/);
  assert.match(actionDom, /configuredAriaLabel: false/);
  assert.match(actionDom, /else if \(state\.configuredAriaLabel\)/);
  assert.match(actionDropdown, /itemConfig\.disabledReason \?\? itemConfig\.helpText \?\? null/);
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
  assert.match(exportTarget, /S100: "S100"/);
  assert.match(productJob, /"Exporting S-101 Edition"/);
  assert.match(productJob, /"S-101 Edition export"/);
  assert.match(tooltips, /"export-s100": "Open S-101 export actions\."/);
  assert.match(tooltips, /"s100-export-edition": "Export a new S-101 Edition for this product\."/);
  assert.match(tooltips, /"s100-export-update": "S-101 Update export is currently disabled\."/);
  assert.match(tooltips, /tools: "Open additional product tools\."/);
});
