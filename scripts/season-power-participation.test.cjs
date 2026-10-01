const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const names = ['getSeasonPlayerPowerInputValue', 'getSeasonPowerEditorValues', 'buildRankLabelEditorHtml', 'saveSeasonRankLabels'];
const functions = names.map(name => {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');

function setup(values) {
  const writes = [], messages = [];
  const draft = { seasonId: 'current', rankLabels: {}, players: values.map((rawValue, i) => ({ playerId: `p${i}`, displayName: `P${i}`, rawValue })) };
  const context = vm.createContext({
    activeSeason: { id: 'current' },
    seasonPlayers: values.map((_, i) => ({ id: `p${i}`, display_name: `P${i}`, is_in_season: false, player_rank: null })),
    normalizeSeasonRankNo: value => Number(value) > 0 ? Number(value) : null,
    getSeasonRankPowerValue: () => 0,
    getDefaultSeasonRankLabel: rank => `Rank ${rank}`,
    getSeasonRankLabels: () => ({}), getSeasonPowerDraft: () => draft,
    escapeHtml: value => String(value), ensureScorerAccess: () => true,
    setAdminPanelMessage: message => messages.push(message),
    setScorerPanelMessage: message => messages.push(message), setMessage: () => {},
    confirmAction: async () => true,
    saveSeasonRankCountValue: async parsed => ({ parsed, season: {} }),
    db: { rpc: async (name, args) => { writes.push({ name, args }); return { data: {} }; } },
    persistSeasonPlayerRank: async (id, rank) => { writes.push({ id, rank }); return {}; },
    syncUpdatedSeasonMeta: () => {}, recalculateSeasonScoresForPanel: async () => true,
    seasonPowerDraftCommitTimers: { scorer: new Map() }, seasonPowerDraftState: {},
    loadSeasonPlayers: async () => {}, loadLeaderboard: async () => {}, loadRecentMatches: async () => {},
    getManagedDialogModal: () => ({ hidden: true }),
  });
  vm.runInContext(functions, context);
  return { context, writes, messages };
}

test('existing inactive players display -99; participating zero stays zero', () => {
  const { context } = setup([]);
  assert.equal(context.getSeasonPlayerPowerInputValue({ is_in_season: false, player_rank: 1 }), '-99');
  assert.equal(context.getSeasonPlayerPowerInputValue({ is_in_season: true, player_rank: 1 }), '0');
  assert.equal(context.getSeasonPlayerPowerInputValue({ is_in_season: true, player_rank: null }), '0');
});

test('zero is displayed in a participating group and -99 in the inactive group', () => {
  const { context } = setup(['0', '-99', '10']);
  const html = context.buildRankLabelEditorHtml();
  const [ranked, inactive] = html.split('season-player-power-group season-player-power-unranked');
  assert.match(ranked, /data-player-id="p0"/);
  assert.doesNotMatch(ranked, /data-player-id="p1"/);
  assert.match(inactive, /data-player-id="p1"/);
  assert.doesNotMatch(inactive, /data-player-id="p0"/);
  const many = Array.from({ length: 12 }, (_, i) => ({ rawValue: String(i) }));
  assert.equal(context.getSeasonPowerEditorValues(many).length, 12);
  assert.ok(context.getSeasonPowerEditorValues(many).includes(0));
});

test('saving zero creates an active rank; -99 never goes into rank power settings', async () => {
  const { context, writes } = setup(['0', '-99', '10']);
  await context.saveSeasonRankLabels();
  assert.deepEqual(writes.filter(w => w.name).map(w => w.args.p_power_value), [10, 0]);
  assert.equal(writes.find(w => w.id === 'p0').rank, 2);
  assert.equal(writes.find(w => w.id === 'p2').rank, 1);
  assert.equal(writes.some(w => w.id === 'p1'), false);
});

test('changing a participant to -99 clears their rank', async () => {
  const { context, writes } = setup(['-99']);
  context.seasonPlayers[0].is_in_season = true;
  context.seasonPlayers[0].player_rank = 1;
  await context.saveSeasonRankLabels();
  assert.equal(writes.find(w => w.id === 'p0').rank, null);
});

test('other negatives, blank, fractions and unsafe integers fail before writing', async () => {
  for (const value of ['-1', '-98', '-100', '', '0.5', '9007199254740992']) {
    const { context, writes, messages } = setup([value]);
    await context.saveSeasonRankLabels();
    assert.equal(writes.length, 0, value);
    assert.ok(messages.some(message => message.includes('-99')), value);
  }
});
