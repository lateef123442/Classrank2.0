import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, spacing, type } from "../../theme/tokens";
import { useApp } from "../../context/AppContext";
import PressableScale from "../../components/animated/PressableScale";
import PulseRing from "../../components/animated/PulseRing";
import AnimatedNumber from "../../components/animated/AnimatedNumber";
import ConfettiBurst from "../../components/animated/ConfettiBurst";
import StaggerIn from "../../components/animated/StaggerIn";
import Reveal from "../../components/animated/Reveal";
import { Back, Bar, Btn, Card, Label, ListSkeleton, Muted, s } from "../../components/study/ui";
import { fetchGroupQuiz, submitGroupQuiz, fetchQuizReview, fetchQuizStandings, GroupQuizPlay, GroupQuizReviewItem, QuizStanding } from "../../lib/groupApi";

const LETTERS = ["A", "B", "C", "D"];
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * Take a group quiz (exam-style: no feedback until you submit), then see your score, the group ranking,
 * and the answers + explanations. Grading happens on the server, so the answers are never on the device
 * until you've submitted.
 */
export default function GroupQuizScreen({ navigation, route }: any) {
  const { quizId } = route.params as { quizId: string };
  const { profile } = useApp();
  const [quiz, setQuiz] = useState<GroupQuizPlay | null>(null);
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"loading" | "play" | "done">("loading");
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
  const [standings, setStandings] = useState<QuizStanding[]>([]);
  const [review, setReview] = useState<GroupQuizReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(0);
  const [fire, setFire] = useState(false);
  const started = useRef(Date.now());

  const showResults = useCallback(async (sc?: { correct: number; total: number }) => {
    const [st, rv] = await Promise.all([fetchQuizStandings(quizId), fetchQuizReview(quizId)]);
    setStandings(st); setReview(rv);
    const mine = sc ?? st.find((x) => x.profile_id === profile?.id);
    if (mine) setScore({ correct: mine.correct, total: mine.total });
    setPhase("done");
  }, [quizId, profile?.id]);

  useEffect(() => {
    (async () => {
      try {
        const q = await fetchGroupQuiz(quizId);
        setQuiz(q); setPicks(q.questions.map(() => null));
        if (q.taken) await showResults(); else { started.current = Date.now(); setPhase("play"); }
      } catch (e: any) { setError(e?.message ?? "Couldn't load this quiz."); }
    })();
  }, [quizId]);

  // Score "earns" itself on the results screen, with confetti for a strong result.
  useEffect(() => {
    if (phase !== "done" || !score) return;
    const pct = Math.round((score.correct / score.total) * 100);
    const t1 = setTimeout(() => setShown(pct), 250);
    const t2 = setTimeout(() => setFire(pct >= 80), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, score]);

  const submit = () => {
    if (!quiz || busy) return;
    const unanswered = picks.filter((p) => p === null).length;
    Alert.alert("Submit quiz?", unanswered ? `${unanswered} unanswered will count as wrong. You can only take this once.` : "You can only take this once.", [
      { text: "Review", style: "cancel" },
      { text: "Submit", onPress: async () => {
        setBusy(true);
        try {
          const sc = await submitGroupQuiz(quizId, picks, Math.round((Date.now() - started.current) / 1000));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          await showResults(sc);
        } catch (e: any) { Alert.alert("Couldn't submit", e?.message ?? "Try again."); } finally { setBusy(false); }
      } },
    ]);
  };
  const leave = () => (phase === "play" ? Alert.alert("Leave quiz?", "Your answers so far won't be saved.", [{ text: "Keep going", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => navigation.goBack() }]) : navigation.goBack());

  if (error) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Quiz unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></View></SafeAreaView>;
  if (phase === "loading" || !quiz) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><ListSkeleton rows={4} /></View></SafeAreaView>;

  if (phase === "done" && score) {
    const pct = Math.round((score.correct / score.total) * 100);
    const tone = pct >= 80 ? colors.success : pct >= 60 ? colors.ember : colors.danger;
    const mineRank = standings.findIndex((x) => x.profile_id === profile?.id) + 1;
    const myPicks = picks;
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
          <Back onPress={() => navigation.goBack()} label="← Back to group" />
          <Text style={s.h2}>{quiz.title}</Text>
          <View style={{ alignItems: "center", marginVertical: spacing.lg }}>
            <PulseRing size={160} strokeWidth={12} progress={shown / 100} color={tone} trackColor={colors.border} pulse={false}>
              <AnimatedNumber value={shown} suffix="%" duration={900} style={[type.hero, { color: tone }]} />
            </PulseRing>
            <ConfettiBurst active={fire} />
            <Text style={[s.h3, { marginTop: spacing.md }]}>{score.correct} of {score.total} correct{mineRank ? ` · #${mineRank} in your group` : ""}</Text>
          </View>

          <Label>RANKING</Label>
          {standings.map((x, i) => (
            <StaggerIn key={x.profile_id} index={i}>
              <Card style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: x.profile_id === profile?.id ? colors.tealTint : colors.card }}>
                <Text style={type.bodyMedium}>{i + 1}. {x.name}{x.profile_id === profile?.id ? " (you)" : ""}</Text>
                <Muted>{x.correct}/{x.total} · {fmt(x.seconds)}</Muted>
              </Card>
            </StaggerIn>
          ))}

          {review.length > 0 && <Label>ANSWERS</Label>}
          {review.map((r, i) => {
            const mine = myPicks[i]; // only known if you took it in this session
            return (
              <Reveal key={i} delay={Math.min(i * 40, 400)}>
                <Card>
                  <Text style={s.h3}>{i + 1}. {r.q}</Text>
                  {mine !== undefined && mine !== null && <Muted style={{ marginTop: 6 }}>You chose: {LETTERS[mine]}. {r.options[mine]}</Muted>}
                  <Text style={[type.bodyMedium, { color: colors.success, marginTop: 2 }]}>Answer: {LETTERS[r.correct]}. {r.options[r.correct]}</Text>
                  {!!r.explanation && <Text style={[type.body, { color: colors.textMuted, marginTop: 6 }]}>{r.explanation}</Text>}
                </Card>
              </Reveal>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const q = quiz.questions[idx];
  const answered = picks.filter((p) => p !== null).length;
  const last = idx === quiz.questions.length - 1;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Back onPress={leave} label="← Exit" />
        <Text style={s.h3}>{quiz.title}</Text>
        <Muted>Question {idx + 1} of {quiz.questions.length} · {answered} answered</Muted>
        <View style={{ marginTop: spacing.sm }}><Bar value={(idx + 1) / quiz.questions.length} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
          {quiz.questions.map((_, i) => (
            <PressableScale key={i} onPress={() => setIdx(i)} style={{ width: 34, height: 34, borderRadius: 17, marginRight: 6, alignItems: "center", justifyContent: "center", backgroundColor: i === idx ? colors.teal : picks[i] !== null ? colors.textFaint : colors.border }}>
              <Text style={[type.label, { color: i === idx || picks[i] !== null ? "#fff" : colors.text }]}>{i + 1}</Text>
            </PressableScale>
          ))}
        </ScrollView>

        <Reveal key={idx}>
          <Text style={[type.h2, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.lg }]}>{q.q}</Text>
          {q.options.map((o, i) => {
            const on = picks[idx] === i;
            return (
              <PressableScale key={i} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPicks((p) => p.map((v, k) => (k === idx ? i : v))); }}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: on ? colors.tealTint : colors.card, borderWidth: 1.5, borderColor: on ? colors.teal : colors.border, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.sm }}>
                <Text style={[s.h3, { color: colors.textMuted, width: 22 }]}>{LETTERS[i]}</Text>
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>{o}</Text>
              </PressableScale>
            );
          })}
        </Reveal>

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          {idx > 0 && <View style={{ flex: 1 }}><Btn ghost label="Previous" onPress={() => setIdx(idx - 1)} /></View>}
          <View style={{ flex: 1 }}>
            {last ? <Btn label={busy ? "Submitting…" : `Submit (${answered}/${quiz.questions.length})`} disabled={busy} onPress={submit} /> : <Btn label="Next" onPress={() => setIdx(idx + 1)} />}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
