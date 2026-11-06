import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const read = (name) => readFileSync(resolve(repo, name), 'utf8');
const normalizer = read('src/ProductManagerCore/EncMetadataCoverageNormalizer.cs');
const manager = read('src/ProductManagerCore/ProductManagerGDB.cs');
const interfaceFile = read('src/ProductManagerCore/IProductManager.cs');
const service = read('src/ProductCatalogueAPI/Jobs/EncPackageDetectionService.cs');
const cleanup = read('src/ProductManagerCore/EncMetadataSurfaceYamlCleanup.cs');

test('suppression plan carries exact geometry references from removed metadata features', () => {
  assert.match(normalizer, /SuppressedSurfaceNames\s*=\s*suppressedSurfaces/);
  assert.match(normalizer, /removed\.Select\(feature => feature\.Geometry!/);
  assert.match(normalizer, /string\.IsNullOrWhiteSpace\(feature\.Geometry\)/);
});

test('verified DPC snapshot transfers suppression plan before YAML persistence', () => {
  assert.match(manager, /suppressedMetadataSurfaces:\s*suppressedSurfaces/);
  assert.match(manager, /SuppressedMetadataSurfaces\s*=\s*suppressedSurfaces\.ToArray\(\)/);
  assert.match(interfaceFile, /public IReadOnlyList<string> SuppressedMetadataSurfaces/);
  const serialize = service.indexOf('var yaml = snapshot.Dataset.Serialize();');
  const prune = service.indexOf('EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(');
  const persist = service.indexOf('packages.TryCreateAsync(package, cancellationToken)');
  assert.ok(serialize !== -1 && prune > serialize && persist > prune);
});

test('serialization cleanup fails closed on shared or missing identities', () => {
  assert.match(cleanup, /!toRemove\.SetEquals\(/);
  assert.match(cleanup, /ENC surface '\{entry\.Name\}' is referenced outside its suppressed metadata record/);
  assert.match(cleanup, /Regex\.IsMatch\(remaining, pattern/);
  assert.match(cleanup, /UnexpectedSurfaceItem\.IsMatch\(section\)/);
});

test('cleanup leaves curve, composite curve, point and depth collections untouched', () => {
  assert.match(cleanup, /var sectionStart = surfaceHeaders\[0\]/);
  assert.match(cleanup, /var sectionEnd = featureHeaders\[0\]\.Index/);
  assert.match(cleanup, /output\.Append\(yaml, offset, yaml\.Length - offset\)/);
  assert.doesNotMatch(cleanup, /\.RemoveCurve\(|\.RemoveCompositeCurve\(|\.RemovePoint\(/);
});

test('replay recovery from controlled candidate is retained', () => {
  assert.match(service, /EncPackageInterruptedExportRecovery\.TryRecoverAsync/);
  assert.match(service, /ENC replay archive scan started/);
});
