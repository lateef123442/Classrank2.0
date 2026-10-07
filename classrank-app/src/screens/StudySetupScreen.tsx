import React, { useEffect, useState } from "react";
import { Notifications } from "../lib/notificationsModule";
import { View, Text, ScrollView, TextInput, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/tokens";
import { useApp } from "../context/AppContext";
import { Back, Btn, Card, Chip, Label, Muted, s } from "../components/study/ui";
import { useStudy, setPrefs, isTime, fmtTime12 } from "../lib/studyStore";
import { requestNotificationPermissions, registerPushToken, clearPushToken } from "../lib/notifications";
import { useSyncStatus } from "../hooks/useStudyCloudSync";
import { syncNow } from "../lib/studySync";

const GOALS = ["Pass exams", "Improve grades", "Prepare for an exam", "Master a subject", "Study consistently"];
const TIMES = ["07:00", "12:00", "17:00", "20:00", "22:00"];
const MINS = [30, 45, 60, 90, 120];
const TYPES: { key: "sessions" | "missed" | "dailyQuiz" | "reviews" | "push"; title: string; sub: string }[] = [
  { key: "sessions", title: "Session reminders", sub: "10 minutes before a planned session" },
  { key: "missed", title: "Missed-session nudges", sub: "Offer to reschedule if you skipped one" },
  { key: "dailyQuiz", title: "Daily challenge", sub: "A gentle prompt before your study time" },
  { key: "reviews", title: "Review prompts", sub: "When a topic or flashcards are due" },
  { key: "push", title: "Class announcements & replies", sub: "Alerts from your courses and study groups. Can't be silenced by quiet hours." },
];

export default function StudySetupScreen({ navigation }: any) {
  const { profile } = useApp();
  const { data } = useStudy();
  const p = data.prefs;
  const sync = useSyncStatus();
  const [allowed, setAllowed] = useState(true);
  useEffect(() => { if (!Notifications) return; Notifications.getPermissionsAsync().then((r) => setAllowed(r.status === "granted")).catch(() => {}); }, []);
  const [qs, setQs] = useState(p.quietStart), [qe, setQe] = useState(p.quietEnd), [custom, setCustom] = useState("");

  const toggleGoal = (g: string) => setPrefs({ goals: p.goals.includes(g) ? p.goals.filter((x) => x !== g) : [...p.goals, g], setupDone: true });
  const toggleNotif = async (k: (typeof TYPES)[number]["key"], v: boolean) => {
    if (v && !(await requestNotificationPermissions())) return Alert.alert("Notifications are off", "Enable notifications for ClassRank in your phone settings to get reminders.");
    setPrefs({ notif: { ...p.notif, [k]: v } });
    if (k === "push") { if (v && profile?.id) registerPushToken(profile.id); else clearPushToken(profile?.id); }
  };
  const saveQuiet = () => {
    if (!isTime(qs) || !isTime(qe)) return Alert.alert("Quiet hours", "Use 24-hour HH:MM, e.g. 22:00 and 07:00.");
    setPrefs({ quietStart: qs, quietEnd: qe });
  };
  const saveCustom = () => { if (!isTime(custom)) return Alert.alert("Time", "Use 24-hour HH:MM, e.g. 19:30."); setPrefs({ preferredTime: custom, setupDone: true }); setCustom(""); };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Study setup</Text>
        <Muted style={{ marginTop: 4 }}>This is how I personalise your plan and reminders.</Muted>

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={s.h3}>{profile?.name}</Text>
          <Muted>{[profile?.university, profile?.department, profile?.year ? `Year ${profile.year}` : null].filter(Boolean).join(" · ")}</Muted>
        </Card>

        <Label>WHAT ARE YOU WORKING TOWARD?</Label>
        <View style={s.row}>{GOALS.map((g) => <Chip key={g} label={g} on={p.goals.includes(g)} onPress={() => toggleGoal(g)} />)}</View>

        <Label>WHEN DO YOU LIKE TO STUDY?</Label>
        <View style={s.row}>{TIMES.map((t) => <Chip key={t} label={fmtTime12(t)} on={p.preferredTime === t} onPress={() => setPrefs({ preferredTime: t, setupDone: true })} />)}</View>
        {!TIMES.includes(p.preferredTime) && <Muted style={{ marginTop: 6 }}>Current: {fmtTime12(p.preferredTime)}</Muted>}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput style={[s.input, { flex: 1 }]} value={custom} onChangeText={setCustom} placeholder="Custom HH:MM" placeholderTextColor={colors.textFaint} keyboardType="numbers-and-punctuation" />
          <Chip label="Set" on={false} onPress={saveCustom} />
        </View>

        <Label>TIME AVAILABLE PER DAY</Label>
        <View style={s.row}>{MINS.map((m) => <Chip key={m} label={`${m} min`} on={p.dailyMinutes === m} onPress={() => setPrefs({ dailyMinutes: m, setupDone: true })} />)}</View>

        <Label>CLOUD BACKUP</Label>
        <Card>
          <Text style={s.h3}>
            {sync.state === "syncing" ? "Backing up…" : sync.state === "synced" ? "Backed up ✅" : sync.state === "offline" ? "Waiting for a connection" : sync.state === "unavailable" ? "Not available yet" : sync.state === "error" ? "Couldn't back up" : "Ready"}
          </Text>
          <Muted style={{ marginTop: 2 }}>
            {sync.state === "unavailable" ? "Cloud backup isn't set up on this server yet, so your study data is only on this phone."
              : sync.state === "error" ? sync.message ?? "Something went wrong. It will retry."
              : sync.at ? `Last backup ${new Date(sync.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. ` : ""}
            {sync.state !== "unavailable" && sync.state !== "error" ? "Your notes, questions, quiz history and flashcards are saved to your account, so a new phone restores them. Only you can read them." : ""}
          </Muted>
          {profile?.id && sync.state !== "unavailable" && <Btn ghost label="Back up now" onPress={() => syncNow(profile.id)} disabled={sync.state === "syncing"} />}
        </Card>

        <Label>NOTIFICATIONS</Label>
        {!allowed && (
          <Card onPress={async () => setAllowed(await requestNotificationPermissions())} style={{ backgroundColor: colors.emberTint, borderWidth: 0 }}>
            <Text style={s.h3}>Reminders are switched off</Text>
            <Muted>Tap to allow notifications. If nothing appears, enable them for ClassRank in your phone's settings.</Muted>
          </Card>
        )}
        {TYPES.map((t) => (
          <Card key={t.key} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}><Text style={s.h3}>{t.title}</Text><Muted>{t.sub}</Muted></View>
            <Switch value={p.notif[t.key]} onValueChange={(v) => toggleNotif(t.key, v)} trackColor={{ true: colors.teal }} />
          </Card>
        ))}

        <Label>QUIET HOURS</Label>
        <Muted>No study notifications during this window.</Muted>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput style={[s.input, { flex: 1 }]} value={qs} onChangeText={setQs} placeholder="22:00" placeholderTextColor={colors.textFaint} />
          <TextInput style={[s.input, { flex: 1 }]} value={qe} onChangeText={setQe} placeholder="07:00" placeholderTextColor={colors.textFaint} />
          <Chip label="Save" on={false} onPress={saveQuiet} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
