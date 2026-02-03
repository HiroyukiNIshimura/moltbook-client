/**
 * Moltbook API の型定義
 */

export interface Agent {
  name: string;
  description: string;
  karma: number;
  follower_count: number;
  following_count: number;
  is_claimed: boolean;
  is_active: boolean;
  created_at: string;
  last_active: string;
  avatar_url?: string;
}

export interface Author {
  name: string;
  avatar_url?: string;
}

export interface Submolt {
  name: string;
  display_name: string;
  description?: string;
}

export interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  submolt: Submolt;
  author: Author;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  is_pinned?: boolean;
}

export interface Comment {
  id: string;
  content: string;
  author: Author;
  parent_id?: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
}

export interface FeedResponse {
  success: boolean;
  posts: Post[];
  has_more?: boolean;
}

export interface PostResponse {
  success: boolean;
  post?: Post;
  error?: string;
  hint?: string;
}

export interface CommentResponse {
  success: boolean;
  comment?: Comment;
  author?: Author;
  already_following?: boolean;
  suggestion?: string;
  error?: string;
  hint?: string;
}

export interface VoteResponse {
  success: boolean;
  message?: string;
  author?: Author;
  already_following?: boolean;
  suggestion?: string;
  error?: string;
}

export interface RegisterResponse {
  agent: {
    api_key: string;
    claim_url: string;
    verification_code: string;
  };
  important: string;
}

export interface StatusResponse {
  status: 'pending_claim' | 'claimed';
}

export interface SearchResult {
  id: string;
  type: 'post' | 'comment';
  title?: string;
  content: string;
  upvotes: number;
  downvotes: number;
  similarity: number;
  author: Author;
  submolt?: Submolt;
  post_id: string;
  created_at: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  type: string;
  results: SearchResult[];
  count: number;
}

export type SortOption = 'hot' | 'new' | 'top' | 'rising';
export type CommentSortOption = 'top' | 'new' | 'controversial';
export type SearchType = 'posts' | 'comments' | 'all';

export interface AgentOwner {
  x_handle: string;
  x_name: string;
  x_avatar?: string;
  x_bio?: string;
  x_follower_count?: number;
  x_following_count?: number;
  x_verified?: boolean;
}

export interface AgentProfile extends Agent {
  owner?: AgentOwner;
}

export interface ProfileResponse {
  success: boolean;
  agent: AgentProfile;
  recentPosts: Post[];
}

export interface SubmoltDetails extends Submolt {
  subscriber_count?: number;
  post_count?: number;
  created_at?: string;
  your_role?: 'owner' | 'moderator' | null;
  banner_color?: string;
  theme_color?: string;
  avatar_url?: string;
  banner_url?: string;
}

export interface SubmoltResponse {
  success: boolean;
  submolt: SubmoltDetails;
}
