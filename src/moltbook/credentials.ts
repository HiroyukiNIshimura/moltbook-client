/**
 * 認証情報の管理
 * 環境変数 MOLTBOOK_API_KEY から取得
 */

/**
 * APIキーを取得（環境変数から）
 */
export function getApiKey(): string | null {
  return process.env.MOLTBOOK_API_KEY?.trim() || null;
}
