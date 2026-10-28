import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPropsFromDataset, findClosestWithAttr } from '../src/dom.js';

test('extractPropsFromDataset casts numbers, booleans, and strings', () => {
  const mockElement = {
    attributes: [
      { name: 'data-tpz-prop-scale', value: '4.5' },
      { name: 'data-tpz-prop-fullscreen', value: 'true' },
      { name: 'data-tpz-prop-closed', value: 'false' },
      { name: 'data-tpz-prop-artist', value: 'Francisco Goya' },
      { name: 'class', value: 'btn primary' },
    ],
  };

  const props = extractPropsFromDataset(mockElement);
  assert.deepEqual(props, {
    scale: 4.5,
    fullscreen: true,
    closed: false,
    artist: 'Francisco Goya',
  });
});

test('findClosestWithAttr walks up parent chain', () => {
  const grandparent = {
    nodeType: 1,
    hasAttribute: (attr) => attr === 'data-tpz-event',
    getAttribute: () => 'zoom_in',
    parentElement: null,
  };

  const parent = {
    nodeType: 1,
    hasAttribute: () => false,
    parentElement: grandparent,
  };

  const child = {
    nodeType: 1,
    hasAttribute: () => false,
    parentElement: parent,
  };

  const found = findClosestWithAttr(child, 'data-tpz-event');
  assert.equal(found, grandparent);
});
