// One editor for administrators and scorers; no network or scoring writes here.
(() => {
  const rules = globalThis.LeagueItemRules;
  const settlementV2 = globalThis.LeagueItemSettlementV2;
  const { ITEM_MATCH_TARGET_DEFINITIONS: targets, ITEM_MATCH_ICON_OPTIONS: icons } = globalThis.LeagueItemOptions;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const options = includeRecord => rules.EFFECTS.filter(effect => includeRecord || effect.id !== "record")
    .map(effect => `<option value="${effect.id}">${effect.label}</option>`).join("");
  function template(mode) {
    const field = (suffix, label, input) => `<label class="item-rule-field" for="${mode}Item${suffix}"><span>${label}</span>${input}</label>`;
    return `
      <div class="item-rule-grid">
        ${field("NameInput", "道具名称", `<input id="${mode}ItemNameInput" type="text" maxlength="32" placeholder="输入名称" />`)}
        ${field("MatchIconSelect", "图标", `<select id="${mode}ItemMatchIconSelect">${icons.map(icon => `<option value="${escape(icon.value)}">${escape(icon.value)} · ${escape(icon.label)}</option>`).join("")}</select>`)}
        ${field("DonationInput", "每次关联赞助额", `<input id="${mode}ItemDonationInput" type="number" min="0" step="any" placeholder="0" />`)}
        ${field("InitialQuantityInput", "本赛季每人初始数量", `<input id="${mode}ItemInitialQuantityInput" type="number" min="0" step="1" placeholder="0" />`)}
      </div>
      <section class="item-rule-section">
        <h3>作用对象</h3>
        <p class="muted">选择使用时可选的对象范围；单人与团队不能混选。</p>
        <div id="${mode}ItemMatchTargets" class="item-target-selector" aria-label="生效对象">
          ${targets.map(({value, label}) => `<button type="button" class="item-target-chip" data-role="item-target-toggle" data-mode="${mode}" data-target="${value}">${label}</button>`).join("")}
        </div>
      </section>
      <section class="item-rule-section">
        <h3>积分效果</h3>
        <div class="item-rule-grid">
          ${field("EffectSelect", "效果类型", `<select id="${mode}ItemEffectSelect">${options(true)}</select>`)}
          ${field("EffectValue", "倍率（最多两位小数，可为负数）", `<input id="${mode}ItemEffectValue" type="number" step="0.01" value="1" />`)}
        </div>
        <p id="${mode}ItemEffectPreview" class="item-rule-preview" aria-live="polite"></p>
        <select id="${mode}ItemResolutionModeSelect" hidden aria-hidden="true"><option value="effect">积分生效</option><option value="record_only">仅记录</option></select>
        <input id="${mode}ItemScoreMultiplierInput" type="hidden" value="1" />
      </section>
      <section class="item-rule-section">
        <h3>生效条件 <span class="item-rule-stage-badge">下赛季暂存</span></h3>
        <div class="item-rule-grid item-condition-grid">
          ${field("ConditionSubject", "以谁的赛果判断", `<select id="${mode}ItemConditionSubject"><option value="">请选择</option><option value="target">被使用者</option><option value="actor">使用者</option></select>`)}
          ${field("ConditionOutcome", "何时生效", `<select id="${mode}ItemConditionOutcome"><option value="">请选择</option><option value="any">无论胜负</option><option value="win">获胜时</option><option value="loss">失败时</option></select>`)}
          ${field("ConditionScoreBelow", "赛前总分低于（可选）", `<input id="${mode}ItemConditionScoreBelow" type="number" step="0.01" placeholder="不限制" />`)}
        </div>
        <p id="${mode}ItemConditionHint" class="muted item-condition-hint">该条件只写入下赛季规则，本赛季仍按现有规则结算。</p>
      </section>
      <details class="item-rule-section" id="${mode}ItemStackSection">
        <summary>组合效果（可选）</summary>
        <p class="muted">同一对象同时使用两件道具时，以组合效果替代各自效果，不是额外相乘。未配置的组合沿用独立结算。</p>
        <div id="${mode}ItemStackTargets" class="item-target-selector" aria-label="组合道具"></div>
        <div id="${mode}ItemStackMultiplierList" class="item-stack-multiplier-list"></div>
      </details>
      <p class="muted item-rule-note">名称与积分规则为全局定义，初始数量仅属于当前赛季。使用时仍可选择免赞助。</p>
      <p id="${mode}ItemEditorMessage" role="status" aria-live="polite" hidden></p>
      <div class="item-rule-actions">
        <button id="${mode}ResetItemBtn" class="button-secondary" type="button">重置表单</button>
        <button id="${mode}SaveItemBtn" type="button">保存道具</button>
      </div>`;
  }
  function update(mode, { readLegacy = false, canManage = true } = {}) {
    const panel = document.getElementById(`${mode}ItemCatalogEditorPanel`);
    if (!panel) return;
    const get = suffix => document.getElementById(`${mode}Item${suffix}`);
    const type = get("EffectSelect"), value = get("EffectValue");
    const legacy = get("ScoreMultiplierInput"), resolution = get("ResolutionModeSelect");
    if (readLegacy) {
      const decoded = rules.decodeEffect({ score_delta_multiplier: legacy.value || 1,
        score_delta_special: legacy.value === "@" ? "@" : null,
        config: { match_resolution_mode: resolution.value } });
      type.value = decoded.type;
      value.value = decoded.type === "multiply" ? decoded.value : 1;
    }
    type.disabled = !canManage;
    value.disabled = !canManage || type.value !== "multiply";
    value.closest("label").hidden = type.value !== "multiply";
    resolution.value = type.value === "record" ? "record_only" : "effect";
    try {
      const encoded = rules.encodeEffect(type.value, value.value);
      legacy.value = encoded.score_delta_special || String(encoded.score_delta_multiplier);
    } catch {
      // Preserve invalid draft for the existing save validation; never silently save 0.
      legacy.value = "invalid";
    }
    get("EffectPreview").textContent = rules.previewEffect(type.value, value.value);
    get("StackSection").hidden = type.value === "record";
    panel.querySelectorAll("[data-stack-effect], [data-stack-value]").forEach(control => {
      control.disabled = !canManage || type.value === "record";
    });
    ["ConditionSubject", "ConditionOutcome", "ConditionScoreBelow"].forEach(suffix => {
      const control = get(suffix);
      if (control) control.disabled = !canManage;
    });
  }
  function inferredLegacyRule(mode) {
    const get = suffix => document.getElementById(`${mode}Item${suffix}`);
    const type = get("EffectSelect")?.value || "multiply";
    const effect = type === "record"
      ? { type: "record_only", value: null }
      : type === "reset"
        ? { type: "set_total", value: 100 }
        : { type: "multiply_match", value: type === "cancel" ? 0 : Number(get("EffectValue")?.value || 1) };
    return {
      version: 2,
      condition: {
        subject: "target",
        outcome: type === "reset" ? "win" : "any",
        scoreBelow: type === "reset" ? 100 : null,
      },
      effect,
    };
  }
  function setCondition(mode, storedRule = null, { requireExplicit = false } = {}) {
    const fallback = inferredLegacyRule(mode);
    const rule = storedRule && typeof storedRule === "object" ? storedRule : fallback;
    const subject = document.getElementById(`${mode}ItemConditionSubject`);
    const outcome = document.getElementById(`${mode}ItemConditionOutcome`);
    const scoreBelow = document.getElementById(`${mode}ItemConditionScoreBelow`);
    if (!subject || !outcome || !scoreBelow) return;
    subject.value = requireExplicit && !storedRule ? "" : (rule.condition?.subject || "target");
    outcome.value = requireExplicit && !storedRule ? "" : (rule.condition?.outcome || "any");
    scoreBelow.value = rule.condition?.scoreBelow === null || rule.condition?.scoreBelow === undefined
      ? "" : String(rule.condition.scoreBelow);
  }
  function getRule(mode) {
    const get = suffix => document.getElementById(`${mode}Item${suffix}`);
    const subject = get("ConditionSubject")?.value || "";
    const outcome = get("ConditionOutcome")?.value || "";
    const rawThreshold = String(get("ConditionScoreBelow")?.value || "").trim();
    const type = get("EffectSelect")?.value || "multiply";
    const effect = type === "record"
      ? { type: "record_only", value: null }
      : type === "reset"
        ? { type: "set_total", value: 100 }
        : { type: "multiply_match", value: type === "cancel" ? 0 : Number(get("EffectValue")?.value) };
    const rule = {
      version: 2,
      condition: {
        subject,
        outcome,
        scoreBelow: rawThreshold === "" ? null : Number(rawThreshold),
      },
      effect,
    };
    settlementV2.validateRule(rule);
    return rule;
  }
  function stackControl(rule, mode, itemId, name, canManage) {
    const decoded = rules.decodeEffect({ score_delta_multiplier: rule.multiplier, score_delta_special: rule.specialToken });
    return `<div class="item-stack-multiplier-row" data-stack-rule>
      <span class="item-stack-multiplier-name">${escape(name)}</span>
      <select data-stack-effect aria-label="组合效果" ${canManage ? "" : "disabled"}>${rules.EFFECTS.filter(effect => effect.id !== "record").map(effect => `<option value="${effect.id}" ${effect.id === decoded.type ? "selected" : ""}>${effect.label}</option>`).join("")}</select>
      <input data-stack-value type="number" step="any" aria-label="组合倍率" value="${escape(rule.multiplier)}" ${decoded.type !== "multiply" ? "hidden" : ""} ${canManage ? "" : "disabled"} />
      <input type="hidden" data-role="item-stack-multiplier-input" data-mode="${mode}" data-item-id="${escape(itemId)}" value="${escape(rules.formatItemScoreMultiplierInputValue(rule.multiplier, rule.specialToken))}" />
    </div>`;
  }
  for (const mode of ["scorer", "admin"]) {
    const panel = document.getElementById(`${mode}ItemCatalogEditorPanel`);
    if (!panel) continue;
    panel.innerHTML = template(mode);
    const onChange = event => {
      if (event.target.id === `${mode}ItemEffectSelect` || event.target.id === `${mode}ItemEffectValue`) {
        update(mode);
        document.getElementById(`${mode}ItemResolutionModeSelect`).dispatchEvent(new Event("change"));
      }
      const row = event.target.closest("[data-stack-rule]");
      if (!row) return;
      const type = row.querySelector("[data-stack-effect]").value;
      const value = row.querySelector("[data-stack-value]");
      value.hidden = type !== "multiply";
      const legacy = row.querySelector('[data-role="item-stack-multiplier-input"]');
      try {
        const encoded = rules.encodeEffect(type, value.value);
        legacy.value = encoded.score_delta_special || String(encoded.score_delta_multiplier);
      } catch { legacy.value = "invalid"; }
    };
    panel.addEventListener("input", onChange);
    panel.addEventListener("change", onChange);
  }
  globalThis.LeagueItemEditor = Object.freeze({ update, setCondition, getRule, stackControl });
})();
