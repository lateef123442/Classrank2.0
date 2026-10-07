import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/tokens";
import { useApp } from "../context/AppContext";
import { Card, Chip, Label, Muted, Tag, s } from "../components/study/ui";
import { useStudy, questionPool, topicStats, scoreHistory, subjectName, attemptedToday, QuizMode, QUIZ_SIZE } from "../lib/studyStore";
import StaggerIn from "../components/animated/StaggerIn";

const MODES: { mode: QuizMode; icon: string; title: string; blurb: (n: number) => string; need: "subject" | "topic" | "any" }[] = [
  { mode: "review", icon: "🔁", title: "Spaced Review", blurb: () => "3–5 questions from each topic that is due or that you are struggling with", need: "any" },
  { mode: "quick", icon: "⚡", title: "Quick Quiz", blurb: () => "5 questions, leaning toward your weak spots", need: "any" },
  { mode: "topic", icon: "🎯", title: "Topic Quiz", blurb: () => "Drill one topic", need: "topic" },
  { mode: "subject", icon: "📚", title: "Subject Quiz", blurb: (n) => `Up to ${Math.min(n, QUIZ_SIZE.subject)} questions across the subject`, need: "subject" },
  { mode: "mock", icon: "⏱", title: "Mock Exam", blurb: (n) => `Timed, no hints until the end · up to ${Math.min(n, QUIZ_SIZE.mock)} questions`, need: "subject" },
  { mode: "daily", icon: "🌅", title: "Daily Challenge", blurb: () => "5 mixed questions across your subjects", need: "any" },
];

export default function PracticeScreen({ navigation }: any) {
  const { hasCompletedTodaysQuiz, todaysQuestions } = useApp();
  const { data } = useStudy();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const topics = topicStats(data).filter((t) => !subjectId || t.subjectId === subjectId);
  const hist = scoreHistory(data);
  const recent = hist.slice(-5);
  const trend = hist.length >= 4 ? Math.round(avg(hist.slice(-3)) - avg(hist.slice(-6, -3).length ? hist.slice(-6, -3) : hist.slice(0, -3))) : null;

  const count = (m: (typeof MODES)[number]) => questionPool(data, m.mode, subjectId ?? undefined, topicId ?? undefined).length;
  const start = (m: (typeof MODES)[number]) => navigation.navigate("PracticeSession", { mode: m.mode, subjectId: subjectId ?? undefined, topicId: topicId ?? undefined });
  const blocked = (m: (typeof MODES)[number]) => (m.mode === "topic" && !topicId) ? "Pick a topic above" : ((m.mode === "subject" || m.mode === "mock") && !subjectId) ? "Pick a subject above" : count(m) === 0 ? (m.mode === "review" ? "Nothing due — you're on top of it" : "No questions yet") : null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Text style={s.h1}>Practice</Text>
        <Muted style={{ marginTop: 4 }}>Test yourself, see where you're weak, then fix it.</Muted>

        {data.subjects.length === 0 ? (
          <Card style={{ marginTop: spacing.lg }} onPress={() => navigation.navigate("Planner")}>
            <Text style={s.h3}>Start by adding a subject →</Text><Muted>Practice questions live inside each subject.</Muted>
          </Card>
        ) : (
          <>
            <Label>SUBJECT</Label>
            <View style={s.row}>
              <Chip label="All" on={!subjectId} onPress={() => { setSubjectId(null); setTopicId(null); }} />
              {data.subjects.map((x) => <Chip key={x.id} label={x.name} on={subjectId === x.id} onPress={() => { setSubjectId(x.id); setTopicId(null); }} />)}
            </View>
            {topics.length > 0 && (
              <>
                <Label>TOPIC (FOR TOPIC QUIZ)</Label>
                <View style={s.row}>{topics.map((t) => <Chip key={t.id} label={t.name} on={topicId === t.id} onPress={() => setTopicId(topicId === t.id ? null : t.id)} />)}</View>
              </>
            )}

            <Label>CHOOSE A MODE</Label>
            {MODES.map((m, mi) => {
              const why = blocked(m);
              const done = m.mode === "daily" && attemptedToday(data, "daily");
              return (
                <StaggerIn key={m.mode} index={mi}><Card onPress={() => (why ? null : start(m))} style={why ? { opacity: 0.5 } : undefined}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 26, marginRight: spacing.md }}>{m.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.h3}>{m.title}{done ? "  ✅" : ""}</Text>
                      <Muted>{why ?? m.blurb(count(m))}</Muted>
                    </View>
                  </View>
                </Card></StaggerIn>
              );
            })}
            {data.questions.length === 0 && <Muted>No practice questions yet. Open a subject room to add some or generate them with the AI tutor.</Muted>}
          </>
        )}

        <Label>RANKED</Label>
        <Card onPress={() => navigation.navigate("Quiz")} style={hasCompletedTodaysQuiz ? { opacity: 0.6 } : undefined}>
          <Text style={s.h3}>🏆 Department quiz {hasCompletedTodaysQuiz ? "— done ✅" : ""}</Text>
          <Muted>{hasCompletedTodaysQuiz ? "Back tomorrow." : todaysQuestions.length ? `${todaysQuestions.length} questions · counts toward your leaderboard rank` : "No quiz published yet."}</Muted>
        </Card>

        {recent.length > 0 && (
          <>
            <Label>RECENT RESULTS</Label>
            {trend !== null && <Muted style={{ marginBottom: spacing.sm }}>{trend > 0 ? `📈 Your last 3 quizzes averaged ${trend} points higher than the 3 before.` : trend < 0 ? `📉 Your last 3 quizzes averaged ${-trend} points lower. Worth a review.` : "Holding steady."}</Muted>}
            {[...data.attempts].slice(-5).reverse().map((a) => {
              const p = Math.round((a.correct / Math.max(a.total, 1)) * 100);
              return (
                <Card key={a.id} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.h3}>{a.subjectId ? subjectName(data, a.subjectId) : "Mixed"} · {a.mode}</Text>
                    <Muted>{a.date} · {a.correct}/{a.total}</Muted>
                  </View>
                  <Tag label={`${p}%`} color={p >= 80 ? colors.success : p >= 60 ? colors.ember : colors.danger} />
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const avg = (xs: { pct: number }[]) => (xs.length ? xs.reduce((a, x) => a + x.pct, 0) / xs.length : 0);
