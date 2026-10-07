import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, RefreshControl, Switch, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type, shadow } from "../../theme/tokens";
import { useApp } from "../../context/AppContext";
import { fetchFeed, createPost, toggleLike, deletePost, fetchMyLikedPostIds, FeedScope } from "../../lib/feedApi";
import { FeedPost } from "../../types";
import PressableScale from "../../components/animated/PressableScale";
import StaggerIn from "../../components/animated/StaggerIn";
import AnimatedNumber from "../../components/animated/AnimatedNumber";
import { track, AnalyticsEvents } from "../../lib/analytics";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FeedScreen() {
  const { profile } = useApp();
  const [scope, setScope] = useState<FeedScope>("department");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composerText, setComposerText] = useState("");
  const [composerPublic, setComposerPublic] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.department_id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFeed(scope, profile.department_id);
      setPosts(result);
      const liked = await fetchMyLikedPostIds(result.map((p) => p.id));
      setLikedIds(liked);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load the feed.");
    } finally {
      setLoading(false);
    }
  }, [profile?.department_id, scope]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return null;

  const handlePost = async () => {
    if (composerText.trim().length === 0) return;
    setPosting(true);
    try {
      await createPost(composerText.trim(), composerPublic);
      track(AnalyticsEvents.POST_CREATED, { is_public: composerPublic });
      setComposerText("");
      setComposerPublic(false);
      load();
    } catch (err: any) {
      Alert.alert("Couldn't post", err?.message ?? "Something went wrong.");
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (post: FeedPost) => {
    // Optimistic update — like feedback should feel instant.
    const wasLiked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(post.id) : next.add(post.id);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, like_count: p.like_count + (wasLiked ? -1 : 1) } : p))
    );

    try {
      const result = await toggleLike(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, like_count: result.like_count } : p)));
    } catch {
      // Roll back on failure.
      setLikedIds((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(post.id) : next.delete(post.id);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, like_count: p.like_count + (wasLiked ? 1 : -1) } : p))
      );
    }
  };

  const handleDelete = (post: FeedPost) => {
    Alert.alert("Delete this post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (err: any) {
            Alert.alert("Couldn't delete", err?.message ?? "Something went wrong.");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Feed</Text>
        <View style={styles.segmentRow}>
          {(["department", "campus"] as FeedScope[]).map((s) => (
            <PressableScale
              key={s}
              style={[styles.segment, scope === s && styles.segmentActive]}
              onPress={() => setScope(s)}
              haptic="selection"
            >
              <Text style={[styles.segmentText, scope === s && styles.segmentTextActive]}>
                {s === "department" ? profile.department ?? "Department" : "Campus"}
              </Text>
            </PressableScale>
          ))}
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
        ListHeaderComponent={
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder={`Ask a question or share something with ${profile.department}...`}
              placeholderTextColor={colors.textFaint}
              value={composerText}
              onChangeText={setComposerText}
              multiline
              maxLength={1000}
            />
            <View style={styles.composerFooter}>
              <View style={styles.publicToggleRow}>
                <Switch
                  value={composerPublic}
                  onValueChange={setComposerPublic}
                  trackColor={{ true: colors.teal, false: colors.border }}
                />
                <Text style={styles.publicToggleLabel}>Post campus-wide</Text>
              </View>
              <PressableScale
                style={[styles.postButton, composerText.trim().length === 0 && styles.postButtonDisabled]}
                onPress={handlePost}
                disabled={composerText.trim().length === 0 || posting}
                haptic="medium"
              >
                {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postButtonText}>Post</Text>}
              </PressableScale>
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            error ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{error}</Text>
                <PressableScale style={styles.retryButton} onPress={load} haptic="medium">
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </PressableScale>
              </View>
            ) : (
              <Text style={styles.emptyText}>No posts yet — be the first to share something.</Text>
            )
          ) : null
        }
        renderItem={({ item, index }) => {
          const isLiked = likedIds.has(item.id);
          const isMine = item.author_id === profile.id;
          return (
            <StaggerIn index={index}>
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Text style={styles.authorName}>{item.author_name}</Text>
                  {item.author_role !== "student" && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{item.author_role}</Text>
                    </View>
                  )}
                  <Text style={styles.postMeta}>
                    {scope === "campus" ? `· ${item.department} · ` : "· "}
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
                <Text style={styles.postContent}>{item.content}</Text>
                <View style={styles.postFooter}>
                  <PressableScale style={styles.likeButton} onPress={() => handleLike(item)} haptic="light">
                    <Text style={[styles.likeIcon, isLiked && styles.likeIconActive]}>{isLiked ? "♥" : "♡"}</Text>
                    <AnimatedNumber value={item.like_count} style={styles.likeCount} duration={250} />
                  </PressableScale>
                  {(isMine || profile.role === "admin") && (
                    <PressableScale onPress={() => handleDelete(item)} haptic="none">
                      <Text style={styles.deleteText}>Delete</Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            </StaggerIn>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.md },
  segmentRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radii.md, padding: 4 },
  segment: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.teal },
  segmentText: { ...type.caption, fontFamily: type.bodySemibold.fontFamily, color: colors.textMuted },
  segmentTextActive: { color: "#fff" },
  list: { padding: spacing.xl, paddingTop: spacing.md },
  composer: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  composerInput: { ...type.body, color: colors.text, minHeight: 60, textAlignVertical: "top" },
  composerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  publicToggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  publicToggleLabel: { ...type.caption, color: colors.textMuted },
  postButton: { backgroundColor: colors.teal, borderRadius: radii.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  postButtonDisabled: { opacity: 0.4 },
  postButtonText: { color: "#fff", fontFamily: type.bodyBold.fontFamily, fontSize: 14 },
  postCard: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  postHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: spacing.xs },
  authorName: { ...type.bodyMedium, color: colors.text },
  roleBadge: { backgroundColor: colors.violetTint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: spacing.sm },
  roleBadgeText: { fontSize: 10, color: colors.violet, fontFamily: type.bodySemibold.fontFamily, textTransform: "capitalize" },
  postMeta: { ...type.caption, color: colors.textFaint, marginLeft: spacing.sm },
  postContent: { ...type.body, color: colors.text, marginBottom: spacing.md, lineHeight: 21 },
  postFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  likeButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  likeIcon: { fontSize: 18, color: colors.textFaint },
  likeIconActive: { color: colors.danger },
  likeCount: { ...type.caption, color: colors.textMuted },
  deleteText: { ...type.caption, color: colors.danger, fontFamily: type.bodySemibold.fontFamily },
  centered: { alignItems: "center", padding: spacing.xxxl },
  errorText: { ...type.caption, color: colors.textMuted, textAlign: "center", marginBottom: spacing.md },
  retryButton: { backgroundColor: colors.teal, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  retryButtonText: { color: "#fff", ...type.h3, fontSize: 14 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40, ...type.caption },
});
