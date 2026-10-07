import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "../../theme/tokens";
import { Back, Btn, Card, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import { fetchCourseContent, leaveCourse, fetchCourseExams, ExamSummary, materialFileUrl } from "../../lib/courseApi";
import { fmtSize } from "../../lib/fileRules";
import { fmtWhen } from "../../lib/examTime";
import { CourseBundle } from "../../lib/studyCourseSync";
import { useStudy, importCourseBundle, detachCourse, daysUntil } from "../../lib/studyStore";

export default function CourseDetailScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const { data } = useStudy();
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timed, setTimed] = useState<ExamSummary[]>([]);
  const local = data.subjects.find((x) => x.courseId === courseId);

  const load = useCallback(async () => {
    try {
      const b = await fetchCourseContent(courseId);
      setBundle(b);
      if (data.subjects.some((x) => x.courseId === courseId)) importCourseBundle(b); // keep my copy current
    } catch (e: any) { setError(e?.message ?? "Couldn't load this course."); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);
  // re-fetch when returning from an exam so status/score are current; older databases without migration 021 just show no exams
  useEffect(() => navigation.addListener("focus", () => { fetchCourseExams(courseId).then(setTimed).catch(() => setTimed([])); }), [navigation, courseId]);

  const openFile = async (path: string) => {
    try { await Linking.openURL(await materialFileUrl(path)); }
    catch (e: any) { Alert.alert("Couldn't open the file", e?.message ?? "Check your connection and try again."); }
  };
  const sync = () => {
    if (!bundle) return;
    const r = importCourseBundle(bundle);
    navigation.navigate("Subject", { subjectId: r.subjectId });
  };
  const leave = () =>
    Alert.alert("Leave this course?", "You'll keep what you've already studied, but stop receiving updates, and your answers are no longer shared with the teacher.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => {
        try { await leaveCourse(courseId); detachCourse(courseId); navigation.goBack(); }
        catch (e: any) { Alert.alert("Couldn't leave", e?.message ?? "Try again."); }
      } },
    ]);

  if (error) return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Course unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></ScrollView></SafeAreaView>;
  if (!bundle) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><ListSkeleton /></View></SafeAreaView>;

  const exams = bundle.events.filter((e) => e.kind === "exam" && e.event_date).sort((a, b) => a.event_date!.localeCompare(b.event_date!));
  const files = bundle.materials.filter((m) => m.kind === "file");
  const news = bundle.events.filter((e) => e.kind === "announcement");

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>{bundle.course.code}</Text>
        <Muted>{bundle.course.title}</Muted>

        <Card style={{ marginTop: spacing.lg, backgroundColor: colors.tealTint, borderWidth: 0 }}>
          <Text style={s.h3}>{local ? "In your study space ✅" : "Add to your study space"}</Text>
          <Muted>{bundle.questions.length} practice questions · {bundle.materials.length} study materials{exams.length ? " · exam dates added to your planner" : ""}</Muted>
          <Btn label={local ? "Open subject room" : "Add to my study space"} onPress={sync} />
        </Card>

        {exams.length > 0 && (<><Label>EXAMS</Label>{exams.map((e) => {
          const d = daysUntil(e.event_date!);
          return (<Card key={e.id}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={s.h3}>{e.title}</Text><Tag label={d < 0 ? "Past" : d === 0 ? "Today" : `${d} days`} color={d >= 0 && d <= 7 ? colors.danger : colors.violet} /></View><Muted>{e.event_date}{e.body ? ` · ${e.body}` : ""}</Muted></Card>);
        })}</>)}

        {files.length > 0 && (<><Label>FILES</Label>{files.map((m) => (
          <Card key={m.id}>
            <Text style={s.h3}>📎 {m.title}</Text>
            <Muted>{m.file_name ?? "file"}{m.file_size ? ` · ${fmtSize(m.file_size)}` : ""}{m.topic ? ` · ${m.topic}` : ""}</Muted>
            <Btn ghost label="Open" onPress={() => openFile(m.body)} />
          </Card>
        ))}</>)}

        {timed.length > 0 && (<><Label>TIMED EXAMS</Label>{timed.map((x) => {
          const a = x.my_attempt;
          const done = !!a?.submitted;
          const label = done ? "Submitted" : x.status === "open" ? (a ? "Resume" : "Start") : x.status === "upcoming" ? "Upcoming" : "Closed";
          const tone = done ? colors.success : x.status === "open" ? colors.danger : colors.violet;
          return (
            <Card key={x.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={s.h3}>{x.title}</Text><Tag label={label} color={tone} /></View>
              <Muted>{x.question_count} questions · {x.duration_minutes} min · one attempt</Muted>
              <Muted>Opens {fmtWhen(x.starts_at)} · closes {fmtWhen(x.ends_at)}</Muted>
              {done && a?.total ? <Muted>Your score: {a.correct}/{a.total}</Muted> : null}
              {x.status === "open" && !done && <Btn label={a ? "Resume exam" : "Start exam"} onPress={() => Alert.alert(a ? "Resume exam?" : "Start exam?", a ? "Your clock is already running." : `You'll have ${x.duration_minutes} minutes and one attempt. The clock starts now.`, [{ text: "Not now", style: "cancel" }, { text: a ? "Resume" : "Start", onPress: () => navigation.navigate("Exam", { examId: x.id }) }])} />}
              {x.status === "closed" && <Btn ghost label="Review answers" onPress={() => navigation.navigate("Exam", { examId: x.id, mode: "review" })} />}
            </Card>
          );
        })}</>)}

        <Label>ANNOUNCEMENTS</Label>
        {news.length === 0 && <Muted>Nothing yet.</Muted>}
        {news.map((n) => <Card key={n.id}><Text style={s.h3}>{n.title}</Text>{!!n.body && <Text style={[type.body, { color: colors.text, marginTop: 4 }]}>{n.body}</Text>}</Card>)}

        <Btn ghost label="Leave course" onPress={leave} />
      </ScrollView>
    </SafeAreaView>
  );
}
