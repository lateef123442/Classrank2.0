import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/tokens";
import { Back, Bar, Card, Label, Muted, Tag, s, STRENGTH_COLOR } from "../components/study/ui";
import {
  useStudy, subjectStats, topicStats, focusMinutes, dueCards, studyStreak, longestStudyStreak, totalAnswers,
  accuracyOverall, xpInfo, achievements, scoreHistory, totalFocusMinutes, weeklyActivity, subjectTrends, knowledgeGaps,
} from "../lib/studyStore";

export default function ProgressScreen({ navigation }: any) {
  const { data } = useStudy();
  const subjects = subjectStats(data), topics = topicStats(data);
  const week = focusMinutes(data, 6, 0), prev = focusMinutes(data, 13, 7);
  const xp = xpInfo(data), acc = accuracyOverall(data), hist = scoreHistory(data).slice(-10);
  const weak = topics.filter((t) => t.label === "Needs review"), strong = topics.filter((t) => t.label === "Strong");
  const week7 = weeklyActivity(data), maxMin = Math.max(30, ...week7.map((w) => w.minutes));
  const trends = Object.fromEntries(subjectTrends(data).map((t) => [t.id, t.delta]));
  const gaps = knowledgeGaps(data);
  const delta = prev > 0 ? Math.round(((week - prev) / prev) * 100) : null;
  const stats: [string, string][] = [
    ["Study streak", `${studyStreak(data)} days`], ["Best streak", `${longestStudyStreak(data)} days`], ["This week", `${week} min`],
    ["All time", `${Math.round((totalFocusMinutes(data) / 60) * 10) / 10} h`], ["Questions", `${totalAnswers(data)}`], ["Accuracy", acc === null ? "—" : `${acc}%`],
    ["Cards due", `${dueCards(data).length}`], ["Level", `${xp.level}`],
  ];
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Your progress</Text>
        {delta !== null && <Muted style={{ marginTop: 4 }}>You studied {week} min this week — {delta >= 0 ? `${delta}% more` : `${-delta}% less`} than last week.</Muted>}
        <View style={[s.row, { marginTop: spacing.lg }]}>
          {stats.map(([k, v]) => <Card key={k} style={{ width: "31%", flexGrow: 1 }}><Text style={s.h2}>{v}</Text><Muted>{k}</Muted></Card>)}
        </View>
        <Card><Text style={s.h3}>Level {xp.level} · {xp.xp} XP</Text><View style={{ marginVertical: 6 }}><Bar value={xp.intoLevel / 500} color={colors.violet} /></View><Muted>{xp.toNext} XP to level {xp.level + 1}</Muted></Card>

        <Label>THIS WEEK</Label>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 6 }}>
            {week7.map((w, i) => <View key={i} style={{ flex: 1, height: Math.max(4, (w.minutes / maxMin) * 80), borderRadius: 4, backgroundColor: w.minutes ? colors.teal : colors.border }} />)}
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>{week7.map((w, i) => <Text key={i} style={[s.muted, { flex: 1, textAlign: "center" }]}>{w.label}</Text>)}</View>
          <Muted style={{ marginTop: 6 }}>Focus minutes per day</Muted>
        </Card>

        <Label>IMPROVEMENT · LAST {hist.length || 0} QUIZZES</Label>
        {hist.length === 0 ? <Muted>Take a practice quiz to start tracking your scores over time.</Muted> : (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 6 }}>
              {hist.map((h, i) => <View key={i} style={{ flex: 1, height: Math.max(6, h.pct * 0.9), borderRadius: 4, backgroundColor: h.pct >= 80 ? colors.success : h.pct >= 60 ? colors.ember : colors.danger }} />)}
            </View>
            <Muted style={{ marginTop: 6 }}>Latest: {hist[hist.length - 1].pct}%{hist.length > 1 ? ` (first shown: ${hist[0].pct}%)` : ""}</Muted>
          </Card>
        )}

        <Label>SUBJECT PERFORMANCE</Label>
        {subjects.length === 0 && <Muted>Add subjects, then quiz and review cards to see strengths and weak areas.</Muted>}
        {subjects.map((x) => (
          <Card key={x.id} onPress={() => navigation.navigate("Subject", { subjectId: x.id })}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.h3}>{x.name}</Text><Tag label={x.label} color={STRENGTH_COLOR[x.label]} />
            </View>
            {trends[x.id] != null && <Text style={{ color: trends[x.id]! >= 0 ? colors.success : colors.danger, fontWeight: "600", marginTop: 2 }}>{trends[x.id]! >= 0 ? "▲" : "▼"} {Math.abs(trends[x.id]!)} pts vs earlier quizzes</Text>}
            <Muted style={{ marginVertical: 4 }}>{x.minutes} min studied · {x.quizAnswers} questions · {x.reviews} card reviews{x.accuracy !== null ? ` · ${x.accuracy}%` : ""}</Muted>
            <Bar value={(x.accuracy ?? 0) / 100} color={STRENGTH_COLOR[x.label]} />
          </Card>
        ))}

        <Label>TOPIC PERFORMANCE</Label>
        {topics.length === 0 && <Muted>Add topics inside a subject room to see them here.</Muted>}
        {topics.map((t) => (
          <Card key={t.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}><Text style={s.h3}>{t.name}</Text><Muted>{t.accuracy !== null ? `${t.accuracy}% · ${t.answered} answers` : `${t.answered} answers`}</Muted></View>
            <Tag label={t.label} color={STRENGTH_COLOR[t.label]} />
          </Card>
        ))}
        {(weak.length > 0 || strong.length > 0) && (
          <Card style={{ backgroundColor: colors.tealTint, borderWidth: 0 }}>
            {weak.length > 0 && <Text style={s.h3}>Focus on: {weak.map((t) => t.name).join(", ")}</Text>}
            {strong.length > 0 && <Muted style={{ marginTop: 4 }}>Strong: {strong.map((t) => t.name).join(", ")}</Muted>}
          </Card>
        )}

        {gaps.length > 0 && (
          <>
            <Label>KNOWLEDGE GAPS</Label>
            {gaps.slice(0, 6).map((g, i) => (
              <Card key={i} onPress={() => navigation.navigate("Subject", { subjectId: g.subjectId })}>
                <Text style={s.h3}>{{ weak: "🔴", overdue: "🟠", untested: "⚪", empty: "📭" }[g.kind]} {g.title}</Text>
                <Muted>{g.detail}</Muted>
              </Card>
            ))}
          </>
        )}

        <Label>ACHIEVEMENTS</Label>
        {achievements(data).map((a) => (
          <Card key={a.id} style={{ opacity: a.earned ? 1 : 0.7 }}>
            <Text style={s.h3}>{a.earned ? "🏅 " : ""}{a.title}</Text>
            <Muted>{a.desc}</Muted>
            {!a.earned && <View style={{ marginTop: 6 }}><Bar value={a.have / a.need} color={colors.violet} /></View>}
          </Card>
        ))}
        <Muted>Accuracy combines quiz answers and flashcard ratings of Good/Easy, and needs 5+ data points per subject (3+ answers per topic).</Muted>
      </ScrollView>
    </SafeAreaView>
  );
}
