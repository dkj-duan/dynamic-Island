/**
 * Minimal i18n: UI strings are written in Chinese and looked up by source
 * text, so a missing entry simply falls back to Chinese instead of breaking.
 */
export type Language = "zh-CN" | "en-US";

export const defaultLanguage: Language = "zh-CN";

export const languageOptions: { value: Language; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
];

const en: Record<string, string> = {
  // —— Shell / navigation ——
  灵动岛: "Dynamic Island",
  小岛伙伴: "Island companion",
  展开样式: "Expanded shape",
  选择展开面板的轮廓: "Choose the expanded panel outline",
  经典: "Classic",
  灵动: "Asymmetric",
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
  拖动组件可调整顺序: "Drag widgets to reorder",
  界面主题: "Theme",
  仅影响设置窗口: "Settings window only",
  跟随系统: "System",
  "随 Windows 深浅色切换": "Follows Windows light/dark",
  浅色: "Light",
  明亮低对比: "Bright, low contrast",
  深色: "Dark",
  夜间使用: "For night use",
  胶囊: "Capsule",
  灵动岛大小: "Island size",
  "最多同时显示 6 个，没有数据的组件自动隐藏。":
    "Show up to 6 at once; widgets without data hide automatically.",
  特小: "XS",
  小: "S",
  适中: "M",
  大: "L",
  特大: "XL",
  显示尺寸: "Size",
  收起状态下灵动岛的宽度: "Island width while collapsed",
  胶囊大小: "Capsule size",
  显示当前时间: "Show the clock",
  收起时显示数字时钟与日期: "Digital clock and date while collapsed",
  闲时内容: "Idle content",
  "在预览中拖动组件，或使用箭头调整顺序。":
    "Drag widgets in the preview, or use the arrows to reorder.",
  时钟: "Clock",
  时钟与日期: "Clock & date",
  "控制收起胶囊里显示的内容。": "Controls what the collapsed capsule shows.",
  岛上显示歌词: "Show lyrics on the island",
  岛上歌词: "Island lyrics",
  "关闭时显示歌手；歌词仍可在展开的音乐页查看。":
    "When off, the artist is shown; lyrics stay available on the music page.",
  正在播放: "Now playing",
  常驻额度: "Pinned quota",
  喝水进度: "Water progress",
  番茄进度: "Pomodoro progress",
  上移: "Move up",
  下移: "Move down",
  "常驻额度仅在有常驻 AI 账户时显示；喝水与番茄显示今日数据。全部关闭时显示 Dynamic Island。":
    "Pinned quota needs a pinned AI account; water and pomodoro show today's data. With everything off, the capsule shows Dynamic Island.",

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
  "点击或悬停展开后都生效；鼠标移出面板后按设定时间折叠，选择「立即」则马上收起，计时不会中断。":
    "Applies to click and hover expansion; the panel folds back after the pointer leaves. Choose Instant to close immediately. Timers keep running.",
  立即: "Instant",
  关闭: "Off",
  "1 秒": "1 s",
  "3 秒": "3 s",
  "5 秒": "5 s",
  "10 秒": "10 s",
  "15 秒": "15 s",
  "20 秒": "20 s",
  "60 秒": "60 s",
  "鼠标移回胶囊会取消收起计时；快捷键呼出的面板，等你把鼠标放上去之后再按此设置收起。":
    "Moving back over the capsule cancels the countdown; a panel opened by hotkey only starts this countdown after the pointer has reached it.",

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
  电池与充电: "Battery & charging",
  电池: "Battery",
  连续专注: "Focus streak",
  音量与静音: "Volume & mute",
  蓝牙耳机电量: "Bluetooth battery",
  喝水倒计时: "Water reminder",
  下次喝水提醒: "Next water reminder",
  明天: "Tomorrow",
  即将: "Soon",
  已到: "Reached",
  临时倒计时: "Temporary countdown",
  设置里还没有时长倒计时: "No duration countdowns in Settings yet.",
  已达标: "Goal met",
  今日饮水已达标: "Today's water goal is met.",
  番茄组件显示: "Pomodoro widget",
  今日个数: "Today's count",
  专注分钟: "Focus minutes",
  本轮轮次: "Current cycle",
  "选择番茄组件在胶囊上展示的信息。": "Choose what the pomodoro widget shows.",
  "最多同时显示 6 个组件；电池、蓝牙、连续专注等没有数据时自动隐藏。":
    "Up to 6 widgets at once; battery, Bluetooth and focus streak hide themselves when there is no data.",
  "常驻额度仅在有常驻 AI 账户时显示；最多同时显示 6 个，没有数据的组件自动隐藏。":
    "The pinned quota needs a pinned AI account; up to 6 widgets show at once and widgets without data hide themselves.",
  暂不可读取: "Not readable",
  未检测到设备: "No devices",
  已连接: "Connected",
  "已连接 · ": "Connected · ",
  已断开: "Disconnected",
  倒计时: "Countdown",
  "用于下班、午休或任意时长；空闲胶囊只显示选中的一条。":
    "Off-work, lunch or any duration; the idle capsule shows one selected countdown.",
  添加倒计时: "Add countdown",
  编辑倒计时: "Edit countdown",
  名称: "Name",
  请输入名称: "Enter a name",
  "请输入有效时间，例如 18:00": "Enter a valid time, e.g. 18:00",
  "请输入有效时长（秒数为 0–59）": "Enter a valid duration (seconds 0–59)",
  "最多添加 8 个倒计时": "Up to 8 countdowns",
  "确定删除这个倒计时？": "Delete this countdown?",
  目标时间: "Target time",
  时长: "Duration",
  显示在岛上: "Show on island",
  空闲胶囊显示: "Idle capsule:",
  空闲胶囊不显示倒计时: "No countdown on the idle capsule",
  取消显示: "Hide from capsule",
  "还没有倒计时。添加下班时间或固定时长，选中后显示在空闲胶囊。":
    "No countdowns yet. Add an off-work time or a fixed duration, then pick one for the idle capsule.",
  倒计时类型: "Countdown type",
  "例如：下班、午休": "e.g. Off work, Lunch",
  "保存失败，请重试": "Could not save. Try again.",
  输出设备: "Output device",
  "点击设备即可设为默认播放设备；托盘菜单也可以切换。":
    "Click a device to make it the default; the tray menu can switch it too.",
  "正在读取输出设备…": "Reading output devices…",
  读取输出设备失败: "Could not read output devices",
  未找到输出设备: "No output devices found",
  当前默认设备: "Current default device",
  点击切换为默认输出设备: "Click to make this the default",
  默认: "Default",
  已切换输出设备: "Output device switched",
  "切换输出设备失败，请重试": "Could not switch the output device. Try again.",
  设备: "Devices",
  音频设备: "Audio devices",
  输入设备: "Input device",
  "点击设备即可设为默认播放或录音设备；托盘菜单也可以切换输出。":
    "Click a device to make it the default for playback or recording; the tray menu can switch outputs too.",
  "正在读取音频设备…": "Reading audio devices…",
  读取音频设备失败: "Could not read audio devices",
  "读取设备失败，请重试": "Could not read devices — try again",
  重试: "Retry",
  刷新设备: "Refresh devices",
  未找到输入设备: "No input devices found",
  已切换输入设备: "Input device switched",
  "切换音频设备失败，请重试": "Could not switch the audio device. Try again.",
  点击切换为默认录音设备: "Click to make this the default recording device",
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
  "正在查询所有账户…": "Checking every account…",
  "等待查询…": "Waiting to check…",
  上次查询: "Last checked",
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
  编辑: "Edit",
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
  重置: "Resets",
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
  邮件: "Mail",
  专注: "Focus",
  短休: "Break",
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
  // —— Dialogs and list management ——
  关闭弹窗: "Close dialog",
  删除账户: "Delete account",
  "删除账户？": "Delete this account?",
  "的密钥会一并删除，之后需要重新添加才能查询。":
    "and its key will be deleted; add it again to resume querying.",
  账户已删除: "Account deleted",
  "移除邮箱？": "Remove this mailbox?",
  "的授权码也会从凭据管理器删除。":
    "and its app password will be removed from Credential Manager.",
  "删除倒计时？": "Delete this countdown?",
  "会从列表和空闲胶囊中移除。":
    "will be removed from the list and the idle capsule.",
  "还没有 AI 账户": "No AI accounts yet",
  "添加账户后，这里会显示余额或周期额度。":
    "Add an account to see balances or cycle quotas here.",
  还没有邮箱账户: "No mailboxes yet",
  "添加后会在这里显示每 5 秒更新的检查状态。":
    "Once added, its check status appears here and refreshes every 5 seconds.",
  请在桌面应用中添加邮箱: "Add mailboxes in the desktop app",
  "浏览器预览不会保存邮箱和授权码。":
    "The browser preview does not save mailboxes or app passwords.",
  "浏览器预览不会保存账户和密钥。":
    "The browser preview does not save accounts or keys.",
  还没有倒计时: "No countdowns yet",
  "添加下班时间或固定时长，选中后显示在空闲胶囊里。":
    "Add a clock time or a fixed duration, then pick one for the idle capsule.",
  "添加 AI 账户": "Add AI account",
  "选择服务并填写账户信息，密钥只保存在本机。":
    "Pick a service and fill in the account; the key stays on this PC.",
  "使用 IMAP 和授权码登录，仅支持 SSL/TLS；验证通过后开始检查新邮件。":
    "Sign in with IMAP and an app password over SSL/TLS; new mail is checked after verification.",
  "目标时间到点提醒，或从开始起倒数的固定时长。":
    "Remind at a clock time, or count down a fixed duration.",

  // —— Settings extras ——
  提醒: "Reminders",
  系统状态: "System status",
  "常驻账户以圆环加进度条显示剩余额度，收起时也能看到。":
    "Pinned accounts show remaining quota as a ring plus bar, even while collapsed.",
  "每两分钟自动查询一次，可随时手动刷新。":
    "Queried every two minutes; refresh manually any time.",
  灵动岛上的额度显示: "Quota on the island",
  请在桌面应用中配置账户: "Configure accounts in the desktop app",
  灵动岛上的邮件提醒: "Mail alerts on the island",
  "收到新邮件时，胶囊直接显示验证码或主题；展开面板可一键复制。":
    "New mail shows its code or subject on the capsule; expand to copy it.",
  "不保存邮件正文，提醒只在内存保留约 5 分钟。":
    "Mail bodies are never saved; alerts stay in memory for about five minutes.",
  "可添加多个邮箱，最近一封新邮件优先显示。":
    "Add several mailboxes; the newest mail is shown first.",
  "需在服务商开启 IMAP 并使用授权码；授权码存放在 Windows 凭据管理器，换 Windows 用户后需要重新添加。":
    "Enable IMAP at your provider and use an app password; it is stored in Windows Credential Manager and must be re-added for another Windows user.",
  "只看近 30 天": "Last 30 days only",
  "选择番茄进度在胶囊里显示今日个数、专注分钟或本轮轮次。":
    "Choose whether the pomodoro widget shows today's count, focus minutes or the cycle.",
  主要功能: "Main features",
  已删除: "Deleted",
  收起计时: "Collapse timer",
  "演示 · 音量": "Demo · Volume",
  "演示 · 亮度": "Demo · Brightness",
  "演示 · 充电中": "Demo · Charging",
  "演示 · 蓝牙耳机": "Demo · Bluetooth headset",
  "重置今日饮水？": "Reset today's water?",
  当前: "Now",
  计时器与番茄钟: "Timer & pomodoro",
  音乐控制: "Music control",
  邮箱验证码: "Mail codes",
  喝水打卡: "Water log",
  系统状态提醒: "System status alerts",
  "一键开始专注或休息，结束时灵动岛持续提醒。":
    "Start a focus or break with one click; the island keeps reminding when it ends.",
  "显示曲名、歌手与同步歌词，可直接切歌和暂停。":
    "Shows title, artist and synced lyrics, with direct controls.",
  "新邮件验证码直接显示在岛上，一键复制。":
    "New mail codes appear on the island and copy with one click.",
  "Codex、DeepSeek 等账户的余额与订阅额度常驻显示。":
    "Balances and subscription quotas for Codex, DeepSeek and more stay visible.",
  "记录每日饮水量，进度以圆环显示在灵动岛。":
    "Log daily water intake; progress shows as a ring on the island.",
  "音量、亮度、电源与蓝牙变化即时提示。":
    "Volume, brightness, power and Bluetooth changes are announced instantly.",
  饮水设置: "Water settings",
  番茄钟设置: "Pomodoro settings",
  已记录: "Logged",
  有记录的天数: "Active days",
  移除: "Remove",
  "还没有选择组件，空闲时只显示灵动岛名称。":
    "No widgets picked yet; the idle island only shows its name.",
  已显示: "Shown",
  可添加: "Available",
  关闭岛上歌词: "Hide island lyrics",
  开启岛上歌词: "Show island lyrics",
  复制: "Copy",
  "已结束 · 按 Esc 关闭": "Finished · Esc to dismiss",
  提醒动效: "Reminder animation",
  启动: "Startup",
  开机自启动: "Start with Windows",
  "登录 Windows 后自动启动；开机启动只显示岛上小窗，不打开设置页。":
    "Starts automatically after you sign in; a login launch only shows the island, not the settings window.",
  已开启开机自启动: "Autostart enabled",
  已关闭开机自启动: "Autostart disabled",
  开机自启动设置失败: "Could not change autostart",
  "提醒出现时胶囊的提示方式，每张卡片会实时预览。":
    "How the capsule reacts to a reminder; each card previews it live.",
  亮度: "Brightness",
  呼吸描边: "Breathing outline",
  光晕扫过: "Light sweep",
  脉冲闪烁: "Pulse flash",
  边框流光: "Border beam",
  仅颜色: "Colour only",
  提醒时自动展开: "Expand on reminder",
  全屏时隐藏灵动岛: "Hide the island in fullscreen",
  提醒显示时长: "Reminder display time",
  "喝水、新邮件等提醒在胶囊上停留的时间，自动展开的面板也按此收起；验证码保持到过期，计时完成等你确认。":
    "How long reminders like water and new mail stay visible; an auto-expanded panel collapses on the same clock. Codes stay until they expire, a finished timer waits for you.",
  已记录一杯水: "Water logged",
  "验证码、喝水和计时结束时会自动打开面板。":
    "Opens the panel automatically for mail codes, water and finished timers.",
  胶囊交互: "Capsule behaviour",
  全局快捷键: "Global hotkeys",
  "组合键（如 Ctrl+Alt+S）和 F 键直接录制；快速按两次 Ctrl、Alt 或 Shift 录为双击触发；被其他程序占用的组合键会在下方列出。":
    "Combos (like Ctrl+Alt+S) and F-keys record directly; quickly pressing Ctrl, Alt or Shift twice records a double press; combos held by other programs are listed below.",
  "按下组合键，Esc 取消": "Press a combo, Esc to cancel",
  录制: "Record",
  "再按一次录为双击，等待则取消":
    "Press it again for a double press, or wait to cancel",
  双击: "Double",
  "（双击）": " (double press)",
  已关闭: "Off",
  "开始 / 暂停专注": "Start / pause focus",
  记一杯水: "Log a cup of water",
  "展开 / 收起灵动岛": "Expand / collapse the island",
  "注册失败，可能被其他程序占用：":
    "Registration failed, possibly held by another program: ",
  应用通知转发: "Notification forwarding",
  通知: "Notifications",
  通知页: "Notification page",
  暂无通知: "No notifications yet",
  "转发到灵动岛的系统通知会显示在这里。":
    "System notifications forwarded to the island appear here.",
  "在提醒设置中开启通知转发后，系统通知会显示在这里。":
    "Turn on notification forwarding in the reminder settings and they appear here.",
  清空通知: "Clear notifications",
  收到通知时: "When a notification arrives",
  "展开灵动岛会被动打开面板，不打断鼠标和键盘；显示在胶囊上只闪现几秒。":
    "Expanding opens the panel passively without grabbing your pointer or keyboard; the capsule flash only shows for a few seconds.",
  显示在胶囊上: "Show on the capsule",
  显示消息内容: "Show message content",
  通知显示时长: "Notification display time",
  "通知在胶囊上停留的时间，展开面板的横幅同样生效。":
    "How long a notification stays on the capsule; the expanded banner follows it too.",
  "关闭后胶囊只显示来源应用名，不显示消息文字。":
    "When off, the capsule only names the source app and never shows the message text.",
  新通知: "New notification",
  "把系统通知转发到灵动岛胶囊，内容只在本地显示；需要在系统设置中授予通知访问权限。":
    "Forward desktop notifications to the island capsule; content stays local. Grant notification access in system settings first.",
  转发系统通知: "Forward notifications",
  通知访问权限: "Notification access",
  "正在读取权限状态…": "Reading the access state…",
  "已授权，新通知会显示在岛上。":
    "Granted; new notifications appear on the island.",
  "未授权，请在系统设置中允许应用访问通知。":
    "Not granted; allow notification access in system settings.",
  打开系统设置: "Open system settings",
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
