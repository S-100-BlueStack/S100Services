import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productManagerApiRoot = new URL("../../../../../ProductManagerAPI/", import.meta.url);

async function readApiFile(relativePath) {
  return readFile(new URL(relativePath, productManagerApiRoot), "utf8");
}

test("ProductManagerAPI registers the FI-011A mock routes inside Development only", async () => {
  const program = await readApiFile("Program.cs");
  const developmentBlockStart = program.indexOf("if (app.Environment.IsDevelopment())");
  const paperRoute = program.indexOf('app.MapGet("/mock/paper-charts"');
  const s102Route = program.indexOf('app.MapGet("/mock/s102"');
  const appRun = program.indexOf("app.Run();");

  assert.ok(developmentBlockStart >= 0);
  assert.ok(paperRoute > developmentBlockStart && paperRoute < appRun);
  assert.ok(s102Route > developmentBlockStart && s102Route < appRun);
  assert.match(program, /GetDevelopmentGeoJson\(env, "some_products\.geojson"\)/);
  assert.match(program, /GetDevelopmentGeoJson\(env, "products\.geojson"\)/);
});

test("ProductManagerAPI copies both Development mock fixtures to output", async () => {
  const projectFile = await readApiFile("ProductManagerAPI.csproj");

  assert.match(projectFile, /Content Include="mock\\products\.geojson"/);
  assert.match(projectFile, /Content Include="mock\\some_products\.geojson"/);
  assert.equal(projectFile.includes("enc-products"), false);
});
