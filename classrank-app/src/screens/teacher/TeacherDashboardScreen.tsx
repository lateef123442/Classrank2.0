import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius } from "../../theme/colors";
import { useApp } from "../../context/AppContext";
import { fetchTeacherStats } from "../../lib/teacherApi";
import { TeacherStats } from "../../types";
import StatCard from "../../components/StatCard";
import PressableScale from "../../components/animated/PressableScale";
import { StatCardSkeleton } from "../../components/animated/Skeleton";

export default function TeacherDashboardScreen() {
  const { profile } = useApp();
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.department_id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTeacherStats(profile.department_id);
      setStats(result);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load dashboard stats.");
    } finally {
      setLoading(false);
    }
  }, [profile?.department_id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return null;

  if (loading && !stats) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.greeting}>Teacher Dashboard</Text>
          <Text style={styles.department}>{profile.department}</Text>
          <View style={styles.statsRow}>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </View>
          <View style={styles.statsRow}>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !stats) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Couldn't load stats</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <PressableScale style={styles.retryButton} onPress={load} haptic="medium">
            <Text style={styles.retryButtonText}>Try Again</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const completionRate =
    stats && stats.student_count > 0 ? Math.round((stats.today_completions / stats.student_count) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
      >
        <Text style={styles.greeting}>Teacher Dashboard</Text>
        <Text style={styles.department}>{profile.department}</Text>

        <View style={styles.statsRow}>
          <StatCard label="Students" value={stats?.student_count ?? 0} accentColor={colors.navy} />
          <StatCard label="Avg. Points" value={stats?.avg_points ?? 0} accentColor={colors.teal} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Today's Questions" value={stats?.today_question_count ?? 0} accentColor={colors.gold} />
          <StatCard label="Completion Rate" value={`${completionRate}%`} accentColor={colors.success} />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            {stats && stats.today_question_count === 0
              ? "No quiz published for today"
              : `${stats?.today_completions ?? 0} of ${stats?.student_count ?? 0} students have answered today`}
          </Text>
          <Text style={styles.infoText}>
            {stats && stats.today_question_count === 0
              ? "Head to the Questions tab to publish today's quiz for your department."
              : "Questions with student answers are locked from editing to keep grading fair — see the Questions tab."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },
  greeting: { fontSize: 24, fontWeight: "800", color: colors.navy, marginTop: 8 },
  department: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 20 },
  statsRow: { flexDirection: "row", marginBottom: 12 },
  infoCard: { backgroundColor: colors.tealLight, borderRadius: radius.md, padding: 16, marginTop: 8 },
  infoTitle: { fontSize: 14, fontWeight: "700", color: colors.navy, marginBottom: 6 },
  infoText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorTitle: { fontSize: 18, fontWeight: "800", color: colors.navy, textAlign: "center" },
  errorSubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 8, marginBottom: 20 },
  retryButton: { backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
