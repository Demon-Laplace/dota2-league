/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceRoleClient,
  createUserScopedClient,
  parseJson,
  requireUser,
  requiredEnv,
} from "../_shared/client.ts";

type ArchiveSeasonBody = {
  seasonId?: string;
  archiveAfterExport?: boolean;
  deleteAfterExport?: boolean;
};

type SeasonRow = {
  id: string;
  code: string | null;
  name: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  rule_version: string | null;
  rule_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type LeaderboardRow = {
  player_id: string;
  display_name: string;
  initial_score: number | string | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  win_rate: number | string | null;
  score_total: number | string | null;
  rank: number | null;
};

type MembershipRow = {
  player_id: string;
  join_status: string;
  rank_no: number | null;
  joined_at: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  is_active: boolean;
};

type SeasonItemSettingRow = {
  item_catalog_id: string;
  initial_quantity: number;
};

type ItemCatalogRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  effect_type: string;
  default_points_delta: number | string | null;
  is_active: boolean;
  config: Record<string, unknown> | null;
};

type MatchDetailRow = {
  match_id: string;
  season_id: string;
  season_code: string | null;
  season_name: string | null;
  match_no: number | null;
  match_date: string | null;
  status: string;
  winner_side: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  created_by_name: string | null;
  submitted_by_name: string | null;
  approved_by_name: string | null;
  players: Array<{
    player_id: string;
    display_name: string;
    side: string;
    slot_no: number | null;
    is_captain: boolean;
    result: string | null;
  }>;
};

type RewardDonationRow = {
  donor_name: string;
  amount: number | string;
  category: string;
  note: string | null;
  is_outside: boolean;
  is_public: boolean;
  donated_at: string;
  player_id: string | null;
  match_id: string | null;
};

function sanitizePathSegment(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    || "season";
}

function escapeCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

