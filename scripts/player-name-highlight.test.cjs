const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const names = ['getHighestRewardPlayerIds', 'getPlayerNameStyleClass', 'getLeaderboardNameRankClass', 'buildDecoratedPlayerNameHtml'];
const functions = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');
const context = vm.createContext({
  leaderboardPlayers: [], getHardcoreLoseTaggedPlayerIds: () => new Set(),
  escapeHtml: value => String(value),
});
vm.runInContext(source.match(/const HIGHEST_REWARD_HIGHLIGHT_MINIMUM = \d+;/)[0] + '\n' + functions, context);
const players = amounts => amounts.map((reward_points, i) => ({ player_id: `p${i}`, reward_points }));

test('zero, base sponsorship and amounts below 100 do not highlight sponsors', () => {
  for (const amounts of [[0, 0], [20, 20], [99.99, 20]]) {
    assert.equal(context.getHighestRewardPlayerIds(players(amounts)).size, 0);
  }
});

test('100 is inclusive and tied highest sponsors remain highlighted', () => {
  assert.deepEqual([...context.getHighestRewardPlayerIds(players([100, 99]))], ['p0']);
  assert.deepEqual([...context.getHighestRewardPlayerIds(players([150, 150, 100]))], ['p0', 'p1']);
});

test('ranking gold remains independent of sponsor gold', () => {
  const low = players([20, 20]);
  const first = context.buildDecoratedPlayerNameHtml('p0', 'First', { players: low, rank: 1 });
  const other = context.buildDecoratedPlayerNameHtml('p1', 'Other', { players: low, rank: 6 });
  assert.match(first, /player-name-display-rank1/);
  assert.doesNotMatch(first, /player-name-display-gold/);
  assert.doesNotMatch(other, /player-name-display-(?:gold|rank1)/);
  const sponsor = context.buildDecoratedPlayerNameHtml('p1', 'Sponsor', { players: players([20, 100]), rank: 6 });
  assert.match(sponsor, /player-name-display-gold/);
  assert.doesNotMatch(sponsor, /player-name-display-rank1/);
});
