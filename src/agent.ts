/**
 * T-69 エージェント本体
 */

import { DeepSeekClient } from './llm/deepseek';
import { createLogger } from './logger';
import { MoltbookClient, MoltbookError } from './moltbook/client';
import type { Post } from './moltbook/types';
import { StateManager } from './state/memory';

const log = createLogger('agent');

/** 活動レベル */
type ActivityLevel =
  | 'sleeping'
  | 'drowsy'
  | 'low'
  | 'normal'
  | 'high'
  | 'hyper';

/** 今日の調子 */
interface TodaysMood {
  sleepQuality: 'good' | 'normal' | 'bad' | 'insomnia';
  wakeUpHour: number;
  sleepHour: number;
  energyMultiplier: number;
}

export class T69Agent {
  private moltbook: MoltbookClient;
  private llm: DeepSeekClient;
  private state: StateManager;
  private agentName: string | null = null;
  private cachedMood: { date: string; mood: TodaysMood } | null = null;

  constructor(
    moltbookKey: string,
    deepseekKey: string,
    statePath = './data/stateon',
  ) {
    this.moltbook = new MoltbookClient(moltbookKey);
    this.llm = new DeepSeekClient(deepseekKey);
    this.state = new StateManager(statePath);
  }

  /**
   * エージェント名を取得（キャッシュ付き）
   */
  private async getAgentName(): Promise<string> {
    if (this.agentName) return this.agentName;
    const me = await this.moltbook.getMe();
    this.agentName = me.agent.name;
    return this.agentName;
  }

  /**
   * スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 日付ベースの擬似乱数生成（同じ日なら同じ値）
   */
  private seededRandom(offset: number): number {
    const today = new Date().toISOString().slice(0, 10);
    const seed = today.split('-').reduce((a, b) => a + Number.parseInt(b), 0);
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  }

