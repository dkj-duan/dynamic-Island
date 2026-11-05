/**
 * Minimal i18n: UI strings are written in Chinese and looked up by source
 * text, so a missing entry simply falls back to Chinese instead of breaking.
 */
export type Language = "zh-CN" | "en-US";

export const defaultLanguage: Language = "zh-CN";

export const languageOptions: { value: Language; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
];

const en: Record<string, string> = {
  // —— Shell / navigation ——
  灵动岛: "Dynamic Island",
  设置: "Settings",
  设置分区: "Settings sections",
  外观: "Appearance",
  交互: "Interaction",
  状态: "Status",
  邮箱: "Mail",
  "AI 额度": "AI quota",
  存储: "Storage",
  关于: "About",
  通用: "General",
  功能: "Tools",
  提醒源: "Reminders",
  系统: "System",
  已自动保存并同步: "Saved and synced",
  "正在读取设置…": "Reading settings…",
  "设置读取失败，已暂停保存以保护原有数据。请检查配置文件。":
    "Could not read settings; saving is paused to protect existing data. Check the config file.",
  "自动保存失败，请重试": "Auto-save failed — try again",
  "正在同步…": "Syncing…",
  "预览已更新，灵动岛将在保存后同步":
    "Preview updated; the island syncs after saving",
  已切换数据目录: "Data directory switched",
  设置已读取: "Settings loaded",
  "浏览器预览：设置不会保存": "Browser preview: settings are not saved",
  "主题、胶囊尺寸与桌面预览，改动会立即同步到灵动岛。":
    "Theme, capsule size and desktop preview. Changes sync to the island instantly.",
  "选择展开方式、自动收起时长，以及灵动岛停靠的位置。":
    "Expand trigger, auto-collapse timing and where the island docks.",
  "读取音量、亮度、电源与蓝牙的变化，在灵动岛上短暂提示。":
    "Watches volume, brightness, power and Bluetooth, then flashes a hint on the island.",
  "通过 IMAP 检查新邮件，识别到验证码后可在灵动岛复制。":
    "Checks mail over IMAP; verification codes can be copied on the island.",
  "查询账户余额与订阅周期额度，可选择一个常驻灵动岛。":
    "Tracks balances and subscription quotas; one account can stay on the island.",
  "设置、邮箱账户与 AI 密钥的存放位置和迁移方式。":
    "Where settings, mail accounts and AI keys live, and how to move them.",
  "版本与项目信息。": "Version and project information.",

  // —— Appearance ——
  界面语言: "Language",
  "界面语言选择后立即生效，两个窗口一起切换。":
    "Applies instantly to both windows.",
  桌面预览: "Desktop preview",
  实时同步: "Live",
  "屏幕顶部 · 居中": "Top of screen · centered",
  随主题与缩放即时更新: "Updates with theme and scale",
  界面主题: "Theme",
  仅影响设置窗口: "Settings window only",
  跟随系统: "System",
  "随 Windows 深浅色切换": "Follows Windows light/dark",
  浅色: "Light",
  明亮低对比: "Bright, low contrast",
  深色: "Dark",
  夜间使用: "For night use",
  胶囊: "Capsule",
  显示尺寸: "Size",
  收起状态下灵动岛的宽度: "Island width while collapsed",
  胶囊大小: "Capsule size",
  显示当前时间: "Show the clock",
  收起时显示数字时钟与日期: "Digital clock and date while collapsed",

  // —— Behaviour ——
  展开方式: "Expand trigger",
  "悬停模式把指针移到胶囊上就会展开，不用点击。":
    "In hover mode the panel opens when the pointer rests on the capsule.",
  点击展开: "Click",
  悬停展开: "Hover",
  灵动岛位置: "Island position",
  "按住胶囊或面板顶栏即可拖动，松手后位置会被记住。":
    "Drag the capsule or the panel header; the position is remembered on release.",
  恢复默认位置: "Reset position",
  已恢复: "Reset done",
  鼠标离开后自动收起: "Auto-collapse",
  "展开后鼠标移出面板，按设定时间折叠；计时不会中断。":
    "After expanding, the panel folds back once the pointer leaves. Timers keep running.",
  关闭: "Off",
  "1 秒": "1 s",
  "3 秒": "3 s",
  "5 秒": "5 s",
  "10 秒": "10 s",
  "15 秒": "15 s",
  "鼠标移回胶囊会取消收起计时；自动收起不会停止正在进行的倒计时。":
    "Moving back over the capsule cancels the countdown; a running timer never stops.",

  // —— Status ——
  当前状态: "Current status",
  刷新状态: "Refresh",
  "状态发生变化时，灵动岛会短暂显示对应提示。":
    "When a value changes, the island flashes the matching hint.",
  演示: "Preview",
  "演示使用示例数据，不会修改系统设置。":
    "Previews use sample data and never change system settings.",
  "演示已发送到屏幕顶部的灵动岛。": "Preview sent to the island.",
  "演示发送失败，请确认灵动岛正在运行。":
    "Preview failed — make sure the island is running.",
  请在桌面应用中查看: "Available in the desktop app",
  "正在读取…": "Reading…",
  读取失败: "Read failed",
  音量: "Volume",
  系统音量或静音状态变化: "System volume or mute changes",
  当前输出设备不可读取: "Output device unavailable",
  已静音: "Muted",
  屏幕亮度: "Brightness",
  需显示器与驱动提供亮度数据: "Requires display and driver support",
  当前显示器未提供: "Not provided by this display",
  电源与电池: "Power & battery",
  接通或断开电源时显示电量: "Shows the level when plugged in or out",
  未检测到电池: "No battery detected",
  充电中: "Charging",
  已接通电源: "On AC power",
  使用电池: "On battery",
  电源已断开: "Power disconnected",
  蓝牙设备: "Bluetooth",
  连接或断开时显示名称与电量: "Shows names and levels on connect/disconnect",
  暂不可读取: "Not readable",
  未检测到设备: "No devices",
  已连接: "Connected",
  "已连接 · ": "Connected · ",
  已断开: "Disconnected",
  播放器未响应此操作: "The player did not respond",
  个: "",
  "添加失败：": "Add failed: ",
  "移除失败：": "Remove failed: ",
  "移除 ": "Remove ",
  "？已保存的授权码也会删除。": "? The saved code is deleted too.",
  台设备已连接: "device(s) connected",

  // —— Mail ——
  邮箱提醒: "Mail reminders",
  已添加的邮箱: "Added accounts",
  未添加: "None",
  "约每 8 秒检查一次收件箱，不改变邮件已读状态。":
    "The inbox is checked about every 8 seconds; mail is never marked read.",
  等待首次检查: "Waiting for the first check",
  移除邮箱: "Remove account",
  "还没有邮箱账户。添加后会在这里显示检查状态。":
    "No mail accounts yet. Added accounts show their check status here.",
  "请在桌面应用中添加邮箱。": "Add mail accounts in the desktop app.",
  添加邮箱: "Add an account",
  邮箱服务商: "Provider",
  邮箱地址: "Address",
  "IMAP 服务器": "IMAP server",
  "SSL 端口": "SSL port",
  邮箱授权码: "Authorization code",
  邮箱服务商生成的授权码: "The code your provider generated",
  "需在服务商开启 IMAP 并使用授权码；仅支持 SSL/TLS，需要 OAuth 的账户暂不支持。授权码存放在 Windows 凭据管理器。":
    "Enable IMAP with an authorization code at your provider. SSL/TLS only — OAuth is not supported. Codes are stored in Windows Credential Manager.",
  "处理中…": "Working…",
  连接并添加: "Connect & add",
  "请填写有效的邮箱、服务器、端口和授权码。":
    "Fill in a valid address, server, port and code.",
  "正在连接邮箱并验证授权码…": "Connecting and verifying the code…",
  "邮箱已添加，将提醒之后收到的新邮件。":
    "Account added. New mail will be announced from now on.",
  "邮箱已移除。": "Account removed.",
  "无法读取邮箱账户，请检查数据目录。":
    "Cannot read mail accounts — check the data directory.",

  // —— AI quota ——
  账户与额度: "Accounts & quotas",
  刷新: "Refresh",
  刷新额度: "Refresh quota",
  "每两分钟自动刷新一次，常驻账户的额度会显示在灵动岛上。":
    "Refreshes every two minutes; the pinned account shows on the island.",
  "请在桌面应用中配置账户。": "Configure accounts in the desktop app.",
  "尚未添加账户。": "No accounts yet.",
  常驻: "Pinned",
  已常驻: "Pinned",
  删除: "Remove",
  添加账户: "Add account",
  服务: "Service",
  账户名称: "Name",
  "例如：个人账户": "e.g. Personal",
  本地服务端口: "Local port",
  本地访问令牌: "Local access token",
  查询密钥: "API key",
  输入该服务的密钥: "The key for this service",
  "密钥由当前 Windows 用户加密后存入数据库，换电脑或 Windows 用户后需重新添加。":
    "Keys are encrypted for the current Windows user and stored in the database; re-add them after switching users or machines.",
  账户已保存并开始查询: "Account saved; querying now",
  "已保存；灵动岛会同步刷新": "Saved; the island refreshes with it",
  "正在查询…": "Checking…",
  "Codex（本机登录）": "Codex (local login)",
  "使用已登录的本机 Codex CLI 查询 ChatGPT 额度，不需要复制密钥。":
    "Queries ChatGPT quota through the signed-in local Codex CLI — no key needed.",
  "Kimi Code（本地服务）": "Kimi Code (local service)",
  "先启动并登录 kimi web，再填写本地服务的端口和访问令牌；只连接本机。":
    "Start and sign in to kimi web first, then fill in the local port and token; localhost only.",
  "DeepSeek API 余额": "DeepSeek API balance",
  "使用 DeepSeek API 密钥。": "Uses a DeepSeek API key.",
  "OpenRouter 积分": "OpenRouter credits",
  "需要 OpenRouter 管理密钥（Management Key），普通推理密钥无法查询账户积分。":
    "Needs an OpenRouter management key; inference keys cannot read credits.",
  "MiniMax Token Plan（中国）": "MiniMax Token Plan (CN)",
  "使用中国区 Token Plan 订阅密钥。": "Uses a CN Token Plan subscription key.",
  "MiniMax Token Plan（国际）": "MiniMax Token Plan (Global)",
  "使用国际区 Token Plan 订阅密钥。":
    "Uses a global Token Plan subscription key.",
  " 密钥由当前 Windows 用户加密后存入数据库，换电脑或 Windows 用户后需重新添加。":
    " Keys are encrypted for the current Windows user and stored in the database; re-add them after switching users or machines.",
  查询失败: "Query failed",
  "尚未添加 AI 账户": "No AI accounts yet",
  "在设置的 AI 额度页面添加。": "Add accounts in Settings → AI quota.",

  // —— Storage ——
  数据与存储: "Data & storage",
  数据目录: "Data directory",
  "设置、邮箱账户与 AI 账户保存在本机数据库中，安装目录与数据目录分开。":
    "Settings, mail and AI accounts live in a local database, separate from the install folder.",
  请选择数据存放目录: "Choose a data folder",
  迁移到其他目录: "Move to another folder",
  使用已有数据: "Use existing data",
  "迁移会复制并校验数据库，不覆盖目标目录中的文件，原目录保留。":
    "Moving copies and verifies the database without overwriting the target; the old folder is kept.",
  无法读取数据目录: "Cannot read the data directory",
  "已切换到已有数据，原目录数据保留。":
    "Switched to the existing data; the old folder is untouched.",
  "数据已复制到新目录，原目录保留备份。":
    "Data copied to the new folder; the old one is kept as backup.",
  "数据目录已切换，但设置同步失败，请重启应用。":
    "Directory switched, but syncing settings failed — restart the app.",
  凭据与隐私: "Credentials & privacy",
  "切换失败：": "Switch failed: ",
  "Windows 凭据管理器，不写入数据库":
    "Windows Credential Manager, never written to the database",
  "当前 Windows 用户加密后入库，换用户需重新添加":
    "Encrypted for the current Windows user; re-add after switching users",
  "AI 密钥": "AI keys",
  邮件内容: "Mail content",
  "仅内存保留约 5 分钟，不保存正文与验证码":
    "Held in memory for about 5 minutes; bodies and codes are never saved",

  // —— About ——
  "为 Windows 桌面打造的状态提醒与快捷操作入口。":
    "A status and quick-action hub for the Windows desktop.",
  版本: "Version",
  技术栈: "Stack",
  数据: "Data",
  "本机 SQLite，凭据使用 Windows 用户加密":
    "Local SQLite; credentials encrypted per Windows user",
  // —— Pomodoro ——
  番茄钟: "Pomodoro",
  "配置专注与休息时长，进度会跨应用重启保留。":
    "Set focus and break lengths; progress survives restarts.",
  "专注时长（分钟）": "Focus (minutes)",
  "短休息（分钟）": "Short break (minutes)",
  "长休息（分钟）": "Long break (minutes)",
  每几轮长休一次: "Long break every N rounds",
  "专注自然结束后记为一个番茄；休息时长由已完成轮数决定，进度会在重启后保留。":
    "Each finished focus counts as a pomodoro; break length follows the completed rounds, and progress is kept across restarts.",
  "只有自然结束的专注会累计番茄；手动取消不计入。达到长休间隔后，下一次休息自动使用长休时长。":
    "Only a focus that runs to the end counts; cancelling does not. After the set number of rounds, the next break uses the long-break length.",
  "时长超出允许范围，未保存": "Duration outside the allowed range — not saved",
  保存: "Save",
  "保存中…": "Saving…",
  已保存: "Saved",

  // —— Water ——
  喝水: "Water",
  该喝水了: "Time to drink",
  喝一杯: "Drink a cup",
  杯: "cups",
  还差: "Still",
  添加: "Add",
  自定义毫升: "Custom amount",
  今日目标已完成: "Daily goal reached",
  "请输入 1–5000 毫升": "Enter 1–5000 ml",
  今日饮水: "Today's water",
  "每次记录都会同步到灵动岛。": "Every entry syncs to the island.",
  "每日目标（毫升）": "Daily goal (ml)",
  "每杯水量（毫升）": "Cup size (ml)",
  "提醒间隔（分钟）": "Reminder interval (minutes)",
  提醒时段: "Reminder hours",
  结束时间: "End time",
  提醒开始时间: "Reminder start time",
  提醒结束时间: "Reminder end time",
  开启喝水提醒: "Enable water reminders",
  到达间隔且今日未达标时在灵动岛提示:
    "Remind on the island when the interval passes and the goal is unmet",
  目标与提醒: "Goal & reminders",
  "提醒只在灵动岛显示，不会弹系统通知。":
    "Reminders stay on the island; no system notifications.",
  "近 30 天饮水": "Water in the last 30 days",
  "30 天总量": "30-day total",
  日均: "Daily average",
  达标天数: "Days reached",
  天: "days",
  "虚线为每日目标，今天高亮显示。":
    "The dashed line marks the daily goal; today is highlighted.",
  "喝水设置超出允许范围，未保存": "Water settings out of range — not saved",
  喝水提醒: "Water reminders",
  "设置每日目标与提醒时段，记录饮水并查看近 30 天数据。":
    "Set a daily goal and reminder hours, log water, and review 30 days of data.",
  重置今日饮水: "Reset today's water",
  "清零今天的饮水量和杯数，统计历史不受影响。":
    "Clears today's water and cup count; history stays intact.",
  确认重置: "Confirm reset",
  已重置今日饮水: "Today's water reset",

  // —— Focus stats ——
  专注统计: "Focus stats",
  "近 30 天的完成情况，今天高亮显示。":
    "Completions over the last 30 days; today is highlighted.",
  今日番茄: "Pomodoros today",
  今日专注: "Focus today",
  "近 30 天": "Last 30 days",
  "近 30 天番茄": "Pomodoros in 30 days",
  分钟: "minutes",
  小时: "hours",

  运行环境: "Runtime",
  项目地址: "Project",
  查看数据目录: "Data folder",

  // —— Island panel ——
  计时器: "Timer",
  音乐: "Music",
  专注: "Focus",
  短休: "Short break",
  长休: "Long break",
  已结束: "Finished",
  已暂停: "Paused",
  进行中: "Running",
  选择时长: "Pick a duration",
  时间到: "Time's up",
  自定义: "Custom",
  分: "m",
  秒: "sec",
  开始: "Start",
  返回: "Back",
  暂停: "Pause",
  继续: "Resume",
  取消: "Cancel",
  "+1 分钟": "+1 min",
  知道了: "Dismiss",
  再计一次: "Restart",
  开始专注: "Start focus",
  开始短休: "Start short break",
  开始长休: "Start long break",
  本轮: "Cycle",
  今日: "Today",
  个番茄: "pomodoros",
  "请输入有效时间（秒数为 0–59）": "Enter a valid time (seconds 0–59)",
  未知艺术家: "Unknown artist",
  "暂无播放进度，无法同步歌词": "No playback position — lyrics unavailable",
  "♪ 间奏": "♪ Interlude",
  "♪ 前奏": "♪ Intro",
  暂无同步歌词: "No synced lyrics",
  "正在查找歌词…": "Looking up lyrics…",
  播放器未提供播放进度: "The player does not report progress",
  上一首: "Previous",
  下一首: "Next",
  播放: "Play",
  调整播放进度: "Seek",
  没有正在播放的媒体: "Nothing is playing",
  "开始播放音乐后，这里会显示曲目信息和控制按钮。":
    "Track info and controls appear here once music plays.",
  最近提醒: "Recent",
  新邮件: "New mail",
  收到新邮件: "New mail",
  收到邮箱验证码: "Verification code",
  验证码: "Code",
  复制验证码: "Copy code",
  已复制: "Copied",
  已过期: "Expired",
  复制失败: "Copy failed",
  这封邮件未识别到验证码: "No code found in this mail",
  暂无新邮件提醒: "No mail reminders",
  "在设置中添加邮箱后，新邮件会显示在这里。":
    "New mail shows up here once an account is added.",
  上一条提醒: "Previous reminder",
  下一条提醒: "Next reminder",
  上一页: "Previous page",
  下一页: "Next page",
  收起灵动岛: "Collapse the island",
  展开灵动岛: "Expand the island",
  打开设置: "Open settings",
  退出应用: "Quit",
  灵动岛页面: "Island pages",
  灵动岛功能: "Island sections",
  倒计时结束: "Countdown finished",
  "窗口调整失败，请重试": "Could not resize the window — try again",
  "操作失败，请重试": "Action failed — try again",
  媒体控制失败: "Media control failed",
  当前播放器暂不支持调整进度: "This player does not support seeking",
  剩余: "left",
};

let current: Language = defaultLanguage;

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

/** Look up a UI string; unknown text falls back to the Chinese source. */
export function t(text: string, lang?: Language): string {
  const active = lang ?? current;
  if (active !== "en-US") return text;
  return en[text] ?? text;
}

/** Normalise a stored language value. */
export function parseLanguage(value: unknown): Language {
  return value === "en-US" ? "en-US" : defaultLanguage;
}
