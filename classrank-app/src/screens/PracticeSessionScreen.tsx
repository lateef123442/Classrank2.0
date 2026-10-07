import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type } from "../theme/tokens";
import PressableScale from "../components/animated/PressableScale";
import * as Haptics from "expo-haptics";
import { reportAttemptToCourses } from "../lib/courseApi";
import AnswerFeedback from "../components/animated/AnswerFeedback";
import Reveal from "../components/animated/Reveal";
import StaggerIn from "../components/animated/StaggerIn";
import PulseRing from "../components/animated/PulseRing";
import AnimatedNumber from "../components/animated/AnimatedNumber";
import ConfettiBurst from "../components/animated/ConfettiBurst";
import AchievementToast from "../components/animated/AchievementToast";
import { Back, Bar, Btn, Card, Label, Muted, s } from "../components/study/ui";
import { useStudy, getStudyData, achievements, buildQuiz, recordAttempt, addCards, analyzeAttempt, topicName, dateStr, QuizMode, QuizAttempt, Question, AnswerRecord } from "../lib/studyStore";

const TITLES: Record<QuizMode, string> = { quick: "Quick Quiz", topic: "Topic Quiz", subject: "Subject Quiz", mock: "Mock Exam", daily: "Daily Challenge", review: "Spaced Review" };
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const LETTERS = ["A", "B", "C", "D"];

