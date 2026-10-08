const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const functionNames = [
  'createEmptyTeamDoubleConfig', 'getDoubleStateByFormType', 'getTeamDoubleStateKey',
  'getTeamDoubleConfigs', 'getTeamDoubleConfig', 'setTeamDoubleConfigs', 'upsertTeamDoubleConfig',
  'selectTeamDoublePayer', 'getSelectedPlayersWithTeams', 'normalizeDoubleState',
  'buildTeamDoubleOptionsHtml', 'buildDoubleDownPayload',
];
const functions = functionNames.map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');
const players = ['A', 'B'].flatMap(team => Array.from({ length: 5 }, (_, i) => ({
  id: `${team}${i}`, team, display_name: `队员${team}${i}`,
})));
const item = { id: 'team-item', name: '团体道具' };

function setup(formType, team) {
  const handlers = {};
  const context = vm.createContext({
    matchDoubleState: { teamA: [], teamB: [], singles: [] },
    backfillDoubleState: { teamA: [], teamB: [], singles: [] },
    teamDoublePickerOpen: { match: { A: '', B: '' }, backfill: { A: '', B: '' } },
    TEAM_SIZE: 5, LEGACY_MATCH_ITEM_IDS: { team: 'legacy-team', personal: 'legacy-personal' },
    getSelectedPlayersByFormType: () => players,
    getMatchInteractionItemById: () => item,
    getItemCatalogAllowedTeamRelations: () => ['own_team', 'enemy_team'],
    getItemCatalogMatchIcon: () => '🍀',
    resolveMatchInteractionItemId: id => id,
    isLegacyMatchInteractionItemId: () => false,
    escapeHtml: value => String(value),
    handleItemSponsorshipToggle: () => false,
    canUseMatchRecordingForm: () => true,
    backfillSeasonSelect: { value: 'season' }, backfillPlayers: players,
    refreshMatchSelectOptions() {}, refreshBackfillSelectOptions() {},
    renderInlineTeamDoubleControls(type) { context.normalizeDoubleState(type); },
    matchFormPanel: { addEventListener(event, handler) { handlers.match = handler; } },
    backfillFormPanel: { addEventListener(event, handler) { handlers.backfill = handler; } },
  });
  vm.runInContext(functions, context);
  for (const panel of ['matchFormPanel', 'backfillFormPanel']) {
    const start = source.indexOf(`${panel}.addEventListener("click", (event) => {`);
    assert.ok(start >= 0, panel);
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
  }
  context.upsertTeamDoubleConfig(formType, team, {
    itemCatalogId: item.id, targetTeam: team === 'A' ? 'B' : 'A', paymentMode: 'solo',
  });
  return {
    context,
    click(playerId = '', gift = false) {
      const button = { dataset: {
        team, itemId: item.id, playerId, sponsorshipExempt: gift ? 'true' : undefined,
      } };
      handlers[formType]({ target: { closest: selector =>
        selector === '[data-role="team-double-payer"]' ? button : null } });
    },
    payload() {
      const result = context.buildDoubleDownPayload(formType);
      assert.equal(result.error, '');
      return result.payload[0];
    },
  };
}

for (const formType of ['match', 'backfill']) {
  for (const team of ['A', 'B']) {
    test(`${formType} ${team}: gift and player choices remain exclusive and save correctly`, () => {
      const fixture = setup(formType, team);
      const firstPlayer = `${team}0`;
      const html = () => fixture.context.buildTeamDoubleOptionsHtml(formType, team, players, item);
      assert.match(html(), /team-double-payer-grid[\s\S]*>系统赠送<\/button>/);
      assert.equal((html().match(/data-role="team-double-payer"/g) || []).length, 6);
      assert.doesNotMatch(html(), /data-role="item-sponsorship-toggle"/);

      fixture.click(firstPlayer);
      assert.equal(fixture.payload().user_player_id, firstPlayer);
      assert.equal(fixture.payload().sponsorship_exempt, false);
      fixture.click('', true);
      const gift = fixture.payload();
      assert.equal(gift.sponsorship_exempt, true);
      assert.equal(gift.payment_mode, 'solo');
      assert.equal(gift.user_player_id, firstPlayer);
      assert.equal(gift.source_team, team);
      assert.equal(gift.target_team, team === 'A' ? 'B' : 'A');
      const payerButtons = html().match(/<button[\s\S]*?<\/button>/g)
        .filter(button => button.includes('data-role="team-double-payer"'));
      assert.equal(payerButtons.filter(button => button.includes('aria-pressed="true"')).length, 1);
      assert.match(payerButtons.find(button => button.includes('aria-pressed="true"')), /系统赠送/);

      // The gift's internal player is also a valid paid choice; switching must clear exemption.
      fixture.click(firstPlayer);
      assert.equal(fixture.payload().user_player_id, firstPlayer);
      assert.equal(fixture.payload().sponsorship_exempt, false);
      fixture.click('', true);
      fixture.click('', true);
      assert.equal(fixture.context.getTeamDoubleConfig(formType, team, item.id).sponsorshipExempt, false);
      assert.match(fixture.context.buildDoubleDownPayload(formType).error, /出资者/);
    });
  }
}
