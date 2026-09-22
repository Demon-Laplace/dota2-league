// Shared editor vocabulary and supported target groups.
(() => {
const ITEM_MATCH_TARGET_DEFINITIONS = [
  { value: "self", label: "自己", group: "single" },
  { value: "ally", label: "队友(单人)", group: "single" },
  { value: "opponent", label: "对手(单人)", group: "single" },
  { value: "own_team", label: "己方团队", group: "team" },
  { value: "enemy_team", label: "对方团队", group: "team" },
];
const ITEM_MATCH_ICON_OPTIONS = [
  { value: "◉", label: "圆形金币" },
  { value: "⇄", label: "左右互换" },
  { value: "↻", label: "刷新" },
  { value: "●", label: "黑色圆形" },
  { value: "◆", label: "菱形" },
  { value: "✦", label: "星芒" },
  { value: "⚔", label: "交叉双剑" },
];
globalThis.LeagueItemOptions = Object.freeze({ ITEM_MATCH_TARGET_DEFINITIONS: Object.freeze(ITEM_MATCH_TARGET_DEFINITIONS.map(Object.freeze)), ITEM_MATCH_ICON_OPTIONS: Object.freeze(ITEM_MATCH_ICON_OPTIONS.map(Object.freeze)) });
})();
