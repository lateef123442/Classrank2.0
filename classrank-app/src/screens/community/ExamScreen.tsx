import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Alert, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Back, Btn, Card, Label, ListSkeleton, Muted, Tag, s } from "../../components/study/ui";
import { startExam, submitExam, reviewExam, examSecondsLeft, ExamSession, ExamReviewItem } from "../../lib/courseApi";
import { fmtClock } from "../../lib/examTime";

const LETTERS = ["A", "B", "C", "D"];

/**
 * Take a teacher-scheduled exam, or (mode "review") see the answers once the exam window has closed.
 * The clock shown here is only a display: the server holds the real deadline, grades the answers,
 * and rejects a late submission, so the phone's own clock can't buy extra time.
 */
export default function ExamScreen({ navigation, route }: any) {
  const { examId, mode = "take" } = route.params as { examId: string; mode?: "take" | "review" };
  const [session, setSession] = useState<ExamSession | null>(null);
  const receivedAt = useRef(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [review, setReview] = useState<ExamReviewItem[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const answersRef = useRef<(number | null)[]>([]);
  answersRef.current = answers;

  useEffect(() => {
    (async () => {
      try {
        if (mode === "review") { setReview(await reviewExam(examId)); return; }
        const sess = await startExam(examId);
        receivedAt.current = Date.now();
        setSession(sess);
        setAnswers(sess.questions.map(() => null));
        setLeft(examSecondsLeft(sess, receivedAt.current));
      } catch (e: any) { setError(e?.message ?? "Couldn't open this exam."); }
    })();
  }, [examId, mode]);

  const finish = useCallback(async (auto: boolean) => {
    if (submitted.current || !session) return;
    submitted.current = true; setSubmitting(true);
    try { setResult(await submitExam(examId, answersRef.current)); }
    catch (e: any) {
      // Keep the exam on screen so the student can retry: swapping in the full-page error would throw away their answers.
      submitted.current = false;
      Alert.alert(auto ? "Time is up" : "Couldn't submit", (e?.message ?? "Check your connection") + (auto ? ". Tap Submit to try again." : ". Your answers are still here, so tap Submit to try again."));
    }
    finally { setSubmitting(false); }
  }, [session, examId]);

  // countdown + auto-submit at zero
  useEffect(() => {
    if (!session || result) return;
    const t = setInterval(() => {
      const l = examSecondsLeft(session, receivedAt.current);
      setLeft(l);
      if (l <= 0) { clearInterval(t); finish(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [session, result, finish]);

  const inProgress = !!session && !result && !error;
  const warnLeave = useCallback(() => {
    Alert.alert("Leave the exam?", "The clock keeps running and you can't restart. Your answers so far are NOT submitted unless you tap Submit.", [
      { text: "Keep going", style: "cancel" },
      { text: "Leave anyway", style: "destructive", onPress: () => navigation.goBack() },
    ]);
  }, [navigation]);
  useEffect(() => {
    if (!inProgress) return;
    const b = BackHandler.addEventListener("hardwareBackPress", () => { warnLeave(); return true; });
    return () => b.remove();
  }, [inProgress, warnLeave]);

  const back = () => (inProgress ? warnLeave() : navigation.goBack());

  if (error) return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Exam unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></ScrollView></SafeAreaView>;

  // ── review ──
  if (mode === "review") {
    if (!review) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><ListSkeleton /></View></SafeAreaView>;
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
          <Back onPress={() => navigation.goBack()} />
          <Text style={s.h1}>Exam review</Text>
          {review.map((r, i) => (
            <Card key={i}>
              <Text style={s.h3}>{i + 1}. {r.q}</Text>
              {r.options.map((o, k) => {
                const right = k === r.correct, mine = k === r.picked;
                return <Text key={k} style={[type.body, { marginTop: 6, color: right ? colors.success : mine ? colors.danger : colors.text }]}>{LETTERS[k]}) {o}{right ? "  ✓" : mine ? "  (your answer)" : ""}</Text>;
              })}
              {r.picked == null && <Muted style={{ marginTop: 6 }}>You skipped this one.</Muted>}
              {!!r.explanation && <Muted style={{ marginTop: 6 }}>{r.explanation}</Muted>}
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!session) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><ListSkeleton /></View></SafeAreaView>;

  // ── submitted ──
  if (result) {
    const pct = Math.round((100 * result.correct) / result.total);
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
          <Text style={s.h1}>Submitted ✅</Text>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[s.h1, { color: pct >= 50 ? colors.success : colors.danger }]}>{result.correct} / {result.total}</Text>
            <Muted>{pct}% · your teacher can see this result.</Muted>
          </Card>
          <Muted style={{ marginTop: spacing.md }}>Answers and explanations unlock after the exam window closes for everyone — check the course page then.</Muted>
          <Btn label="Done" onPress={() => navigation.goBack()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── taking ──
  const q = session.questions[idx];
  const answered = answers.filter((a) => a != null).length;
  const last = idx === session.questions.length - 1;
  const urgent = left <= 60;
  const confirmSubmit = () => {
    const blank = answers.length - answered;
    Alert.alert("Submit exam?", blank ? `${blank} question${blank > 1 ? "s are" : " is"} unanswered. You can't change answers after submitting.` : "You can't change answers after submitting.", [
      { text: "Not yet", style: "cancel" },
      { text: "Submit", onPress: () => finish(false) },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Back onPress={back} label="← Leave" />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.h3} numberOfLines={1}>{session.title}</Text>
          <Tag label={`⏱ ${fmtClock(left)}`} color={urgent ? colors.danger : colors.violet} />
        </View>
        <Muted style={{ marginTop: 4 }}>Question {idx + 1} of {session.questions.length} · {answered} answered</Muted>

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={s.h3}>{q.q}</Text>
          {q.options.map((o, k) => {
            const on = answers[idx] === k;
            return (
              <PressableScale key={k} onPress={() => setAnswers(answers.map((a, i) => (i === idx ? (on ? null : k) : a)))}>
                <View style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.teal : colors.border, backgroundColor: on ? colors.tealTint : colors.card }}>
                  <Text style={type.body}>{LETTERS[k]}) {o}</Text>
                </View>
              </PressableScale>
            );
          })}
        </Card>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Btn ghost label="Previous" disabled={idx === 0} onPress={() => setIdx(idx - 1)} /></View>
          <View style={{ flex: 1 }}>{last
            ? <Btn label={submitting ? "Submitting…" : "Submit"} disabled={submitting} onPress={confirmSubmit} />
            : <Btn label="Next" onPress={() => setIdx(idx + 1)} />}</View>
        </View>
        {!last && <Btn ghost label="Submit now" disabled={submitting} onPress={confirmSubmit} />}
        <Label>JUMP TO</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {answers.map((a, i) => (
            <PressableScale key={i} onPress={() => setIdx(i)}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: i === idx ? colors.teal : colors.border, backgroundColor: a != null ? colors.tealTint : colors.card }}>
                <Text style={type.bodyMedium}>{i + 1}</Text>
              </View>
            </PressableScale>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
