import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius } from "../../theme/colors";
import { fetchAdminStats } from "../../lib/adminApi";
import { AdminStats } from "../../types";
import StatCard from "../../components/StatCard";
import PressableScale from "../../components/animated/PressableScale";
import { StatCardSkeleton } from "../../components/animated/Skeleton";

export default function AdminDashboardScreen() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminStats();
      setStats(result);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load platform stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !stats) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.greeting}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>Platform-wide overview</Text>
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.teal} />}
      >
        <Text style={styles.greeting}>Admin Dashboard</Text>
        <Text style={styles.subtitle}>Platform-wide overview</Text>

        <View style={styles.statsRow}>
          <StatCard label="Students" value={stats?.total_students ?? 0} accentColor={colors.navy} />
          <StatCard label="Teachers" value={stats?.total_teachers ?? 0} accentColor={colors.teal} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Departments" value={stats?.total_departments ?? 0} accentColor={colors.gold} />
          <StatCard label="Points Awarded" value={stats?.total_points_awarded ?? 0} accentColor={colors.success} />
        </View>

        <Text style={styles.sectionTitle}>By Department</Text>
        {(stats?.by_department ?? []).map((d) => (
          <View key={d.department} style={styles.deptRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deptName}>{d.department}</Text>
              <Text style={styles.deptFaculty}>{d.faculty}</Text>
            </View>
            <View style={styles.deptStats}>
              <Text style={styles.deptStatValue}>{d.student_count}</Text>
              <Text style={styles.deptStatLabel}>students</Text>
            </View>
            <View style={styles.deptStats}>
              <Text style={styles.deptStatValue}>{d.avg_points}</Text>
              <Text style={styles.deptStatLabel}>avg pts</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },
  greeting: { fontSize: 24, fontWeight: "800", color: colors.navy, marginTop: 8 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 20 },
  statsRow: { flexDirection: "row", marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.navy, marginTop: 16, marginBottom: 10 },
  deptRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  deptName: { fontSize: 14, fontWeight: "700", color: colors.text },
  deptFaculty: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  deptStats: { alignItems: "center", marginLeft: 16 },
  deptStatValue: { fontSize: 15, fontWeight: "800", color: colors.teal },
  deptStatLabel: { fontSize: 10, color: colors.textMuted },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorTitle: { fontSize: 18, fontWeight: "800", color: colors.navy, textAlign: "center" },
  errorSubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 8, marginBottom: 20 },
  retryButton: { backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
