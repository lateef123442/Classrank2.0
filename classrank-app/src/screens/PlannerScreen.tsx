import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/tokens";
import PressableScale from "../components/animated/PressableScale";
import { Back, Btn, Card, Chip, Label, Muted, s } from "../components/study/ui";
import {
  useStudy, addSubject, removeSubject, addSession, setSessionStatus, rescheduleSession, removeSession, applySchedule,
  generateSchedule, missedSessions, subjectName, topicName, daysUntil, dateStr, addDaysStr, fmtTime12, PlannedSession,
} from "../lib/studyStore";

const MINUTES = [10, 20, 30, 45];
const dayLabel = (d: string) => (d === dateStr() ? "Today" : d === addDaysStr(1) ? "Tomorrow" : new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }));

export default function PlannerScreen({ navigation }: any) {
  const { data } = useStudy();
  const [name, setName] = useState("");
  const [exam, setExam] = useState("");
  const [pickId, setPickId] = useState<string | null>(null);
  const [mins, setMins] = useState(20);
  const [offset, setOffset] = useState(0);
  const chosen = pickId ?? data.subjects[0]?.id;
  const missed = missedSessions(data);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(i));
  const upcoming = (d: string) => data.sessions.filter((x) => x.date === d).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  const saveSubject = () => {
    if (!name.trim()) return;
    if (exam && (!/^\d{4}-\d{2}-\d{2}$/.test(exam) || isNaN(new Date(exam).getTime()))) return Alert.alert("Exam date", "Use the format YYYY-MM-DD, e.g. 2026-12-05.");
    addSubject(name, exam);
    setName(""); setExam("");
  };

  const suggest = () => {
    const plan = generateSchedule(data, 7);
    if (!plan.length) return Alert.alert("Nothing to suggest", data.subjects.length ? "Your next 7 days are already full for your daily study time." : "Add a subject first.");
    const preview = plan.slice(0, 6).map((p) => `${dayLabel(p.date)} ${fmtTime12(p.time)} — ${subjectName(data, p.subjectId)}${p.topicId ? ` (${topicName(data, p.topicId)})` : ""}, ${p.minutes} min`).join("\n");
    Alert.alert(`Suggested week · ${plan.length} sessions`, `${preview}${plan.length > 6 ? `\n…and ${plan.length - 6} more` : ""}\n\nBased on your exams, weak areas, missed sessions and ${data.prefs.dailyMinutes} min/day.`, [
      { text: "Not now", style: "cancel" }, { text: "Add to planner", onPress: () => applySchedule(plan) },
    ]);
  };

  const move = (x: PlannedSession) =>
    Alert.alert("Move session", `${subjectName(data, x.subjectId)} · ${x.minutes} min`, [
      { text: "Later today", onPress: () => rescheduleSession(x.id, dateStr(), "21:00") },
      { text: "Tomorrow", onPress: () => rescheduleSession(x.id, addDaysStr(1)) },
      { text: "Cancel", style: "cancel" },
    ]);

  const Session = ({ x }: { x: PlannedSession }) => (
    <Card style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        <Text style={[s.h3, x.status !== "planned" && { opacity: 0.5 }]}>{subjectName(data, x.subjectId)} · {x.minutes} min</Text>
        <Muted>{x.time ? `${fmtTime12(x.time)} · ` : ""}{x.topicId ? `${topicName(data, x.topicId)} · ` : ""}{x.status === "planned" ? "Planned" : x.status === "done" ? "Completed ✅" : "Skipped"}</Muted>
      </View>
      {x.status === "planned" ? (
        <View style={{ gap: 6 }}>
          <View style={s.row}>
            <Chip label="Done" on onPress={() => setSessionStatus(x.id, "done")} />
            <Chip label="Move" on={false} onPress={() => move(x)} />
          </View>
          <View style={s.row}>
            <Chip label="Skip" on={false} onPress={() => setSessionStatus(x.id, "skipped")} />
            <Chip label="✕" on={false} onPress={() => removeSession(x.id)} />
          </View>
        </View>
      ) : (
        <Chip label="Undo" on={false} onPress={() => setSessionStatus(x.id, "planned")} />
      )}
    </Card>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Study planner</Text>
        <Btn ghost label="✨ Suggest my week" onPress={suggest} disabled={!data.subjects.length} />

        {missed.length > 0 && (
          <>
            <Label>MISSED</Label>
            {missed.map((x) => (
              <Card key={x.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.emberTint }}>
                <View style={{ flex: 1 }}><Text style={s.h3}>{subjectName(data, x.subjectId)} · {x.minutes} min</Text><Muted>{dayLabel(x.date)}</Muted></View>
                <Chip label="Move to today" on onPress={() => rescheduleSession(x.id, dateStr(), data.prefs.preferredTime)} />
              </Card>
            ))}
          </>
        )}

        {days.map((d) => {
          const list = upcoming(d);
          if (d !== dateStr() && !list.length) return null;
          return (
            <View key={d}>
              <Label>{dayLabel(d).toUpperCase()}</Label>
              {list.length === 0 && <Muted>No sessions planned. Add one below.</Muted>}
              {list.map((x) => <Session key={x.id} x={x} />)}
            </View>
          );
        })}

        {data.subjects.length > 0 && (
          <>
            <Label>ADD A SESSION</Label>
            <View style={s.row}>{days.slice(0, 4).map((d, i) => <Chip key={d} label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayLabel(d).split(",")[0]} on={offset === i} onPress={() => setOffset(i)} />)}</View>
            <View style={[s.row, { marginTop: spacing.sm }]}>{data.subjects.map((x) => <Chip key={x.id} label={x.name} on={chosen === x.id} onPress={() => setPickId(x.id)} />)}</View>
            <View style={[s.row, { marginTop: spacing.sm }]}>{MINUTES.map((m) => <Chip key={m} label={`${m} min`} on={mins === m} onPress={() => setMins(m)} />)}</View>
            <Btn label={`Add session · ${fmtTime12(data.prefs.preferredTime)}`} onPress={() => chosen && addSession(chosen, mins, addDaysStr(offset), data.prefs.preferredTime)} />
          </>
        )}

        <Label>SUBJECTS</Label>
        {data.subjects.map((x) => (
          <Card key={x.id} style={{ flexDirection: "row", alignItems: "center" }}>
            <PressableScale style={{ flex: 1 }} onPress={() => navigation.navigate("Subject", { subjectId: x.id })}>
              <Text style={s.h3}>{x.name}</Text>
              {x.examDate && <Muted>{daysUntil(x.examDate) >= 0 ? `Exam in ${daysUntil(x.examDate)} days` : "Exam passed"} · {x.examDate}</Muted>}
            </PressableScale>
            <PressableScale onPress={() => Alert.alert("Remove subject?", "Its topics, notes, questions, cards and sessions will be removed too.", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => removeSubject(x.id) }])}>
              <Text style={s.muted}>Remove</Text>
            </PressableScale>
          </Card>
        ))}
        <TextInput style={s.input} placeholder="Subject (e.g. Anatomy)" placeholderTextColor={colors.textFaint} value={name} onChangeText={setName} />
        <TextInput style={s.input} placeholder="Exam date YYYY-MM-DD (optional)" placeholderTextColor={colors.textFaint} value={exam} onChangeText={setExam} keyboardType="numbers-and-punctuation" />
        <Btn label="Add subject" onPress={saveSubject} />
      </ScrollView>
    </SafeAreaView>
  );
}
