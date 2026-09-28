// Lightweight i18n: English + Spanish, runtime locale switching, no build step.
//
// Independent module — depends only on storage. Imported by main.js at boot and
// then by every scene that draws text. No reverse dependency on render/main so
// circular imports stay impossible.
//
// Translation strategy:
//   - `t(key, vars)` looks up a key in the active locale; falls back to `en`
//     then to the key string itself so missed keys are visible during testing.
//   - Vars interpolate `{name}` → vars.name. Missing vars are left untouched.
//   - `tn(key, count, vars)` picks `key.one` for count===1, else `key.other`,
//     and injects `{n}` automatically (callers can override via vars).
//   - `formatNumber` / `formatDate` route through `Intl.*` against the active
//     locale so a player who picks "English" gets `1,234` on a Spanish device.
//
// Locale resolution (see resolveLocale()):
//   1. saved settings.language ('auto' | 'en' | 'es')
//   2. when 'auto':
//        a. ?lang=en|es URL override (localhost only)
//        b. navigator.languages startsWith 'es' → 'es'
//        c. fallback: 'en'

import * as storage from './storage.js';

// ----- Dictionaries -----

const en = {
  // Common, reused everywhere
  'common.back':       '返回',
  'common.backShort':  '←',
  'common.close':      '关闭',
  'common.ok':         '好',
  'common.cancel':     '取消',
  'common.start':      '开始',
  'common.retry':      '↻ 重试',
  'common.again':      '↻ 再来',
  'common.title':      '🏠 主页',
  'common.share':      '📤 分享',
  'common.next':       '▶ 下一步',
  'common.nextLevel':  '▶ 下一关',
  'common.nextPuzzle': '▶ 下一题',
  'common.allPuzzles': '📋 全部谜题',
  'common.reshuffling': '洗牌中…',
  'common.copiedToClipboard': '已复制到剪贴板！',

  // Title scene
  'title.brand':           '消消乐',
  'title.welcomeBack':     '{name}，欢迎回来',
  'title.continueZen':     '▶ 继续禅境',
  'title.continueClassic': '▶ 继续闯关',
  'title.continueSubtitleClassic': '第{level}关 · {score}',
  'title.continueSubtitleZen':     '{score} 分',
  'title.streak':          '连续打卡',
  'title.viewSource':      '查看源码',
  'title.zen':             '🧘  禅境',
  'title.classic':         '🎯  闯关',
  'title.daily':           '📅  每日',
  'title.blitz':           '⚡  闪电',
  'title.puzzles':         '🧩  解谜',
  'title.zenBest':         '最高：{score}',
  'title.zenEndless':      '无尽模式 · 总有解',
  'title.classicSubtitle': '第 {current} / {total} 关  ·  ★ {stars}',
  'title.dailySubtitle':   '{date}',
  'title.dailySubtitleDone': '{date} ✓',
  'title.blitzSubtitleBest': '60 秒限时  ·  最高：{score}',
  'title.blitzSubtitle':   '60 秒限时',
  'title.puzzlesSubtitle': '已解 {done} / {total}',
  'title.stats':           '📊  统计',
  'title.settings':        '⚙  设置',

  // Settings overlay
  'settings.title':           '设置',
  'settings.haptic':          '震动反馈',
  'settings.paintingMode':    '涂色禅境模式',
  'settings.language':        '语言',
  'settings.languageAuto':    '自动',
  'settings.languageEn':      'English',
  'settings.languageEs':      'Español',
  'settings.resetProgress':   '🗑 重置进度',
  'settings.resetConfirm':    '清除全部进度和玩家名？',
  'settings.close':           '关闭',

  // Name-entry modal (DOM)
  'name_entry.label':         '给自己起个名字',
  'name_entry.start':         '开始',

  // Zen HUD
  'zen.title':                '🧘 禅境',
  'zen.end':                  '结束',
  'zen.endShort':             '结束',
  'zen.savePaintingConfirm':  '要把这局禅境的画面存成画作吗？',

  // Classic HUD
  'classic.level':            '第 {n} 关',
  'classic.moves':            '步数：{n}',

  // Daily HUD
  'daily.title':              '📅 每日挑战',
  'daily.movesLeft':          '剩余步数：{n}',
  'daily.replayDoesNotCount': '重玩（不计成绩）',
  'daily.todayLabel':         '{date}',

  // Combo floaters (cascade depth)
  'combo.2':                  '漂亮！',
  'combo.3':                  '太棒了！',
  'combo.4':                  '超神！',
  'combo.mega':               '超级 x{n}!',

  // Blitz HUD
  'blitz.title':              '⚡ 闪电',
  'blitz.seconds':            '{n}秒',

  // Result scene
  'result.classicWin':           '过关！',
  'result.classicLose':          '步数用完',
  'result.classicSubtitleWin':   '{score} 分（目标 {target}）',
  'result.classicSubtitleLose':  '{score} / {target}',
  'result.dailyHeader':          '每日挑战 — {date}',
  'result.newBest':              '🏆 新纪录！',
  'result.bestEver':             '历史最高：{score}',
  'result.blitzDone':            '⚡ 闪电结束',
  'result.best':                 '最高：{score}',
  'result.puzzleWin':            '🧩 解开了！',
  'result.puzzleLose':           '解谜失败',
  'result.goalNotReached':       '未达成目标',
  'result.runEnded':             '本局结束',
  'result.scorePts':             '{score} 分',
  'result.shareDailyText':       '消消乐每日 {date}：{score} 分',

  // Level select
  'levelSelect.title':           '闯关 — 选择关卡',
  'levelSelect.page':            '第 {page} / {total} 页',

  // Puzzle select
  'puzzleSelect.title':          '🧩 解谜',
  'puzzleSelect.solvedCount':    '已解 {done} / {total}',
  'puzzleSelect.tileMoves':      { one: '{n} 步', other: '{n} 步' },
  'puzzleSelect.tileLabel':      '#{id}  {name}',

  // Puzzle HUD
  'puzzle.title':                '🧩 {name}',
  'puzzle.moves':                '步数：{n}',

  // Puzzle goals / progress
  'puzzle.goal.totalScore':       '得分 {amount}',
  'puzzle.goal.clearGemsOfColor': '消除 {count} 颗{color}宝石',
  'puzzle.goal.createSpecial':    '合成 {count} 个{special}',
  'puzzle.goal.cascadeDepth':     '触发 {depth} 连锁',
  'puzzle.progress.totalScore':       '{score} / {amount}',
  'puzzle.progress.clearGemsOfColor': '{cleared} / {count}',
  'puzzle.progress.createSpecial':    '{cleared} / {count}',
  'puzzle.progress.cascadeDepth':     '最高连锁：{best} / {depth}',

  // Puzzle names + hints (per ID)
  'puzzle.1.name':  '第一步',           'puzzle.1.hint':  '三消就行，你可以的。',
  'puzzle.2.name':  '猎红',             'puzzle.2.hint':  '消除 10 颗红色宝石。',
  'puzzle.3.name':  '扫蓝',             'puzzle.3.hint':  '消除 12 颗蓝色宝石。',
  'puzzle.4.name':  '排成线',           'puzzle.4.hint':  '连续两次 4 连消。',
  'puzzle.5.name':  '连锁反应',         'puzzle.5.hint':  '触发一次 2 连锁。',
  'puzzle.6.name':  '冲刺得分',         'puzzle.6.hint':  '10 步内拿到 1,500 分。',
  'puzzle.7.name':  '砰！',             'puzzle.7.hint':  '摆出 T 形或 L 形。',
  'puzzle.8.name':  '彩虹冲刺',         'puzzle.8.hint':  '消除 15 颗紫色宝石。',
  'puzzle.9.name':  '彩色炸弹',         'puzzle.9.hint':  '一次 5 连消。',
  'puzzle.10.name': '深层连锁',         'puzzle.10.hint': '触发一次 3 连锁。',
  'puzzle.11.name': '马拉松',           'puzzle.11.hint': '稳住节奏。',
  'puzzle.12.name': '造星者',           'puzzle.12.hint': '3 连锁会生成星星，再深一层。',

  // Colors + specials (used by puzzle goal/progress strings)
  'color.0': '红色',    'color.1': '蓝色',    'color.2': '绿色',
  'color.3': '黄色',    'color.4': '紫色',    'color.5': '白色',    'color.6': '黑色',
  'special.lineGem':    '直线宝石',
  'special.colorBomb':  '彩色炸弹',
  'special.areaBomb':   '范围炸弹',
  'special.star':       '星星',
  'special.generic':    '特殊宝石',

  // Stats scene
  'stats.title':                  '统计与成就',
  'stats.unlockedSummary':        '已解锁 {unlocked} / {total}',
  'stats.totalGemsCleared':       '累计消除宝石',
  'stats.zenBestScore':           '禅境最高分',
  'stats.zenRunsPlayed':          '禅境局数',
  'stats.classicLevelsBeaten':    '闯关卡数',
  'stats.classicLevelsBeatenValue': '{n} / {total}',
  'stats.dailyChallengesCompleted':'完成每日挑战',
  'stats.blitzBestScore':         '闪电最高分',

  // Powerup overlay
  'powerup.shuffle.label':     '洗牌',
  'powerup.colorBlast.label':  '同色消除',
  'powerup.bombDrop.label':    '投弹',
  'powerup.recolor.label':     '换色',
  'powerup.targetHint':        '{emoji}  {label} — 点一颗宝石',
  'powerup.tapOutsideCancel':  '（点盘面外取消）',
  'powerup.pickColor':         '选一个颜色',
  'powerup.chargeEarned':      '+1 次充能！',
  'powerup.pickFill':          '选择要充能的道具',
  'powerup.saveForLater':      '或留着（点外部关闭）',

  // Screen-reader scene announcements (aria-live region — see main.js announce())
  'sr.scene.title':        '主菜单',
  'sr.scene.levelSelect':  '选关',
  'sr.scene.puzzleSelect': '选谜题',
  'sr.scene.stats':        '统计与成就',
  'sr.scene.result':       '结算页',
  'sr.scene.gameZen':      '禅境开始',
  'sr.scene.gameClassic':  '闯关开始',
  'sr.scene.gameDaily':    '每日挑战开始',
  'sr.scene.gameBlitz':    '闪电开始',
  'sr.scene.gamePuzzle':   '解谜开始',

  // Achievement toast
  'achievement.unlocked': '解锁成就',

  // Achievements (per ID — see src/achievements.js)
  'achievement.first_match.name':    '初次消除',   'achievement.first_match.desc':    '完成第一次消除。',
  'achievement.matches_100.name':    '连消好手',   'achievement.matches_100.desc':    '累计消除 100 颗宝石。',
  'achievement.matches_1000.name':   '消除大师',   'achievement.matches_1000.desc':   '累计消除 1,000 颗宝石。',
  'achievement.matches_10000.name':  '连锁之王',   'achievement.matches_10000.desc':  '累计消除 10,000 颗宝石。',
  'achievement.cascade_3.name':      '火力全开',   'achievement.cascade_3.desc':      '触发一次 3 连锁。',
  'achievement.cascade_5.name':      '星星诞生',   'achievement.cascade_5.desc':      '触发一次 5 连锁。',
  'achievement.cascade_8.name':      '势不可挡',   'achievement.cascade_8.desc':      '触发一次 8 连锁。',
  'achievement.special_color.name':  '彩色炸弹',   'achievement.special_color.desc':  '首次合成彩色炸弹。',
  'achievement.special_area.name':   '大爆炸',     'achievement.special_area.desc':   '首次合成范围炸弹。',
  'achievement.special_star.name':   '星座',       'achievement.special_star.desc':   '首次合成星星。',
  'achievement.classic_l10.name':    '学徒',       'achievement.classic_l10.desc':    '通过第 10 关。',
  'achievement.classic_l50.name':    '高手',       'achievement.classic_l50.desc':    '通过第 50 关。',
  'achievement.classic_l100.name':   '大师',       'achievement.classic_l100.desc':   '通过第 100 关。',
  'achievement.classic_l200.name':   '宗师',       'achievement.classic_l200.desc':   '通过第 200 关。',
  'achievement.first_zen.name':      '心平气和',   'achievement.first_zen.desc':      '完成第一局禅境。',
  'achievement.first_daily.name':    '每日习惯',   'achievement.first_daily.desc':    '完成第一次每日挑战。',
  'achievement.first_blitz.name':    '速度恶魔',   'achievement.first_blitz.desc':    '完成第一局闪电。',
  'achievement.first_puzzle.name':   '解谜人',     'achievement.first_puzzle.desc':   '解开第一道谜题。',
  'achievement.score_zen_10k.name':  '禅境万分',   'achievement.score_zen_10k.desc':  '单局禅境达到 10,000 分。',
  'achievement.score_zen_100k.name': '禅境十万',   'achievement.score_zen_100k.desc': '单局禅境达到 100,000 分。',

  // === 2026-07 feature drop ===

  // New settings
  'settings.sound':           '音效',
  'settings.gemStyle':        '宝石样式',
  'settings.gemStyleColor':   '彩色',
  'settings.gemStyleShapes':  '形状',
  'settings.gempedia':        '📖 宝石图鉴',
  'settings.exportSave':      '📤 导出存档',
  'settings.importSave':      '📥 导入存档',
  'settings.exportCopied':    '存档码已复制到剪贴板！',
  'settings.exportManual':    '你的存档码（复制它）：',
  'settings.importLabel':     '粘贴存档码',
  'settings.importApply':     '导入',
  'settings.importDone':      '存档已导入！',
  'settings.importBad':       '存档码无效。',

  // Undo power-up
  'powerup.undo.label':       '撤销',

  // Daily meta
  'daily.streak':             '🔥 连续 {n} 天',
  'title.dailyNext':          '{h}小时{m}分后更新',
  'result.viewHistory':       '📆 历史',
  'dailyHistory.title':       '📅 每日历史',
  'dailyHistory.empty':       '还没玩过每日挑战',
  'dailyHistory.totalPlayed': '已玩 {n} 次',

  // Daily leaderboard (optional backend — hidden when unavailable)
  'leaderboard.title':        '🏆 今日排行',
  'leaderboard.rank':         '你的名次：#{rank}',
  'leaderboard.empty':        '来做今天的第一名！',

  // Blitz time bonus + speed streak
  'blitz.timeBonus':          '+{n}秒',
  'blitz.streak':             '速度 x{n}',

  // Classic ice + boss levels
  'classic.ice':              '🧊 {n}',
  'classic.boss':             '👑 BOSS',

  // Zen painting gallery
  'zen.gallery':              '🖼 画廊',
  'gallery.title':            '🖼 禅境画作',
  'gallery.empty':            '用涂色模式玩一局禅境就能填充画廊。',

  // Stats additions
  'stats.biggestCascade':     '最大连锁',
  'stats.specialsCreated':    '合成特殊宝石',
  'stats.bombsDefused':       '拆除炸弹',
  'stats.timePlayed':         '游戏时长',
  'stats.timeValue':          '{h}小时{m}分',

  // New achievements
  'achievement.streak_3.name':   '常客',        'achievement.streak_3.desc':   '连续 3 天玩每日挑战。',
  'achievement.streak_7.name':   '铁杆',        'achievement.streak_7.desc':   '连续 7 天玩每日挑战。',
  'achievement.defuse_10.name':  '拆弹小队',    'achievement.defuse_10.desc':  '拆除 10 颗定时炸弹。',
  'achievement.powerup_10.name': '全副武装',    'achievement.powerup_10.desc': '使用 10 次道具充能。',

  // Hand-laid puzzles (13-15)
  'puzzle.13.name': '十字',           'puzzle.13.hint': '中间想成一个 T。',
  'puzzle.14.name': '双峰',           'puzzle.14.hint': '两组 4 连只差一步。',
  'puzzle.15.name': '将军',           'puzzle.15.hint': '只有一步能赢，找到它。',

  // Screen-reader extras
  'sr.scene.gempedia':        '宝石图鉴',
  'sr.scene.dailyHistory':    '每日历史',
  'sr.scene.gallery':         '禅境画作',

  // Gempedia
  'gempedia.title':           '宝石图鉴',
  'gempedia.subtitle':        '所有特殊宝石与道具',
  'gempedia.line.name':       '直线宝石',
  'gempedia.line.desc':       '消除时清空整行或整列。',
  'gempedia.line.how':        '4 连消获得。',
  'gempedia.colorBomb.name':  '彩色炸弹',
  'gempedia.colorBomb.desc':  '与任意宝石交换可清空该颜色的所有宝石；两颗交换可清空全盘。',
  'gempedia.colorBomb.how':   '5 连消，或一波消除 7+ 颗获得。',
  'gempedia.areaBomb.name':   '范围炸弹',
  'gempedia.areaBomb.desc':   '消除时炸开周围 3×3 区域。',
  'gempedia.areaBomb.how':    '摆出 T 形或 L 形消除，或一波消除 6+ 颗获得。',
  'gempedia.star.name':       '星星',
  'gempedia.star.desc':       '清除盘面上数量最多的两种颜色的宝石。',
  'gempedia.star.how':        '触发 3 连锁获得；也会随机掉落。',
  'gempedia.fire.name':       '火焰',
  'gempedia.fire.desc':       '消除时烧掉上下左右 4 颗宝石。',
  'gempedia.fire.how':        '顶部随机掉落。',
  'gempedia.lightning.name':  '闪电',
  'gempedia.lightning.desc':  '消除时电击同色随机 3 颗宝石。',
  'gempedia.lightning.how':   '顶部随机掉落。',
  'gempedia.wildcard.name':   '万能宝石',
  'gempedia.wildcard.desc':   '可当作任意颜色参与消除。',
  'gempedia.wildcard.how':    '顶部随机掉落。',
  'gempedia.coin.name':       '金币',
  'gempedia.coin.desc':       '消除它的那一波得分 ×5。',
  'gempedia.coin.how':        '顶部随机掉落。',
  'gempedia.gravity.name':    '重力宝石',
  'gempedia.gravity.desc':    '翻转下一次下落方向——宝石向上飞。',
  'gempedia.gravity.how':     '顶部随机掉落。',
  'gempedia.timeBomb.name':   '定时炸弹',
  'gempedia.timeBomb.desc':   '每走一步倒计时一次，消除它 +500 分；归零爆炸——闯关模式扣 5 步。',
  'gempedia.timeBomb.how':    '顶部随机掉落，初始为 7。',
  'gempedia.timePlus.name':   '时间宝石',
  'gempedia.timePlus.desc':   '闪电模式消除时 +2 秒。',
  'gempedia.timePlus.how':    '仅闪电模式掉落。',
  'gempedia.shuffle.name':    '洗牌',
  'gempedia.shuffle.desc':    '重排全盘宝石。',
  'gempedia.shuffle.how':     '每 1500 分获得 1 次充能（最多 3 次）。',
  'gempedia.colorBlast.name': '同色消除',
  'gempedia.colorBlast.desc': '点一颗宝石，清空同色全部宝石。',
  'gempedia.colorBlast.how':  '每 1500 分获得 1 次充能（最多 3 次）。',
  'gempedia.bombDrop.name':   '投弹',
  'gempedia.bombDrop.desc':   '点一颗宝石把它变成范围炸弹。',
  'gempedia.bombDrop.how':    '每 1500 分获得 1 次充能（最多 3 次）。',
  'gempedia.recolor.name':    '换色',
  'gempedia.recolor.desc':    '点一颗宝石并给它选个新颜色。',
  'gempedia.recolor.how':     '每 1500 分获得 1 次充能（最多 3 次）。',
  'gempedia.undo.name':       '撤销',
  'gempedia.undo.desc':       '回退到上一步之前的盘面。',
  'gempedia.undo.how':        '每 1500 分获得 1 次充能（最多 3 次）。',
};

