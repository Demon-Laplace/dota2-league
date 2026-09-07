// Pure display-calculation regression tests; no database or browser dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const names = ['getMatchPlayerRank', 'getMatchPlayerPowerValue', 'getMatchTeamPowerTotal'];
const functions = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');
const cache = new Map();
const context = vm.createContext({
  Map, activeSeason: { id: 'current' },
  normalizeSeasonRankNo: value => Number(value) > 0 ? Number(value) : null,
  getCachedSeasonPlayerPower: (season, player) => cache.get(`${season}:${player}`),
  getSeasonRankPowerValue: rank => rank ? ({1:10, 2:5, 3:0}[rank] ?? null) : null,
});
vm.runInContext(functions, context);
const value = (player, season = 'current', ranks = new Map()) => context.getMatchPlayerPowerValue(player, season, ranks);
assert.equal(value({player_id:'p'}), null, 'missing data is not zero');
assert.equal(value({player_id:'p',power_value_snapshot:7}), 7, 'cold-load snapshot fallback');
assert.equal(value({player_id:'p',power_value_snapshot:0}), 0, 'explicit snapshot zero');
assert.equal(value({player_id:'p',rank_no_snapshot:2}), 5, 'rank snapshot survives empty membership map');
assert.equal(value({player_id:'p'}, 'current', new Map([['p',3]])), 0, 'configured zero');
assert.equal(value({player_id:'p',power_value_snapshot:'bad',rank_no_snapshot:2}), 5, 'invalid snapshot falls through');
assert.equal(context.getMatchTeamPowerTotal([{player_id:'p'},{power_value_snapshot:7}], 'current'), null, 'no partial sum');
cache.set('current:p', {rank_no:1,power_value:10});
assert.equal(value({player_id:'p',power_value_snapshot:7}), 10, 'current settings supersede snapshot after load');
assert.equal(context.getMatchTeamPowerTotal([{player_id:'p'},{power_value_snapshot:7}], 'current'), 17, 'sum after load');
cache.set('past:p', {rank_no:1,power_value:10});
assert.equal(value({player_id:'p',power_value_snapshot:7}, 'past'), 7, 'history preserves snapshot');
console.log('PASS: 10 match power loading, zero and historical snapshot regressions');
