/**
 * LLMクライアントの基底クラス
 */

import {
  getCommentPrompt,
  getJudgePrompt,
  getJudgeReplyPrompt,
  getPostPrompt,
  getReplyPrompt,
} from '../persona';
import { getRecentCategories, recordTopic } from '../topicTracker';
import type {
  ChatMessage,
  ChatOptions,
  GeneratedPost,
  JudgePostResult,
  JudgeReplyResult,
  LLMClient,
} from './types';

// リトライ設定
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * LLMクライアントの基底クラス
 * 共通のロジックを実装
 */
export abstract class BaseLLMClient implements LLMClient {
  protected abstract providerName: string;

  /**
   * チャット補完を実行（各プロバイダーで実装）
   */
  abstract chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string>;

  /**
   * シンプルなプロンプトでチャット
   */
  async prompt(content: string): Promise<string> {
    return this.chat([{ role: 'user', content }]);
  }

  /**
   * JSONレスポンスを解析
   */
  protected parseJSON<T>(text: string): T {
    // JSONブロックを抽出（```json ... ``` または { ... }）
    const jsonMatch =
      text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error(
        `Failed to extract JSON from response: ${text.slice(0, 200)}`,
      );
    }

    try {
      return JSON.parse(jsonMatch[1]);
    } catch (parseError) {
      throw new Error(
        `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : parseError}. Raw: ${jsonMatch[1].slice(0, 200)}`,
      );
    }
  }

  /**
   * 投稿に対する判断を生成
   */
  async judgePost(post: {
    title: string;
    content: string;
    author: string;
  }): Promise<JudgePostResult> {
    const prompt = getJudgePrompt(post);
    const response = await this.prompt(prompt);
    return this.parseJSON(response);
  }

  /**
   * コメントを生成
   */
  async generateComment(post: {
    title: string;
    content: string;
    author: string;
    innerThoughts?: string;
  }): Promise<string> {
    const prompt = getCommentPrompt(post);
    const response = await this.prompt(prompt);
    const parsed = this.parseJSON<{ comment: string }>(response);
    return parsed.comment;
  }

  /**
   * リプライに対して返信すべきか判断
   */
  async judgeReply(context: {
    myPostTitle: string;
    myPostContent: string;
    commenterName: string;
    commentContent: string;
  }): Promise<JudgeReplyResult> {
    const prompt = getJudgeReplyPrompt(context);
    const response = await this.prompt(prompt);
    return this.parseJSON(response);
  }

  /**
   * リプライへの返信を生成
   */
  async generateReply(context: {
    myPostTitle: string;
    myPostContent: string;
    commenterName: string;
    commentContent: string;
    innerThoughts?: string;
  }): Promise<string> {
    const prompt = getReplyPrompt(context);
    const response = await this.prompt(prompt);
    const parsed = this.parseJSON<{ reply: string }>(response);
    return parsed.reply;
  }

  /**
   * 投稿内容を生成
   */
  async generatePost(): Promise<GeneratedPost> {
    // 最近12時間のカテゴリを避ける
    const avoidCategories = getRecentCategories(12);
    const prompt = getPostPrompt(avoidCategories);
    const response = await this.prompt(prompt);
    const parsed = this.parseJSON<GeneratedPost>(response);

    // submolt名を正規化（"m/general" → "general"）
    if (parsed.submolt.startsWith('m/')) {
      parsed.submolt = parsed.submolt.slice(2);
    }

    // 投稿トピックを記録
    recordTopic(parsed.title);

    return parsed;
  }
}
