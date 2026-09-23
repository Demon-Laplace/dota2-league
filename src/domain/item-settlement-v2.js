// Staged v2 contract. The editor may validate and store this shape, but score
// settlement remains on legacy SQL until the server-side season gate is enabled.
(() => {
  const TYPES = new Set(["multiply_match", "add_points", "set_total", "record_only"]);
  const OUTCOMES = new Set(["win", "loss", "any"]);
  function exactKeys(object, keys, label) {
    if (!object || typeof object !== "object" || Array.isArray(object)
      || Object.keys(object).some(key => !keys.includes(key))
      || keys.some(key => !Object.hasOwn(object, key))) {
      throw new Error(`Invalid ${label}`);
    }
  }
  function fixed(value, scale, bound, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > bound) {
      throw new Error(`Invalid ${label}`);
    }
    const scaled = value * scale;
    const integer = Math.round(Math.abs(scaled)) * Math.sign(scaled);
    if (Math.abs(scaled - integer) > 1e-6) throw new Error(`Excess precision: ${label}`);
    return integer === 0 ? 0 : integer;
  }
  const cents = value => fixed(value, 100, 1000000, "points");
  // PostgreSQL numeric rounds ties away from zero, unlike Math.round(-0.5).
  function roundRatio(numerator, denominator) {
    const sign = Math.sign(numerator);
    const result = Math.floor((Math.abs(numerator) + denominator / 2) / denominator) * sign;
    return result === 0 ? 0 : result;
  }
  function validateRule(rule) {
    exactKeys(rule, ["version", "condition", "effect"], "rule");
    if (rule.version !== 2) throw new Error("Unsupported rule version");
    exactKeys(rule.condition, ["subject", "outcome", "scoreBelow"], "condition");
    exactKeys(rule.effect, ["type", "value"], "effect");
    const { subject, outcome, scoreBelow } = rule.condition;
    if (!["actor", "target"].includes(subject) || !OUTCOMES.has(outcome)) {
      throw new Error("Explicit condition required");
    }
    if (scoreBelow !== null) cents(scoreBelow);
    const { type, value } = rule.effect;
    if (!TYPES.has(type)) throw new Error("Unsupported effect");
    if (type === "multiply_match") fixed(value, 10000, 100, "multiplier");
    else if (type === "record_only") {
      if (value !== null) throw new Error("Record-only effect has no value");
    } else cents(value);
    return rule;
  }
  function evaluate(rule, context) {
    validateRule(rule);
    // Context must come from a server-issued match draft, never a cached
    // leaderboard. beforeTotal is before this effect; preMatchTotal is fixed.
    const base = cents(context.baseMatchDelta);
    const before = cents(context.beforeTotal);
    const subject = rule.condition.subject === "actor" ? context.actor : context.target;
    if (!subject || !["win", "loss", "pending"].includes(subject.outcome)) {
      throw new Error("Missing condition subject");
    }
    const result = (applied, delta, reason) => {
      cents((before + delta) / 100);
      return { applied, pointsDelta: delta / 100, beforeTotal: before / 100,
        afterTotal: (before + delta) / 100, reason };
    };
    if (subject.outcome === "pending") return result(false, 0, "pending_result");
    if (rule.condition.outcome !== "any" && subject.outcome !== rule.condition.outcome) {
      return result(false, 0, "outcome_not_met");
    }
    if (rule.condition.scoreBelow !== null
      && cents(subject.preMatchTotal) >= cents(rule.condition.scoreBelow)) {
      return result(false, 0, "threshold_not_met");
    }
    let delta = 0;
    switch (rule.effect.type) {
      case "multiply_match":
        delta = roundRatio(base * fixed(rule.effect.value, 10000, 100, "multiplier"), 10000) - base;
        break;
      case "add_points": delta = cents(rule.effect.value); break;
      case "set_total": delta = cents(rule.effect.value) - before; break;
      case "record_only": return result(false, 0, "record_only");
    }
    return result(true, delta, "applied");
  }
  function canUseV2(season) {
    // Date alone never activates settlement. The server must also enforce this.
    return Boolean(season && season.status === "active"
      && /^\d{4}-(0[1-9]|1[0-2])$/.test(season.code || "")
      && season.code >= "2026-10" && season.itemSettlementVersion === 2);
  }
  globalThis.LeagueItemSettlementV2 = Object.freeze({ validateRule, evaluate, canUseV2 });
})();
