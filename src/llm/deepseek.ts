/**
 * DeepSeek API クライアント
 */

import { getCommentPrompt, getPostPrompt, getJudgePrompt } from '../persona.js';

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

export class DeepSeekClient {
  private apiKey: string;
  private baseUrl = 'https://api.deepseek.com/v1';
  private model = 'deepseek-chat';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * チャット補完を実行
   */
  async chat(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
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
      throw new Error(`DeepSeek API error: ${error.error?.message || response.statusText}`);
    }

    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || '';
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
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error(`Failed to parse JSON from response: ${text}`);
    }

    return JSON.parse(jsonMatch[1]);
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
    const parsed = this.parseJSON<{ title: string; content: string; submolt: string }>(response);

    // submolt名を正規化（"m/general" → "general"）
    if (parsed.submolt.startsWith('m/')) {
      parsed.submolt = parsed.submolt.slice(2);
    }

    return parsed;
  }
}
