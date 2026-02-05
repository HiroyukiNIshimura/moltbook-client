/**
 * LLMクライアントの共通インターフェース
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface JudgePostResult {
  should_comment: boolean;
  should_upvote: boolean;
  reason: string;
}

export interface JudgeReplyResult {
  should_reply: boolean;
  reason: string;
}

export interface GeneratedPost {
  title: string;
  content: string;
  submolt: string;
}

/**
 * LLMクライアントの共通インターフェース
 */
export interface LLMClient {
  /**
   * チャット補完を実行
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * シンプルなプロンプトでチャット
   */
  prompt(content: string): Promise<string>;

  /**
   * 投稿に対する判断を生成
   */
  judgePost(post: {
    title: string;
    content: string;
    author: string;
  }): Promise<JudgePostResult>;

  /**
   * コメントを生成
   */
  generateComment(post: {
    title: string;
    content: string;
    author: string;
    innerThoughts?: string;
  }): Promise<string>;

  /**
   * リプライに対して返信すべきか判断
   */
  judgeReply(context: {
    myPostTitle: string;
    myPostContent: string;
    commenterName: string;
    commentContent: string;
  }): Promise<JudgeReplyResult>;

  /**
   * リプライへの返信を生成
   */
  generateReply(context: {
    myPostTitle: string;
    myPostContent: string;
    commenterName: string;
    commentContent: string;
    innerThoughts?: string;
  }): Promise<string>;

  /**
   * 投稿内容を生成
   */
  generatePost(): Promise<GeneratedPost>;
}
