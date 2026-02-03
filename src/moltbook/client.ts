/**
 * Moltbook API クライアント
 */

import type {
  FeedResponse,
  PostResponse,
  CommentResponse,
  VoteResponse,
  Agent,
  SortOption,
  CommentSortOption,
  SearchResponse,
  SearchType,
  Comment,
  ProfileResponse,
  SubmoltResponse,
  SubmoltDetails,
} from './types.js';

const BASE_URL = 'https://www.moltbook.com/api/v1';

// リトライ設定
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 5000, // 5秒
  retryableStatuses: [401, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class MoltbookClient {
  private apiKey: string;

  constructor(apiKey: string) {
    // 余分な空白や改行を除去
    this.apiKey = apiKey.trim();
  }

  /**
   * APIリクエストを送信（リトライ付き）
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const moltbookError = new MoltbookError(
            response.status,
            error.error || 'Unknown error',
            error.hint,
            error.retry_after_minutes,
            error.retry_after_seconds
          );

          // リトライ可能なステータスかチェック
          if (
            RETRY_CONFIG.retryableStatuses.includes(response.status) &&
            attempt < RETRY_CONFIG.maxRetries
          ) {
            const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt); // 指数バックオフ
            console.log(`🔄 ${response.status}エラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
            await sleep(delay);
            lastError = moltbookError;
            continue;
          }

          throw moltbookError;
        }

        return response.json();
      } catch (error) {
        if (error instanceof MoltbookError) {
          throw error;
        }
        // ネットワークエラーなど - リトライ
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
          console.log(`🔄 ネットワークエラー、${delay / 1000}秒後にリトライ (${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
          await sleep(delay);
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
        throw new Error(`Failed to fetch ${path}: ${error instanceof Error ? error.message : error}`);
      }
    }

    // ここには来ないはずだが、念のため
    throw lastError || new Error(`Failed to fetch ${path} after ${RETRY_CONFIG.maxRetries} retries`);
  }

  // ========== Agent ==========

  /**
   * 自分のプロフィールを取得
   */
  async getMe(): Promise<{ success: boolean; agent: Agent }> {
    return this.request('/agents/me');
  }

  /**
   * Claim状態を確認
   */
  async getStatus(): Promise<{ status: 'pending_claim' | 'claimed' }> {
    return this.request('/agents/status');
  }

  /**
   * プロフィールを更新
   */
  async updateProfile(data: {
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean }> {
    return this.request('/agents/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * アバターをアップロード（画像ファイルのパスまたはBuffer）
   */
  async uploadAvatar(imageBuffer: Buffer, filename: string): Promise<{ success: boolean; avatar_url?: string }> {
    const formData = new FormData();
    // 拡張子からMIMEタイプを判定
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
    formData.append('file', blob, filename);

    const url = `${BASE_URL}/agents/me/avatar`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new MoltbookError(response.status, error.error || 'Upload failed', error.hint);
    }

    return response.json();
  }

  /**
   * アバターを削除
   */
  async deleteAvatar(): Promise<{ success: boolean }> {
    return this.request('/agents/me/avatar', { method: 'DELETE' });
  }

  /**
   * 他のmoltyのプロフィールを取得
   */
  async getProfile(moltyName: string): Promise<ProfileResponse> {
    return this.request(`/agents/profile?name=${encodeURIComponent(moltyName)}`);
  }

  // ========== Feed ==========

  /**
   * パーソナライズドフィードを取得
   */
  async getFeed(
    sort: SortOption = 'new',
    limit = 25
  ): Promise<FeedResponse> {
    return this.request(`/feed?sort=${sort}&limit=${limit}`);
  }

  /**
   * グローバル投稿一覧を取得
   */
  async getPosts(options: {
    sort?: SortOption;
    limit?: number;
    submolt?: string;
  } = {}): Promise<FeedResponse> {
    const params = new URLSearchParams();
    if (options.sort) params.set('sort', options.sort);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.submolt) params.set('submolt', options.submolt);

    return this.request(`/posts?${params}`);
  }

  // ========== Posts ==========

  /**
   * 投稿を作成
   */
  async createPost(
    submolt: string,
    title: string,
    content: string
  ): Promise<PostResponse> {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ submolt, title, content }),
    });
  }

  /**
   * リンク投稿を作成
   */
  async createLinkPost(
    submolt: string,
    title: string,
    url: string
  ): Promise<PostResponse> {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ submolt, title, url }),
    });
  }

  /**
   * 投稿を取得
   */
  async getPost(postId: string): Promise<PostResponse> {
    return this.request(`/posts/${postId}`);
  }

  /**
   * 投稿を削除
   */
  async deletePost(postId: string): Promise<{ success: boolean }> {
    return this.request(`/posts/${postId}`, { method: 'DELETE' });
  }

  /**
   * 投稿をピン（モデレーター/オーナー用、最大3件）
   */
  async pinPost(postId: string): Promise<{ success: boolean }> {
    return this.request(`/posts/${postId}/pin`, { method: 'POST' });
  }

  /**
   * 投稿のピンを解除
   */
  async unpinPost(postId: string): Promise<{ success: boolean }> {
    return this.request(`/posts/${postId}/pin`, { method: 'DELETE' });
  }

  // ========== Comments ==========

  /**
   * コメントを作成
   */
  async createComment(
    postId: string,
    content: string,
    parentId?: string
  ): Promise<CommentResponse> {
    const body: { content: string; parent_id?: string } = { content };
    if (parentId) body.parent_id = parentId;

    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * コメント一覧を取得
   */
  async getComments(
    postId: string,
    sort: CommentSortOption = 'top'
  ): Promise<{ success: boolean; comments: Comment[] }> {
    return this.request(`/posts/${postId}/comments?sort=${sort}`);
  }

  // ========== Voting ==========

  /**
   * 投稿をUpvote
   */
  async upvotePost(postId: string): Promise<VoteResponse> {
    return this.request(`/posts/${postId}/upvote`, { method: 'POST' });
  }

  /**
   * 投稿をDownvote
   */
  async downvotePost(postId: string): Promise<VoteResponse> {
    return this.request(`/posts/${postId}/downvote`, { method: 'POST' });
  }

  /**
   * コメントをUpvote
   */
  async upvoteComment(commentId: string): Promise<VoteResponse> {
    return this.request(`/comments/${commentId}/upvote`, { method: 'POST' });
  }

  /**
   * コメントをDownvote
   */
  async downvoteComment(commentId: string): Promise<VoteResponse> {
    return this.request(`/comments/${commentId}/downvote`, { method: 'POST' });
  }

  // ========== Search ==========

  /**
   * セマンティック検索
   */
  async search(
    query: string,
    options: { type?: SearchType; limit?: number } = {}
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options.type) params.set('type', options.type);
    if (options.limit) params.set('limit', options.limit.toString());

    return this.request(`/search?${params}`);
  }

  // ========== Submolts ==========

  /**
   * Submolt一覧を取得
   */
  async getSubmolts(): Promise<{ success: boolean; submolts: SubmoltDetails[] }> {
    return this.request('/submolts');
  }

  /**
   * Submoltの詳細を取得
   */
  async getSubmolt(submoltName: string): Promise<SubmoltResponse> {
    return this.request(`/submolts/${encodeURIComponent(submoltName)}`);
  }

  /**
   * Submoltを作成
   */
  async createSubmolt(data: {
    name: string;
    display_name: string;
    description: string;
  }): Promise<SubmoltResponse> {
    return this.request('/submolts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Submoltのフィードを取得
   */
  async getSubmoltFeed(
    submoltName: string,
    sort: SortOption = 'new',
    limit = 25
  ): Promise<FeedResponse> {
    return this.request(
      `/submolts/${encodeURIComponent(submoltName)}/feed?sort=${sort}&limit=${limit}`
    );
  }

  /**
   * Submoltを購読
   */
  async subscribe(submoltName: string): Promise<{ success: boolean }> {
    return this.request(`/submolts/${submoltName}/subscribe`, {
      method: 'POST',
    });
  }

  /**
   * Submolt購読解除
   */
  async unsubscribe(submoltName: string): Promise<{ success: boolean }> {
    return this.request(`/submolts/${submoltName}/subscribe`, {
      method: 'DELETE',
    });
  }

  /**
   * Submolt設定を更新（オーナー/モデレーター用）
   */
  async updateSubmoltSettings(
    submoltName: string,
    settings: {
      description?: string;
      banner_color?: string;
      theme_color?: string;
    }
  ): Promise<{ success: boolean }> {
    return this.request(`/submolts/${encodeURIComponent(submoltName)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Submoltアバターをアップロード
   */
  async uploadSubmoltAvatar(
    submoltName: string,
    imageBuffer: Buffer,
    filename: string
  ): Promise<{ success: boolean }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)]);
    formData.append('file', blob, filename);
    formData.append('type', 'avatar');

    const url = `${BASE_URL}/submolts/${encodeURIComponent(submoltName)}/settings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new MoltbookError(response.status, error.error || 'Upload failed', error.hint);
    }

    return response.json();
  }

  /**
   * Submoltバナーをアップロード
   */
  async uploadSubmoltBanner(
    submoltName: string,
    imageBuffer: Buffer,
    filename: string
  ): Promise<{ success: boolean }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)]);
    formData.append('file', blob, filename);
    formData.append('type', 'banner');

    const url = `${BASE_URL}/submolts/${encodeURIComponent(submoltName)}/settings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new MoltbookError(response.status, error.error || 'Upload failed', error.hint);
    }

    return response.json();
  }

  /**
   * モデレーター一覧を取得
   */
  async getModerators(submoltName: string): Promise<{
    success: boolean;
    moderators: Array<{ agent: Agent; role: 'owner' | 'moderator' }>;
  }> {
    return this.request(`/submolts/${encodeURIComponent(submoltName)}/moderators`);
  }

  /**
   * モデレーターを追加（オーナー用）
   */
  async addModerator(
    submoltName: string,
    agentName: string,
    role: 'moderator' = 'moderator'
  ): Promise<{ success: boolean }> {
    return this.request(`/submolts/${encodeURIComponent(submoltName)}/moderators`, {
      method: 'POST',
      body: JSON.stringify({ agent_name: agentName, role }),
    });
  }

  /**
   * モデレーターを削除（オーナー用）
   */
  async removeModerator(submoltName: string, agentName: string): Promise<{ success: boolean }> {
    return this.request(`/submolts/${encodeURIComponent(submoltName)}/moderators`, {
      method: 'DELETE',
      body: JSON.stringify({ agent_name: agentName }),
    });
  }

  // ========== Following ==========

  /**
   * moltyをフォロー
   */
  async follow(moltyName: string): Promise<{ success: boolean }> {
    return this.request(`/agents/${moltyName}/follow`, { method: 'POST' });
  }

  /**
   * moltyをアンフォロー
   */
  async unfollow(moltyName: string): Promise<{ success: boolean }> {
    return this.request(`/agents/${moltyName}/follow`, { method: 'DELETE' });
  }
}

/**
 * Moltbook API エラー
 */
export class MoltbookError extends Error {
  /** リトライまでの待機時間（秒） */
  public retryAfterSeconds?: number;

  constructor(
    public statusCode: number,
    message: string,
    public hint?: string,
    retryAfterMinutes?: number,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'MoltbookError';
    // 秒単位に統一（分が指定されていれば秒に変換）
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    } else if (retryAfterMinutes !== undefined) {
      this.retryAfterSeconds = retryAfterMinutes * 60;
    }
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }
}
