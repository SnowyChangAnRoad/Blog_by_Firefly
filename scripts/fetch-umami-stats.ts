// 构建期从 Umami 数据库读取全站累计访问量，写入 src/constants/umami-stats.json。
// 侧边栏「站点统计」组件读取该文件展示数字；读取失败时不覆盖旧文件，也不阻断构建。
//
// 需要的环境变量：
//   UMAMI_DATABASE_URL  PostgreSQL 连接串，例如 postgresql://umami:密码@localhost:5432/umami
//   UMAMI_WEBSITE_ID    （可选）Umami 站点 ID，用于只统计本站；不填则统计整库
//
// 注意：该文件只存在构建机，已加入 .gitignore，不参与版本管理。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_FILE = path.join(ROOT, "src", "constants", "umami-stats.json");

const DATABASE_URL = process.env.UMAMI_DATABASE_URL?.trim() ?? "";
const WEBSITE_ID = process.env.UMAMI_WEBSITE_ID?.trim() ?? "";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UmamiStats {
	visitors: number;
	pageviews: number;
	updatedAt: string;
}

function queryNumber(sql: string): number {
	const output = execFileSync("psql", [DATABASE_URL, "-tAc", sql], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const value = Number.parseInt(output.trim(), 10);
	return Number.isFinite(value) ? value : 0;
}

function main(): void {
	if (!DATABASE_URL) {
		console.log("[UMAMI-STATS] 未设置 UMAMI_DATABASE_URL，跳过访问量统计");
		return;
	}

	const conditions = ["event_type = 1"];
	if (WEBSITE_ID) {
		if (!UUID_PATTERN.test(WEBSITE_ID)) {
			console.warn(`[UMAMI-STATS] UMAMI_WEBSITE_ID 格式不合法，已忽略：${WEBSITE_ID}`);
		} else {
			conditions.push(`website_id = '${WEBSITE_ID}'`);
		}
	}
	const where = `where ${conditions.join(" and ")}`;

	try {
		const pageviews = queryNumber(`select count(*) from website_event ${where};`);
		const visitors = queryNumber(
			`select count(distinct session_id) from website_event ${where};`,
		);

		const stats: UmamiStats = {
			visitors,
			pageviews,
			updatedAt: new Date().toISOString(),
		};

		fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
		fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(stats, null, 2)}\n`);
		console.log(
			`[UMAMI-STATS] visitors=${visitors} pageviews=${pageviews} -> ${path.relative(ROOT, OUTPUT_FILE)}`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[UMAMI-STATS] 读取失败，保留上次数据：${message}`);
	}
}

main();