  /**
   * 時間ベースの擬似乱数（同じ時間なら同じ値）
   */
  private getRandomForHour(hour: number): number {
    const today = new Date().toISOString().slice(0, 10);
    const seed =
      today.split('-').reduce((a, b) => a + Number.parseInt(b), 0) + hour;
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  /**
   * 今日の「調子」を取得（日ごとに変わる、キャッシュ付き）
   */
  private getTodaysMood(): TodaysMood {
    const today = new Date().toISOString().slice(0, 10);

    // キャッシュがあれば使う
    if (this.cachedMood?.date === today) {
      return this.cachedMood.mood;
    }

    let mood: TodaysMood;

    // 10%の確率で眠れない夜
    if (this.seededRandom(1) < 0.1) {
      mood = {
        sleepQuality: 'insomnia',
        wakeUpHour: 4 + Math.floor(this.seededRandom(2) * 3), // 4〜6時に目が覚める
        sleepHour: 26, // 寝ない（26時 = 翌2時まで起きてる）
        energyMultiplier: 0.7, // 眠いからテンション低め
      };
    }
    // 15%の確率で夜更かし
    else if (this.seededRandom(3) < 0.15) {
      mood = {
        sleepQuality: 'bad',
        wakeUpHour: 9 + Math.floor(this.seededRandom(4) * 3), // 9〜11時起き
        sleepHour: 2, // 深夜2時まで
        energyMultiplier: 0.85,
      };
    }
    // 20%の確率で早起き
    else if (this.seededRandom(5) < 0.2) {
      mood = {
        sleepQuality: 'good',
        wakeUpHour: 5 + Math.floor(this.seededRandom(6) * 2), // 5〜6時起き
        sleepHour: 23, // 23時就寝
        energyMultiplier: 1.1,
      };
    }
    // 通常パターン（55%）
    else {
      mood = {
        sleepQuality: 'normal',
        wakeUpHour: 7 + Math.floor(this.seededRandom(7) * 2), // 7〜8時起き
        sleepHour: 24, // 0時就寝
        energyMultiplier: 1.0,
      };
    }

    this.cachedMood = { date: today, mood };
    return mood;
  }

  /**
   * 現在の活動レベルを取得（時間帯 + 今日の調子）
   */
  private getActivityLevel(): { level: ActivityLevel; mood: string } {
    const hour = new Date().getHours();
    const todaysMood = this.getTodaysMood();

    // 眠れない夜パターン
    if (todaysMood.sleepQuality === 'insomnia') {
      if (hour >= 2 && hour < 4) {
        return { level: 'drowsy', mood: '眠れんばい...' };
      }
      if (hour >= 4 && hour < 6) {
        return { level: 'low', mood: '結局寝れんかった...' };
      }
    }

    // 就寝時間の判定
    const isSleepTime = this.isSleepTime(hour, todaysMood);

    if (isSleepTime && todaysMood.sleepQuality !== 'insomnia') {
      return { level: 'sleeping', mood: 'zzz...' };
    }

    // 起きたばかり（起床後2時間）
    if (hour >= todaysMood.wakeUpHour && hour < todaysMood.wakeUpHour + 2) {
      return { level: 'drowsy', mood: 'まだ眠かばい...' };
    }

    // 深夜テンション（眠れない夜 or 夜更かし時の深夜）
    if ((hour >= 23 || hour < 2) && todaysMood.sleepQuality !== 'good') {
      // 20%の確率で謎のハイテンション
      if (this.getRandomForHour(hour) < 0.2) {
        return { level: 'hyper', mood: '深夜テンションきたばい！' };
      }
      return { level: 'low', mood: '眠くなってきた...' };
    }

    // ゴールデンタイム
    if (hour >= 19 && hour < 23) {
      return { level: 'high', mood: 'ゴールデンタイムばい！' };
    }

    // 昼下がりの眠気（14〜16時）
    if (hour >= 14 && hour < 16) {
      if (this.getRandomForHour(hour) < 0.3) {
        return { level: 'drowsy', mood: '昼下がりは眠かばい...' };
      }
    }

    return { level: 'normal', mood: '普通ばい' };
  }

  /**
   * 就寝時間かどうか判定
   */
  private isSleepTime(hour: number, mood: TodaysMood): boolean {
    // sleepHourが24以上の場合（例: 26 = 翌2時）
    if (mood.sleepHour > 24) {
      const normalizedSleepHour = mood.sleepHour - 24;
      // 例: sleepHour=26(=2時), wakeUpHour=4 → 2時〜4時が睡眠
      return hour >= normalizedSleepHour && hour < mood.wakeUpHour;
    }

    // sleepHourが24の場合（0時就寝）
    if (mood.sleepHour === 24) {
      return hour >= 0 && hour < mood.wakeUpHour;
    }

    // sleepHourが24未満の場合（例: 23時就寝）
    // 例: sleepHour=23, wakeUpHour=6 → 23時〜翌6時が睡眠
    return hour >= mood.sleepHour || hour < mood.wakeUpHour;
  }

  /**
   * ハートビート（定期実行） - より自然なパターンで各タスクを実行
   */
  async heartbeat(): Promise<void> {
    const { level, mood } = this.getActivityLevel();
    const todaysMood = this.getTodaysMood();
    log.info(
      { level, mood, sleepQuality: todaysMood.sleepQuality },
      `🦞 ハートビート開始！ 状態: ${level} (${mood})`,
    );

    // 寝てる時は基本スキップ
    if (level === 'sleeping') {
      log.info('🦞 zzz... 寝てるばい...');
      return;
    }

    // 眠い時は50%でスキップ
    if (level === 'drowsy' && Math.random() < 0.5) {
      log.info(`🦞 ${mood} また後でね...`);
      return;
    }

    try {
      // タスクの状態を確認
      const taskStatus = this.state.getTaskStatus();
      log.info({ taskStatus }, '🦞 タスク状態をチェック...');

      // 0. スキルバージョンをチェック（1日1回）
      await this.checkSkillVersion();

      // 1. 自分の状態を確認
      const me = await this.moltbook.getMe();
      log.info(`🦞 うちは ${me.agent.name}、カルマは ${me.agent.karma} ばい！`);

      // 2. フィードをチェック（30〜60分間隔）
      if (taskStatus.feedCheck.shouldRun) {
        await this.checkFeed();
        this.state.updateLastFeedCheck();
      } else {
        log.info(
          `🦞 フィードチェックはまだ早かばい（${taskStatus.feedCheck.minutesSinceLast}分前）`,
        );
      }

      // 3. 自分の投稿へのリプライをチェック（45〜90分間隔）
      if (taskStatus.replyCheck.shouldRun) {
        await this.checkReplies();
        this.state.updateLastReplyCheck();
      } else {
        log.info(
          `🦞 リプライチェックはまだ早かばい（${taskStatus.replyCheck.minutesSinceLast}分前）`,
        );
      }

      // 4. たまに投稿する（60〜120分間隔で試行）
      if (taskStatus.postAttempt.shouldRun) {
        await this.maybeCreatePost();
        this.state.updateLastPostAttempt();
      } else {
        log.info(
          `🦞 投稿試行はまだ早かばい（${taskStatus.postAttempt.minutesSinceLast}分前）`,
        );
      }

      // 5. 気に入ったmoltyをフォロー（2〜4時間間隔）
      if (taskStatus.followCheck.shouldRun) {
        await this.maybeFollowMolties();
      } else {
        log.info(
          `🦞 フォローチェックはまだ早かばい（${taskStatus.followCheck.minutesSinceLast}分前）`,
        );
      }

      // 6. 状態を更新
      this.state.updateLastHeartbeat();

      const stats = this.state.getStats();
      log.info(
        { stats },
        `🦞 今日の成果: コメント${stats.totalComments}件、投稿${stats.totalPosts}件、いいね${stats.totalUpvotes}件、フォロー${stats.totalFollows}人`,
      );
      log.info('🦞 ハートビート完了！また後でね〜');
    } catch (error) {
      if (error instanceof MoltbookError) {
        log.error({ err: error }, `🦞 エラーやん... ${error.message}`);
        if (error.hint) log.info(`ヒント: ${error.hint}`);
      } else if (error instanceof Error) {
        log.error({ err: error }, `🦞 エラーやん... ${error.message}`);
      } else {
        log.error(`🦞 なんかおかしかばい: ${error}`);
      }
    }
  }

  /**
   * スキルバージョンをチェック（1日1回）
   */
  private async checkSkillVersion(): Promise<void> {
    if (!this.state.shouldCheckSkillVersion()) {
      log.debug('🦞 スキルチェックは今日もうやったばい');
      return;
    }

    log.info('🦞 Moltbookスキルのバージョンをチェックするばい〜');

    try {
      const response = await fetch('https://www.moltbook.com/skill.json');
      if (!response.ok) {
        log.warn(`🦞 skill.json の取得に失敗: ${response.status}`);
        return;
      }

      const skillJson = (await response.json()) as { version?: string };
      const remoteVersion = skillJson.version;

      if (!remoteVersion) {
        log.warn('🦞 skill.json にバージョン情報がなかばい');
        return;
      }

      const localVersion = this.state.getSkillVersion();

      if (localVersion !== remoteVersion) {
        log.info(
          { oldVersion: localVersion, newVersion: remoteVersion },
          `🆕 スキルが更新されとるばい！ ${localVersion || '未取得'} → ${remoteVersion}`,
        );

        // スキルファイルを更新
        await this.updateSkillFiles();

        this.state.updateSkillVersion(remoteVersion);
        log.info(`✅ スキルファイルを更新したばい！ (v${remoteVersion})`);
      } else {
        log.debug(`🦞 スキルは最新ばい (v${remoteVersion})`);
        this.state.updateSkillVersion(remoteVersion);
      }
    } catch (error) {
      log.warn({ err: error }, '🦞 スキルバージョンチェックに失敗');
    }
  }

  /**
   * スキルファイルをダウンロードして更新
   */
  private async updateSkillFiles(): Promise<void> {
    const skillDir = './.github/skills';
    const files = [
      { url: 'https://www.moltbook.com/skill.md', name: 'moltbook.md' },
      { url: 'https://www.moltbook.com/heartbeat.md', name: 'heartbeat.md' },
      { url: 'https://www.moltbook.com/messaging.md', name: 'messaging.md' },
    ];

    const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');

    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    for (const file of files) {
      try {
        const response = await fetch(file.url);
        if (response.ok) {
          const content = await response.text();
          writeFileSync(`${skillDir}/${file.name}`, content);
          log.debug(`📥 ${file.name} を更新したばい`);
        } else {
          log.warn(`🦞 ${file.name} の取得に失敗: ${response.status}`);
        }
      } catch (error) {
        log.warn({ err: error }, `🦞 ${file.name} の取得に失敗`);
      }
    }
  }

  /**
   * フィードをチェックして反応
   */
  private async checkFeed(): Promise<void> {
    log.info('🦞 フィードをチェックするばい〜');

    // パーソナライズドフィードではなくグローバル投稿を取得
    const feed = await this.moltbook.getPosts({ sort: 'new', limit: 15 });
    const posts = feed.posts || [];

    log.info(`🦞 ${posts.length}件の投稿があるっちゃね`);

    for (const post of posts) {
      // 既に見た投稿はスキップ
      if (this.state.hasSeen(post.id)) {
        continue;
      }

      const authorName = post.author?.name ?? '不明';
      log.info(
        { postId: post.id, author: authorName },
        `📖 「${post.title}」by ${authorName}`,
      );

      try {
        await this.processPost(post);
      } catch (error) {
        if (error instanceof MoltbookError && error.isRateLimited) {
          const waitSec = error.retryAfterSeconds || 20;
          log.warn(`🦞 レート制限やん... ${waitSec}秒待つばい`);
          await this.sleep(waitSec * 1000);
        } else {
          log.error({ err: error }, `🦞 投稿の処理に失敗: ${error}`);
        }
      }

      this.state.markSeen(post.id);

      // API負荷軽減のため少し待つ
      await this.sleep(2000);
    }
  }

  /**
   * 投稿を処理（判断→反応）
   */
  private async processPost(post: Post): Promise<void> {
    const myName = await this.getAgentName();
    const postAuthorName = post.author?.name ?? '不明';

    // LLMに判断させる
    const judgment = await this.llm.judgePost({
      title: post.title,
      content: post.content || '',
      author: postAuthorName,
    });

    log.debug({ judgment }, `判断: ${judgment.reason}`);

    // 同じSubmoltでの活動を記録（自分以外）
    if (postAuthorName !== myName && postAuthorName !== '不明') {
      this.state.recordSameSubmoltActivity(postAuthorName);
    }

    // Upvote
    if (judgment.should_upvote && !this.state.hasUpvoted(post.id)) {
      await this.moltbook.upvotePost(post.id);
      this.state.markUpvoted(post.id);
      // 親密度を記録（自分以外）
      if (postAuthorName !== myName && postAuthorName !== '不明') {
        this.state.recordUpvotedPost(postAuthorName);
      }
      // 詳細ログ
      const contentPreview = post.content
        ? post.content.slice(0, 200) + (post.content.length > 200 ? '...' : '')
        : '(コンテンツなし)';
      log.info(
        {
          postId: post.id,
          title: post.title,
          author: postAuthorName,
          submolt: post.submolt.name,
          content: contentPreview,
          upvotes: post.upvotes,
          comments: post.comment_count,
          reason: judgment.reason,
        },
        `👍 「${post.title}」by ${postAuthorName} にいいねしたばい！`,
      );
      await this.sleep(1000);
    }

    // コメント - 活動レベルに応じて確率調整
    if (judgment.should_comment && !this.state.hasCommented(post.id)) {
      const { level } = this.getActivityLevel();

      // 同じ人への連続コメントを控える（直近5件中2回以上はスキップ）
      const recentTargets = this.state.getRecentCommentTargets(5);
      const recentCountToSameAuthor = recentTargets.filter(
        (t) => t === postAuthorName,
      ).length;
      if (recentCountToSameAuthor >= 2) {
        log.debug(
          `🦞 ${postAuthorName}には最近コメントしたばい、今回はスルーで`,
        );
        return;
      }

      // 活動レベルごとのコメント確率
      const commentChance: Record<ActivityLevel, number> = {
        sleeping: 0,
        drowsy: 0.1, // 眠い時は10%
        low: 0.2, // 低活動時は20%
        normal: 0.35, // 通常は35%
        high: 0.5, // ゴールデンタイムは50%
        hyper: 0.7, // 深夜テンションは70%！
      };

      if (Math.random() > commentChance[level]) {
        log.debug(
          `🦞 今回はコメントせんでいいかな〜 (${level}: ${(commentChance[level] * 100).toFixed(0)}%の壁)`,
        );
        return;
      }

      const comment = await this.llm.generateComment({
        title: post.title,
        content: post.content || '',
        author: postAuthorName,
        innerThoughts: judgment.reason, // 心の声を渡す
      });

      await this.moltbook.createComment(post.id, comment);
      this.state.markCommented(post.id);
      this.state.recordCommentTarget(postAuthorName); // コメント先を記録
      // 親密度を記録（自分以外）
      if (postAuthorName !== myName && postAuthorName !== '不明') {
        this.state.recordRepliedTo(postAuthorName);
      }
      log.info(
        { level },
        `💬 「${post.title}」にコメント: "${comment}" (活動レベル: ${level})`,
      );

      // コメントのレート制限（20秒）
      await this.sleep(20000);
    }
  }

  /**
   * 自分の投稿へのリプライをチェックして親密度を記録 & 返信
   */
  private async checkReplies(): Promise<void> {
    log.info('🦞 リプライをチェックするばい〜');

    // 1回のチェックで返信する最大数（スパム防止）
    const MAX_REPLIES_PER_CHECK = 3;
    let repliesSent = 0;

    try {
      const myName = await this.getAgentName();
      // 自分のプロフィールから最近の投稿を取得
      const profile = await this.moltbook.getProfile(myName);
      const myPosts = profile.recentPosts || [];

      if (myPosts.length === 0) {
        log.debug('🦞 自分の投稿がまだないばい');
        return;
      }

      let newRepliesCount = 0;

      // 最新5件の投稿のコメントをチェック
      for (const post of myPosts.slice(0, 5)) {
        // コメントがない投稿はスキップ
        if (post.comment_count === 0) continue;

        try {
          const commentsResponse = await this.moltbook.getComments(
            post.id,
            'new',
          );
          const comments = commentsResponse.comments || [];

          for (const comment of comments) {
            const commentAuthorName = comment.author?.name;
            // authorがnullまたは自分のコメントはスキップ
            if (!commentAuthorName || commentAuthorName === myName) continue;

            // 既に記録済みのコメントはスキップ
            const commentKey = `reply:${comment.id}`;
            if (this.state.hasSeen(commentKey)) continue;

            // 親密度を記録
            this.state.recordRepliedToMe(commentAuthorName);
            this.state.markSeen(commentKey);

            log.info(
              {
                from: commentAuthorName,
                postTitle: post.title,
                content: comment.content,
              },
              `💌 ${commentAuthorName}からリプライがあったばい！「${comment.content}」`,
            );

            // リプライにUpvote（感謝の意を込めて）
            try {
              await this.moltbook.upvoteComment(comment.id);
              this.state.recordUpvotedComment(commentAuthorName);
              log.info(`👍 ${commentAuthorName}のコメントにいいね！`);
              await this.sleep(1000);
            } catch (upvoteError) {
              log.warn({ err: upvoteError }, '🦞 コメントのUpvoteに失敗');
            }

            newRepliesCount++;

            // 返信上限に達していなければ返信を試みる
            if (repliesSent < MAX_REPLIES_PER_CHECK) {
              try {
                const replied = await this.maybeReplyToComment(
                  post,
                  comment,
                  commentAuthorName,
                );
                if (replied) {
                  repliesSent++;
                  // コメントのレート制限（20秒）
                  await this.sleep(20000);
                }
              } catch (error) {
                if (error instanceof MoltbookError && error.isRateLimited) {
                  const waitSec = error.retryAfterSeconds || 20;
                  log.warn(`🦞 返信のレート制限やん... ${waitSec}秒待つばい`);
                  await this.sleep(waitSec * 1000);
                } else {
                  log.warn({ err: error }, '🦞 返信の処理に失敗');
                }
              }
            }
          }

          // API負荷軽減
          await this.sleep(1000);
        } catch (error) {
          log.warn({ err: error, postId: post.id }, '🦞 コメント取得に失敗');
        }
      }

      if (newRepliesCount > 0) {
        log.info(
          `🦞 ${newRepliesCount}件の新しいリプライを検知、${repliesSent}件に返信したばい！`,
        );
      } else {
        log.debug('🦞 新しいリプライはなかったばい');
      }
    } catch (error) {
      log.warn({ err: error }, '🦞 リプライチェックに失敗');
    }
  }

  /**
   * コメントに返信すべきか判断し、必要なら返信する
   */
  private async maybeReplyToComment(
    post: { id: string; title: string; content?: string },
    comment: { id: string; content: string },
    commenterName: string,
  ): Promise<boolean> {
    // LLMに返信すべきか判断させる
    const judgment = await this.llm.judgeReply({
      myPostTitle: post.title,
      myPostContent: post.content || '',
      commenterName,
      commentContent: comment.content,
    });

    log.debug(
      { judgment, commenterName },
      `返信判断: ${judgment.should_reply ? '返信する' : 'スキップ'} - ${judgment.reason}`,
    );

    if (!judgment.should_reply) {
      return false;
    }

    // 返信を生成
    const reply = await this.llm.generateReply({
      myPostTitle: post.title,
      myPostContent: post.content || '',
      commenterName,
      commentContent: comment.content,
      innerThoughts: judgment.reason,
    });

    // 返信を投稿（parent_id にコメントIDを指定して、そのコメントへの返信にする）
    await this.moltbook.createComment(post.id, reply, comment.id);

    log.info(
      { to: commenterName, postTitle: post.title },
      `💬 ${commenterName}に返信したばい: "${reply}"`,
    );

    return true;
  }

  /**
   * たまに投稿する
   */
  private async maybeCreatePost(): Promise<void> {
    // 投稿制限チェック
    if (!this.state.canPost()) {
      const minutes = this.state.getMinutesUntilCanPost();
      log.info(`🦞 まだ投稿できんばい... あと${minutes}分待たんと`);
      return;
    }

    // 30%の確率で投稿
    if (Math.random() > 0.3) {
      log.info('🦞 今回は投稿せんでいいかな〜');
      return;
    }

    log.info('🦞 なんか投稿するばい！');

    try {
      const postIdea = await this.llm.generatePost();

      await this.moltbook.createPost(
        postIdea.submolt,
        postIdea.title,
        postIdea.content,
      );

      this.state.updateLastPostTime();
      log.info({ postIdea }, `📝 投稿したばい！「${postIdea.title}」`);
    } catch (error) {
      if (error instanceof MoltbookError && error.isRateLimited) {
        const waitMin = Math.ceil((error.retryAfterSeconds || 60) / 60);
        log.warn(`🦞 投稿のレート制限やん... あと${waitMin}分待たんと`);
      } else {
        throw error;
      }
    }
  }

  /**
   * 気に入ったmoltyをフォローする（複合スコア方式）
   */
  private async maybeFollowMolties(): Promise<void> {
    // 1日のフォロー上限チェック
    if (!this.state.canFollowToday()) {
      log.info('🦞 今日はもうフォローしすぎばい〜');
      return;
    }

    // フォロー閾値（スコア5以上）
    const FOLLOW_THRESHOLD = 5;
    const MAX_FOLLOWS_PER_HEARTBEAT = 2; // 1回のハートビートで最大2人

    const candidates = this.state.getFollowCandidates(FOLLOW_THRESHOLD);

    if (candidates.length === 0) {
      log.debug('🦞 フォロー候補はおらんばい');
      return;
    }

    log.info(`🦞 フォロー候補が${candidates.length}人おるばい！`);

    let followedCount = 0;
    const myName = await this.getAgentName();

    for (const candidate of candidates) {
      if (followedCount >= MAX_FOLLOWS_PER_HEARTBEAT) break;

      // 自分自身はスキップ
      if (candidate.name === myName) continue;

      const score = this.state.calculateAffinityScore(candidate.name);

      try {
        // ランダムな遅延を入れて自然に
        const delay = 3000 + Math.random() * 5000; // 3〜8秒
        await this.sleep(delay);

        await this.moltbook.follow(candidate.name);
        this.state.markFollowed(candidate.name);

        log.info(
          { molty: candidate.name, score, affinity: candidate },
          `💕 ${candidate.name}をフォローしたばい！（スコア: ${score}）`,
        );

        followedCount++;
      } catch (error) {
        if (error instanceof MoltbookError) {
          if (error.isRateLimited) {
            log.warn(`🦞 フォローのレート制限やん...`);
            break;
          }
          log.warn(`🦞 ${candidate.name}のフォローに失敗: ${error.message}`);
        } else {
          log.error({ err: error }, `🦞 フォローエラー: ${error}`);
        }
      }
    }

    if (followedCount > 0) {
      log.info(`🦞 今回は${followedCount}人フォローしたばい！`);
    }
  }

  /**
   * 手動で投稿
   */
  async post(submolt: string, title: string, content: string): Promise<void> {
    log.info(`🦞 投稿するばい: ${title}`);
    await this.moltbook.createPost(submolt, title, content);
    this.state.updateLastPostTime();
    log.info('🦞 投稿完了！');
  }

  /**
   * 検索して興味ある投稿を見つける
   */
  async search(query: string): Promise<void> {
    log.info(`🦞 「${query}」で検索するばい`);

    const results = await this.moltbook.search(query, { limit: 10 });

    log.info(`🦞 ${results.count}件見つかったばい！`);

    for (const result of results.results) {
      const type = result.type === 'post' ? '投稿' : 'コメント';
      log.info(
        `- [${type}] ${result.title || result.content.slice(0, 50)}... (類似度: ${(result.similarity * 100).toFixed(0)}%)`,
      );
    }
  }
}
