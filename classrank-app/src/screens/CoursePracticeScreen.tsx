import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Back, Btn, Card, Muted, s } from "../components/study/ui";
import { fetchCoursePracticeSet, checkCoursePracticeAnswer } from "../lib/courseApi";
import { colors, spacing } from "../theme/tokens";

type QuestionItem = {
  id: string;
  q: string;
  options: string[];
  topic: string;
};

export default function CoursePracticeScreen({ navigation, route }: any) {
  const { courseId, topicId } = route.params as { courseId: string; topicId?: string };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const items = await fetchCoursePracticeSet(courseId, topicId, 10);
        if (!active) return;

        if (!items || items.length === 0) {
          setError("No practice questions are available for this topic yet.");
          return;
        }

        setQuestions(items);
      } catch (e: any) {
        setError(e?.message ?? "Couldn't load practice questions.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [courseId, topicId]);

  const current = questions[currentIndex];
  const total = questions.length;

  const submitAnswer = async (optionIndex: number) => {
    if (!current || selected !== null) return;
    setSelected(optionIndex);
    setRevealed(true);

    try {
      const res = await checkCoursePracticeAnswer(current.id, optionIndex);
      if (res.was_correct) {
        setCorrectCount((prev) => prev + 1);
      }
    } catch (e: any) {
      Alert.alert("Couldn't check answer", e?.message ?? "Try again.");
    }
  };

  const next = () => {
    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1);
      setSelected(null);
      setRevealed(false);
    } else {
      setResult({ correct: correctCount, total });
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
          <Text style={s.h1}>Practice unavailable</Text>
          <Muted>{error}</Muted>
        </View>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
          <Back onPress={() => navigation.goBack()} />
          <Text style={s.h1}>Practice summary</Text>

          <Card style={{ marginTop: spacing.sm }}>
            <Text style={s.h3}>{result.correct}/{result.total} correct</Text>
            <Muted>Keep going — each topic helps you get more ready for the course quiz and exam.</Muted>
          </Card>

          <Btn label="Back to course" onPress={() => navigation.goBack()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Course practice</Text>
        <Muted>Question {currentIndex + 1} of {total}</Muted>

        <Card style={{ marginTop: spacing.sm }}>
          <Text style={s.h3}>{current.q}</Text>

          <View style={{ marginTop: spacing.sm }}>
            {current.options.map((option: string, optionIndex: number) => {
              const isSelected = selected === optionIndex;
              return (
                <Btn
                  key={`${current.id}-${optionIndex}`}
                  ghost
                  label={`${String.fromCharCode(65 + optionIndex)}. ${option}`}
                  onPress={() => submitAnswer(optionIndex)}
                  style={{
                    marginTop: 6,
                    backgroundColor: isSelected ? colors.tealTint : "transparent",
                    borderColor: isSelected ? colors.teal : colors.border,
                    opacity: revealed && !isSelected ? 0.7 : 1,
                  }}
                />
              );
            })}
          </View>

          {revealed && (
            <View style={{ marginTop: spacing.md }}>
              <Muted>Answer checked.</Muted>
            </View>
          )}
        </Card>

        {revealed && (
          <Btn label={currentIndex + 1 < total ? "Next question" : "Finish"} onPress={next} style={{ marginTop: spacing.lg }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
