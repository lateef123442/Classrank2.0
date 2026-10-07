import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "../theme/tokens";
import PressableScale from "../components/animated/PressableScale";
import { Back, Btn, Card, Chip, Label, Muted, Tag, s, STRENGTH_COLOR } from "../components/study/ui";
import {
  useStudy, subjectStats, topicStats, daysUntil, addTopic, removeTopic, markTopicLearned, addNote, removeNote,
  addQuestions, removeQuestion, setSubjectExam, dueCards,
} from "../lib/studyStore";
import { generateQuestions, FileInfo } from "../lib/studyAi";
import { courseFilePaths } from "../lib/studyCourseSync";
import { Loader } from "../components/animated/Loader";

type Tab = "Overview" | "Topics" | "Notes" | "Questions";
const LETTERS = ["A", "B", "C", "D"];

export default function SubjectRoomScreen({ navigation, route }: any) {
  const { subjectId } = route.params as { subjectId: string };
  const { data } = useStudy();
  const sub = data.subjects.find((x) => x.id === subjectId);
  const [tab, setTab] = useState<Tab>("Overview");
  const [topicName, setTopicName] = useState("");
  const [nTitle, setNTitle] = useState(""), [nBody, setNBody] = useState("");
  const [qText, setQText] = useState(""), [opts, setOpts] = useState(["", "", "", ""]), [right, setRight] = useState(0), [why, setWhy] = useState("");
  const [qTopic, setQTopic] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [exam, setExam] = useState(sub?.examDate ?? "");

  if (!sub) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Subject not found</Text></View></SafeAreaView>;

  const stat = subjectStats(data).find((x) => x.id === subjectId)!;
  const topics = topicStats(data).filter((t) => t.subjectId === subjectId);
  const notes = data.notes.filter((n) => n.subjectId === subjectId);
  const questions = data.questions.filter((q) => q.subjectId === subjectId);
  const dueN = dueCards(data).filter((c) => c.subjectId === subjectId).length;
  const practice = (mode: string, topicId?: string) => navigation.navigate("PracticeSession", { mode, subjectId, topicId });
  const tName = (id?: string) => data.topics.find((t) => t.id === id)?.name;

  const saveQuestion = () => {
    if (!qText.trim() || opts.some((o) => !o.trim())) return Alert.alert("Incomplete", "Enter the question and all four options.");
    addQuestions([{ subjectId, topicId: qTopic, q: qText.trim(), options: opts.map((o) => o.trim()), correct: right, explanation: why.trim(), source: "manual" }]);
    setQText(""); setOpts(["", "", "", ""]); setWhy(""); setRight(0);
  };

  const generate = async () => {
    setBusy(true);
    try {
      const topicNotes = notes.filter((n) => !n.title.startsWith("📎")).filter((n) => !qTopic || n.topicId === qTopic || !n.topicId).map((n) => `${n.title}: ${n.body}`).join("\n");
      let info: FileInfo | null = null;
      const made = await generateQuestions({ subject: sub.name, topic: tName(qTopic), notes: topicNotes, files: courseFilePaths(data, subjectId, qTopic || undefined), onFiles: (i) => { info = i; }, count: 5 });
      addQuestions(made.map((m) => ({ ...m, subjectId, topicId: qTopic })));
      const k = (info as FileInfo | null)?.skipped ?? 0;
      Alert.alert("Added", `${made.length} questions added. Skim them for accuracy before relying on them.${k > 0 ? ` ${k} course file${k === 1 ? "" : "s"} couldn't be read, so those questions use your notes and the other files.` : ""}`);
    } catch {
      Alert.alert("Couldn't generate", "The AI tutor is unreachable. Check your connection, or that the study-companion function is deployed. You can still add questions by hand.");
    } finally { setBusy(false); }
  };

  const saveExam = () => {
    if (exam && (!/^\d{4}-\d{2}-\d{2}$/.test(exam) || isNaN(new Date(exam).getTime()))) return Alert.alert("Exam date", "Use YYYY-MM-DD, e.g. 2026-12-05.");
    setSubjectExam(subjectId, exam);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>{sub.name}</Text>
        <Muted>{stat.label}{stat.accuracy !== null ? ` · ${stat.accuracy}% accuracy` : ""}{sub.examDate && daysUntil(sub.examDate) >= 0 ? ` · exam in ${daysUntil(sub.examDate)} days` : ""}</Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.lg }}>
          <View style={s.row}>{(["Overview", "Topics", "Notes", "Questions"] as Tab[]).map((t) => <Chip key={t} label={t} on={tab === t} onPress={() => setTab(t)} />)}</View>
        </ScrollView>

        {tab === "Overview" && (
          <>
            <View style={s.row}>
              {[[`${stat.minutes}m`, "studied"], [`${stat.questions}`, "questions"], [`${stat.quizAnswers}`, "answered"], [`${dueN}`, "cards due"]].map(([v, k]) => (
                <Card key={k} style={{ width: "48%", flexGrow: 1 }}><Text style={s.h2}>{v}</Text><Muted>{k}</Muted></Card>
              ))}
            </View>
            <Label>LEARN → PRACTICE</Label>
            <Btn label="⚡ Quick quiz" onPress={() => practice("quick")} disabled={!questions.length} />
            <Btn ghost label="📚 Subject quiz" onPress={() => practice("subject")} disabled={!questions.length} />
            <Btn ghost label="⏱ Mock exam" onPress={() => practice("mock")} disabled={!questions.length} />
            <Btn ghost label="⏱ Start a focus session" onPress={() => navigation.navigate("Main", { screen: "Study", params: { subject: sub.name } })} />
            <Btn ghost label="🃏 Flashcards" onPress={() => navigation.navigate("Cards")} />
            <Btn ghost label="🤖 Ask the tutor about this subject" onPress={() => navigation.navigate("Companion", { prompt: `Help me study ${sub.name}. Ask me what I already know first.` })} />
            {!questions.length && <Muted style={{ marginTop: spacing.sm }}>Add questions in the Questions tab to unlock quizzes.</Muted>}
            <Label>EXAM DATE</Label>
            <TextInput style={s.input} value={exam} onChangeText={setExam} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} keyboardType="numbers-and-punctuation" />
            <Btn ghost label="Save exam date" onPress={saveExam} />
          </>
        )}

        {tab === "Topics" && (
          <>
            {topics.length === 0 && <Muted>Break the subject into topics (e.g. Genetics, Cell Structure). Quizzes then show exactly which ones need work.</Muted>}
            {topics.map((t) => {
              const full = data.topics.find((x) => x.id === t.id)!;
              return (
                <Card key={t.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.h3}>{t.name}</Text><Tag label={t.label} color={STRENGTH_COLOR[t.label]} />
                  </View>
                  <Muted style={{ marginTop: 2 }}>{t.accuracy !== null ? `${t.accuracy}% over ${t.answered} answers` : `${t.answered} answers so far`}{full.nextReview ? ` · review ${t.due ? "due" : "on " + full.nextReview}` : ""}</Muted>
                  <View style={[s.row, { marginTop: spacing.sm }]}>
                    <Chip label="Mark learned" on={false} onPress={() => { markTopicLearned(t.id); Alert.alert("Nice", "I'll bring this back for review tomorrow, then at longer gaps."); }} />
                    <Chip label="Quiz" on={false} onPress={() => (data.questions.some((q) => q.topicId === t.id) ? practice("topic", t.id) : Alert.alert("No questions", "Add questions for this topic first."))} />
                    <Chip label="Delete" on={false} onPress={() => Alert.alert("Delete topic?", "Its questions stay in the subject.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => removeTopic(t.id) }])} />
                  </View>
                </Card>
              );
            })}
            <TextInput style={s.input} value={topicName} onChangeText={setTopicName} placeholder="New topic (e.g. Genetics)" placeholderTextColor={colors.textFaint} />
            <Btn label="Add topic" onPress={() => { addTopic(subjectId, topicName); setTopicName(""); }} disabled={!topicName.trim()} />
          </>
        )}

        {tab === "Notes" && (
          <>
            <Muted>Notes and study materials. Paste text, summaries, or links to videos and slides. The AI uses your notes (and your course's uploaded files) when generating questions.</Muted>
            {notes.map((n) => (
              <Card key={n.id} style={{ marginTop: spacing.sm }}>
                <Text style={s.h3}>{n.title}</Text>
                <Muted>{n.date}{tName(n.topicId) ? ` · ${tName(n.topicId)}` : ""}</Muted>
                <Text style={[type.body, { color: colors.text, marginTop: 6 }]} numberOfLines={8}>{n.body}</Text>
                <View style={[s.row, { marginTop: spacing.sm }]}>
                  <Chip label="Study this note" on={false} onPress={() => navigation.navigate("Main", { screen: "Study", params: { subject: sub.name, notes: n.body } })} />
                  <Chip label="Delete" on={false} onPress={() => removeNote(n.id)} />
                </View>
              </Card>
            ))}
            <TextInput style={s.input} value={nTitle} onChangeText={setNTitle} placeholder="Title" placeholderTextColor={colors.textFaint} />
            <TextInput style={[s.input, { minHeight: 110, textAlignVertical: "top" }]} multiline value={nBody} onChangeText={setNBody} placeholder="Paste or type notes, or a link…" placeholderTextColor={colors.textFaint} />
            <Btn label="Save note" disabled={!nBody.trim()} onPress={() => { addNote(subjectId, nTitle, nBody, qTopic); setNTitle(""); setNBody(""); }} />
          </>
        )}

        {tab === "Questions" && (
          <>
            {topics.length > 0 && (
              <>
                <Label>TOPIC FOR NEW QUESTIONS</Label>
                <View style={s.row}>
                  <Chip label="None" on={!qTopic} onPress={() => setQTopic(undefined)} />
                  {topics.map((t) => <Chip key={t.id} label={t.name} on={qTopic === t.id} onPress={() => setQTopic(t.id)} />)}
                </View>
              </>
            )}
            <Label>GENERATE WITH AI</Label>
            <Btn ghost label={busy ? "Generating…" : "✨ Generate 5 questions"} onPress={generate} disabled={busy} />
            {busy && <View style={{ marginTop: spacing.sm }}><Loader label="Writing your questions…" /></View>}

            <Label>ADD YOUR OWN</Label>
            <TextInput style={s.input} value={qText} onChangeText={setQText} placeholder="Question" placeholderTextColor={colors.textFaint} multiline />
            {opts.map((o, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <PressableScale onPress={() => setRight(i)} style={{ marginTop: spacing.sm, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: right === i ? colors.success : colors.border }}>
                  <Text style={[type.label, { color: right === i ? "#fff" : colors.text }]}>{LETTERS[i]}</Text>
                </PressableScale>
                <TextInput style={[s.input, { flex: 1 }]} value={o} onChangeText={(v) => setOpts(opts.map((x, k) => (k === i ? v : x)))} placeholder={`Option ${LETTERS[i]}`} placeholderTextColor={colors.textFaint} />
              </View>
            ))}
            <Muted style={{ marginTop: 4 }}>Tap a letter to mark the correct answer.</Muted>
            <TextInput style={s.input} value={why} onChangeText={setWhy} placeholder="Explanation (shown after answering)" placeholderTextColor={colors.textFaint} multiline />
            <Btn label="Save question" onPress={saveQuestion} />

            <Label>{questions.length} IN THIS SUBJECT</Label>
            {questions.map((q) => (
              <Card key={q.id} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyMedium} numberOfLines={2}>{q.q}</Text>
                  <Muted>{tName(q.topicId) ?? "No topic"}{q.source === "ai" ? " · AI" : ""}</Muted>
                </View>
                <PressableScale onPress={() => removeQuestion(q.id)}><Text style={s.muted}>Remove</Text></PressableScale>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
