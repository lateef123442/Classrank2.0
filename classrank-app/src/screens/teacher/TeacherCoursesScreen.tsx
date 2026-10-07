import React, { useCallback, useEffect, useState } from "react";
import { Text, ScrollView, TextInput, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/tokens";
import { useApp } from "../../context/AppContext";
import { Btn, Card, Label, Muted, s, ListSkeleton } from "../../components/study/ui";
import { fetchStaffCourses, createCourse, StaffCourse } from "../../lib/courseApi";

/** Teachers see their own courses; admins see every course (and can open any to moderate or delete it). */
export default function TeacherCoursesScreen({ navigation }: any) {
  const { profile } = useApp();
  const [courses, setCourses] = useState<StaffCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(""), [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const isAdmin = profile?.role === "admin";

  const load = useCallback(async () => {
    try { setCourses(await fetchStaffCourses()); setError(null); } catch (e: any) { setError(e?.message ?? "Couldn't load courses."); setCourses((c) => c ?? []); }
  }, []);
  useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

  const create = async () => {
    if (!profile?.department_id || busy) return;
    setBusy(true);
    try {
      const c = await createCourse(profile.department_id, code, title);
      setCode(""); setTitle(""); await load();
      Alert.alert("Course created", `Students join with the code ${c.join_code}.`, [{ text: "Manage", onPress: () => navigation.navigate("TeacherCourse", { courseId: c.id }) }]);
    } catch (e: any) { Alert.alert("Couldn't create course", e?.message ?? "Try again."); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={s.h1}>{isAdmin ? "All courses" : "My courses"}</Text>
        {courses === null && <ListSkeleton />}
        {error && <Muted style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Muted>}
        {courses?.length === 0 && !error && <Muted style={{ marginTop: spacing.sm }}>{isAdmin ? "No courses have been created yet." : "Create a course, then share its code with your class."}</Muted>}
        {courses?.map((c) => (
          <Card key={c.id} style={{ marginTop: spacing.sm }} onPress={() => navigation.navigate("TeacherCourse", { courseId: c.id })}>
            <Text style={s.h3}>{c.code} · {c.title}</Text>
            <Muted>{c.member_count} students · {c.question_count} questions · {c.material_count} materials{isAdmin ? ` · ${c.teacher_name} · ${c.department}` : ` · code ${c.join_code}`}</Muted>
          </Card>
        ))}
        {!!profile?.department_id && (
          <>
            <Label>NEW COURSE</Label>
            <TextInput style={s.input} value={code} onChangeText={setCode} placeholder="Course code (e.g. CSC201)" placeholderTextColor={colors.textFaint} autoCapitalize="characters" />
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Title (e.g. Data Structures)" placeholderTextColor={colors.textFaint} />
            <Btn label={busy ? "Creating…" : "Create course"} onPress={create} disabled={busy || code.trim().length < 2 || title.trim().length < 2} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
