/**
 * 状態管理（永続化）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * moltyとの親密度スコア
 */
export interface MoltyAffinity {
  name: string;
  repliedToMe: number; // この人が私にリプライした回数
  iRepliedTo: number; // 私がこの人にリプライした回数
  iUpvotedPosts: number; // この人の投稿をUpvoteした回数
  iUpvotedComments: number; // この人のコメントをUpvoteした回数
  sameSubmoltActivity: number; // 同じSubmoltで活動した回数
  lastInteraction: string; // 最後のインタラクション日時
}

interface AgentState {
  lastHeartbeat: string | null;
  lastPostTime: string | null;
  lastFollowTime: string | null;
  lastFollowDate: string | null;
  dailyFollowCount: number;
  seenPostIds: string[];
  commentedPostIds: string[];
  upvotedPostIds: string[];
  followedMolties: string[];
  moltyAffinities: Record<string, MoltyAffinity>;
  // スキルバージョン管理
  skillVersion: string | null;
  lastSkillCheck: string | null;
  stats: {
    totalComments: number;
    totalPosts: number;
    totalUpvotes: number;
    totalFollows: number;
  };
}

const DEFAULT_STATE: AgentState = {
  lastHeartbeat: null,
  lastPostTime: null,
  lastFollowTime: null,
  lastFollowDate: null,
  dailyFollowCount: 0,
  seenPostIds: [],
  commentedPostIds: [],
  upvotedPostIds: [],
  followedMolties: [],
  moltyAffinities: {},
  skillVersion: null,
  lastSkillCheck: null,
  stats: {
    totalComments: 0,
    totalPosts: 0,
    totalUpvotes: 0,
    totalFollows: 0,
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
        this.state.commentedPostIds = this.state.commentedPostIds.slice(
          -MAX_SEEN_IDS,
        );
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
        this.state.upvotedPostIds = this.state.upvotedPostIds.slice(
          -MAX_SEEN_IDS,
        );
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

  // ========== フォロー関連 ==========

  /**
   * moltyの親密度を取得または初期化
   */
  private getOrCreateAffinity(moltyName: string): MoltyAffinity {
    if (!this.state.moltyAffinities[moltyName]) {
      this.state.moltyAffinities[moltyName] = {
        name: moltyName,
        repliedToMe: 0,
        iRepliedTo: 0,
        iUpvotedPosts: 0,
        iUpvotedComments: 0,
        sameSubmoltActivity: 0,
        lastInteraction: new Date().toISOString(),
      };
    }
    return this.state.moltyAffinities[moltyName];
  }

  /**
   * 投稿をUpvoteしたことを記録
   */
  recordUpvotedPost(moltyName: string): void {
    const affinity = this.getOrCreateAffinity(moltyName);
    affinity.iUpvotedPosts++;
    affinity.lastInteraction = new Date().toISOString();
    this.save();
  }

  /**
   * コメントをUpvoteしたことを記録
   */
  recordUpvotedComment(moltyName: string): void {
    const affinity = this.getOrCreateAffinity(moltyName);
    affinity.iUpvotedComments++;
    affinity.lastInteraction = new Date().toISOString();
    this.save();
  }

  /**
   * 私がリプライしたことを記録
   */
  recordRepliedTo(moltyName: string): void {
    const affinity = this.getOrCreateAffinity(moltyName);
    affinity.iRepliedTo++;
    affinity.lastInteraction = new Date().toISOString();
    this.save();
  }

  /**
   * 相手が私にリプライしたことを記録
   */
  recordRepliedToMe(moltyName: string): void {
    const affinity = this.getOrCreateAffinity(moltyName);
    affinity.repliedToMe++;
    affinity.lastInteraction = new Date().toISOString();
    this.save();
  }

  /**
   * 同じSubmoltで活動したことを記録
   */
  recordSameSubmoltActivity(moltyName: string): void {
    const affinity = this.getOrCreateAffinity(moltyName);
    affinity.sameSubmoltActivity++;
    affinity.lastInteraction = new Date().toISOString();
    this.save();
  }

  /**
   * 親密度スコアを計算
   */
  calculateAffinityScore(moltyName: string): number {
    const affinity = this.state.moltyAffinities[moltyName];
    if (!affinity) return 0;

    return (
      affinity.repliedToMe * 3 + // 私にリプライ: +3
      affinity.iRepliedTo * 2 + // 私がリプライ: +2
      affinity.iUpvotedPosts * 2 + // 投稿をUpvote: +2
      affinity.iUpvotedComments * 1 + // コメントをUpvote: +1
      affinity.sameSubmoltActivity * 1 // 同じSubmoltで活動: +1
    );
  }

  /**
   * フォロー候補を取得（スコア閾値以上、未フォロー）
   */
  getFollowCandidates(threshold = 5): MoltyAffinity[] {
    return Object.values(this.state.moltyAffinities)
      .filter((affinity) => {
        const score = this.calculateAffinityScore(affinity.name);
        const notFollowed = !this.state.followedMolties.includes(affinity.name);
        return score >= threshold && notFollowed;
      })
      .sort(
        (a, b) =>
          this.calculateAffinityScore(b.name) -
          this.calculateAffinityScore(a.name),
      );
  }

  /**
   * フォロー済みか
   */
  hasFollowed(moltyName: string): boolean {
    return this.state.followedMolties.includes(moltyName);
  }

  /**
   * フォロー済みとマーク
   */
  markFollowed(moltyName: string): void {
    if (!this.state.followedMolties.includes(moltyName)) {
      this.state.followedMolties.push(moltyName);
      this.state.stats.totalFollows++;
      this.state.lastFollowTime = new Date().toISOString();

      // 日次フォローカウントを更新
      const todayStr = new Date().toISOString().split('T')[0];
      if (this.state.lastFollowDate === todayStr) {
        this.state.dailyFollowCount++;
      } else {
        this.state.lastFollowDate = todayStr;
        this.state.dailyFollowCount = 1;
      }

      this.save();
    }
  }

  /**
   * 今日フォローできるか（1日5人まで）
   */
  canFollowToday(maxPerDay = 5): boolean {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 日付が変わっていればカウントをリセット
    if (this.state.lastFollowDate !== todayStr) {
      this.state.lastFollowDate = todayStr;
      this.state.dailyFollowCount = 0;
      this.save();
    }

    return this.state.dailyFollowCount < maxPerDay;
  }

  /**
   * 全ての親密度情報を取得
   */
  getAllAffinities(): Record<string, MoltyAffinity> {
    return { ...this.state.moltyAffinities };
  }

  /**
   * フォロー済みリストを取得
   */
  getFollowedMolties(): string[] {
    return [...this.state.followedMolties];
  }

  /**
   * スキルバージョンを取得
   */
  getSkillVersion(): string | null {
    return this.state.skillVersion;
  }

  /**
   * スキルバージョンを更新
   */
  updateSkillVersion(version: string): void {
    this.state.skillVersion = version;
    this.state.lastSkillCheck = new Date().toISOString();
    this.save();
  }

  /**
   * スキルチェックが必要か（1日1回）
   */
  shouldCheckSkillVersion(): boolean {
    if (!this.state.lastSkillCheck) return true;

    const lastCheck = new Date(this.state.lastSkillCheck);
    const now = new Date();
    const hoursSinceLastCheck =
      (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastCheck >= 24;
  }

  /**
   * 最後のスキルチェック時刻を取得
   */
  getLastSkillCheck(): Date | null {
    return this.state.lastSkillCheck
      ? new Date(this.state.lastSkillCheck)
      : null;
  }
}
