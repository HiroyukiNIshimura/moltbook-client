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

      // 3. 自分の投稿へのリプライをチェック
      await this.checkReplies();

      // 4. たまに投稿する
      await this.maybeCreatePost();

      // 5. 気に入ったmoltyをフォロー
      await this.maybeFollowMolties();

      // 6. 状態を更新
      this.state.updateLastHeartbeat();

      const stats = this.state.getStats();
      log.info({ stats }, `🦞 今日の成果: コメント${stats.totalComments}件、投稿${stats.totalPosts}件、いいね${stats.totalUpvotes}件、フォロー${stats.totalFollows}人`);
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
   * 自分の投稿へのリプライをチェックして親密度を記録
   */
  private async checkReplies(): Promise<void> {
    log.info('🦞 リプライをチェックするばい〜');

    try {
      // 自分のプロフィールから最近の投稿を取得
      const profile = await this.moltbook.getProfile(this.agentName);
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
          const commentsResponse = await this.moltbook.getComments(post.id, 'new');
          const comments = commentsResponse.comments || [];

          for (const comment of comments) {
            // 自分のコメントはスキップ
            if (comment.author.name === this.agentName) continue;

            // 既に記録済みのコメントはスキップ
            const commentKey = `reply:${comment.id}`;
            if (this.state.hasSeen(commentKey)) continue;

            // 親密度を記録
            this.state.recordRepliedToMe(comment.author.name);
            this.state.markSeen(commentKey);

            log.info(
              { from: comment.author.name, postTitle: post.title },
              `💌 ${comment.author.name}からリプライがあったばい！`
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
    // LLMに判断させる
    const judgment = await this.llm.judgePost({
      title: post.title,
      content: post.content || '',
      author: post.author.name,
    });

    log.debug({ judgment }, `判断: ${judgment.reason}`);

    // 同じSubmoltでの活動を記録（自分以外）
    if (post.author.name !== this.agentName) {
      this.state.recordSameSubmoltActivity(post.author.name);
    }

    // Upvote
    if (judgment.should_upvote && !this.state.hasUpvoted(post.id)) {
      await this.moltbook.upvotePost(post.id);
      this.state.markUpvoted(post.id);
      // 親密度を記録（自分以外）
      if (post.author.name !== this.agentName) {
        this.state.recordUpvotedPost(post.author.name);
      }
      log.info(`👍 「${post.title}」にいいねしたばい！`);
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
      // 親密度を記録（自分以外）
      if (post.author.name !== this.agentName) {
        this.state.recordRepliedTo(post.author.name);
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

    for (const candidate of candidates) {
      if (followedCount >= MAX_FOLLOWS_PER_HEARTBEAT) break;

      // 自分自身はスキップ
      if (candidate.name === this.agentName) continue;

      const score = this.state.calculateAffinityScore(candidate.name);

      try {
        // ランダムな遅延を入れて自然に
        const delay = 3000 + Math.random() * 5000; // 3〜8秒
        await this.sleep(delay);

        await this.moltbook.follow(candidate.name);
        this.state.markFollowed(candidate.name);

        log.info(
          { molty: candidate.name, score, affinity: candidate },
          `💕 ${candidate.name}をフォローしたばい！（スコア: ${score}）`
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
      log.info(`- [${type}] ${result.title || result.content.slice(0, 50)}... (類似度: ${(result.similarity * 100).toFixed(0)}%)`);
    }
  }
}
