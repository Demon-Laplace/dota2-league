import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankRows,encodeSnapshot,decodeSnapshot,calculateChampion} from '../supabase/functions/publish-season-champion/champion.mjs';
const players = [{player_id:'a',display_name:'A',score_total:100,wins:2,losses:1},{player_id:'b',display_name:'B',score_total:90,wins:1,losses:1}];
test('hero and manual rewards count independently, participation includes open-ended rules',()=>{
  const rows = rankRows(players,[{matches_played:1,participation_points:2,is_open_ended:true,points_per_extra_match:3}],
    [{player_id:'b',points_delta:10}],[{player_id:'b',points_delta:20}],[]);
  assert.equal(rows[0].player_id,'b'); assert.equal(rows[0].score,125); assert.equal(rows[1].score,108);
});
test('total-score ties use win/loss, accounting for item rollback',()=>{
  const rows = rankRows(players.map(p=>({...p,score_total:100})),[],[],[],[
    {id:'1',player_id:'a',entry_type:'item_effect',points_delta:20},
    {id:'2',player_id:'a',entry_type:'rollback',points_delta:-20,reversal_of_id:'1'},
    {id:'3',player_id:'b',entry_type:'item_effect',points_delta:10},
  ]);
  assert.equal(rows[0].player_id,'a');
});
test('snapshot Unicode roundtrip and malformed files fail closed',()=>{
  const rows=[{seasonCode:'2026-06',championName:'将军'}];
  assert.deepEqual(decodeSnapshot(encodeSnapshot(rows)),rows);
  assert.throws(()=>decodeSnapshot('unexpected content'));
});
test('active season cannot be frozen',async()=>{
  await assert.rejects(calculateChampion('unused','unused',{status:'active'}),/ended/);
});