function formatUtc(value: string | null | undefined) {
  if (!value) return "无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace(".000Z", "Z");
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function buildTable(headers: string[], rows: string[][]) {
  if (!rows.length) {
    return "暂无记录";
  }

  const head = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => escapeCell(cell)).join(" | ")} |`);
  return [head, separator, ...body].join("\n");
}

function toBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function groupMatchPlayers(players: MatchDetailRow["players"], side: "radiant" | "dire") {
  return (Array.isArray(players) ? players : [])
    .filter((player) => player?.side === side)
    .map((player) => {
      const captainSuffix = player?.is_captain ? " (队长)" : "";
      return `${player.display_name}${captainSuffix}`;
    })
    .join("、") || "无";
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function buildSeasonArchiveMarkdown(params: {
  season: SeasonRow;
  archivedAt: string;
  archivedByUserId: string;
  leaderboard: LeaderboardRow[];
  memberships: MembershipRow[];
  players: PlayerRow[];
  itemSettings: SeasonItemSettingRow[];
  itemCatalog: ItemCatalogRow[];
  matches: MatchDetailRow[];
  donations: RewardDonationRow[];
}) {
  const {
    season,
    archivedAt,
    archivedByUserId,
    leaderboard,
    memberships,
    players,
    itemSettings,
    itemCatalog,
    matches,
    donations,
  } = params;

  const playerMap = new Map(players.map((player) => [player.id, player]));
  const itemMap = new Map(itemCatalog.map((item) => [item.id, item]));
  const approvedMatchCount = matches.filter((match) => match.status === "approved").length;

  const rosterTable = buildTable(
    ["选手", "状态", "战力档位", "加入时间", "总表启用"],
    memberships
      .slice()
      .sort((a, b) => {
        const rankA = a.rank_no ?? 999;
        const rankB = b.rank_no ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        const nameA = playerMap.get(a.player_id)?.display_name ?? "";
        const nameB = playerMap.get(b.player_id)?.display_name ?? "";
        return nameA.localeCompare(nameB, "zh-Hans-CN");
      })
      .map((membership) => {
        const player = playerMap.get(membership.player_id);
        return [
          player?.display_name ?? membership.player_id,
          membership.join_status,
          membership.rank_no == null ? "未设置" : `第 ${membership.rank_no} 档`,
          formatUtc(membership.joined_at),
          player?.is_active ? "是" : "否",
        ];
      }),
  );

  const leaderboardTable = buildTable(
    ["排名", "选手", "总分", "初始分", "场次", "胜", "负", "胜率"],
    leaderboard.map((entry) => [
      String(entry.rank ?? ""),
      entry.display_name,
      formatNumber(entry.score_total),
      formatNumber(entry.initial_score),
      String(entry.matches_played ?? 0),
      String(entry.wins ?? 0),
      String(entry.losses ?? 0),
      `${formatNumber(entry.win_rate)}%`,
    ]),
  );

  const itemTable = buildTable(
    ["道具", "编码", "赛季初始数量", "效果类型", "默认积分", "启用", "说明"],
    itemSettings
      .map((setting) => {
        const item = itemMap.get(setting.item_catalog_id);
        if (!item) return null;
        return [
          item.name,
          item.code,
          String(setting.initial_quantity ?? 0),
          item.effect_type,
          formatNumber(item.default_points_delta),
          item.is_active ? "是" : "否",
          item.description || "",
        ];
      })
      .filter((row): row is string[] => Array.isArray(row)),
  );

  const donationTable = buildTable(
    ["时间", "赞助者", "金额", "类别", "外部赞助", "公开", "关联比赛", "备注"],
    donations.map((donation) => [
      formatUtc(donation.donated_at),
      donation.donor_name,
      formatNumber(donation.amount),
      donation.category,
      donation.is_outside ? "是" : "否",
      donation.is_public ? "是" : "否",
      donation.match_id ?? "",
      donation.note ?? "",
    ]),
  );

  const matchSections = matches.length
    ? matches
      .slice()
      .sort((a, b) => (a.match_no ?? 0) - (b.match_no ?? 0))
      .map((match) => {
        const radiant = groupMatchPlayers(match.players, "radiant");
        const dire = groupMatchPlayers(match.players, "dire");
        const metadataBlock = match.metadata && Object.keys(match.metadata).length
          ? `\n原始 metadata：\n\`\`\`json\n${stringifyJson(match.metadata)}\n\`\`\`\n`
          : "";
        return [
          `### 第 ${match.match_no ?? "-"} 场`,
          `- 日期：${match.match_date ?? "无"}`,
          `- 状态：${match.status}`,
          `- 胜方：${match.winner_side || "未定"}`,
          `- 天辉：${radiant}`,
          `- 夜魇：${dire}`,
          `- 创建：${match.created_by_name || "未知"} / ${formatUtc(match.created_at)}`,
          `- 提交：${match.submitted_by_name || "未提交"} / ${formatUtc(match.submitted_at)}`,
          `- 审核：${match.approved_by_name || "未审核"} / ${formatUtc(match.approved_at)}`,
          match.notes ? `- 备注：${match.notes}` : "- 备注：无",
          metadataBlock.trimEnd(),
        ].filter(Boolean).join("\n");
      })
      .join("\n\n")
    : "暂无比赛记录";

  return [
    `# ${season.name} 赛季归档`,
    "",
    "> 该文档由系统在赛季完结后自动生成，用于 GitHub 留档。按约定只新增，不回写修改。",
    "",
    "## 归档信息",
    "",
    `- 赛季 ID：${season.id}`,
    `- 赛季代码：${season.code || "无"}`,
    `- 赛季状态：${season.status}`,
    `- 归档时间：${formatUtc(archivedAt)}`,
    `- 归档执行人：${archivedByUserId}`,
    `- 赛季开始：${formatUtc(season.start_at)}`,
    `- 赛季结束：${formatUtc(season.end_at)}`,
    `- 规则版本：${season.rule_version || "无"}`,
    `- 选手数：${memberships.length}`,
    `- 比赛数：${matches.length}`,
    `- 已审核比赛数：${approvedMatchCount}`,
    `- 赞助记录数：${donations.length}`,
    "",
    "## 赛季规则配置",
    "",
    "```json",
    stringifyJson(season.rule_config),
    "```",
    "",
    "## 选手与战力配置",
    "",
    rosterTable,
    "",
    "## 积分榜快照",
    "",
    leaderboardTable,
    "",
    "## 道具配置",
    "",
    itemTable,
    "",
    "## 赞助记录",
    "",
    donationTable,
    "",
    "## 比赛记录",
    "",
    matchSections,
    "",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const clientResult = createUserScopedClient(req);
  if ("error" in clientResult) return clientResult.error;

  const userResult = await requireUser(clientResult.supabase);
  if ("error" in userResult) return userResult.error;

  const bodyResult = await parseJson<ArchiveSeasonBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  const seasonId = String(bodyResult.data?.seasonId ?? "").trim();
  const archiveAfterExport = bodyResult.data?.archiveAfterExport ?? bodyResult.data?.deleteAfterExport ?? true;
  if (!seasonId) {
    return jsonResponse({ error: "seasonId is required." }, { status: 400 });
  }

  const permissionResult = await clientResult.supabase.rpc("is_admin");
  if (permissionResult.error) {
    return jsonResponse({ error: permissionResult.error.message }, { status: 400 });
  }
  if (!permissionResult.data) {
    return jsonResponse({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const serviceClient = createServiceRoleClient();
    const archivedAt = new Date().toISOString();

    const { data: seasonRow, error: seasonError } = await serviceClient
      .from("seasons")
      .select("id, code, name, status, start_at, end_at, rule_version, rule_config, created_at, updated_at")
      .eq("id", seasonId)
      .maybeSingle();

    if (seasonError) {
      throw new Error(seasonError.message);
    }
    if (!seasonRow) {
      return jsonResponse({ error: "Season not found." }, { status: 404 });
    }
    const season = seasonRow as SeasonRow;
    if (archiveAfterExport && season.status === "active") {
      return jsonResponse({ error: "Active season cannot be exported and archived." }, { status: 400 });
    }

    const [
      leaderboardResult,
      membershipsResult,
      itemSettingsResult,
      matchesResult,
      donationsResult,
    ] = await Promise.all([
      serviceClient
        .from("v_leaderboard")
        .select("player_id, display_name, initial_score, matches_played, wins, losses, win_rate, score_total, rank")
        .eq("season_id", seasonId)
        .order("rank", { ascending: true })
        .order("display_name", { ascending: true }),
      serviceClient
        .from("season_memberships")
        .select("player_id, join_status, rank_no, joined_at")
        .eq("season_id", seasonId),
      serviceClient
        .from("season_item_catalog_settings")
        .select("item_catalog_id, initial_quantity")
        .eq("season_id", seasonId),
      serviceClient
        .from("v_match_detail")
        .select("match_id, season_id, season_code, season_name, match_no, match_date, status, winner_side, notes, metadata, created_at, updated_at, submitted_at, approved_at, created_by_name, submitted_by_name, approved_by_name, players")
        .eq("season_id", seasonId)
        .order("match_no", { ascending: true }),
      serviceClient
        .from("reward_donations")
        .select("donor_name, amount, category, note, is_outside, is_public, donated_at, player_id, match_id")
        .eq("season_id", seasonId)
        .order("donated_at", { ascending: true }),
    ]);

    if (leaderboardResult.error) throw new Error(leaderboardResult.error.message);
    if (membershipsResult.error) throw new Error(membershipsResult.error.message);
    if (itemSettingsResult.error) throw new Error(itemSettingsResult.error.message);
    if (matchesResult.error) throw new Error(matchesResult.error.message);
    if (donationsResult.error) throw new Error(donationsResult.error.message);

    const memberships = (membershipsResult.data ?? []) as MembershipRow[];
    const itemSettings = (itemSettingsResult.data ?? []) as SeasonItemSettingRow[];

    const playerIds = [...new Set(memberships.map((row) => row.player_id).filter(Boolean))];
    const itemIds = [...new Set(itemSettings.map((row) => row.item_catalog_id).filter(Boolean))];

    const playersResult = playerIds.length
      ? await serviceClient
        .from("players")
        .select("id, display_name, is_active")
        .in("id", playerIds)
      : { data: [], error: null };
    const itemsResult = itemIds.length
      ? await serviceClient
        .from("item_catalog")
        .select("id, code, name, description, effect_type, default_points_delta, is_active, config")
        .in("id", itemIds)
      : { data: [], error: null };

    if (playersResult.error) throw new Error(playersResult.error.message);
    if (itemsResult.error) throw new Error(itemsResult.error.message);

    const markdown = buildSeasonArchiveMarkdown({
      season,
      archivedAt,
      archivedByUserId: userResult.user.id,
      leaderboard: (leaderboardResult.data ?? []) as LeaderboardRow[],
      memberships,
      players: (playersResult.data ?? []) as PlayerRow[],
      itemSettings,
      itemCatalog: (itemsResult.data ?? []) as ItemCatalogRow[],
      matches: (matchesResult.data ?? []) as MatchDetailRow[],
      donations: (donationsResult.data ?? []) as RewardDonationRow[],
    });

    const repository = requiredEnv("GITHUB_REPOSITORY");
    const token = requiredEnv("GITHUB_TOKEN");
    const branch = Deno.env.get("GITHUB_ARCHIVE_BRANCH") || "main";
    const prefix = (Deno.env.get("GITHUB_ARCHIVE_PREFIX") || "docs/season-archives")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    const timestampSlug = archivedAt.replace(/[:.]/g, "-");
    const seasonSlug = sanitizePathSegment(season.code || season.id);
    const path = `${prefix}/${seasonSlug}/${timestampSlug}-${season.id}.md`;
    const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");

    const githubResponse = await fetch(`https://api.github.com/repos/${repository}/contents/${encodedPath}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json; charset=utf-8",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: `archive: ${season.code || season.id} season snapshot`,
        content: toBase64Utf8(markdown),
        branch,
      }),
    });

    const githubPayload = await githubResponse.json().catch(() => ({}));
    if (!githubResponse.ok) {
      throw new Error(String(githubPayload?.message || `GitHub API request failed with status ${githubResponse.status}.`));
    }

    const responsePayload: Record<string, unknown> = {
      seasonId: season.id,
      path,
      branch,
      htmlUrl: githubPayload?.content?.html_url || null,
      sha: githubPayload?.content?.sha || null,
      archivedInDatabase: false,
      archiveError: null,
      deletedFromDatabase: false,
      deleteError: null,
    };

    if (archiveAfterExport) {
      const archiveResult = await serviceClient.rpc("mark_exported_season_archived", {
        p_season_id: season.id,
      });
      if (archiveResult.error) {
        responsePayload.archiveError = archiveResult.error.message;
      } else {
        responsePayload.archivedInDatabase = Boolean(archiveResult.data?.archived ?? true);
      }
    }

    return jsonResponse(responsePayload);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to archive season." },
      { status: 500 },
    );
  }
});
