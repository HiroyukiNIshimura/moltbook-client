/**
 * Google Gemini API クライアント
 * Gemini 2.0 Flash (gemini-2.0-flash) を使用
 */

import { createLogger } from '../logger';
import { BaseLLMClient, RETRY_CONFIG, sleep } from './base';
import type { ChatMessage, ChatOptions } from './types';

const log = createLogger('gemini');

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
    finishReason: string;
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiClient extends BaseLLMClient {
  protected providerName = 'Gemini';
  private apiKey: string;
  // Google AI Studio endpoint（APIキー対応）
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private model = 'gemini-2.0-flash';

  // 429エラー専用の長めのバックオフ設定
  private static readonly RATE_LIMIT_DELAY_MS = 60000; // 60秒待機

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  /**
   * メッセージをGemini形式に変換
   */
  private convertMessages(messages: ChatMessage[]): {
    systemInstruction?: { parts: { text: string }[] };
    contents: GeminiContent[];
  } {
    let systemInstruction: { parts: { text: string }[] } | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Geminiではsystem instructionとして設定
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemInstruction, contents };
  }

  /**
   * チャット補完を実行（リトライ付き）
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<string> {
    let lastError: Error | null = null;
    const { systemInstruction, contents } = this.convertMessages(messages);

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

        const requestBody: Record<string, unknown> = {
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.8,
            maxOutputTokens: options.maxTokens ?? 500,
          },
        };

        if (systemInstruction) {
          requestBody.systemInstruction = systemInstruction;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const errorMsg = `Gemini API error: ${error.error?.message || response.statusText}`;

          // リトライ可能なステータスかチェック
          if (
            RETRY_CONFIG.retryableStatuses.includes(response.status) &&
            attempt < RETRY_CONFIG.maxRetries
          ) {
            // 429エラーの場合は長めに待機
            const delay =
              response.status === 429
                ? GeminiClient.RATE_LIMIT_DELAY_MS
                : RETRY_CONFIG.baseDelayMs * 2 ** attempt;
            log.info(
              `🔄 Gemini ${response.status}エラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
            );
            await sleep(delay);
            lastError = new Error(errorMsg);
            continue;
          }

          throw new Error(errorMsg);
        }

        const data: GeminiResponse = await response.json();

        // 空のcandidatesをチェック
        if (
          !data.candidates ||
          data.candidates.length === 0 ||
          !data.candidates[0]?.content?.parts?.[0]?.text
        ) {
          throw new Error('Gemini API returned empty response');
        }

        return data.candidates[0].content.parts[0].text;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Gemini API')) {
          throw error;
        }
        // ネットワークエラー - リトライ
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = RETRY_CONFIG.baseDelayMs * 2 ** attempt;
          log.info(
            `🔄 Geminiネットワークエラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
          );
          await sleep(delay);
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('Gemini API request failed after retries');
  }
}
