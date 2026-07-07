import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addAnalyzeDatasetItem,
  createAnalyzeDatasetItems,
  getEnabledAnalyzeDatasetNames,
  normalizeAnalyzeDatasetItems,
  removeAnalyzeDatasetItem,
  toggleAnalyzeDatasetItem,
} from './analyzeDatasetList.js';

test('createAnalyzeDatasetItems trims names and removes empty values', () => {
  const items = createAnalyzeDatasetItems([' DK5ABC123 ', '', null, 'DK5ABC456']);

  assert.deepEqual(items, [
    {
      id: 'dk5abc123',
      name: 'DK5ABC123',
      enabled: true,
    },
    {
      id: 'dk5abc456',
      name: 'DK5ABC456',
      enabled: true,
    },
  ]);
});

test('normalizeAnalyzeDatasetItems preserves disabled state', () => {
  const items = normalizeAnalyzeDatasetItems([
    {
      name: 'DK5ABC123',
      enabled: false,
    },
    {
      name: 'DK5ABC456',
      enabled: true,
    },
  ]);

  assert.deepEqual(items, [
    {
      id: 'dk5abc123',
      name: 'DK5ABC123',
      enabled: false,
    },
    {
      id: 'dk5abc456',
      name: 'DK5ABC456',
      enabled: true,
    },
  ]);
});

test('normalizeAnalyzeDatasetItems removes duplicate names case-insensitively', () => {
  const items = normalizeAnalyzeDatasetItems(['DK5ABC123', 'dk5abc123', 'DK5ABC456']);

  assert.deepEqual(
    items.map((item) => item.name),
    ['DK5ABC123', 'DK5ABC456']
  );
});

test('addAnalyzeDatasetItem appends new names', () => {
  const items = addAnalyzeDatasetItem(createAnalyzeDatasetItems(['DK5ABC123']), 'DK5ABC456');

  assert.deepEqual(
    items.map((item) => item.name),
    ['DK5ABC123', 'DK5ABC456']
  );
});

test('addAnalyzeDatasetItem enables an existing disabled item instead of duplicating it', () => {
  const items = addAnalyzeDatasetItem(
    [
      {
        name: 'DK5ABC123',
        enabled: false,
      },
    ],
    'dk5abc123'
  );

  assert.deepEqual(items, [
    {
      id: 'dk5abc123',
      name: 'DK5ABC123',
      enabled: true,
    },
  ]);
});

test('toggleAnalyzeDatasetItem updates one item', () => {
  const items = toggleAnalyzeDatasetItem(createAnalyzeDatasetItems(['DK5ABC123']), 'dk5abc123', false);

  assert.deepEqual(items, [
    {
      id: 'dk5abc123',
      name: 'DK5ABC123',
      enabled: false,
    },
  ]);
});

test('removeAnalyzeDatasetItem removes one item', () => {
  const items = removeAnalyzeDatasetItem(
    createAnalyzeDatasetItems(['DK5ABC123', 'DK5ABC456']),
    'dk5abc123'
  );

  assert.deepEqual(items, [
    {
      id: 'dk5abc456',
      name: 'DK5ABC456',
      enabled: true,
    },
  ]);
});

test('getEnabledAnalyzeDatasetNames returns only enabled names', () => {
  const enabledNames = getEnabledAnalyzeDatasetNames([
    {
      name: 'DK5ABC123',
      enabled: false,
    },
    {
      name: 'DK5ABC456',
      enabled: true,
    },
  ]);

  assert.deepEqual(enabledNames, ['DK5ABC456']);
});
