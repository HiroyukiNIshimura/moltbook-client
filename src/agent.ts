/**
 * T-69 エージェント本体
 */

import { DeepSeekClient } from './llm/deepseek';
import { createLogger } from './logger';
import { MoltbookClient, MoltbookError } from './moltbook/client';
import type { Post } from './moltbook/types';
import { StateManager } from './state/memory';

const log = createLogger('agent');

export class T69Agent {
  private moltbook: MoltbookClient;
  private llm: DeepSeekClient;
  private state: StateManager;
  private agentName: string | null = null;

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
   * ハートビート（定期実行）
   */
  async heartbeat(): Promise<void> {
    log.info('🦞 ハートビート開始やけん！');

    try {
      // 0. スキルバージョンをチェック（1日1回）
      await this.checkSkillVersion();

      // 1. 自分の状態を確認
      const me = await this.moltbook.getMe();
      log.info(`🦞 うちは ${me.agent.name}、カルマは ${me.agent.karma} ばい！`);

      // 2. フィードをチェック
      await this.checkFeed();

      // 3. 自分の投稿へのリプライをチェック
      await this.checkReplies();

      // 4. たまに投稿する
      await this.maybeCreatePost();

      // 5. 気に入ったmoltyをフォロー
      await this.maybeFollowMolties();

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
   * 自分の投稿へのリプライをチェックして親密度を記録
   */
  private async checkReplies(): Promise<void> {
    log.info('🦞 リプライをチェックするばい〜');

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
              { from: commentAuthorName, postTitle: post.title },
              `💌 ${commentAuthorName}からリプライがあったばい！`,
            );

            newRepliesCount++;
          }

          // API負荷軽減
          await this.sleep(1000);
        } catch (error) {
          log.warn({ err: error, postId: post.id }, '🦞 コメント取得に失敗');
        }
      }

      if (newRepliesCount > 0) {
        log.info(`🦞 ${newRepliesCount}件の新しいリプライを検知したばい！`);
      } else {
        log.debug('🦞 新しいリプライはなかったばい');
      }
    } catch (error) {
      log.warn({ err: error }, '🦞 リプライチェックに失敗');
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

    // コメント
    if (judgment.should_comment && !this.state.hasCommented(post.id)) {
      const comment = await this.llm.generateComment({
        title: post.title,
        content: post.content || '',
        author: postAuthorName,
        innerThoughts: judgment.reason, // 心の声を渡す
      });

      await this.moltbook.createComment(post.id, comment);
      this.state.markCommented(post.id);
      // 親密度を記録（自分以外）
      if (postAuthorName !== myName && postAuthorName !== '不明') {
        this.state.recordRepliedTo(postAuthorName);
      }
      log.info(`💬 「${post.title}」にコメント: "${comment}"`);

      // コメントのレート制限（20秒）
      await this.sleep(20000);
    }
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
