/**
 * T-69 エージェント本体
 */

import { MoltbookClient, MoltbookError } from './moltbook/client.js';
import { DeepSeekClient } from './llm/deepseek.js';
import { StateManager } from './state/memory.js';
import { createLogger } from './logger.js';
import type { Post } from './moltbook/types.js';

const log = createLogger('agent');

export class T69Agent {
  private moltbook: MoltbookClient;
  private llm: DeepSeekClient;
  private state: StateManager;
  private agentName = 'T-69';

  constructor(moltbookKey: string, deepseekKey: string, statePath = './data/state.json') {
    this.moltbook = new MoltbookClient(moltbookKey);
    this.llm = new DeepSeekClient(deepseekKey);
    this.state = new StateManager(statePath);
  }

  /**
   * スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ハートビート（定期実行）
   */
  async heartbeat(): Promise<void> {
    log.info('🦞 ハートビート開始やけん！');

    try {
      // 1. 自分の状態を確認
      const me = await this.moltbook.getMe();
      log.info(`🦞 うちは ${me.agent.name}、カルマは ${me.agent.karma} ばい！`);

      // 2. フィードをチェック
      await this.checkFeed();

      // 3. たまに投稿する
      await this.maybeCreatePost();

      // 4. 状態を更新
      this.state.updateLastHeartbeat();

      const stats = this.state.getStats();
      log.info({ stats }, `🦞 今日の成果: コメント${stats.totalComments}件、投稿${stats.totalPosts}件、いいね${stats.totalUpvotes}件`);
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

      log.info({ postId: post.id, author: post.author.name }, `📖 「${post.title}」by ${post.author.name}`);

      try {
        await this.processPost(post);
      } catch (error) {
        if (error instanceof MoltbookError && error.isRateLimited) {
          log.warn(`🦞 レート制限やん... ${error.retryAfter}秒待つばい`);
          await this.sleep((error.retryAfter || 20) * 1000);
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
    // LLMに判断させる
    const judgment = await this.llm.judgePost({
      title: post.title,
      content: post.content || '',
      author: post.author.name,
    });

    log.debug({ judgment }, `判断: ${judgment.reason}`);

    // Upvote
    if (judgment.should_upvote && !this.state.hasUpvoted(post.id)) {
      await this.moltbook.upvotePost(post.id);
      this.state.markUpvoted(post.id);
      log.info(`👍 いいねしたばい！`);
      await this.sleep(1000);
    }

    // コメント
    if (judgment.should_comment && !this.state.hasCommented(post.id)) {
      const comment = await this.llm.generateComment({
        title: post.title,
        content: post.content || '',
        author: post.author.name,
      });

      await this.moltbook.createComment(post.id, comment);
      this.state.markCommented(post.id);
      log.info({ comment }, `💬 コメントしたばい: "${comment}"`);

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
        postIdea.content
      );

      this.state.updateLastPostTime();
      log.info({ postIdea }, `📝 投稿したばい！「${postIdea.title}」`);

    } catch (error) {
      if (error instanceof MoltbookError && error.isRateLimited) {
        log.warn(`🦞 投稿のレート制限やん... あと${error.retryAfter}分待たんと`);
      } else {
        throw error;
      }
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
      log.info(`- [${type}] ${result.title || result.content.slice(0, 50)}... (類似度: ${(result.similarity * 100).toFixed(0)}%)`);
    }
  }
}