const DICTIONARIES = { en, zh: en };   // en 字典已被替换为中文内容

// ----- State -----

let _setting = 'auto';   // raw value from storage: 'auto' | 'en' | 'es'
let _locale = 'en';      // resolved locale: 'en' | 'es'

// Cached Intl instances per locale; rebuilt on locale change so we don't
// allocate a fresh formatter for every formatNumber call.
let _nfCache = null;
let _dfCache = null;
// Memoized DateTimeFormat instances for opts-based formatDate() calls, keyed by
// JSON.stringify(opts). Without this, title.draw() (every rAF on narrow
// viewports) constructs a fresh ICU formatter ~60×/s. Cleared on locale change.
const _dfOptsCache = new Map();

// ----- Public API -----

export function init() {
  _setting = (storage.getSettings().language) || 'auto';
  _locale = resolveLocale(_setting);
  _nfCache = new Intl.NumberFormat(_locale);
  _dfCache = new Intl.DateTimeFormat(_locale, { year: 'numeric', month: 'short', day: 'numeric' });
  _dfOptsCache.clear();
  syncDocumentLang();
}

export function setLanguage(value) {
  if (value !== 'auto' && value !== 'en' && value !== 'es') return;
  _setting = value;
  storage.saveKey('settings', { language: value });
  const newLocale = resolveLocale(_setting);
  if (newLocale === _locale) return;
  _locale = newLocale;
  _nfCache = new Intl.NumberFormat(_locale);
  _dfCache = new Intl.DateTimeFormat(_locale, { year: 'numeric', month: 'short', day: 'numeric' });
  // Locale changed → template strings differ → cached interpolations and the
  // opts-keyed date formatters are stale.
  _interpolateCache.clear();
  _dfOptsCache.clear();
  syncDocumentLang();
}

