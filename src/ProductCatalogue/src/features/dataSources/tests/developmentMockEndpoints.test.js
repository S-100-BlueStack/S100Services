import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productManagerApiRoot = new URL("../../../../../ProductCatalogueAPI/", import.meta.url);

async function readApiFile(relativePath) {
  return readFile(new URL(relativePath, productManagerApiRoot), "utf8");
}

test("ProductCatalogueAPI registers only the retained source mocks inside Development", async () => {
  const program = await readApiFile("Program.cs");
  const developmentBlockStart = program.indexOf("if (app.Environment.IsDevelopment())");
  const genericProductRoute = program.indexOf('app.MapGet("/mock/products"');
  const paperRoute = program.indexOf('app.MapGet("/mock/paper-charts"');
  const s102Route = program.indexOf('app.MapGet("/mock/s102"');
  const appRun = program.indexOf("app.Run();");

  assert.ok(developmentBlockStart >= 0);
  assert.equal(genericProductRoute, -1);
  assert.ok(paperRoute > developmentBlockStart && paperRoute < appRun);
  assert.ok(s102Route > developmentBlockStart && s102Route < appRun);
  assert.match(program, /GetDevelopmentGeoJson\("paper-charts\.geojson"\)/);
  assert.match(program, /GetDevelopmentGeoJson\("s102\.geojson"\)/);
  assert.match(program, /GetManifestResourceStream\(resourceName\)/);
  assert.equal(program.includes("environment.ContentRootPath"), false);
});

test("ProductCatalogueAPI embeds only source-specific Development mock fixtures", async () => {
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
