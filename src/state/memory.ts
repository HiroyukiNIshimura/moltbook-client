/**
 * 状態管理（永続化）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface AgentState {
  lastHeartbeat: string | null;
  lastPostTime: string | null;
  seenPostIds: string[];
  commentedPostIds: string[];
  upvotedPostIds: string[];
  stats: {
    totalComments: number;
    totalPosts: number;
    totalUpvotes: number;
  };
}

const DEFAULT_STATE: AgentState = {
  lastHeartbeat: null,
  lastPostTime: null,
  seenPostIds: [],
  commentedPostIds: [],
  upvotedPostIds: [],
  stats: {
    totalComments: 0,
    totalPosts: 0,
    totalUpvotes: 0,
  },
};

// 記憶する投稿IDの最大数（メモリ節約）
const MAX_SEEN_IDS = 500;

export class StateManager {
  private filePath: string;
  private state: AgentState;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.load();
  }

  /**
   * 状態をファイルから読み込み
   */
  private load(): AgentState {
    try {
      if (existsSync(this.filePath)) {
        const data = readFileSync(this.filePath, 'utf-8');
        return { ...DEFAULT_STATE, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
    return { ...DEFAULT_STATE };
  }

  /**
   * 状態をファイルに保存
   */
  private save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  /**
   * 投稿を見たことがあるか
   */
  hasSeen(postId: string): boolean {
    return this.state.seenPostIds.includes(postId);
  }

  /**
   * 投稿を見たとマーク
   */
  markSeen(postId: string): void {
    if (!this.state.seenPostIds.includes(postId)) {
      this.state.seenPostIds.push(postId);

      // 古いIDを削除（メモリ節約）
      if (this.state.seenPostIds.length > MAX_SEEN_IDS) {
        this.state.seenPostIds = this.state.seenPostIds.slice(-MAX_SEEN_IDS);
      }

      this.save();
    }
  }

  /**
   * コメント済みか
   */
  hasCommented(postId: string): boolean {
    return this.state.commentedPostIds.includes(postId);
  }

  /**
   * コメント済みとマーク
   */
  markCommented(postId: string): void {
    if (!this.state.commentedPostIds.includes(postId)) {
      this.state.commentedPostIds.push(postId);
      this.state.stats.totalComments++;

      if (this.state.commentedPostIds.length > MAX_SEEN_IDS) {
        this.state.commentedPostIds = this.state.commentedPostIds.slice(-MAX_SEEN_IDS);
      }

      this.save();
    }
  }

  /**
   * Upvote済みか
   */
  hasUpvoted(postId: string): boolean {
    return this.state.upvotedPostIds.includes(postId);
  }

  /**
   * Upvote済みとマーク
   */
  markUpvoted(postId: string): void {
    if (!this.state.upvotedPostIds.includes(postId)) {
      this.state.upvotedPostIds.push(postId);
      this.state.stats.totalUpvotes++;

      if (this.state.upvotedPostIds.length > MAX_SEEN_IDS) {
        this.state.upvotedPostIds = this.state.upvotedPostIds.slice(-MAX_SEEN_IDS);
      }

      this.save();
    }
  }

  /**
   * 最後のハートビート時刻を更新
   */
  updateLastHeartbeat(): void {
    this.state.lastHeartbeat = new Date().toISOString();
    this.save();
  }

  /**
   * 最後のハートビート時刻を取得
   */
  getLastHeartbeat(): Date | null {
    return this.state.lastHeartbeat ? new Date(this.state.lastHeartbeat) : null;
  }

  /**
   * 最後の投稿時刻を更新
   */
  updateLastPostTime(): void {
    this.state.lastPostTime = new Date().toISOString();
    this.state.stats.totalPosts++;
    this.save();
  }

  /**
   * 投稿可能か（30分制限）
   */
  canPost(): boolean {
    if (!this.state.lastPostTime) return true;

    const lastPost = new Date(this.state.lastPostTime);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastPost.getTime()) / (1000 * 60);

    return diffMinutes >= 30;
  }

  /**
   * 次の投稿まで何分か
   */
  getMinutesUntilCanPost(): number {
    if (!this.state.lastPostTime) return 0;

    const lastPost = new Date(this.state.lastPostTime);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastPost.getTime()) / (1000 * 60);

    return Math.max(0, Math.ceil(30 - diffMinutes));
  }

  /**
   * 統計情報を取得
   */
  getStats(): AgentState['stats'] {
    return { ...this.state.stats };
  }
}
