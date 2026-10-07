import React, { useCallback, useEffect, useState } from "react";
import { Text, ScrollView, TextInput, Alert, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/tokens";
import { Back, Btn, Card, Chip, Label, Muted, s, ListSkeleton } from "../../components/study/ui";
import { fetchMyGroups, createGroup, joinGroup, StudyGroup } from "../../lib/groupApi";
import { fetchMyCourses, MyCourse } from "../../lib/courseApi";
import StaggerIn from "../../components/animated/StaggerIn";

export default function GroupsScreen({ navigation }: any) {
  const [groups, setGroups] = useState<StudyGroup[] | null>(null);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(""), [desc, setDesc] = useState(""), [courseId, setCourseId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setGroups(await fetchMyGroups()); setError(null); } catch (e: any) { setError(e?.message ?? "Couldn't load your groups."); setGroups((g) => g ?? []); }
    fetchMyCourses().then(setCourses).catch(() => {});
  }, []);
  useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

  const run = async (fn: () => Promise<void>, fail: string) => { if (busy) return; setBusy(true); try { await fn(); } catch (e: any) { Alert.alert(fail, e?.message ?? "Try again."); } finally { setBusy(false); } };
  const create = () => run(async () => {
    const g = await createGroup(name, desc, courseId);
    setName(""); setDesc(""); setCourseId(null); await load();
    Alert.alert("Group created", `Share this code so friends can join: ${g.join_code}`, [{ text: "Open", onPress: () => navigation.navigate("Group", { groupId: g.id }) }]);
  }, "Couldn't create group");
  const join = () => run(async () => {
    const g = await joinGroup(code);
    setCode(""); await load(); navigation.navigate("Group", { groupId: g.group_id });
  }, "Couldn't join");

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Study groups</Text>
        {groups === null && <ListSkeleton />}
        {error && <Muted style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Muted>}
        {groups?.length === 0 && !error && <Muted style={{ marginTop: spacing.sm }}>No groups yet. Start one or join with a friend's code.</Muted>}
        {groups?.map((g, i) => (
          <StaggerIn key={g.id} index={i}><Card style={{ marginTop: spacing.sm }} onPress={() => navigation.navigate("Group", { groupId: g.id })}>
            <Text style={s.h3}>{g.name}</Text>
            <Muted>{g.member_count} member{g.member_count === 1 ? "" : "s"}{g.active_challenge ? ` · 🏁 ${g.active_challenge}` : ""}</Muted>
          </Card></StaggerIn>
        ))}

        <Label>JOIN WITH A CODE</Label>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput style={[s.input, { flex: 1 }]} value={code} onChangeText={setCode} placeholder="Group code" placeholderTextColor={colors.textFaint} autoCapitalize="characters" autoCorrect={false} />
          <Chip label="Join" on onPress={join} />
        </View>

        <Label>START A GROUP</Label>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Name (e.g. CSC 201 exam crew)" placeholderTextColor={colors.textFaint} />
        <TextInput style={s.input} value={desc} onChangeText={setDesc} placeholder="What's it for? (optional)" placeholderTextColor={colors.textFaint} />
        {courses.length > 0 && (<>
          <Muted style={{ marginTop: spacing.sm }}>Link to one of your courses (optional)</Muted>
          <View style={[s.row, { marginTop: 6 }]}>{courses.map((c) => <Chip key={c.id} label={c.code} on={courseId === c.id} onPress={() => setCourseId(courseId === c.id ? null : c.id)} />)}</View>
        </>)}
        <Btn label={busy ? "Working…" : "Create group"} onPress={create} disabled={busy || name.trim().length < 2} />
      </ScrollView>
    </SafeAreaView>
  );
}
