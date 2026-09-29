// Item allowance affects sponsorship totals, never individual usage records.
(() => {
  const cents = value => Math.round((Number(value) || 0) * 100);
  const isItemCost = log => Boolean(log?.player_id) && (
    log.category === 'card' || log.category === 'misc'
    || String(log.source_key || '').startsWith('item_purchase:')
  );
  function totals(logs, credits) {
    const byPlayer = new Map();
    let grossCents = 0;
    for (const log of logs || []) {
      const amount = Math.max(cents(log.amount), 0);
      grossCents += amount;
      if (!log.player_id) continue;
      const id = String(log.player_id);
      const row = byPlayer.get(id) || { grossCents: 0, itemCents: 0 };
      row.grossCents += amount;
      if (isItemCost(log)) row.itemCents += amount;
      byPlayer.set(id, row);
    }
    const ids = new Set([...byPlayer.keys(), ...credits.keys()]);
    let appliedCents = 0;
    for (const id of ids) {
      const row = byPlayer.get(id) || { grossCents: 0, itemCents: 0 };
      const creditCents = Math.max(cents(credits.get(id)), 0);
      row.creditCents = creditCents;
      row.remainingCents = creditCents - row.itemCents;
      row.appliedCents = Math.min(creditCents, row.itemCents);
      row.netCents = row.grossCents - row.appliedCents;
      appliedCents += row.appliedCents;
      byPlayer.set(id, row);
    }
    return { byPlayer, grossCents, appliedCents, netCents: grossCents - appliedCents };
  }
  globalThis.LeagueItemCredit = Object.freeze({ totals, isItemCost });
})();