// Keep <html lang> in sync with the active locale so screen readers pick the
// right pronunciation voice (matters when the player switches to Spanish on
// a device whose default is English, or vice versa).
function syncDocumentLang() {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = _locale;
  }
}

export function getLanguageSetting() { return _setting; }
export function getLocale() { return _locale; }

// Translate. Vars interpolate {name} → vars.name. Falls back to en, then to
// the key itself so missed strings are visible during testing.
export function t(key, vars) {
  if (key == null) {
    warnDev('i18n.t() called with empty key');
    return '';
  }
  const v = lookup(key, _locale) ?? lookup(key, 'en');
  if (v == null) return key;
  return vars ? interpolate(v, vars) : v;
}

// Pluralized translate. Looks up `key.one` or `key.other` depending on count.
// Automatically injects {n} = count; callers can override via vars.
export function tn(key, count, vars) {
  if (key == null) {
    warnDev('i18n.tn() called with empty key');
    return '';
  }
  const entry = lookupRaw(key, _locale) ?? lookupRaw(key, 'en');
  if (entry == null || typeof entry !== 'object') return t(key, { ...(vars || {}), n: count });
  const tmpl = (count === 1 ? entry.one : entry.other) || entry.other || entry.one || key;
  return interpolate(tmpl, { ...(vars || {}), n: count });
}

