import type { MalListItem } from "@/types/mal";
import type { NsfwMode } from "@/types/nsfw";

// 共用的 NSFW 违禁词，按需增删。
// 注：MAL 只有英文 genre，中 / 日词匹配不到；ecchi 属打码边缘，这里一并拦截。
const NSFW_KEYWORDS = [
	"Hentai",
	"Ecchi",
	"えっち",
	"エッチ",
	"NSFW",
	"R18",
	"R-18",
	"18禁",
	"黄油",
	"卖肉",
	"成人",
	"成人向け",
	"エロ",
];

export function isMalNsfw(item: MalListItem): boolean {
	return (item.node?.genres ?? []).some((g) => NSFW_KEYWORDS.includes(g.name));
}

// mode === "hide" 时过滤掉 NSFW 条目
export function filterNsfw<T>(
	items: T[],
	mode: NsfwMode,
	isNsfw: (x: T) => boolean,
): T[] {
	return mode === "hide" ? items.filter((x) => !isNsfw(x)) : items;
}
