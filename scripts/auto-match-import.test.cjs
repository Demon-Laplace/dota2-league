const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { stripTypeScriptTypes } = require('node:module');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');

const seasonId = '11111111-1111-4111-8111-111111111111';
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const appSource = read('app.js');
const workerSource = read('.github/scripts/capture-opendota-screenshots.mjs');
const edgeSource = stripTypeScriptTypes(read('supabase/functions/fetch-dota-match/index.ts'));

function functions(source, names, globals = {}) {
  const bodies = names.map(name => {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
  });
  const context = vm.createContext({ URL, Request, Response, AbortSignal, console,
    Buffer, createHash, gzipSync, gunzipSync, ...globals });
  vm.runInContext(bodies.join('\n'), context);
  return context;
}

function officialResult(overrides = {}) {
  return { match_id: 12345, start_time: 1791464400, duration: 2400, radiant_win: true,
    radiant_score: 25, dire_score: 14,
    players: Array.from({ length: 10 }, (_, index) => ({
      account_id: 100 + index, player_slot: index < 5 ? index : 128 + index - 5,
      hero_id: index + 1, kills: index, deaths: 2, assists: 3,
    })), ...overrides };
}

function query(rows) {
  return { select() { return this; }, eq() { return this; }, in() { return this; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
}

function edge({ allowed = true, fetchImpl, accountRows = [], membershipRows = [] } = {}) {
  let handler;
  let serviceCalls = 0;
  let fetchCalls = 0;
  const context = vm.createContext({ URL, Request, Response, AbortSignal, console,
    corsHeaders: {}, jsonResponse: (body, init = {}) => new Response(JSON.stringify(body), init),
    createUserScopedClient: req => req.headers.has('Authorization')
      ? { supabase: { rpc: async () => ({ data: allowed, error: null }) } }
      : { error: new Response('{}', { status: 401 }) },
    requireUser: async () => ({ user: { id: 'operator' } }),
    parseJson: async req => ({ data: await req.json() }),
    createServiceRoleClient: () => { serviceCalls++; return {
      from: table => query(table === 'player_external_accounts' ? accountRows : membershipRows),
    }; },
    fetch: async url => { fetchCalls++; return fetchImpl(url); },
    Deno: { env: { get: name => name === 'STEAM_WEB_API_KEY' ? 'test-only' : undefined },
      serve: callback => { handler = callback; } },
  });
  vm.runInContext(edgeSource.replace(/^import[\s\S]*?;\n/gm, ''), context);
  return { context,
    request: (body, authenticated = true) => handler(new Request('http://test', {
      method: 'POST', headers: authenticated ? { Authorization: 'Bearer test-only' } : {},
      body: JSON.stringify(body),
    })), counts: () => ({ serviceCalls, fetchCalls }) };
}

test('fetch endpoint requires authentication, an explicit season, and scorer permission before external access', async () => {
  for (const [authenticated, body, allowed, status] of [
    [false, { seasonId, matchId: '12345' }, true, 401],
    [true, { matchId: '12345' }, true, 400],
    [true, { seasonId, matchId: '12345' }, false, 403],
  ]) {
    const fixture = edge({ allowed, fetchImpl: () => { throw new Error('must not fetch'); } });
    assert.equal((await fixture.request(body, authenticated)).status, status);
    assert.deepEqual(fixture.counts(), { serviceCalls: 0, fetchCalls: 0 });
  }
});

test('invalid month is a client error; Valve history errors do not become an empty successful list', async () => {
  const fixture = edge({ fetchImpl: async () => Response.json({ result: { status: 15 } }) });
  assert.equal((await fixture.request({ seasonId, leagueId: '19878', monthCode: '2026-13' })).status, 400);
  assert.equal((await fixture.request({ seasonId, leagueId: '19878', monthCode: '2026-10' })).status, 502);
});

test('network failure falls back to OpenDota and only active season mappings are returned', async () => {
  const fixture = edge({ accountRows: [
    { provider_account_id: '100', player_id: 'active', players: { display_name: '选手一' } },
    { provider_account_id: '101', player_id: 'pending', players: { display_name: '选手二' } },
  ], membershipRows: [{ player_id: 'active', join_status: 'active' },
    { player_id: 'pending', join_status: 'pending' }],
  fetchImpl: async url => {
    if (url.hostname === 'api.steampowered.com') throw new TypeError('network unavailable');
    return Response.json(officialResult({ radiant_win: false }));
  } });
  const response = await fixture.request({ seasonId, matchId: '12345' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, 'opendota_public');
  assert.equal(body.winnerSide, 'dire');
  assert.equal(body.radiantScore, 25);
  assert.equal(body.matchedCount, 1);
  assert.equal(body.players[0].matchedPlayerId, 'active');
  assert.equal(body.players[1].matchedPlayerId, null);
});

test('missing winner and duplicate or invalid team slots cannot be imported', () => {
  const { context } = edge();
  for (const result of [officialResult({ radiant_win: undefined }),
    officialResult({ match_id: 999 }),
    officialResult({ players: officialResult().players.map(player => ({ ...player, player_slot: 0 })) }),
    officialResult({ players: officialResult().players.map((player, i) => ({ ...player, player_slot: i })) }),
  ]) assert.throws(() => context.validateMatchResult(result, '12345'));
  assert.doesNotThrow(() => context.validateMatchResult(officialResult({ radiant_win: false }), '12345'));
});

test('month paging preserves IDs beyond safe integers and fails on a stuck cursor', async () => {
  const fixture = edge({ fetchImpl: async url => {
    assert.equal(url.searchParams.get('matches_requested'), '100');
    return Response.json({ result: { status: 1, matches: [
      { match_id: '90071992547409933', start_time: 1791464400 },
    ] } });
  } });
  await assert.rejects(fixture.context.fetchLeagueMatchesForVersion('test', '19878', 'v1', '2026-10'), /分页没有前进/);
});

test('month paging fails instead of returning a partial month at the safety limit', async () => {
  let matchId = 1000;
  const fixture = edge({ fetchImpl: async () => Response.json({ result: { status: 1,
    matches: [{ match_id: String(matchId--), start_time: 1791464400 }] } }) });
  await assert.rejects(fixture.context.fetchLeagueMatchesForVersion('test', '19878', 'v1', '2026-10'), /读取上限/);
});

test('the 2am Beijing business-month boundaries include the last late-night match', () => {
  const { context } = edge();
  const range = context.getMonthUnixRange('2026-10');
  assert.equal(new Date(range.startSeconds * 1000).toISOString(), '2026-09-30T18:00:00.000Z');
  assert.equal(new Date(range.endSeconds * 1000).toISOString(), '2026-10-31T18:00:00.000Z');
});

test('identical rosters require explicit association even when match counts agree; linked matches are excluded', async () => {
  const dayMatches = [{ match_id: 'one' }, { match_id: 'two' }];
  const context = functions(appSource, ['getOfficialManualAssociationContext'], {
    fetchRecentMatchRowsForSeasonDate: async () => dayMatches,
    fetchOfficialMatchAssetsForMatchIds: async () => new Map(),
    getOfficialMatchesForDate: () => [{}, {}],
    getOfficialSavedMatchRosterCandidates: () => dayMatches,
  });
  assert.equal((await context.getOfficialManualAssociationContext(seasonId, '2026-10-08', {})).requiresManualSelection, true);
  context.fetchOfficialMatchAssetsForMatchIds = async () => new Map([['one', { dota_match_id: 'different' }]]);
  const association = await context.getOfficialManualAssociationContext(seasonId, '2026-10-08', {});
  assert.equal(association.requiresManualSelection, false);
  assert.equal(association.candidates[0].match_id, 'two');
});

test('missing power and kill totals remain unknown instead of being displayed as zero', () => {
  const context = functions(appSource, ['normalizeOfficialMatchSummary', 'getRecentMatchTeamBadgeConfig'], {
    getRecentMatchTeamScore: () => null, formatScore: value => String(value),
  });
  assert.equal(context.normalizeOfficialMatchSummary({ radiantScore: null, direScore: null }), null);
  assert.equal(context.getRecentMatchTeamBadgeConfig({}, 'A', false, null, true).label, '—');
  assert.equal(context.getRecentMatchTeamBadgeConfig({}, 'A', false, null, true).className, '');
});

test('official player cards render account labels, heroes and KDA with all migrated dependencies', () => {
  const context = functions(appSource, ['buildImportedDotaSlotLabel', 'buildImportedDotaSlotMeta',
    'renderOfficialMatchPlayerChip'], {
    getOfficialMatchSlotKey: () => 'radiant:1', getOfficialMatchMappingKey: () => '12345:radiant:1',
    getOfficialSelectedPlayerId: () => '', getOfficialLocalPlayerName: () => '',
    officialMatchImportState: { activeMappingKey: '' }, getHeroDisplayName: value => value,
    normalizeKdaEntry: value => value, hasKdaEntryValue: () => true, escapeHtml: value => String(value),
  });
  const html = context.renderOfficialMatchPlayerChip('12345', {}, {
    accountId: '100', heroName: 'Axe', slotNo: 1, kills: 7, deaths: 2, assists: 9,
  }, 0);
  assert.match(html, /#100/);
  assert.match(html, /Axe/);
  assert.match(html, /KDA 7\/2\/9/);
});

test('RPC permission errors do not trigger legacy schema fallbacks', () => {
  const context = functions(appSource, ['shouldRetryMissingRpc'], { getErrorMessage: error => error.message });
  assert.equal(context.shouldRetryMissingRpc({ code: '42501', message: 'permission denied for assign_player_steam_account' }, 'assign_player_steam_account'), false);
  assert.equal(context.shouldRetryMissingRpc({ code: 'PGRST202', message: 'Could not find the function assign_player_steam_account' }, 'assign_player_steam_account'), true);
});

test('import locks before loading details and releases the lock after a failed lookup', async () => {
  let release;
  let calls = 0;
  const state = { isSaving: false };
  const context = functions(appSource, ['saveOfficialImportedMatch'], {
    officialMatchImportState: state, normalizeDotaMatchIdInput: value => value,
    ensureScorerAccess: () => true, getOfficialMonthEntryByMatchId: () => ({ seasonId }),
    canModifyMatchRecordsForSeason: () => true, getOfficialMatchEntry: () => ({}),
    getOfficialMatchDetail: () => null, renderOfficialMatchesModal() {}, setOfficialMatchesMessage() {},
    loadOfficialMatchDetail: () => { calls++; return new Promise(resolve => { release = resolve; }); },
  });
  const first = context.saveOfficialImportedMatch('12345');
  assert.equal(state.isSaving, true);
  await context.saveOfficialImportedMatch('12345');
  assert.equal(calls, 1);
  release(null);
  await first;
  assert.equal(state.isSaving, false);
});

test('already-linked official matches refresh details without creating another match or changing scores', async () => {
  let refreshed = 0;
  const players = Array.from({ length: 10 }, (_, index) => ({ id: `player-${index}` }));
  const matchEntry = {};
  const state = { isSaving: false };
  const context = functions(appSource, ['saveOfficialImportedMatch'], {
    officialMatchImportState: state, TEAM_SIZE: 5,
    normalizeDotaMatchIdInput: value => value, ensureScorerAccess: () => true,
    getOfficialMonthEntryByMatchId: () => ({ seasonId }), canModifyMatchRecordsForSeason: () => true,
    getOfficialMatchEntry: () => matchEntry,
    getOfficialMatchDetail: () => ({ matchId: '12345', winnerSide: 'radiant' }),
    getOfficialResolvedPlayerContext: () => ({ radiantPlayerIds: players.slice(0,5).map(player => player.id),
      direPlayerIds: players.slice(5).map(player => player.id), allPlayerIds: players.map(player => player.id) }),
    getOfficialEligiblePlayersForSeason: async () => players,
    getOfficialMatchDate: () => '2026-10-08', getBeijingBusinessDateString: () => '2026-10-12',
    getSeasonMetaById: () => ({ start_date: '2026-10-01' }), mapWinnerSideToTeam: () => 'A',
    buildOfficialMatchAssignments: () => ({}), refreshOfficialAssetLinksForMatches: async () => {},
    getOfficialAssetLinkForDotaMatchId: () => ({ asset: { match_id: 'local' }, match: { season_id: seasonId } }),
    persistOfficialImportedSnapshot: async () => { refreshed++; },
    renderOfficialMatchesModal() {}, setOfficialMatchesMessage() {},
    db: { rpc() { throw new Error('must not change scores or create a match'); } },
  });
  await context.saveOfficialImportedMatch('12345');
  assert.equal(refreshed, 1);
  assert.equal(matchEntry.imported, true);
  assert.equal(state.isSaving, false);
});

test('archive checksum mismatches are rejected before decoding or displaying match data', async () => {
  const cache = new Map();
  const context = functions(appSource, ['fetchOpendotaSnapshotArchivePayloadFromIndex'], {
    opendotaSnapshotArchivePayloadCache: cache,
    resolveOpendotaSnapshotArchiveUrl: value => value,
    fetch: async () => new Response(new Uint8Array([1,2,3])),
    calculateSha256Hex: async () => 'actual-checksum',
    decodeGzipArchiveText() { throw new Error('must not decode'); },
  });
  await assert.rejects(context.fetchOpendotaSnapshotArchivePayloadFromIndex({ path: 'archive.gz', sha256: 'different-checksum' }), /归档校验失败/);
  assert.equal(cache.size, 0);
});

test('imported heroes and KDA persist in the existing snapshot format and survive reconstruction', async () => {
  let saved;
  const imported = { matchId: '12345', startTime: 1791464400, duration: 2400,
    winnerSide: 'radiant', radiantWin: true, radiantScore: 25, direScore: 14,
    players: [{ side: 'radiant', slotNo: 1, matchedPlayerId: 'player', heroName: 'Axe', kills: 7, deaths: 2, assists: 9 }] };
  const context = functions(appSource, ['persistOfficialImportedSnapshot', 'normalizeOfficialMatchSummary',
    'normalizeOfficialSnapshotPlayer', 'normalizeOfficialSnapshotRow', 'buildRecentMatchSnapshotFromOfficialSnapshotRow'], {
    getOfficialMatchDetail: () => imported, getOfficialMatchEntry: () => ({}),
    getSavedMatchById: () => ({ match_id: 'local', season_id: seasonId, match_date: '2026-10-08' }),
    getSavedMatchDateValue: match => match.match_date, getOfficialMatchPlayers: match => match.players,
    getOfficialSelectedPlayerId: player => player.matchedPlayerId,
    getOfficialLocalPlayerName: () => '选手', normalizeDotaMatchIdInput: value => String(value),
    normalizeHeroName: value => value, normalizeKdaValue: value => value ?? null,
    db: { from: () => ({ upsert: async row => { saved = row; return { error: null }; } }) },
  });
  await context.persistOfficialImportedSnapshot('local', '12345');
  assert.equal(saved.archive_status, 'pending');
  const snapshot = context.buildRecentMatchSnapshotFromOfficialSnapshotRow(saved);
  assert.equal(snapshot.playersById.get('player').hero_name, 'Axe');
  assert.equal(snapshot.playersById.get('player').kills, 7);
  assert.equal(snapshot.summary.radiant_score, 25);
  assert.equal(context.normalizeOfficialSnapshotRow(saved).detail.duration, 2400);
});

test('manual month capture only selects the requested month and respects force', async () => {
  const context = functions(workerSource, ['buildTargets'], {
    normalizeArchiveMonth: value => value,
    getMatchesForMonth: async month => { assert.equal(month, '2026-10'); return [{ match_id: 'one' }, { match_id: 'two' }]; },
    getAssetsByMatchIds: async () => [{ match_id: 'one', asset_status: 'available', dota_match_id: '1' },
      { match_id: 'two', asset_status: 'pending', dota_match_id: '2' }],
    getQueuedAssets: () => { throw new Error('must not process other months'); },
  });
  const options = { snapshotArchiveMonth: '2026-10', limit: 20, force: false };
  assert.equal((await context.buildTargets(options))[0].match.match_id, 'two');
  assert.equal((await context.buildTargets({ ...options, force: true })).length, 2);
});

test('background association never resolves identical rosters by count or match order', async () => {
  const context = functions(workerSource, ['shouldRequireManualOfficialMatchAssociation'], {
    getLocalMatchesForDate: async () => [{}, {}], getLocalMatchRosterSignature: () => 'same-rosters',
  });
  assert.equal(await context.shouldRequireManualOfficialMatchAssociation({}, 2), true);
});

const archiveFunctions = ['createSnapshotArchiveBundle', 'buildSnapshotArchivePayload',
  'getSnapshotArchiveBlobPath', 'getSnapshotArchiveIndexPath', 'getSnapshotArchivePrefix'];
function archiveGlobals() {
  return { PROVIDER: 'opendota', BUCKET: 'opendota-match-screenshots', DEFAULT_SNAPSHOT_ARCHIVE_PREFIX: 'data/opendota' };
}
const row = { id: 'snapshot', match_id: 'local', season_id: seasonId,
  match_date: '2026-10-08', dota_match_id: '12345', updated_at: '2026-10-08T12:00:00Z', payload: {} };
const archiveOptions = { githubRepository: 'test/repo', snapshotArchiveBranch: 'dev/test' };

test('archive blobs are immutable and named by their verified SHA256 checksum', () => {
  const context = functions(workerSource, archiveFunctions, archiveGlobals());
  const bundle = context.createSnapshotArchiveBundle(row.match_date, [row], archiveOptions);
  assert.equal(bundle.index.immutable, true);
  assert.ok(bundle.blobPath.endsWith(`.${bundle.sha256}.json.gz`));
  assert.equal(createHash('sha256').update(bundle.gzipBuffer).digest('hex'), bundle.index.sha256);
});

test('archive retains earlier matches and only marks source rows after both uploads succeed', async () => {
  const writes = [];
  let archivedRows;
  const context = functions(workerSource, ['archiveSnapshotDate', ...archiveFunctions], {
    ...archiveGlobals(), getSnapshotRowsByDate: async () => [row],
    readArchivedSnapshotRows: async () => [{ ...row, match_id: 'earlier', dota_match_id: '11111' }],
    putGithubContentFile: async (...args) => writes.push(args[0]),
    putGithubJsonFile: async (...args) => writes.push(args[0]),
    markSnapshotRowsArchived: async (rows, bundle) => {
      assert.equal(writes.length, 2);
      archivedRows = rows;
      assert.equal(bundle.payload.matches.length, 2);
    },
  });
  await context.archiveSnapshotDate(row.match_date, archiveOptions);
  assert.equal(archivedRows[0].id, 'snapshot');
  archivedRows = null;
  context.putGithubJsonFile = async () => { throw new Error('index upload failed'); };
  await assert.rejects(context.archiveSnapshotDate(row.match_date, archiveOptions), /index upload failed/);
  assert.equal(archivedRows, null);
});

test('archiving updates only unchanged source snapshots and never deletes them', async () => {
  const calls = [];
  const context = functions(workerSource, ['markSnapshotRowsArchived'], {
    supabaseRequest: async (url, options) => calls.push({ url, options }),
  });
  await context.markSnapshotRowsArchived([row], { indexPath: 'index.json' }, archiveOptions);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.ok(calls[0].url.includes(`id=eq.${row.id}&updated_at=eq.${encodeURIComponent(row.updated_at)}`));
  assert.equal(calls[0].options.body.archive_status, 'archived');
});

test('invalid existing archives fail before any replacement is attempted', async () => {
  const context = functions(workerSource, ['readArchivedSnapshotRows', ...archiveFunctions], {
    ...archiveGlobals(), readGithubArchiveFile: async () => Buffer.from(JSON.stringify({
      matchDate: row.match_date, path: '../../elsewhere', sha256: 'untrusted',
    })),
  });
  await assert.rejects(context.readArchivedSnapshotRows(row.match_date, archiveOptions), /invalid/);
});
