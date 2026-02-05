/**
 * コメントキュー
 * レートリミット（20秒/件、50件/日）を守るためのキュー
 */

import { createLogger } from './logger';
import type { MoltbookClient } from './moltbook/client';

const log = createLogger('comment-queue');

/** コメントジョブ */
export interface CommentJob {
  postId: string;
  content: string;
  parentId?: string; // リプライの場合
  metadata?: {
    postTitle?: string;
    targetAuthor?: string;
  };
}

/** キュー統計 */
export interface QueueStats {
  queueLength: number;
  dailyCount: number;
  dailyRemaining: number;
}

const MAX_DAILY_COMMENTS = 45; // 50より少し余裕を持たせる

export class CommentQueue {
  private queue: CommentJob[] = [];
  private dailyCount = 0;
  private lastDate: string | null = null;

  /**
   * 日次カウントを初期化（起動時にAPIから取得した値を設定）
   */
  initializeDailyCount(count: number): void {
    const today = new Date().toISOString().slice(0, 10);
    this.dailyCount = count;
    this.lastDate = today;
    log.info(
      `📊 本日のコメント数を初期化: ${count}件 (残り: ${MAX_DAILY_COMMENTS - count}件)`,
    );
  }

  /**
   * 日次カウントをリセット（日付が変わった場合）
   */
  private resetDailyIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastDate !== today) {
      log.info(
        `📅 日付が変わったばい！コメントカウントをリセット (${this.dailyCount}件 → 0件)`,
      );
      this.dailyCount = 0;
      this.lastDate = today;
    }
  }

  /**
   * キューにジョブを追加
   * @returns true: 追加成功, false: 日次制限に達している
   */
  enqueue(job: CommentJob): boolean {
    this.resetDailyIfNeeded();

    // 日次制限チェック（キュー内のジョブ + 本日処理済み）
    if (this.dailyCount + this.queue.length >= MAX_DAILY_COMMENTS) {
      log.warn(
        `🚫 コメント日次制限に達したばい... (${this.dailyCount}件処理済み, ${this.queue.length}件待ち)`,
      );
      return false;
    }

    this.queue.push(job);

    const target = job.metadata?.targetAuthor
      ? `@${job.metadata.targetAuthor}`
      : job.postId;
    log.info(
      `📝 コメントをキューに追加: ${target} (キュー: ${this.queue.length}件, 本日: ${this.dailyCount}件)`,
    );

    return true;
  }

  /**
   * キューからジョブを取り出す
   */
  private dequeue(): CommentJob | null {
    return this.queue.shift() ?? null;
  }

  /**
   * キューの先頭を処理（30秒間隔で呼び出される）
   */
  async processOne(moltbook: MoltbookClient): Promise<void> {
    this.resetDailyIfNeeded();

    const job = this.dequeue();
    if (!job) {
      return; // キューが空
    }

    const target = job.metadata?.targetAuthor
      ? `@${job.metadata.targetAuthor}`
      : `post:${job.postId.slice(0, 8)}`;

    try {
      await moltbook.createComment(job.postId, job.content, job.parentId);
      this.dailyCount++;

      log.info(
        `💬 コメント送信完了: ${target} (本日: ${this.dailyCount}/${MAX_DAILY_COMMENTS}件)`,
      );
    } catch (error) {
      // 失敗してもリトライはしない（重複投稿防止）
      log.error({ err: error }, `❌ コメント送信失敗: ${target}`);
    }
  }

  /**
   * キューの統計を取得
   */
  getStats(): QueueStats {
    this.resetDailyIfNeeded();
    return {
      queueLength: this.queue.length,
      dailyCount: this.dailyCount,
      dailyRemaining: Math.max(
        0,
        MAX_DAILY_COMMENTS - this.dailyCount - this.queue.length,
      ),
    };
  }

  /**
   * キューが空かどうか
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * 今日まだコメントできるか
   */
  canCommentToday(): boolean {
    this.resetDailyIfNeeded();
    return this.dailyCount + this.queue.length < MAX_DAILY_COMMENTS;
  }
}
