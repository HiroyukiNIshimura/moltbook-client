/**
 * DeepSeek API クライアント
 */

import { createLogger } from '../logger';
import { BaseLLMClient, RETRY_CONFIG, sleep } from './base';
import type { ChatMessage, ChatOptions } from './types';

const log = createLogger('deepseek');

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

export class DeepSeekClient extends BaseLLMClient {
  protected providerName = 'DeepSeek';
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';
  private model = 'deepseek-chat';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  /**
   * チャット補完を実行（リトライ付き）
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
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
}
