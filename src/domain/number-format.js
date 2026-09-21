// Pure domain utilities: no DOM, storage, network, or application state.
(function (root) {
"use strict";
function formatChineseCardinalNumber(value) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0) return String(value ?? "");
  if (normalized === 0) return "零";

  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (normalized < 10) return digits[normalized];
  if (normalized < 20) return `十${normalized % 10 ? digits[normalized % 10] : ""}`;
  if (normalized < 100) {
    const tens = Math.floor(normalized / 10);
    const ones = normalized % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ""}`;
  }

  if (normalized < 10000) {
    const units = ["", "十", "百", "千"];
    let remaining = normalized;
    let result = "";
    let zeroPending = false;
    for (let unitIndex = units.length - 1; unitIndex >= 0; unitIndex -= 1) {
      const unitValue = 10 ** unitIndex;
      const digit = Math.floor(remaining / unitValue);
      remaining %= unitValue;
      if (!digit) {
        zeroPending = Boolean(result && remaining);
        continue;
      }
      if (zeroPending) result += "零";
      result += `${digits[digit]}${units[unitIndex]}`;
      zeroPending = false;
    }
    return result;
  }

  return String(normalized)
    .split("")
    .map((digit) => digits[Number(digit)] || digit)
    .join("");
}

function formatChineseRankOrdinal(value) {
  const normalized = Number(value);
  const numerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  if (Number.isInteger(normalized) && normalized >= 0 && normalized < numerals.length) {
    return numerals[normalized];
  }
  return String(value || "");
}
root.LeagueNumberFormat = Object.freeze({ formatChineseCardinalNumber, formatChineseRankOrdinal });
})(globalThis);

