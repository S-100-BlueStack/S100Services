import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const detector = read('src/ProductCatalogueAPI/Jobs/EncPackageDetectionService.cs');
const recovery = read('src/ProductCatalogueAPI/Jobs/EncPackageInterruptedExportRecovery.cs');
const repository = read('src/ProductCatalogueAPI/Data/Repositories/ProductRepository.cs');

// Supplemental source-contract checks; they do not replace the .NET/SQL integration tests.
test('replay recovery precedes the blocked-state filter', () => {
  const replay = detector.indexOf('var replay = await packages.GetReplayBoundsAsync');
  const recover = detector.indexOf('await EncPackageInterruptedExportRecovery.TryRecoverAsync(candidate,');
  const filter = detector.indexOf('var eligibleReplay = replay.Where(');
  assert.ok(replay >= 0 && recover > replay && filter > recover);
});

test('both Product locks are held before replay and live-edit recovery', () => {
  assert.ok(detector.includes('ProductTrackLockKey.For(candidate.SourceDatasetName, ProductSpecification.S101)'));
  assert.ok(detector.includes('ProductTrackLockKey.For(candidate.S57DatasetName, ProductSpecification.S57)'));
  const s101 = detector.indexOf('var packageLock = await locks.TryAcquireAsync');
  const s57 = detector.indexOf('var s57Lock = await locks.TryAcquireAsync', s101);
  const recoveryOnEdit = detector.indexOf('TryRecoverAsync(existing,');
  assert.ok(s101 > 0 && s57 > s101 && recoveryOnEdit > s57);
});

test('recovery requires package identity and an in-progress candidate', () => {
  assert.match(recovery, /GetByIdAsync\(expectedPackage.Id/);
  assert.match(recovery, /SamePackage\(expectedPackage, package\)/);
  assert.match(recovery, /track\.State is not \(ProductState\.Exporting or ProductState\.Validating\)/);
  assert.match(recovery, /CandidateEdition is >= 0/);
  assert.match(recovery, /CandidateUpdate is >= 0/);
  assert.match(recovery, /track\.IsManuallyFrozen/);
});

test('conditional SQL guards package, track and candidate and retains replay', () => {
  const method = repository.split('public async Task<bool> TryFailInterruptedPackageExportAsync(')[1]
    .split('public async Task<Guid> CompleteExportWithHistoryAsync(')[0];
  for (const clause of [
    'IsolationLevel.Serializable', 'FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK)',
    'package_id = @PackageId', 't.product_export_track_id = @TrackId',
    't.state = @ExpectedState', 't.updated_at_utc = @ExpectedUpdatedAtUtc',
    't.candidate_edition = @CandidateEdition', 't.candidate_update = @CandidateUpdate',
    'dbo.ProductExportTrackFreezeHold', 'dbo.ProductIcEncDelivery',
    'INSERT INTO dbo.ProductStateHistory', 'ENC_EXPORT_INTERRUPTED',
    'DbType.DateTime2',
  ]) assert.ok(method.includes(clause), `Missing SQL guard: ${clause}`);
  assert.ok(!method.includes('UPDATE dbo.EncPackageReplay'));
  assert.ok(!method.includes('DELETE FROM dbo.EncPackageReplay'));
  assert.ok(!method.includes('candidate_edition = NULL'));
});

test('automatic recovery does not change the existing new-edit requirement', () => {
  assert.match(detector, /if \(!HasNewEdits\(changes, packageArchiveEditUtc\)\)/);
  assert.match(detector, /if \(!await CanRefreshAsync\(existing, cancellationToken\)\)/);
  assert.match(detector, /await packages\.MarkReplayAsync\(sourceName, packageScanFromUtc, cancellationToken\)/);
});
