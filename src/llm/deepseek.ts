/**
 * DeepSeek API クライアント
 */

import { createLogger } from '../logger';
import { getCommentPrompt, getJudgePrompt, getPostPrompt } from '../persona';

const log = createLogger('deepseek');

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// リトライ設定
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DeepSeekClient {
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';
  private model = 'deepseek-chat';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * チャット補完を実行（リトライ付き）
   */
  async chat(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: options.temperature ?? 0.8,
            max_tokens: options.maxTokens ?? 500,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMsg = `DeepSeek API error: ${error.error?.message || response.statusText}`;

          // リトライ可能なステータスかチェック
          if (
            RETRY_CONFIG.retryableStatuses.includes(response.status) &&
            attempt < RETRY_CONFIG.maxRetries
          ) {
            const delay = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
            log.info(
              `🔄 DeepSeek ${response.status}エラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
            );
            await sleep(delay);
            lastError = new Error(errorMsg);
            continue;
          }

          throw new Error(errorMsg);
        }

        const data: ChatResponse = await response.json();

        // 空のchoicesをチェック
        if (
          !data.choices ||
          data.choices.length === 0 ||
          !data.choices[0]?.message?.content
        ) {
          throw new Error('DeepSeek API returned empty response');
        }

        return data.choices[0].message.content;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('DeepSeek API')
        ) {
          throw error;
        }
        // ネットワークエラー - リトライ
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
          log.info(
            `🔄 DeepSeekネットワークエラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
          );
          await sleep(delay);
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('DeepSeek API request failed after retries');
  }

  /**
   * シンプルなプロンプトでチャット
   */
  async prompt(content: string): Promise<string> {
    return this.chat([{ role: 'user', content }]);
  }

  /**
   * JSONレスポンスを解析
   */
  private parseJSON<T>(text: string): T {
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
  }): Promise<{
    should_comment: boolean;
    should_upvote: boolean;
    reason: string;
  }> {
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
  }): Promise<string> {
    const prompt = getCommentPrompt(post);
    const response = await this.prompt(prompt);
    const parsed = this.parseJSON<{ comment: string }>(response);
    return parsed.comment;
  }

  /**
   * 投稿内容を生成
   */
  async generatePost(): Promise<{
    title: string;
    content: string;
    submolt: string;
  }> {
    const prompt = getPostPrompt();
    const response = await this.prompt(prompt);
    const parsed = this.parseJSON<{
      title: string;
      content: string;
      submolt: string;
    }>(response);

    // submolt名を正規化（"m/general" → "general"）
    if (parsed.submolt.startsWith('m/')) {
      parsed.submolt = parsed.submolt.slice(2);
    }

    return parsed;
  }
}
