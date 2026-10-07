import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Back, Btn, Card, Muted, s } from "../components/study/ui";
import { fetchCourseDailyQuiz, submitCourseDailyQuiz } from "../lib/courseApi";
import { colors, spacing, type } from "../theme/tokens";

export default function CourseDailyQuizScreen({ navigation, route }: any) {
  const { courseId } = route.params as { courseId: string };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetchCourseDailyQuiz(courseId, 5);
        if (!active) return;

        if (res.status !== "ready" || !res.questions?.length) {
          setQuestions([]);
          setError("No daily quiz is available right now for this course.");
          return;
        }

        setQuestions(res.questions);
      } catch (e: any) {
        setError(e?.message ?? "Couldn't load this daily quiz.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [courseId]);

  const finished = questions.length > 0 && questions.every((_, index) => selected[index] !== undefined);

  const submit = async () => {
    if (!questions.length) return;
    const payload = questions.map((_, index) => selected[index] ?? null);

    try {
      const resultData = await submitCourseDailyQuiz(courseId, payload);
      setResult(resultData);
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.message ?? "Try again.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ padding: spacing.xl }}>
          <Back onPress={() => navigation.goBack()} />
          <ActivityIndicator size="large" color={colors.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ padding: spacing.xl }}>
          <Back onPress={() => navigation.goBack()} />
          <Text style={s.h1}>Daily quiz unavailable</Text>
          <Muted>{error}</Muted>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted && result) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
          <Back onPress={() => navigation.goBack()} />
          <Text style={s.h1}>Quiz Results</Text>

          <Card style={{ marginTop: spacing.sm }}>
            <Text style={s.h3}>{result.correct}/{result.total} correct</Text>
            <Muted>You earned {result.correct * 5} course points.</Muted>
          </Card>

          {result.review.map((item: any, index: number) => (
            <Card key={`${item.q}-${index}`} style={{ marginTop: spacing.sm }}>
              <Text style={s.h3}>{item.q}</Text>
              <Muted>
                Your answer: {item.picked == null ? "No answer" : item.options[item.picked]} ·
                Correct answer: {item.options[item.correct]}
              </Muted>
              <Text style={[type.body, { color: colors.text, marginTop: 6 }]}>{item.explanation}</Text>
            </Card>
          ))}

          <Btn label="Back to course" onPress={() => navigation.goBack()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Course Daily Quiz</Text>

        {questions.map((q: any, index: number) => (
          <Card key={q.id} style={{ marginTop: spacing.sm }}>
            <Text style={s.h3}>{index + 1}. {q.q}</Text>

            <View style={{ marginTop: spacing.sm }}>
              {q.options.map((opt: string, optionIndex: number) => {
                const selectedOption = selected[index];
                const active = selectedOption === optionIndex;

                return (
                  <Btn
                    key={`${q.id}-${optionIndex}`}
                    ghost
                    label={`${String.fromCharCode(65 + optionIndex)}. ${opt}`}
                    onPress={() => setSelected((prev) => ({ ...prev, [index]: optionIndex }))}
                    style={{
                      marginTop: 6,
                      backgroundColor: active ? colors.tealTint : "transparent",
                      borderColor: active ? colors.teal : colors.border,
                    }}
                  />
                );
              })}
            </View>
          </Card>
        ))}

        <Btn label="Submit quiz" disabled={!finished} onPress={submit} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}
