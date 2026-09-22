// Pure item-rule adapter. Database columns remain authoritative.
(() => {
const RESET_ITEM_SCORE_SPECIAL_TOKEN = "@";
function getItemCatalogResolutionMode(entry) {
  const rawValue = entry?.config && typeof entry.config === "object"
    ? entry.config.match_resolution_mode
    : undefined;
  return rawValue === "record_only" ? "record_only" : "effect";
}

function isItemCatalogRecordOnly(entry) {
  return getItemCatalogResolutionMode(entry) === "record_only";
}

function normalizeItemScoreMultiplierValue(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeItemScoreSpecialToken(value = "") {
  const normalized = String(value ?? "").trim();
  return normalized === RESET_ITEM_SCORE_SPECIAL_TOKEN ? RESET_ITEM_SCORE_SPECIAL_TOKEN : "";
}

function parseItemScoreMultiplierInput(value, fallback = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      valid: true,
      multiplier: normalizeItemScoreMultiplierValue(fallback, 0),
      specialToken: "",
    };
  }
  if (raw === RESET_ITEM_SCORE_SPECIAL_TOKEN) {
    return {
      valid: true,
      multiplier: 0,
      specialToken: RESET_ITEM_SCORE_SPECIAL_TOKEN,
    };
  }
  const multiplier = Number(raw);
  if (!Number.isFinite(multiplier)) {
    return {
      valid: false,
      multiplier: normalizeItemScoreMultiplierValue(fallback, 0),
      specialToken: "",
    };
  }
  return {
    valid: true,
    multiplier,
    specialToken: "",
  };
}

function formatItemScoreMultiplierInputValue(multiplier = 0, specialToken = "") {
  const normalizedSpecialToken = normalizeItemScoreSpecialToken(specialToken);
  if (normalizedSpecialToken) return normalizedSpecialToken;
  return String(normalizeItemScoreMultiplierValue(multiplier, 0));
}

function getItemCatalogScoreDeltaMultiplier(entry) {
  return normalizeItemScoreMultiplierValue(entry?.score_delta_multiplier, 0);
}

function getItemCatalogScoreDeltaSpecialToken(entry) {
  return normalizeItemScoreSpecialToken(entry?.score_delta_special ?? entry?.config?.score_delta_special);
}

function isResetToInitialWinScoreMultiplier(multiplier = 0, specialToken = "") {
  return normalizeItemScoreSpecialToken(specialToken) === RESET_ITEM_SCORE_SPECIAL_TOKEN;
}

function normalizeItemScoreStackRules(rawRules = [], selfItemId = "") {
  if (!Array.isArray(rawRules)) return [];
  const seenItemIds = new Set();

  return rawRules.reduce((list, rule) => {
    const itemCatalogId = String(rule?.itemCatalogId || rule?.item_catalog_id || "").trim();
    if (!itemCatalogId || itemCatalogId === selfItemId || seenItemIds.has(itemCatalogId)) {
      return list;
    }
    seenItemIds.add(itemCatalogId);
    const specialToken = normalizeItemScoreSpecialToken(rule?.specialToken ?? rule?.score_delta_special);
    list.push({
      itemCatalogId,
      multiplier: normalizeItemScoreMultiplierValue(rule?.multiplier ?? rule?.score_delta_multiplier, 0),
      specialToken,
    });
    return list;
  }, []);
}

function getItemCatalogScoreStackRules(entry) {
  if (isItemCatalogRecordOnly(entry)) {
    return [];
  }
  return normalizeItemScoreStackRules(entry?.score_delta_stack_rules, entry?.id || "");
}

function getItemScoreMultiplierPriority(multiplier = 0, specialToken = "") {
  return isResetToInitialWinScoreMultiplier(multiplier, specialToken)
    ? Number.POSITIVE_INFINITY
    : Math.abs(normalizeItemScoreMultiplierValue(multiplier, 0));
}

function getItemCatalogScoreStackMultiplier(itemEntryA, itemEntryB) {
  const itemIdA = itemEntryA?.id || "";
  const itemIdB = itemEntryB?.id || "";
  if (!itemIdA || !itemIdB || itemIdA === itemIdB) return null;
  const rule = getItemCatalogScoreStackRules(itemEntryA).find((entry) => entry.itemCatalogId === itemIdB) || null;
  return rule
    ? {
      multiplier: normalizeItemScoreMultiplierValue(rule.multiplier, 0),
      specialToken: normalizeItemScoreSpecialToken(rule.specialToken),
    }
    : null;
}
// Choose disjoint configured pairs by priority, preserving the established order
// for ties. Clone candidates: previewing must never consume the caller's state.
function resolveItemEffectGroups(effectCandidatesByTarget) {
  const appliedGroups = [];
  effectCandidatesByTarget.forEach((candidates) => {
    const effects = candidates.map(candidate => ({ ...candidate, isConsumed: false }));
    while (true) {
      let bestPair = null;
      for (let index = 0; index < effects.length; index += 1) {
        const current = effects[index];
        if (current.isConsumed || !current.itemEntry?.id) continue;
        for (let peerIndex = index + 1; peerIndex < effects.length; peerIndex += 1) {
          const peer = effects[peerIndex];
          if (peer.isConsumed || !peer.itemEntry?.id) continue;
          const stackRule = getItemCatalogScoreStackMultiplier(current.itemEntry, peer.itemEntry);
          if (stackRule === null) continue;
          const candidate = {
            left: current,
            right: peer,
            appliedMultiplier: stackRule.multiplier,
            appliedSpecialToken: stackRule.specialToken,
          };
          if (
            !bestPair
            || getItemScoreMultiplierPriority(candidate.appliedMultiplier, candidate.appliedSpecialToken)
              > getItemScoreMultiplierPriority(bestPair.appliedMultiplier, bestPair.appliedSpecialToken)
          ) {
            bestPair = candidate;
          }
        }
      }

      if (!bestPair) break;
      bestPair.left.isConsumed = true;
      bestPair.right.isConsumed = true;
      appliedGroups.push({
        targetPlayerId: bestPair.left.targetPlayerId,
        targetTeam: bestPair.left.targetTeam,
        itemLabel: `${bestPair.left.itemLabel} + ${bestPair.right.itemLabel}`,
        appliedMultiplier: bestPair.appliedMultiplier,
        appliedSpecialToken: bestPair.appliedSpecialToken,
      });
    }

    effects.forEach((entry) => {
      if (entry.isConsumed) return;
      appliedGroups.push({
        targetPlayerId: entry.targetPlayerId,
        targetTeam: entry.targetTeam,
        itemLabel: entry.itemLabel,
        appliedMultiplier: entry.appliedMultiplier,
        appliedSpecialToken: entry.appliedSpecialToken,
      });
    });
  });

  return appliedGroups;
}

// Only expose capabilities implemented by authoritative SQL settlement.
const EFFECTS = Object.freeze([
  Object.freeze({ id: "multiply", label: "本场积分乘以倍率", detail: "只影响本场胜负积分，不影响人工积分、英雄奖励等独立加分。", value: "1" }),
  Object.freeze({ id: "cancel", label: "本场胜负积分归零", detail: "抵消本场胜负积分，不清空选手的总积分。", value: "0" }),
  Object.freeze({ id: "reset", label: "总积分重置至 100", detail: "仅在获胜且赛前总分低于 100 时生效；失败时仅记录使用。此条件由结算规则限定。", value: "@" }),
  Object.freeze({ id: "record", label: "仅记录使用", detail: "不改变积分，也不参与组合效果；仍按使用时的赞助选项记录。", value: "1" }),
]);
function decodeEffect(entry) {
  if (isItemCatalogRecordOnly(entry)) return { type: "record", value: 1 };
  if (getItemCatalogScoreDeltaSpecialToken(entry)) return { type: "reset", value: 100 };
  const value = getItemCatalogScoreDeltaMultiplier(entry);
  return { type: value === 0 ? "cancel" : "multiply", value };
}
function encodeEffect(type, value = 1) {
  if (!EFFECTS.some(effect => effect.id === type)) throw new Error("不支持的道具效果");
  const spec = parseItemScoreMultiplierInput(type === "reset" ? "@" : type === "cancel" ? 0 : type === "record" ? 1 : value, 1);
  if (!spec.valid || (type === "multiply" && spec.specialToken)) throw new Error("请输入有效倍率");
  return { score_delta_multiplier: spec.multiplier, score_delta_special: spec.specialToken || null,
    match_resolution_mode: type === "record" ? "record_only" : "effect" };
}
function previewEffect(type, value) {
  const effect = EFFECTS.find(entry => entry.id === type);
  if (!effect) return "请选择效果";
  if (type !== "multiply") return effect.detail;
  const spec = parseItemScoreMultiplierInput(value, 1);
  if (!spec.valid || spec.specialToken) return "请输入有效倍率";
  const format = number => Number(number.toFixed(6)).toString();
  return `例：本场原本 +10 → ${format(10 * spec.multiplier)}；原本 −10 → ${format(-10 * spec.multiplier)}。仅影响本场胜负积分。`;
}
globalThis.LeagueItemRules = Object.freeze({ RESET_ITEM_SCORE_SPECIAL_TOKEN, getItemCatalogResolutionMode, isItemCatalogRecordOnly, normalizeItemScoreMultiplierValue, normalizeItemScoreSpecialToken, parseItemScoreMultiplierInput, formatItemScoreMultiplierInputValue, getItemCatalogScoreDeltaMultiplier, getItemCatalogScoreDeltaSpecialToken, isResetToInitialWinScoreMultiplier, normalizeItemScoreStackRules, getItemCatalogScoreStackRules, getItemScoreMultiplierPriority, getItemCatalogScoreStackMultiplier, resolveItemEffectGroups, EFFECTS, decodeEffect, encodeEffect, previewEffect });
})();
