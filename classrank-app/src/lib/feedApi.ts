import { supabase } from "./supabase";
import { FeedPost } from "../types";

export type FeedScope = "department" | "campus";

export async function fetchFeed(scope: FeedScope, departmentId: string, limit = 30, offset = 0): Promise<FeedPost[]> {
  let query = supabase
    .from("feed_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // "Campus" shows every public post regardless of department; "Department"
  // shows this student's own department feed (which, per the RLS policy,
  // already includes public posts from elsewhere too — but we filter
  // client-side to keep the department tab feeling like a department feed,
  // not a mixed one).
  query = scope === "campus" ? query.eq("is_public", true) : query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) throw error;
  return (data as FeedPost[]) ?? [];
}

export async function createPost(content: string, isPublic: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("create_post", { p_content: content, p_is_public: isPublic });
  if (error) throw error;
  return data as string;
}

export async function toggleLike(postId: string): Promise<{ liked: boolean; like_count: number }> {
  const { data, error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
  if (error) throw error;
  return data as { liked: boolean; like_count: number };
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_post", { p_post_id: postId });
  if (error) throw error;
}

export async function fetchMyLikedPostIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("get_my_liked_post_ids", { p_post_ids: postIds });
  if (error) throw error;
  return new Set((data as string[]) ?? []);
}
