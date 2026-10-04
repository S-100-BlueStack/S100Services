import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productManagerApiRoot = new URL("../../../../../ProductCatalogueAPI/", import.meta.url);

async function readApiFile(relativePath) {
  return readFile(new URL(relativePath, productManagerApiRoot), "utf8");
}

test("ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate", async () => {
  const program = await readApiFile("Program.cs");
  const mockGateStart = program.indexOf("MockDataSourcesConfiguration.IsEnabled(");
  const genericProductRoute = program.indexOf('app.MapGet("/mock/products"');
  const paperRoute = program.indexOf('app.MapGet("/mock/paper-charts"');
  const s102Route = program.indexOf('app.MapGet("/mock/s102"');
  const appRun = program.indexOf("app.Run();");

  assert.ok(mockGateStart >= 0);
  assert.equal(genericProductRoute, -1);
  assert.ok(paperRoute > mockGateStart && paperRoute < appRun);
  assert.ok(s102Route > mockGateStart && s102Route < appRun);
  assert.match(program, /GetMockGeoJson\("paper-charts\.geojson"\)/);
  assert.match(program, /GetMockGeoJson\("s102\.geojson"\)/);
  assert.match(program, /GetManifestResourceStream\(resourceName\)/);
  assert.equal(program.includes("environment.ContentRootPath"), false);

  const configuration = await readApiFile("MockDataSourcesConfiguration.cs");
  assert.match(configuration, /MockDataSources:Enabled/);
  assert.match(configuration, /if \(isDevelopment\)/);
  assert.match(configuration, /bool\.TryParse/);
});

test("ProductCatalogueAPI embeds only the retained source-specific mock fixtures", async () => {
  const projectFile = await readApiFile("ProductCatalogueAPI.csproj");

  assert.match(
    projectFile,
    /EmbeddedResource Include="mock\\paper-charts\.geojson" LogicalName="ProductCatalogueAPI\.mock\.paper-charts\.geojson"/
  );
  assert.match(
    projectFile,
    /EmbeddedResource Include="mock\\s102\.geojson" LogicalName="ProductCatalogueAPI\.mock\.s102\.geojson"/
  );
  assert.equal(projectFile.includes("mock\\products.geojson"), false);
  assert.equal(projectFile.includes("mock\\some_products.geojson"), false);
  assert.equal(projectFile.includes("enc-products"), false);
});
