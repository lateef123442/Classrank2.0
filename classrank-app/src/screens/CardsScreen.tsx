import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type } from "../theme/tokens";
import PressableScale from "../components/animated/PressableScale";
import { useStudy, addCard, addCards, rateCard, dueCards, subjectName, nextCardState, fmtInterval } from "../lib/studyStore";
import { generateFlashcards } from "../lib/studyAi";
import FlipCard from "../components/animated/FlipCard";
import Reveal from "../components/animated/Reveal";
import { Loader } from "../components/animated/Loader";

const RATINGS: { r: 0 | 1 | 2 | 3; label: string; color: string }[] = [
  { r: 0, label: "Again", color: colors.danger }, { r: 1, label: "Hard", color: colors.ember },
  { r: 2, label: "Good", color: colors.teal }, { r: 3, label: "Easy", color: colors.violet },
];

export default function CardsScreen({ navigation }: any) {
  const { data } = useStudy();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [shown, setShown] = useState(false);
  const [subj, setSubj] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topic, setTopic] = useState<string | undefined>();
  const [only, setOnly] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const due = dueCards(data).filter((c) => !only || c.subjectId === only);
  const chosen = subj ?? data.subjects[0]?.id;
  const topics = data.topics.filter((t) => t.subjectId === chosen);
  const tName = (id?: string) => data.topics.find((t) => t.id === id)?.name;

  const generate = async () => {
    const sub = data.subjects.find((x) => x.id === chosen);
    if (!sub) return;
    setBusy(true);
    try {
      const notes = data.notes.filter((n) => n.subjectId === sub.id && (!topic || n.topicId === topic || !n.topicId)).map((n) => `${n.title}: ${n.body}`).join("\n");
      const made = await generateFlashcards({ subject: sub.name, topic: tName(topic), notes, count: 6 });
      const added = addCards(made.map((m) => ({ ...m, subjectId: sub.id, topicId: topic })));
      Alert.alert("Cards added", added ? `${added} new card${added > 1 ? "s" : ""} added. Skim them for accuracy before relying on them.` : "Those cards already exist.");
    } catch {
      Alert.alert("Couldn't generate", "The AI tutor is unreachable. Check your connection, or that the study-companion function is deployed.");
    } finally { setBusy(false); }
  };
  const card = queue && queue.length ? data.cards.find((c) => c.id === queue[0]) : null;

  const rate = (r: 0 | 1 | 2 | 3) => {
    if (!card) return;
    rateCard(card.id, r);
    // "Again" cards go to the back of today's queue so you see them once more this session.
    setQueue((q) => { const [h, ...t] = q!; return r === 0 ? [...t, h] : t; });
    setShown(false);
  };

  const Back = () => <PressableScale onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></PressableScale>;

  if (queue) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: spacing.xl, flex: 1 }}>
          <PressableScale onPress={() => setQueue(null)}><Text style={styles.back}>← End review</Text></PressableScale>
          {!card ? (
            <View style={styles.center}>
              <Text style={styles.h1}>All caught up 🎉</Text>
              <Text style={styles.muted}>Cards you rated Good or Easy will return in a few days.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.muted}>{subjectName(data, card.subjectId)}{tName(card.topicId) ? ` · ${tName(card.topicId)}` : ""} · {queue.length} left</Text>
              <Reveal key={card.id} style={{ marginVertical: spacing.xl }}>
                <PressableScale onPress={() => setShown(true)} scaleTo={0.98}>
                  <FlipCard flipped={shown} height={260} faceStyle={styles.flashFace}
                    front={<Text style={styles.flashText}>{card.front}</Text>}
                    back={<Text style={styles.flashText}>{card.back}</Text>} />
                </PressableScale>
              </Reveal>
              {!shown ? (
                <PressableScale style={styles.primary} onPress={() => setShown(true)}><Text style={styles.primaryText}>Show answer</Text></PressableScale>
              ) : (
                <View style={styles.row}>
                  {RATINGS.map((x) => (
                    <PressableScale key={x.r} style={[styles.rate, { backgroundColor: x.color }]} onPress={() => rate(x.r)}>
                      <Text style={styles.primaryText}>{x.label}</Text>
                      <Text style={styles.interval}>{fmtInterval(nextCardState(card, x.r).interval)}</Text>
                    </PressableScale>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Back />
        <Text style={styles.h1}>Flashcards</Text>
        <Text style={styles.muted}>{data.cards.length} cards · {due.length} due today</Text>
        {data.subjects.length > 1 && (
          <View style={[styles.row, { marginTop: spacing.md }]}>
            {[{ id: null as string | null, name: "All" }, ...data.subjects].map((x) => (
              <PressableScale key={x.id ?? "all"} style={[styles.chip, only === x.id && styles.chipOn]} onPress={() => setOnly(x.id)}>
                <Text style={[styles.chipText, only === x.id && { color: "#fff" }]}>{x.name}</Text>
              </PressableScale>
            ))}
          </View>
        )}
        <PressableScale style={[styles.primary, due.length === 0 && { opacity: 0.4 }]} disabled={due.length === 0} onPress={() => { setQueue(due.map((c) => c.id)); setShown(false); }}>
          <Text style={styles.primaryText}>{due.length ? `Review ${due.length} card${due.length > 1 ? "s" : ""}` : "Nothing due"}</Text>
        </PressableScale>

        <Text style={styles.label}>NEW CARD</Text>
        {data.subjects.length === 0 ? (
          <Text style={styles.muted}>Add a subject in the planner first.</Text>
        ) : (
          <>
            <View style={styles.row}>
              {data.subjects.map((s) => (
                <PressableScale key={s.id} style={[styles.chip, chosen === s.id && styles.chipOn]} onPress={() => { setSubj(s.id); setTopic(undefined); }}>
                  <Text style={[styles.chipText, chosen === s.id && { color: "#fff" }]}>{s.name}</Text>
                </PressableScale>
              ))}
            </View>
            {topics.length > 0 && (
              <View style={[styles.row, { marginTop: spacing.sm }]}>
                {topics.map((t) => (
                  <PressableScale key={t.id} style={[styles.chip, topic === t.id && styles.chipOn]} onPress={() => setTopic(topic === t.id ? undefined : t.id)}>
                    <Text style={[styles.chipText, topic === t.id && { color: "#fff" }]}>{t.name}</Text>
                  </PressableScale>
                ))}
              </View>
            )}
            <PressableScale style={[styles.ghost, busy && { opacity: 0.5 }]} disabled={busy} onPress={generate}>
              <Text style={styles.ghostText}>{busy ? "Generating…" : "✨ Generate 6 cards with AI"}</Text>
            </PressableScale>
            {busy && <View style={{ marginTop: spacing.sm }}><Loader label="Writing your cards…" /></View>}
            <TextInput style={styles.input} placeholder="Front (question)" placeholderTextColor={colors.textFaint} value={front} onChangeText={setFront} multiline />
            <TextInput style={styles.input} placeholder="Back (answer)" placeholderTextColor={colors.textFaint} value={back} onChangeText={setBack} multiline />
            <PressableScale style={styles.primary} onPress={() => { if (chosen && front.trim() && back.trim()) { addCard(chosen, front, back, topic); setFront(""); setBack(""); } }}>
              <Text style={styles.primaryText}>Save card</Text>
            </PressableScale>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  back: { ...type.bodyMedium, color: colors.tealDeep, marginBottom: spacing.md },
  h1: { ...type.h1, color: colors.text },
  muted: { ...type.caption, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  label: { ...type.label, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flash: { flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.xxl, marginVertical: spacing.xl, justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  flashFace: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.xxl, borderWidth: 1, borderColor: colors.border },
  flashText: { ...type.h2, color: colors.text, textAlign: "center" },
  primary: { backgroundColor: colors.teal, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  primaryText: { ...type.h3, color: "#fff" },
  interval: { ...type.caption, color: "#fff", opacity: 0.85, marginTop: 2 },
  ghost: { backgroundColor: colors.tealTint, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  ghostText: { ...type.h3, color: colors.tealDeep },
  rate: { flex: 1, minWidth: 70, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { ...type.bodyMedium, color: colors.text },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, marginTop: spacing.sm, ...type.body, color: colors.text },
});