export default function PracticeSessionScreen({ navigation, route }: any) {
  const { mode, subjectId, topicId } = route.params as { mode: QuizMode; subjectId?: string; topicId?: string };
  const { data } = useStudy();
  const [quiz] = useState(() => buildQuiz(data, mode, subjectId, topicId)); // frozen at start, like the ranked quiz
  const qs = quiz.questions;
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => qs.map(() => null));
  const picksRef = useRef(picks); picksRef.current = picks;
  const [left, setLeft] = useState(quiz.timeLimit ?? 0);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const started = useRef(Date.now());
  const isMock = mode === "mock";
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const answers: AnswerRecord[] = qs.map((q, i) => ({ qid: q.id, subjectId: q.subjectId, topicId: q.topicId, picked: picksRef.current[i], correct: picksRef.current[i] === q.correct }));
    const subj = subjectId ?? (new Set(qs.map((q) => q.subjectId)).size === 1 ? qs[0].subjectId : undefined);
    const earnedBefore = new Set(achievements(getStudyData()).filter((a) => a.earned).map((a) => a.id));
    const saved = recordAttempt({ mode, subjectId: subj, topicId, date: dateStr(), seconds: Math.round((Date.now() - started.current) / 1000), total: qs.length, correct: answers.filter((a) => a.correct).length, answers });
    setUnlocked(achievements(getStudyData()).filter((a) => a.earned && !earnedBefore.has(a.id)).map((a) => a.title));
    setResult(saved);
    reportAttemptToCourses(saved); // no-op unless some questions came from a teacher's course
  };

  useEffect(() => {
    if (!isMock || result) return;
    const id = setInterval(() => setLeft((l) => { if (l <= 1) { clearInterval(id); setTimeout(finish, 0); return 0; } return l - 1; }), 1000);
    return () => clearInterval(id);
  }, [result]);

  const confirmExit = () =>
    Alert.alert("Leave quiz?", "Your answers so far won't be saved.", [{ text: "Keep going", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => navigation.goBack() }]);
  useEffect(() => {
    if (result || !qs.length) return;
    const b = BackHandler.addEventListener("hardwareBackPress", () => { confirmExit(); return true; });
    return () => b.remove();
  }, [result]);

  if (!qs.length) {
    return (
      <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}>
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>No questions yet</Text>
        <Muted style={{ marginTop: 8 }}>Add questions to this subject (or generate them) and try again.</Muted>
      </View></SafeAreaView>
    );
  }

  if (result) return <Results result={result} qs={qs} picks={picks} navigation={navigation} unlocked={unlocked} />;

  const q = qs[idx], picked = picks[idx];
  const revealed = !isMock && picked !== null;
  const pick = (i: number) => {
    if (revealed) return;
    setPicks((p) => p.map((v, k) => (k === idx ? i : v)));
    // Practice modes give instant right/wrong feedback; mock exams stay neutral until the end.
    (isMock ? Haptics.selectionAsync() : Haptics.notificationAsync(i === q.correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error)).catch(() => {});
  };
  const answered = picks.filter((p) => p !== null).length;
  const last = idx === qs.length - 1;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Back onPress={confirmExit} label="← Exit" />
          <Text style={[s.h3, isMock && left < 60 && { color: colors.danger }]}>{isMock ? `⏱ ${fmt(left)}` : TITLES[mode]}</Text>
        </View>
        <Muted>Question {idx + 1} of {qs.length}{q.topicId ? ` · ${topicName(data, q.topicId)}` : ""}</Muted>
        <View style={{ marginTop: spacing.sm }}><Bar value={(idx + 1) / qs.length} /></View>

        {isMock && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
            {qs.map((_, i) => (
              <PressableScale key={i} onPress={() => setIdx(i)} style={[st.dot, picks[i] !== null && st.dotDone, i === idx && st.dotNow]}>
                <Text style={[type.label, { color: picks[i] !== null || i === idx ? "#fff" : colors.text }]}>{i + 1}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        )}

        <Reveal key={idx}>
        <Text style={[type.h2, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.lg }]}>{q.q}</Text>
        {q.options.map((o, i) => {
          const isPick = picked === i, isRight = i === q.correct;
          const tone = revealed ? (isRight ? st.right : isPick ? st.wrong : null) : isPick ? st.chosen : null;
          return (
            <AnswerFeedback key={i} status={revealed ? (isRight ? "right" : isPick ? "wrong" : "idle") : "idle"}>
            <PressableScale onPress={() => pick(i)} style={[st.opt, tone]}>
              <Text style={[st.letter, tone && { color: colors.text }]}>{LETTERS[i]}</Text>
              <Text style={[type.body, { color: colors.text, flex: 1 }]}>{o}</Text>
              {revealed && isRight && <Text>✅</Text>}{revealed && isPick && !isRight && <Text>❌</Text>}
            </PressableScale>
            </AnswerFeedback>
          );
        })}
        </Reveal>

        {revealed && (
          <Reveal key={`why-${idx}`}>
          <Card style={{ backgroundColor: picked === q.correct ? colors.successTint : colors.dangerTint, borderWidth: 0, marginTop: spacing.md }}>
            <Text style={s.h3}>{picked === q.correct ? "Correct" : "Not quite"}</Text>
            <Text style={[type.body, { color: colors.text, marginTop: 4 }]}>{q.explanation || `The correct answer is ${LETTERS[q.correct]}.`}</Text>
          </Card>
          </Reveal>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          {isMock && idx > 0 && <View style={{ flex: 1 }}><Btn ghost label="Previous" onPress={() => setIdx(idx - 1)} /></View>}
          <View style={{ flex: 1 }}>
            {isMock ? (
              last ? <Btn label={`Submit (${answered}/${qs.length})`} onPress={() => Alert.alert("Submit exam?", answered < qs.length ? `${qs.length - answered} unanswered will count as wrong.` : "All answered.", [{ text: "Review", style: "cancel" }, { text: "Submit", onPress: finish }])} />
                   : <Btn label="Next" onPress={() => setIdx(idx + 1)} />
            ) : (
              <Btn label={last ? "See results" : "Next"} disabled={!revealed} onPress={() => (last ? finish() : setIdx(idx + 1))} />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Results({ result, qs, picks, navigation, unlocked }: { result: QuizAttempt; qs: Question[]; picks: (number | null)[]; navigation: any; unlocked: string[] }) {
  const { data } = useStudy();
  const a = analyzeAttempt(data, result);
  const wrong = qs.map((q, i) => ({ q, i })).filter(({ q, i }) => picks[i] !== q.correct);
  const tone = a.score >= 80 ? colors.success : a.score >= 60 ? colors.ember : colors.danger;
  const go = () => {
    const n = a.next;
    if (n.target === "Subject") navigation.navigate("Subject", n.params);
    else navigation.navigate("Main", { screen: "Practice" });
  };
  const [saved, setSaved] = useState(false);
  const saveCards = () => {
    const n = addCards(wrong.map(({ q }) => ({ subjectId: q.subjectId, topicId: q.topicId, front: q.q, back: `${q.options[q.correct]}${q.explanation ? ` — ${q.explanation}` : ""}` })));
    setSaved(true);
    Alert.alert(n ? "Saved to flashcards" : "Already saved", n ? `${n} card${n > 1 ? "s" : ""} added. They're due now, and will space out as you rate them.` : "Those are already in your flashcards.");
  };
  // The score "earns" itself: ring fills and the number counts up shortly after the screen appears.
  const [shownScore, setShownScore] = useState(0);
  const [fire, setFire] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setShownScore(a.score), 250);
    const t2 = setTimeout(() => setFire(a.score >= 80), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const ask = (q: Question) => navigation.navigate("Companion", { prompt: `I got this wrong: "${q.q}" (options: ${q.options.join(" / ")}). I don't want the answer yet — give me a hint and ask me a guiding question.` });

  return (
    <SafeAreaView style={s.safe}>
      <AchievementToast titles={unlocked} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <View style={{ alignItems: "center", marginVertical: spacing.lg }}>
          <PulseRing size={160} strokeWidth={12} progress={shownScore / 100} color={tone} trackColor={colors.border} pulse={false}>
            <AnimatedNumber value={shownScore} suffix="%" duration={900} style={[type.hero, { color: tone }]} />
          </PulseRing>
          <ConfettiBurst active={fire} />
          <Text style={[s.h3, { marginTop: spacing.md }]}>{result.correct} of {result.total} correct · {fmt(result.seconds)}</Text>
          <Muted>+{result.correct * 10 + 20} XP{a.skipped ? ` · ${a.skipped} unanswered` : ""}</Muted>
        </View>

        {a.wentWell.length > 0 && <StaggerIn index={2}><Insight title="👍 What went well" lines={a.wentWell} /></StaggerIn>}
        {a.struggled.length > 0 && <StaggerIn index={3}><Insight title="⚠️ Where you struggled" lines={a.struggled} /></StaggerIn>}
        {a.revise.length > 0 && <StaggerIn index={4}><Insight title="🔁 Revise next" lines={a.revise.map((r) => r.name)} note="These will come back for review soon." /></StaggerIn>}

        <StaggerIn index={5}>
          <Card style={{ backgroundColor: colors.tealTint, borderWidth: 0 }}>
            <Text style={s.h3}>Recommended next</Text>
            <Text style={[type.body, { color: colors.text, marginTop: 4 }]}>{a.next.text}</Text>
            <Btn label={a.next.cta} onPress={go} />
          </Card>
        </StaggerIn>

        {wrong.length > 0 && (
          <>
            <Label>REVIEW WHAT YOU MISSED</Label>
            <Btn ghost disabled={saved} label={saved ? "Saved to flashcards ✓" : `🃏 Save ${wrong.length} missed as flashcards`} onPress={saveCards} />
            {wrong.map(({ q, i }) => (
              <Card key={q.id}>
                <Text style={s.h3}>{q.q}</Text>
                <Muted style={{ marginTop: 6 }}>{picks[i] === null ? "You didn't answer." : `You chose: ${q.options[picks[i]!]}`}</Muted>
                <Text style={[type.bodyMedium, { color: colors.success, marginTop: 2 }]}>Answer: {q.options[q.correct]}</Text>
                {!!q.explanation && <Text style={[type.body, { color: colors.textMuted, marginTop: 6 }]}>{q.explanation}</Text>}
                <PressableScale onPress={() => ask(q)}><Text style={[type.bodyMedium, { color: colors.tealDeep, marginTop: spacing.sm }]}>Get a hint from the tutor →</Text></PressableScale>
              </Card>
            ))}
          </>
        )}
        <Btn ghost label="Done" onPress={() => navigation.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Insight = ({ title, lines, note }: { title: string; lines: string[]; note?: string }) => (
  <Card>
    <Text style={s.h3}>{title}</Text>
    {lines.map((l) => <Text key={l} style={[type.body, { color: colors.text, marginTop: 4 }]}>• {l}</Text>)}
    {note && <Muted style={{ marginTop: 6 }}>{note}</Muted>}
  </Card>
);

const st = StyleSheet.create({
  opt: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm },
  letter: { ...type.h3, color: colors.textMuted, width: 22 },
  chosen: { borderColor: colors.teal, backgroundColor: colors.tealTint },
  right: { borderColor: colors.success, backgroundColor: colors.successTint },
  wrong: { borderColor: colors.danger, backgroundColor: colors.dangerTint },
  dot: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 6 },
  dotDone: { backgroundColor: colors.textFaint },
  dotNow: { backgroundColor: colors.teal },
});
