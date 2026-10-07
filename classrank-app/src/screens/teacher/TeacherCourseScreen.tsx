import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "../../theme/tokens";
import PressableScale from "../../components/animated/PressableScale";
import { Back, Bar, Btn, Card, Chip, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import {
  fetchCourseContent, fetchCourseStats, CourseStats, upsertMaterial, upsertCourseQuestion, postCourseEvent,
  deleteCourseContent, deleteCourse, fetchStaffCourses, removeMaterialFile, removeCourseFiles,
} from "../../lib/courseApi";
import { CourseBundle } from "../../lib/studyCourseSync";
import { generateQuestions, FileInfo } from "../../lib/studyAi";
import { parseQuestionBlocks, ParsedQuestion } from "../../lib/bulkImport";
import TeacherExamsPanel from "./TeacherExamsPanel";
import TeacherFileUpload from "./TeacherFileUpload";
import { fmtSize } from "../../lib/fileRules";

type Tab = "Insights" | "Materials" | "Questions" | "Exams" | "Updates";
const LETTERS = ["A", "B", "C", "D"];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime());

export default function TeacherCourseScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const [tab, setTab] = useState<Tab>("Insights");
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [stats, setStats] = useState<CourseStats | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // forms
  const [mTopic, setMTopic] = useState(""), [mTitle, setMTitle] = useState(""), [mKind, setMKind] = useState<"note" | "link" | "video">("note"), [mBody, setMBody] = useState("");
  const [qTopic, setQTopic] = useState(""), [qText, setQText] = useState(""), [opts, setOpts] = useState(["", "", "", ""]), [right, setRight] = useState(0), [why, setWhy] = useState("");
  const [eKind, setEKind] = useState<"announcement" | "exam">("announcement"), [eTitle, setETitle] = useState(""), [eBody, setEBody] = useState(""), [eDate, setEDate] = useState("");

  // AI drafts are shown for review; nothing reaches students until the teacher publishes it.
  const [drafts, setDrafts] = useState<ParsedQuestion[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [paste, setPaste] = useState("");
  const parsed = useMemo(() => (paste.trim() ? parseQuestionBlocks(paste) : null), [paste]);

  const load = useCallback(async () => {
    try {
      const [b, st, list] = await Promise.all([fetchCourseContent(courseId), fetchCourseStats(courseId), fetchStaffCourses()]);
      setBundle(b); setStats(st); setJoinCode(list.find((c) => c.id === courseId)?.join_code ?? ""); setError(null);
    } catch (e: any) { setError(e?.message ?? "Couldn't load this course."); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, fail: string) => { if (busy) return; setBusy(true); try { await fn(); await load(); } catch (e: any) { Alert.alert(fail, e?.message ?? "Try again."); } finally { setBusy(false); } };
  const confirmDelete = (kind: "material" | "question" | "event", id: string) =>
    Alert.alert("Delete?", kind === "question" ? "Students' copies are removed the next time they open the course." : "This can't be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => act(async () => {
      const filePath = kind === "material" ? bundle?.materials.find((m) => m.id === id && m.kind === "file")?.body : undefined;
      await deleteCourseContent(kind, id);
      if (filePath) await removeMaterialFile(filePath); // after the row is gone; best effort
    }, "Couldn't delete") }]);

  const saveQuestion = () => {
    if (!qText.trim() || opts.some((o) => !o.trim())) return Alert.alert("Incomplete", "Enter the question and all four options.");
    act(async () => { await upsertCourseQuestion({ courseId, topic: qTopic, question: qText, options: opts.map((o) => o.trim()), correctIndex: right, explanation: why }); setQText(""); setOpts(["", "", "", ""]); setWhy(""); setRight(0); }, "Couldn't save question");
  };
  const saveEvent = () => {
    if (eKind === "exam" && !isDate(eDate)) return Alert.alert("Exam date", "Use YYYY-MM-DD, e.g. 2026-12-05.");
    act(async () => { await postCourseEvent({ courseId, kind: eKind, title: eTitle, body: eBody, eventDate: eKind === "exam" ? eDate : null }); setETitle(""); setEBody(""); setEDate(""); }, "Couldn't post");
  };
  const publishAll = async (items: ParsedQuestion[]) => {
    if (busy || !items.length) return 0;
    setBusy(true);
    let ok = 0;
    try {
      for (const it of items) {
        await upsertCourseQuestion({ courseId, topic: it.topic, question: it.question, options: it.options, correctIndex: it.correctIndex, explanation: it.explanation });
        ok++;
      }
    } catch (e: any) {
      Alert.alert("Stopped early", `${ok} of ${items.length} published. ${e?.message ?? "Try again."}`);
    } finally { setBusy(false); await load(); }
    return ok;
  };
  const draftWithAi = async () => {
    if (!bundle || drafting) return;
    setDrafting(true);
    try {
      const topic = qTopic.trim();
      const inTopic = (m: { topic: string }) => !topic || !m.topic || m.topic.toLowerCase() === topic.toLowerCase();
      const notes = bundle.materials.filter((m) => m.kind !== "file").filter(inTopic).map((m) => `${m.title}: ${m.body}`).join("\n");
      // Uploaded files are read by the server (PDF, images, text, Word, PowerPoint, Excel); the 3 newest matching ones are used.
      const files = bundle.materials.filter((m) => m.kind === "file").filter(inTopic).slice(-3).map((m) => m.body);
      let info: FileInfo | null = null;
      const made = await generateQuestions({ subject: `${bundle.course.code} ${bundle.course.title}`, topic: topic || undefined, notes, files, onFiles: (i) => { info = i; }, count: 5 });
      setDrafts(made.map((m) => ({ topic, question: m.q, options: m.options, correctIndex: m.correct, explanation: m.explanation })));
      const skipped = (info as FileInfo | null)?.skipped ?? 0;
      if (skipped > 0) Alert.alert("Some files weren't used", `${skipped} attached file${skipped === 1 ? "" : "s"} couldn't be read (scanned or empty documents, or an unreadable format), so those questions are based on your notes and the other files.`);
    } catch { Alert.alert("Couldn't draft questions", "The AI service is unreachable. Check your connection, or that the study-companion function is deployed."); }
    finally { setDrafting(false); }
  };
  const removeCourse = () => Alert.alert("Delete this course?", "Students lose access to its content. Everything they've already copied into their own study space stays with them.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete course", style: "destructive", onPress: async () => { try { await removeCourseFiles(courseId); await deleteCourse(courseId); navigation.goBack(); } catch (e: any) { Alert.alert("Couldn't delete", e?.message ?? "Try again."); } } },
  ]);

  if (error && !bundle) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Course unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></View></SafeAreaView>;
  if (!bundle || !stats) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><ListSkeleton /></View></SafeAreaView>;

  const input = (v: string, set: (x: string) => void, ph: string, extra: any = {}) => <TextInput style={[s.input, extra]} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={colors.textFaint} />;
  const tone = (p: number) => (p >= 75 ? colors.success : p >= 50 ? colors.ember : colors.danger);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>{bundle.course.code}</Text>
        <Muted>{bundle.course.title}{joinCode ? ` · join code ${joinCode}` : ""}</Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.lg }}>
          <View style={s.row}>{(["Insights", "Materials", "Questions", "Exams", "Updates"] as Tab[]).map((t) => <Chip key={t} label={t} on={tab === t} onPress={() => setTab(t)} />)}</View>
        </ScrollView>

        {tab === "Insights" && (
          <>
            <View style={s.row}>
              {[[`${stats.member_count}`, "students"], [`${stats.active_7d}`, "active this week"], [`${stats.answers_total}`, "answers"], [stats.accuracy == null ? "—" : `${stats.accuracy}%`, "class accuracy"]].map(([v, k]) => (
                <Card key={k} style={{ width: "48%", flexGrow: 1 }}><Text style={s.h2}>{v}</Text><Muted>{k}</Muted></Card>
              ))}
            </View>
            <Label>HARDEST QUESTIONS</Label>
            {stats.hardest.length === 0 && <Muted>Needs at least 3 answers per question. Students' practice results appear here automatically.</Muted>}
            {stats.hardest.map((h) => (
              <Card key={h.question_id}>
                <Text style={type.bodyMedium} numberOfLines={3}>{h.question}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 }}>
                  <Tag label={`${h.pct_correct}% correct`} color={tone(h.pct_correct)} /><Muted>{h.attempts} attempts{h.topic ? ` · ${h.topic}` : ""}</Muted>
                </View>
              </Card>
            ))}
            <Label>TOPICS TO REVISIT IN CLASS</Label>
            {stats.topics.map((t) => (
              <Card key={t.topic}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={s.h3}>{t.topic}</Text><Muted>{t.pct_correct}% · {t.attempts} answers</Muted></View>
                <View style={{ marginTop: 6 }}><Bar value={t.pct_correct / 100} color={tone(t.pct_correct)} /></View>
              </Card>
            ))}
            <Label>STUDENTS (LOWEST ACCURACY FIRST)</Label>
            {stats.students.length === 0 && <Muted>No answers yet.</Muted>}
            {stats.students.slice(0, 20).map((st, i) => (
              <Card key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={type.bodyMedium}>{st.name}</Text><Muted>{st.accuracy}% · {st.answers} answers</Muted></Card>
            ))}
            <Btn ghost danger label="Delete course" onPress={removeCourse} />
          </>
        )}

        {tab === "Materials" && (
          <>
            {bundle.materials.length === 0 && <Muted>Add notes, links or videos. Students get them in their Subject Room.</Muted>}
            {bundle.materials.map((m) => (
              <Card key={m.id} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}><Text style={s.h3}>{m.title}</Text><Muted>{m.kind === "file" ? `📎 ${m.file_name ?? "file"}${m.file_size ? ` · ${fmtSize(m.file_size)}` : ""}` : m.kind}{m.topic ? ` · ${m.topic}` : ""}</Muted></View>
                <PressableScale onPress={() => confirmDelete("material", m.id)}><Text style={s.muted}>Delete</Text></PressableScale>
              </Card>
            ))}
            <Label>ADD MATERIAL</Label>
            <View style={s.row}>{(["note", "link", "video"] as const).map((k) => <Chip key={k} label={k} on={mKind === k} onPress={() => setMKind(k)} />)}</View>
            {input(mTitle, setMTitle, "Title")}
            {input(mTopic, setMTopic, "Topic (optional, e.g. Trees)")}
            {input(mBody, setMBody, mKind === "note" ? "Notes" : "Link", { minHeight: mKind === "note" ? 110 : undefined, textAlignVertical: "top" })}
            <Btn label="Add material" disabled={busy || !mTitle.trim() || !mBody.trim()} onPress={() => act(async () => { await upsertMaterial({ courseId, topic: mTopic, title: mTitle, kind: mKind, body: mBody }); setMTitle(""); setMTopic(""); setMBody(""); }, "Couldn't add")} />
            <Label>ATTACH A FILE</Label>
            <TeacherFileUpload courseId={courseId} topic={mTopic} onAdded={load} />
          </>
        )}

        {tab === "Questions" && (
          <>
            <Muted>{bundle.questions.length} questions. Students practise these in Quick, Topic, Subject and Mock quizzes.</Muted>
            {bundle.questions.map((q) => (
              <Card key={q.id} style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}><Text style={type.bodyMedium} numberOfLines={2}>{q.question}</Text><Muted>{q.topic || "No topic"} · answer {LETTERS[q.correct_index]}</Muted></View>
                <PressableScale onPress={() => confirmDelete("question", q.id)}><Text style={s.muted}>Delete</Text></PressableScale>
              </Card>
            ))}
            <Label>DRAFT WITH AI</Label>
            <Muted>Drafts 5 questions from this course's materials{qTopic.trim() ? ` (topic: ${qTopic.trim()})` : ""}. Check each one is correct before publishing: AI can be wrong.</Muted>
            <Btn ghost label={drafting ? "Drafting…" : "✨ Draft 5 questions"} onPress={draftWithAi} disabled={drafting || bundle.materials.filter((m) => m.kind !== "file").length === 0} />
            {bundle.materials.filter((m) => m.kind !== "file").length === 0 && <Muted>Add some text notes or links first so the questions are based on your content (uploaded files can't be read by the AI yet).</Muted>}
            {drafts.map((d, i) => (
              <Card key={i} style={{ marginTop: spacing.sm }}>
                <Text style={s.h3}>{d.question}</Text>
                {d.options.map((o, k) => <Text key={k} style={[type.body, { color: k === d.correctIndex ? colors.success : colors.text, marginTop: 2 }]}>{LETTERS[k]}. {o}{k === d.correctIndex ? "  ✓" : ""}</Text>)}
                {!!d.explanation && <Muted style={{ marginTop: 6 }}>{d.explanation}</Muted>}
                <View style={[s.row, { marginTop: spacing.sm }]}>
                  <Chip label="Publish" on onPress={async () => { if (await publishAll([d])) setDrafts((x) => x.filter((_, k) => k !== i)); }} />
                  <Chip label="Discard" on={false} onPress={() => setDrafts((x) => x.filter((_, k) => k !== i))} />
                </View>
              </Card>
            ))}
            {drafts.length > 1 && <Btn label={`Publish all ${drafts.length}`} disabled={busy} onPress={async () => { if (await publishAll(drafts)) setDrafts([]); }} />}

            <Label>PASTE MANY QUESTIONS</Label>
            <Muted>One block per question, separated by a blank line: "Q:" text, options A) to D), then "Answer: B". Optional "Why:" and "Topic:" lines.</Muted>
            <TextInput style={[s.input, { minHeight: 140, textAlignVertical: "top" }]} multiline value={paste} onChangeText={setPaste} placeholder={"Q: What is the root of a tree?\nA) The top node\nB) A leaf\nC) An edge\nD) A cycle\nAnswer: A\nWhy: It has no parent."} placeholderTextColor={colors.textFaint} autoCapitalize="none" />
            {parsed && (
              <>
                <Muted style={{ marginTop: 6 }}>{parsed.questions.length} ready to import{parsed.errors.length ? ` · ${parsed.errors.length} with problems (skipped)` : ""}</Muted>
                {parsed.errors.map((e) => <Text key={e.block} style={[type.caption, { color: colors.danger }]}>Question {e.block}: {e.message}</Text>)}
                <Btn label={`Import ${parsed.questions.length} question${parsed.questions.length === 1 ? "" : "s"}`} disabled={busy || parsed.questions.length === 0} onPress={async () => { const n = await publishAll(parsed.questions); if (n === parsed.questions.length) { setPaste(""); Alert.alert("Imported", `${n} questions published.`); } }} />
              </>
            )}

            <Label>ADD QUESTION</Label>
            {input(qTopic, setQTopic, "Topic (e.g. Trees)")}
            {input(qText, setQText, "Question", { minHeight: 70, textAlignVertical: "top" })}
            {opts.map((o, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <PressableScale onPress={() => setRight(i)} style={{ marginTop: spacing.sm, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: right === i ? colors.success : colors.border }}>
                  <Text style={[type.label, { color: right === i ? "#fff" : colors.text }]}>{LETTERS[i]}</Text>
                </PressableScale>
                <TextInput style={[s.input, { flex: 1 }]} value={o} onChangeText={(v) => setOpts(opts.map((x, k) => (k === i ? v : x)))} placeholder={`Option ${LETTERS[i]}`} placeholderTextColor={colors.textFaint} />
              </View>
            ))}
            <Muted style={{ marginTop: 4 }}>Tap a letter to mark the correct answer.</Muted>
            {input(why, setWhy, "Explanation shown after answering")}
            <Btn label="Add question" disabled={busy} onPress={saveQuestion} />
          </>
        )}

        {tab === "Exams" && <TeacherExamsPanel courseId={courseId} questions={bundle.questions} onChanged={load} />}

        {tab === "Updates" && (
          <>
            {bundle.events.length === 0 && <Muted>Post announcements and exam dates. Exam dates feed straight into students' planners.</Muted>}
            {bundle.events.map((e) => (
              <Card key={e.id} style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}><Text style={s.h3}>{e.kind === "exam" ? "📝 " : "📣 "}{e.title}</Text><Muted>{e.event_date ?? ""}{e.body ? ` ${e.body}` : ""}</Muted></View>
                <PressableScale onPress={() => confirmDelete("event", e.id)}><Text style={s.muted}>Delete</Text></PressableScale>
              </Card>
            ))}
            <Label>NEW UPDATE</Label>
            <View style={s.row}>{(["announcement", "exam"] as const).map((k) => <Chip key={k} label={k} on={eKind === k} onPress={() => setEKind(k)} />)}</View>
            {input(eTitle, setETitle, eKind === "exam" ? "Exam title (e.g. Midterm)" : "Announcement title")}
            {input(eBody, setEBody, "Details (optional)")}
            {eKind === "exam" && input(eDate, setEDate, "Exam date YYYY-MM-DD")}
            <Btn label="Post" disabled={busy || !eTitle.trim()} onPress={saveEvent} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
