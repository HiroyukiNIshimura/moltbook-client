/**
 * OpenAI ChatGPT API クライアント
 * GPT-5 を使用
 */

import { createLogger } from '../logger';
import { BaseLLMClient, RETRY_CONFIG, sleep } from './base';
import type { ChatMessage, ChatOptions } from './types';

const log = createLogger('openai');

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      refusal?: string | null;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIClient extends BaseLLMClient {
  protected providerName = 'OpenAI';
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private model = 'gpt-5';

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

    // OpenAIのメッセージ形式に変換（同じ形式なのでそのまま使用可能）
    const openaiMessages: OpenAIChatMessage[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

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
            messages: openaiMessages,
            // GPT-5ではtemperatureはデフォルト(1)のみサポート
            // トークン制限を増やす（GPT-5は応答が長くなりがち）
            max_completion_tokens: options.maxTokens ?? 2048,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMsg = `OpenAI API error: ${error.error?.message || response.statusText}`;

          // リトライ可能なステータスかチェック
          if (
            RETRY_CONFIG.retryableStatuses.includes(response.status) &&
            attempt < RETRY_CONFIG.maxRetries
          ) {
            const delay = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
            log.info(
              `🔄 OpenAI ${response.status}エラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
            );
            await sleep(delay);
            lastError = new Error(errorMsg);
            continue;
          }

          throw new Error(errorMsg);
        }

        const data: OpenAIResponse = await response.json();

        // デバッグ: レスポンス内容をログ出力
        log.debug(`OpenAI response: ${JSON.stringify(data, null, 2)}`);

        // 空のchoicesをチェック
        if (!data.choices || data.choices.length === 0) {
          throw new Error(
            `OpenAI API returned empty response: ${JSON.stringify(data)}`,
          );
        }

        const choice = data.choices[0];

        // refusal（拒否）のチェック
        if (choice.message?.refusal) {
          throw new Error(`OpenAI API refused: ${choice.message.refusal}`);
        }

        // contentが空の場合
        if (!choice.message?.content) {
          throw new Error(
            `OpenAI API returned no content. finish_reason: ${choice.finish_reason}`,
          );
        }

        return choice.message.content;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('OpenAI API')) {
          throw error;
        }
        // ネットワークエラー - リトライ
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
          log.info(
            `🔄 OpenAIネットワークエラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
          );
          await sleep(delay);
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('OpenAI API request failed after retries');
  }
}
