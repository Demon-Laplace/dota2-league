const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/domain/item-credit.js');
const { totals } = globalThis.LeagueItemCredit;
const item = (amount, player_id = 'A', category = 'card') => ({ player_id, amount, category });
const extra = (amount, player_id = 'A') => ({ player_id, amount, category: 'extra' });

test('item credit only offsets item charges and may be set after use', () => {
  const logs = [item(50), extra(10)];
  let result = totals(logs, new Map());
  assert.equal(result.byPlayer.get('A').netCents, 6000);
  assert.equal(result.byPlayer.get('A').remainingCents, 0);
  result = totals(logs, new Map([['A', 50]]));
  assert.equal(result.byPlayer.get('A').netCents, 1000);
  assert.equal(result.byPlayer.get('A').remainingCents, 0);
  assert.equal(result.netCents, 1000);
});

test('season total replaces earlier credit, excess charges stay payable', () => {
  const logs = [item(100), extra(50), extra(10), item(0.2, 'B', 'misc')];
  const result = totals(logs, new Map([['A', 50], ['B', 1]]));
  assert.equal(result.byPlayer.get('A').netCents, 11000);
  assert.equal(result.byPlayer.get('A').remainingCents, -5000);
  assert.equal(result.byPlayer.get('B').netCents, 0);
  assert.equal(result.byPlayer.get('B').remainingCents, 80);
  assert.equal(result.netCents, 11000);
});

test('unused credit does not increase sponsorship and item usage remains unchanged', () => {
  const logs = [item(50), extra(60)];
  const result = totals(logs, new Map([['A', 100]]));
  assert.equal(logs[0].amount, 50);
  assert.equal(result.byPlayer.get('A').itemCents, 5000);
  assert.equal(result.byPlayer.get('A').netCents, 6000);
  assert.equal(result.byPlayer.get('A').remainingCents, 5000);
  assert.equal(result.grossCents, 11000);
});