export function formatNumber(n) {
  return _nfCache ? _nfCache.format(n) : String(n);
}

export function formatDate(date, opts) {
  const normalized = normalizeDateInput(date);
  if (!(normalized instanceof Date) || Number.isNaN(normalized.getTime())) return String(date ?? '');
  if (!_dfCache) return String(date);
  if (opts) {
    const key = JSON.stringify(opts);
    let fmt = _dfOptsCache.get(key);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat(_locale, opts);
      _dfOptsCache.set(key, fmt);
    }
    return fmt.format(normalized);
  }
  return _dfCache.format(normalized);
}

// ----- Internals -----

function resolveLocale(setting) {
  // 本版只有中文：en 字典已替换为中文文案，统一返回 zh 以便日期/数字走中文本地化
  return 'zh';
}

function lookupRaw(key, locale) {
  const dict = DICTIONARIES[locale];
  return dict ? dict[key] : undefined;
}

function lookup(key, locale) {
  const raw = lookupRaw(key, locale);
  if (raw == null) return undefined;
  // For plain string entries we return as-is. For {one, other} entries the
  // caller should be using tn(); but if someone calls t() on a plural entry,
  // return the `other` form as a safe fallback.
  if (typeof raw === 'object') return raw.other ?? raw.one;
  return raw;
}

// HUD strings like 'Level {n}' / 'Moves: {n}' are interpolated every frame with
// values that are stable for seconds. Memoize so the regex replace + String()
// allocation only happens when (template, vars) actually changes.
//
// Caller contract: every existing call site passes vars whose values are
// primitives (numbers, strings, booleans), so `'|' + k + '=' + vars[k]` produces
// a unique key. for...in iterates string keys in insertion order per ES spec.
const _interpolateCache = new Map();
function interpolate(template, vars) {
  let key = template;
  for (const k in vars) key += '|' + k + '=' + vars[k];
  const cached = _interpolateCache.get(key);
  if (cached !== undefined) return cached;
  if (_interpolateCache.size > 256) _interpolateCache.clear();
  const out = template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  _interpolateCache.set(key, out);
  return out;
}

function normalizeDateInput(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(date);
}

function warnDev(message) {
  if (typeof location !== 'undefined' &&
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    console.warn(message);
  }
}
