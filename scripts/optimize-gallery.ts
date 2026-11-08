// 相册图片压缩脚本
// 用途：把 public/gallery/<album>/ 下的原图转成 WebP（最长边 1920，质量 80），
// 原图移动到 .gallery-originals/<album>/ 备份，并自动更新 galleryConfig 的封面路径。
//
// 用法：
//   pnpm optimize-gallery          # 转换尚未压缩的图片
//   pnpm optimize-gallery --force  # 强制重新压缩所有图片
//
// 说明：
// - 已符合要求的 WebP 默认跳过。
// - GIF 动图会跳过，避免丢失动画。
// - 原图不会删除，而是移动到 .gallery-originals/（已加入 .gitignore）。

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

sharp.cache(false);

const ROOT = process.cwd();
const GALLERY_DIR = path.join(ROOT, "public", "gallery");
const ORIGINALS_DIR = path.join(ROOT, ".gallery-originals");
const CONFIG_FILE = path.join(ROOT, "src", "config", "galleryConfig.ts");

const MAX_EDGE = 1920;
const QUALITY = 80;

const FORCE = process.argv.includes("--force");
const IMAGE_EXT = /\.(jpe?g|png|avif|webp|gif)$/i;
const CONVERT_EXT = /\.(jpe?g|png|avif)$/i;

async function pathExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function listAlbums(): Promise<string[]> {
	const entries = await fs.readdir(GALLERY_DIR, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeWithRetry(target: string): Promise<void> {
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			await fs.rm(target, { force: true });
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EBUSY" && code !== "EPERM") throw error;
			if (attempt === 5) throw error;
			await sleep(300 * attempt);
		}
	}
}

async function moveToOriginals(
	album: string,
	source: string,
	filename: string,
): Promise<void> {
	const targetDir = path.join(ORIGINALS_DIR, album);
	await fs.mkdir(targetDir, { recursive: true });
	const target = path.join(targetDir, filename);
	await fs.rm(target, { force: true });

	const retries = 5;
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await fs.rename(source, target);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EBUSY" && code !== "EPERM") throw error;
			if (attempt < retries) {
				// Windows 上文件可能被资源管理器/预览占用，稍后重试
				await sleep(300 * attempt);
			}
		}
	}

	// rename 始终失败时退化为复制 + 删除
	await fs.copyFile(source, target);
	await removeWithRetry(source);
}

async function convert(source: string, output: string): Promise<void> {
	// 先读入内存再交给 sharp，避免 Windows 上 sharp 持有源文件句柄导致后续 unlink 失败
	const input = await fs.readFile(source);
	const temp = `${output}.tmp`;
	await sharp(input)
		.rotate()
		.resize({
			width: MAX_EDGE,
			height: MAX_EDGE,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: QUALITY, effort: 4 })
		.toFile(temp);
	await fs.rm(output, { force: true });
	await fs.rename(temp, output);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
	if (!(await pathExists(GALLERY_DIR))) {
		console.log(`相册目录不存在：${GALLERY_DIR}`);
		return;
	}

	const albums = await listAlbums();
	const existingUrls = new Set<string>();
	let beforeBytes = 0;
	let afterBytes = 0;
	let convertedCount = 0;
	let skippedCount = 0;

	for (const album of albums) {
		const albumDir = path.join(GALLERY_DIR, album);
		const files = (await fs.readdir(albumDir, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && IMAGE_EXT.test(entry.name))
			.map((entry) => entry.name)
			.sort();

		for (const filename of files) {
			const source = path.join(albumDir, filename);
			const ext = path.extname(filename);
			const stem = filename.slice(0, -ext.length);
			const outputName = `${stem}.webp`;
			const output = path.join(albumDir, outputName);

			if (/\.gif$/i.test(filename)) {
				existingUrls.add(`/gallery/${album}/${filename}`);
				console.log(`[${album}] 跳过 GIF：${filename}`);
				skippedCount++;
				continue;
			}

			const sourceStat = await fs.stat(source);

			if (/\.webp$/i.test(filename)) {
				existingUrls.add(`/gallery/${album}/${filename}`);
				if (!FORCE) {
					const input = await fs.readFile(source);
					const meta = await sharp(input).metadata();
					const width = meta.width ?? 0;
					const height = meta.height ?? 0;
					if (width <= MAX_EDGE && height <= MAX_EDGE) {
						skippedCount++;
						continue;
					}
				}

				beforeBytes += sourceStat.size;
				await convert(source, source);
				const newStat = await fs.stat(source);
				afterBytes += newStat.size;
				convertedCount++;
				console.log(
					`[${album}] ${filename}  ${formatSize(sourceStat.size)} -> ${formatSize(newStat.size)}`,
				);
				continue;
			}

			if (!CONVERT_EXT.test(filename)) {
				skippedCount++;
				continue;
			}

			beforeBytes += sourceStat.size;
			await convert(source, output);
			const newStat = await fs.stat(output);
			afterBytes += newStat.size;
			convertedCount++;
			await moveToOriginals(album, source, filename);

			existingUrls.add(`/gallery/${album}/${outputName}`);

			console.log(
				`[${album}] ${filename} -> ${outputName}  ${formatSize(sourceStat.size)} -> ${formatSize(newStat.size)}`,
			);
		}
	}

	const config = await fs.readFile(CONFIG_FILE, "utf8");
	const updatedConfig = config.replace(
		/\/gallery\/([^/"'`\s]+)\/([^/"'`\s]+)\.(jpe?g|png|avif)/gi,
		(match, album: string, stem: string) => {
			const webpUrl = `/gallery/${album}/${stem}.webp`;
			if (!existingUrls.has(match) && existingUrls.has(webpUrl)) {
				return webpUrl;
			}
			return match;
		},
	);
	if (updatedConfig !== config) {
		await fs.writeFile(CONFIG_FILE, updatedConfig);
		console.log(`\n已更新封面路径：${path.relative(ROOT, CONFIG_FILE)}`);
	}

	const savedBytes = beforeBytes - afterBytes;
	const savedPercent =
		beforeBytes > 0 ? Math.round((savedBytes / beforeBytes) * 100) : 0;

	console.log(`\n完成：转换 ${convertedCount} 张，跳过 ${skippedCount} 张`);
	console.log(
		`体积：${formatSize(beforeBytes)} -> ${formatSize(afterBytes)}，节省 ${savedPercent}%`,
	);
	if (convertedCount > 0) {
		console.log(`原图已移动到：${path.relative(ROOT, ORIGINALS_DIR)}/`);
	}
}

main().catch((error: unknown) => {
	console.error("相册压缩失败：", error);
	process.exitCode = 1;
});
