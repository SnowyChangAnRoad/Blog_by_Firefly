import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: false,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "netease",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		id: "10046455237",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		playlist: [
			{
				name: "踊り子",
				artist: "Vaundy",
				url: "/assets/music/Dancing_Girl(Jap).mp3",
				cover: "/assets/music/cover/Dancing_Girl(Jap).jpg",
				lrc: "",
			},
			{
				name: "焚音打",
				artist: "MyGO!!!!!",
				url: "/assets/music/MyGO!!!!!_-_last_music.mp3",
				cover: "/assets/music/cover/MyGO!!!!!_-_last_music.jpg",
				lrc: "",
			},
			{
				name: "You are My Curse",
				artist: "Kotoha",
				url: "/assets/music/Kotoha_-_You_are_My_Curse.mp3",
				cover: "/assets/music/cover/Kotoha_-_You_are_My_Curse.jpg",
				lrc: "",
			},
			{
				name: "最美好前途(后朋克版)",
				artist: "未知",
				url: "/assets/music/Wondrous_Future-Post-punk.mp3",
				cover: "/assets/music/cover/Wondrous_Future-Post-punk.png",
				lrc: "",
			},
			{
				name: "Красива",
				artist: "",
				url: "/assets/music/Beautiful.mp3",
				cover: "/assets/music/cover/Beautiful.jpg",
				lrc: "",
			},
			{
				name: "Небо",
				artist: "",
				url: "/assets/music/Sky.mp3",
				cover: "/assets/music/cover/Sky.jpg",
				lrc: "",
			},
			{
				name: "カタチのないもの",
				artist: "",
				url: "/assets/music/Shapeless.mp3",
				cover: "/assets/music/cover/Shapeless.jpg",
				lrc: "",
			},
			{
				name: "葡萄成熟时",
				artist: "",
				url: "/assets/music/When_Grapes_Are_Ripe.mp3",
				cover: "/assets/music/cover/When_Grapes_Are_Ripe.jpg",
				lrc: "",
			},
			{
				name: "那些你很冒险的梦",
				artist: "",
				url: "/assets/music/Those_Adventurous_Dreams.mp3",
				cover: "/assets/music/cover/Those_Adventurous_Dreams.jpg",
				lrc: "",
			},
		],
	},
};
