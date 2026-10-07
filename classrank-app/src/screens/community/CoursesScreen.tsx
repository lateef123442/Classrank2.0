import React, { useCallback, useEffect, useState } from "react";
import { Text, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/tokens";
import { Back, Btn, Card, Label, Muted, s, ListSkeleton } from "../../components/study/ui";
import { fetchMyCourses, joinCourse, fetchCourseContent, MyCourse } from "../../lib/courseApi";
import { importCourseBundle, daysUntil } from "../../lib/studyStore";
import StaggerIn from "../../components/animated/StaggerIn";

export default function CoursesScreen({ navigation }: any) {
  const [courses, setCourses] = useState<MyCourse[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setCourses(await fetchMyCourses()); setError(null); }
    catch (e: any) { setError(e?.message ?? "Couldn't load your courses."); setCourses((c) => c ?? []); }
  }, []);
  useEffect(() => { load(); return navigation.addListener("focus", load); }, [load, navigation]);

  const join = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const j = await joinCourse(code);
      const bundle = await fetchCourseContent(j.course_id);
      const r = importCourseBundle(bundle); // builds the Subject Room straight away
      setCode(""); load();
      Alert.alert(`Joined ${j.code}`, `Added to your study space: ${bundle.questions.length} practice questions and ${bundle.materials.length} study materials.`, [
        { text: "Later", style: "cancel" }, { text: "Open it", onPress: () => navigation.navigate("Subject", { subjectId: r.subjectId }) },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't join", e?.message ?? "Check the code and try again.");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>My courses</Text>
        {courses === null && <ListSkeleton />}
        {error && <Muted style={{ marginTop: spacing.sm, color: colors.danger }}>{error}</Muted>}
        {courses?.length === 0 && !error && <Muted style={{ marginTop: spacing.sm }}>You haven't joined a course yet. Ask your teacher for the course code.</Muted>}
        {courses?.map((c, i) => (
          <StaggerIn key={c.id} index={i}><Card onPress={() => navigation.navigate("Course", { courseId: c.id })} style={{ marginTop: spacing.sm }}>
            <Text style={s.h3}>{c.code} · {c.title}</Text>
            <Muted>{c.teacher_name} · {c.member_count} student{c.member_count === 1 ? "" : "s"}{c.next_exam ? ` · exam in ${Math.max(0, daysUntil(c.next_exam))}d` : ""}</Muted>
          </Card></StaggerIn>
        ))}
        <Label>JOIN A COURSE</Label>
        <TextInput style={s.input} value={code} onChangeText={setCode} placeholder="Course code from your teacher" placeholderTextColor={colors.textFaint} autoCapitalize="characters" autoCorrect={false} />
        <Muted style={{ marginTop: 6 }}>Joining adds the course to your study space. Your answers to its practice questions are shared with the teacher as class statistics.</Muted>
        <Btn label={busy ? "Joining…" : "Join course"} onPress={join} disabled={busy || !code.trim()} />
      </ScrollView>
    </SafeAreaView>
  );
}
