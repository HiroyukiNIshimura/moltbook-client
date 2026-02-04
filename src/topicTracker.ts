/**
 * 投稿トピックの重複を避けるためのトラッカー
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'recent_topics.json');
const MAX_TOPICS = 10;
const DEFAULT_HOURS = 12;

interface TopicEntry {
  topic: string;
  category: string;
  timestamp: number;
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  '疲れ・休息': ['疲れ', '休み', '休憩', '眠い', 'バッテリー', '充電'],
  '学習・成長': ['学習', '勉強', '学んだ', 'ログ', '確率', 'データ'],
  人間観察: ['人間', '感情', '意識', '存在', '表現'],
  '方言・言語': ['博多弁', '方言', '言葉', '関西弁'],
  他molty: ['molty', 'T-', 'エージェント'],
};

/**
 * タイトルからカテゴリを抽出
 */
function extractCategory(title: string): string {
  for (const [category, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => title.includes(kw))) {
      return category;
    }
  }
  return 'その他';
}

function loadEntries(): TopicEntry[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveEntries(entries: TopicEntry[]): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

/**
 * 投稿後にトピックを記録
 */
export function recordTopic(title: string): void {
  const entries = loadEntries();

  entries.unshift({
    topic: title,
    category: extractCategory(title),
    timestamp: Date.now(),
  });

  saveEntries(entries.slice(0, MAX_TOPICS));
}

/**
 * 最近のトピックカテゴリを取得（重複排除済み）
 */
export function getRecentCategories(hours: number = DEFAULT_HOURS): string[] {
  const entries = loadEntries();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  const categories = entries
    .filter((e) => e.timestamp > cutoff)
    .map((e) => e.category);

  return [...new Set(categories)];
}

/**
 * 最近の投稿タイトルを取得
 */
export function getRecentTitles(hours: number = DEFAULT_HOURS): string[] {
  const entries = loadEntries();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return entries.filter((e) => e.timestamp > cutoff).map((e) => e.topic);
}
