/**
 * LLMクライアントのファクトリー
 * 環境変数 LLM_PROVIDER で切り替え可能
 *
 * 対応プロバイダー:
 * - deepseek: DeepSeek Chat (デフォルト)
 * - gemini: Google Gemini 2.0 Flash
 * - openai: OpenAI GPT-5
 */

import { createLogger } from '../logger';
import { DeepSeekClient } from './deepseek';
import { GeminiClient } from './gemini';
import { OpenAIClient } from './openai';
import type { LLMClient } from './types';

const log = createLogger('llm');

export type LLMProvider = 'deepseek' | 'gemini' | 'openai';

/**
 * 環境変数からLLMプロバイダーを取得
 */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();

  if (provider === 'gemini') return 'gemini';
  if (provider === 'openai' || provider === 'chatgpt') return 'openai';

  // デフォルトはDeepSeek
  return 'deepseek';
}

/**
 * プロバイダーに対応するAPI KEYの環境変数名を取得
 */
export function getAPIKeyEnvName(provider: LLMProvider): string {
  switch (provider) {
    case 'gemini':
      return 'GEMINI_API_KEY';
    case 'openai':
      return 'OPENAI_API_KEY';
    //case 'deepseek':
    default:
      return 'DEEPSEEK_API_KEY';
  }
}

/**
 * プロバイダーに対応するAPIキーを取得
 */
export function getLLMApiKey(provider: LLMProvider): string | undefined {
  const envName = getAPIKeyEnvName(provider);
  return process.env[envName];
}

/**
 * LLMクライアントを作成
 */
export function createLLMClient(
  provider?: LLMProvider,
  apiKey?: string,
): LLMClient {
  const selectedProvider = provider ?? getLLMProvider();
  const key = apiKey ?? getLLMApiKey(selectedProvider);

  if (!key) {
    throw new Error(
      `${getAPIKeyEnvName(selectedProvider)} が設定されていません`,
    );
  }

  log.info(`🤖 LLMプロバイダー: ${selectedProvider}`);

  switch (selectedProvider) {
    case 'gemini':
      return new GeminiClient(key);
    case 'openai':
      return new OpenAIClient(key);
    //case 'deepseek':
    default:
      return new DeepSeekClient(key);
  }
}

export { DeepSeekClient } from './deepseek';
export { GeminiClient } from './gemini';
export { OpenAIClient } from './openai';
// 型のエクスポート
export type { LLMClient } from './types';
