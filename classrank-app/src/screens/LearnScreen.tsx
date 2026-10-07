import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/tokens";
import { Card, Bar, Label, Muted, Tag, Btn, s, STRENGTH_COLOR } from "../components/study/ui";
import { useStudy, subjectStats, daysUntil, dueCards, dueTopics } from "../lib/studyStore";
import StaggerIn from "../components/animated/StaggerIn";

export default function LearnScreen({ navigation }: any) {
  const { data } = useStudy();
  const stats = subjectStats(data);
  const dueC = dueCards(data).length, dueT = dueTopics(data).length;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Text style={s.h1}>Learn</Text>
        <Muted style={{ marginTop: 4 }}>Each subject is a room: notes, topics, questions, and progress in one place.</Muted>

        <Card onPress={() => navigation.navigate("Cards")} style={{ marginTop: spacing.lg, backgroundColor: colors.violetTint, borderWidth: 0 }}>
          <Text style={s.h3}>🃏 Flashcards</Text>
          <Muted>{dueC ? `${dueC} due for review` : "Nothing due right now"}{dueT ? ` · ${dueT} topic${dueT > 1 ? "s" : ""} to revisit` : ""}</Muted>
        </Card>

        <Label>YOUR SUBJECTS</Label>
        {stats.length === 0 && <Muted>No subjects yet. Add the courses you're taking and I'll build your study plan around them.</Muted>}
        {[...stats].sort((a, b) => a.name.localeCompare(b.name)).map((x, i) => {
          const sub = data.subjects.find((y) => y.id === x.id)!;
          const exam = sub.examDate ? daysUntil(sub.examDate) : null;
          return (
            <StaggerIn key={x.id} index={i}><Card onPress={() => navigation.navigate("Subject", { subjectId: x.id })}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.h3}>{x.name}</Text>
                <Tag label={x.label} color={STRENGTH_COLOR[x.label]} />
              </View>
              <Muted style={{ marginTop: 2 }}>{x.topics} topics · {x.questions} questions · {x.cards} cards{exam !== null && exam >= 0 ? ` · exam in ${exam}d` : ""}</Muted>
              <View style={{ marginTop: spacing.sm }}><Bar value={(x.accuracy ?? 0) / 100} color={STRENGTH_COLOR[x.label]} /></View>
            </Card></StaggerIn>
          );
        })}
        <Btn ghost label="+ Add or manage subjects" onPress={() => navigation.navigate("Planner")} />
      </ScrollView>
    </SafeAreaView>
  );
}
