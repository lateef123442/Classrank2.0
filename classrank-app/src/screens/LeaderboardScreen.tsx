import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type } from "../theme/tokens";
import { useApp } from "../context/AppContext";
import PressableScale from "../components/animated/PressableScale";
import StaggerIn from "../components/animated/StaggerIn";
import { LeaderboardRowSkeleton } from "../components/animated/Skeleton";
import LeaderboardRow from "../components/LeaderboardRow";
import LeaderboardPodium from "../components/LeaderboardPodium";

type Tier = "Department" | "Faculty" | "Campus";
const TIERS: Tier[] = ["Department", "Faculty", "Campus"];

export default function LeaderboardScreen() {
  const {
    profile,
    departmentLeaderboard,
    facultyLeaderboard,
    campusLeaderboard,
    campusHasMore,
    loadMoreCampusLeaderboard,
    leaderboardLoading,
    leaderboardError,
    refreshLeaderboards,
  } = useApp();
  const [tier, setTier] = useState<Tier>("Department");

  if (!profile) return null;

  const rows =
    tier === "Department" ? departmentLeaderboard : tier === "Faculty" ? facultyLeaderboard : campusLeaderboard;

  const subtitleFor = (entryDept: string, entryFaculty: string) => (tier === "Campus" ? entryDept : entryFaculty);

  if (leaderboardError && rows.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Couldn't load the leaderboard</Text>
          <Text style={styles.errorSubtitle}>{leaderboardError}</Text>
          <PressableScale style={styles.retryButton} onPress={refreshLeaderboards} haptic="medium">
            <Text style={styles.retryButtonText}>Try Again</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const showPodium = top3.length === 3;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.segmentRow}>
          {TIERS.map((t) => (
            <PressableScale
              key={t}
              style={[styles.segment, tier === t && styles.segmentActive]}
              onPress={() => setTier(t)}
              haptic="selection"
              accessibilityRole="tab"
              accessibilityState={{ selected: tier === t }}
            >
              <Text style={[styles.segmentText, tier === t && styles.segmentTextActive]}>{t}</Text>
            </PressableScale>
          ))}
        </View>
        <Text style={styles.scopeLabel}>
          {tier === "Department" && `Ranked within ${profile.department}`}
          {tier === "Faculty" && `Ranked within ${profile.faculty} — normalized for fairness`}
          {tier === "Campus" && "Ranked campus-wide — normalized for fairness"}
        </Text>
      </View>

      {leaderboardLoading && rows.length === 0 ? (
        <View style={styles.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <LeaderboardRowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={tier === "Campus" && campusHasMore ? loadMoreCampusLeaderboard : undefined}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={leaderboardLoading} onRefresh={refreshLeaderboards} tintColor={colors.teal} />
          }
          ListHeaderComponent={
            showPodium ? (
              <LeaderboardPodium top3={top3} currentUserId={profile.id} />
            ) : top3.length > 0 ? (
              <View style={{ marginBottom: spacing.sm }}>
                {top3.map((item, i) => (
                  <LeaderboardRow
                    key={item.id}
                    rank={i + 1}
                    name={item.id === profile.id ? `${item.name} (You)` : item.name}
                    subtitle={subtitleFor(item.department, item.faculty)}
                    points={item.points}
                    isCurrentUser={item.id === profile.id}
                    isPro={item.is_pro}
                    percentile={tier === "Department" ? undefined : item.department_percentile}
                  />
                ))}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <StaggerIn index={index}>
              <LeaderboardRow
                rank={index + 4}
                name={item.id === profile.id ? `${item.name} (You)` : item.name}
                subtitle={subtitleFor(item.department, item.faculty)}
                points={item.points}
                isCurrentUser={item.id === profile.id}
                isPro={item.is_pro}
                percentile={tier === "Department" ? undefined : item.department_percentile}
              />
            </StaggerIn>
          )}
          ListEmptyComponent={
            !leaderboardLoading && rows.length === 0 ? (
              <Text style={styles.emptyText}>No rankings yet — be the first to take a quiz.</Text>
            ) : null
          }
        />
      )}
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
  scopeLabel: { ...type.caption, color: colors.textMuted, marginTop: spacing.md, marginBottom: 4 },
  list: { padding: spacing.xl, paddingTop: spacing.md },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40, ...type.caption },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxxl },
  errorTitle: { ...type.h2, color: colors.text, textAlign: "center" },
  errorSubtitle: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.xl },
  retryButton: { backgroundColor: colors.teal, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  retryButtonText: { color: "#fff", ...type.h3 },
});
