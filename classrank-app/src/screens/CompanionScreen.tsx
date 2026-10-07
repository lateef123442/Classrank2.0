import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type } from "../theme/tokens";
import PressableScale from "../components/animated/PressableScale";
import { supabase } from "../lib/supabase";
import { useStudy, subjectStats, topicStats, daysUntil, dueTopics, knowledgeGaps, generateSchedule, applySchedule, addQuestions, addCards, subjectName, topicName, fmtTime12, dateStr, addDaysStr } from "../lib/studyStore";
import { generateQuestions, generateFlashcards, FileInfo } from "../lib/studyAi";
import { courseFilePaths } from "../lib/studyCourseSync";
import { Loader } from "../components/animated/Loader";

interface Msg { role: "user" | "assistant"; content: string; action?: { label: string; run: () => void } }
const FOLLOW_UPS = ["Give me a hint", "Explain it more simply", "Quiz me on this"];
const PROMPTS = ["Explain recursion like I'm a beginner", "I don't understand this question", "Explain this topic using a simple example", "Give me a hint, not the answer"];

export default function CompanionScreen({ navigation, route }: any) {
  const { data } = useStudy();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [tool, setTool] = useState<"quiz" | "cards" | null>(null);
  const [tSub, setTSub] = useState<string | undefined>();
  const [tTopic, setTTopic] = useState<string | undefined>();
  const pickSub = tSub ?? data.subjects[0]?.id;
  const reply = (content: string, action?: Msg["action"]) => {
    setMsgs((m) => [...m, { role: "assistant", content, action }]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  };
  // Deep links from quiz results / subject rooms arrive with a ready-to-edit prompt.
  useEffect(() => { if (route?.params?.prompt) setText(route.params.prompt); }, [route?.params?.prompt]);


  // ── one-tap tools: structured results go straight into the student's own library ──
  const generate = async () => {
    const sub = data.subjects.find((x) => x.id === pickSub);
    if (!sub || busy) return;
    const notes = data.notes.filter((n) => !n.title.startsWith("📎") && n.subjectId === sub.id && (!tTopic || n.topicId === tTopic || !n.topicId)).map((n) => `${n.title}: ${n.body}`).join("\n");
    const label = `${sub.name}${tTopic ? ` → ${topicName(data, tTopic)}` : ""}`;
    // Course rooms: the teacher's uploaded files (PDF, Word, slides…) are read by the server too.
    const files = courseFilePaths(data, sub.id, tTopic || undefined);
    let info: FileInfo | null = null;
    const onFiles = (i: FileInfo) => { info = i; };
    const fileNote = () => { const k = (info as FileInfo | null)?.skipped ?? 0; return k > 0 ? ` (${k} course file${k === 1 ? "" : "s"} couldn't be read, so I used your notes and the rest.)` : ""; };
    setBusy(true); setMsgs((m) => [...m, { role: "user", content: `${tool === "quiz" ? "Generate a quiz" : "Make flashcards"}: ${label}` }]);
    try {
      if (tool === "quiz") {
        const made = await generateQuestions({ subject: sub.name, topic: topicName(data, tTopic) === "General" ? undefined : topicName(data, tTopic), notes, files, onFiles, count: 5 });
        addQuestions(made.map((m) => ({ ...m, subjectId: sub.id, topicId: tTopic })));
        reply(`Added ${made.length} practice questions to ${label}. Skim them for accuracy, then test yourself.${fileNote()}`, { label: "Start quiz", run: () => navigation.navigate("PracticeSession", tTopic ? { mode: "topic", subjectId: sub.id, topicId: tTopic } : { mode: "quick", subjectId: sub.id }) });
      } else {
        const made = await generateFlashcards({ subject: sub.name, topic: topicName(data, tTopic) === "General" ? undefined : topicName(data, tTopic), notes, files, onFiles, count: 6 });
        const n = addCards(made.map((m) => ({ ...m, subjectId: sub.id, topicId: tTopic })));
        reply(n ? `Added ${n} flashcards to ${label}. Rate them Again/Hard/Good/Easy and I'll space them out.${fileNote()}` : "You already have those cards.", n ? { label: "Review cards", run: () => navigation.navigate("Cards") } : undefined);
      }
      setTool(null);
    } catch {
      reply("I couldn't generate that right now. Check your connection, or that the study-companion function is deployed.");
    } finally { setBusy(false); }
  };

  const planWeek = () => {
    setMsgs((m) => [...m, { role: "user", content: "Plan my week" }]);
    const plan = generateSchedule(data, 7);
    if (!plan.length) return reply(data.subjects.length ? `Your next 7 days are already full for ${data.prefs.dailyMinutes} min/day.` : "Add a subject first and I'll build a plan around it.");
    const day = (d: string) => (d === dateStr() ? "Today" : d === addDaysStr(1) ? "Tomorrow" : new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" }));
    const lines = plan.map((p) => `${day(p.date)} ${fmtTime12(p.time)} — ${subjectName(data, p.subjectId)}${p.topicId ? ` (${topicName(data, p.topicId)})` : ""}, ${p.minutes} min`);
    reply(`Here's a week that fits ${data.prefs.dailyMinutes} min/day, weighted toward your exams and weak spots:\n\n${lines.join("\n")}`, { label: "Add to planner", run: () => { applySchedule(plan); reply("Added. You'll get reminders before each session."); } });
  };

  const findGaps = () => {
    setMsgs((m) => [...m, { role: "user", content: "What are my knowledge gaps?" }]);
    const gaps = knowledgeGaps(data);
    if (!gaps.length) return reply("Nothing stands out right now. Keep practising and I'll flag anything that slips.");
    const icon = { weak: "🔴", overdue: "🟠", untested: "⚪", empty: "📭" } as const;
    const first = gaps.find((g) => g.kind === "weak");
    reply(gaps.slice(0, 8).map((g) => `${icon[g.kind]} ${g.title} — ${g.detail}`).join("\n"),
      first ? { label: `Practise ${first.title}`, run: () => navigation.navigate("PracticeSession", { mode: "topic", subjectId: first.subjectId, topicId: first.topicId }) } : undefined);
  };

  const send = async (content: string) => {
    if (!content.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: content.trim() }];
    setMsgs(next); setText(""); setBusy(true);
    // Lightweight context so the tutor knows the student's exams and weak spots.
    const context = {
      subjects: data.subjects.map((s) => ({ name: s.name, examInDays: s.examDate ? daysUntil(s.examDate) : null })),
      weak: subjectStats(data).filter((s) => s.label === "Needs review").map((s) => s.name),
      weakTopics: topicStats(data).filter((t) => t.label === "Needs review").map((t) => `${t.name} (${t.accuracy}%)`),
      dueForReview: dueTopics(data).map((t) => t.name),
      dailyStudyMinutes: data.prefs.dailyMinutes,
    };
    try {
      const { data: res, error } = await supabase.functions.invoke("study-companion", { body: { messages: next.slice(-12), context } });
      if (error || !res?.reply) throw error ?? new Error("empty");
      setMsgs([...next, { role: "assistant", content: res.reply }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "I couldn't reach the tutor. Check your connection. If this keeps happening, the study-companion function may not be deployed yet." }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ padding: spacing.xl, paddingBottom: 0 }}>
          <PressableScale onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></PressableScale>
          <Text style={styles.h1}>Study companion</Text>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: spacing.xl }}>
          {msgs.length === 0 && (
            <>
              <Text style={styles.muted}>I'll guide you with hints and questions rather than just handing over answers.</Text>
              <View style={styles.row}>{PROMPTS.map((p) => (
                <PressableScale key={p} style={styles.chip} onPress={() => setText(p)}><Text style={styles.chipText}>{p}</Text></PressableScale>
              ))}</View>
            </>
          )}
          {msgs.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.me : styles.bot]}>
              <Text style={[styles.msg, m.role === "user" && { color: "#fff" }]}>{m.content}</Text>
              {m.action && <PressableScale style={styles.action} onPress={m.action.run}><Text style={styles.actionText}>{m.action.label} →</Text></PressableScale>}
            </View>
          ))}
          {!busy && msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && !msgs[msgs.length - 1].action && (
            <View style={styles.row}>{FOLLOW_UPS.map((f) => <PressableScale key={f} style={styles.chip} onPress={() => send(f)}><Text style={styles.chipText}>{f}</Text></PressableScale>)}</View>
          )}
          {busy && <View style={{ marginTop: spacing.md, alignSelf: "flex-start", marginLeft: spacing.md }}><Loader size={7} /></View>}
        </ScrollView>
        {tool && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{tool === "quiz" ? "Generate a quiz for…" : "Make flashcards for…"}</Text>
            {data.subjects.length === 0 ? <Text style={styles.muted}>Add a subject first.</Text> : (
              <>
                <View style={styles.rowTight}>{data.subjects.map((x) => <PressableScale key={x.id} style={[styles.chip, pickSub === x.id && styles.chipOn]} onPress={() => { setTSub(x.id); setTTopic(undefined); }}><Text style={[styles.chipText, pickSub === x.id && { color: "#fff" }]}>{x.name}</Text></PressableScale>)}</View>
                {data.topics.some((t) => t.subjectId === pickSub) && <View style={styles.rowTight}>{data.topics.filter((t) => t.subjectId === pickSub).map((t) => <PressableScale key={t.id} style={[styles.chip, tTopic === t.id && styles.chipOn]} onPress={() => setTTopic(tTopic === t.id ? undefined : t.id)}><Text style={[styles.chipText, tTopic === t.id && { color: "#fff" }]}>{t.name}</Text></PressableScale>)}</View>}
                <PressableScale style={[styles.send, { alignSelf: "stretch", alignItems: "center", marginTop: spacing.sm }, busy && { opacity: 0.5 }]} disabled={busy} onPress={generate}><Text style={styles.sendText}>{busy ? "Generating…" : "Generate"}</Text></PressableScale>
              </>
            )}
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
          {([["✨ Quiz me", () => setTool(tool === "quiz" ? null : "quiz")], ["🃏 Flashcards", () => setTool(tool === "cards" ? null : "cards")], ["🗓 Plan my week", planWeek], ["🔍 My gaps", findGaps]] as [string, () => void][]).map(([l, f]) => (
            <PressableScale key={l} style={styles.chip} onPress={f}><Text style={styles.chipText}>{l}</Text></PressableScale>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} placeholder="Ask anything…" placeholderTextColor={colors.textFaint} value={text} onChangeText={setText} multiline />
          <PressableScale style={styles.send} onPress={() => send(text)}><Text style={styles.sendText}>Send</Text></PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  back: { ...type.bodyMedium, color: colors.tealDeep, marginBottom: spacing.sm },
  h1: { ...type.h1, color: colors.text },
  muted: { ...type.body, color: colors.textMuted },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  chip: { backgroundColor: colors.violetTint, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chipText: { ...type.bodyMedium, color: colors.text },
  bubble: { maxWidth: "88%", borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  me: { alignSelf: "flex-end", backgroundColor: colors.teal },
  bot: { alignSelf: "flex-start", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  msg: { ...type.body, color: colors.text },
  inputRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, alignItems: "flex-end" },
  input: { flex: 1, maxHeight: 110, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, ...type.body, color: colors.text },
  send: { backgroundColor: colors.teal, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  chipOn: { backgroundColor: colors.teal },
  rowTight: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  panel: { backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border, padding: spacing.lg },
  panelTitle: { ...type.h3, color: colors.text },
  action: { backgroundColor: colors.tealTint, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.sm, alignSelf: "flex-start" },
  actionText: { ...type.bodyMedium, color: colors.tealDeep },
  sendText: { ...type.h3, color: "#fff" },
});
