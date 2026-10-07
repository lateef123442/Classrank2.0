import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, type, shadow } from "../theme/tokens";
import { useApp } from "../context/AppContext";
import PressableScale from "../components/animated/PressableScale";
import AnimatedNumber from "../components/animated/AnimatedNumber";
import ConfettiBurst from "../components/animated/ConfettiBurst";
import { track, AnalyticsEvents } from "../lib/analytics";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParamList } from "../navigation/RootNavigator";

type Props = BottomTabScreenProps<MainTabParamList, "Quiz">;

function ProgressBar({ progress }: { progress: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(progress, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [progress]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, style]} />
    </View>
  );
}

export default function QuizScreen({ navigation }: Props) {
  const {
    profile,
    todaysQuestions,
    answeredQuestionIds,
    hasCompletedTodaysQuiz,
    submitAnswer,
    quizLoading,
    quizError,
    refreshTodaysQuestions,
  } = useApp();

  // Freeze the queue when the session starts. Answering updates
  // answeredQuestionIds, which would otherwise shrink this list mid-quiz,
  // skip questions and flash the "done" screen before the results.
  const queueRef = useRef<typeof todaysQuestions | null>(null);
  if (queueRef.current === null && !quizLoading && todaysQuestions.length > 0) {
    const pending = todaysQuestions.filter((q) => !answeredQuestionIds.has(q.id));
    if (pending.length > 0) queueRef.current = pending;
  }
  const pendingQuestions = queueRef.current ?? [];

  const [pointer, setPointer] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [pointsThisSession, setPointsThisSession] = useState(0);
  const [grading, setGrading] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (sessionFinished && pendingQuestions.length > 0 && correctCount === pendingQuestions.length) {
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const timer = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [sessionFinished]);

  if (!profile) return null;

  if (quizLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (quizError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.doneTitle}>Something went wrong</Text>
          <Text style={styles.doneSubtitle}>{quizError}</Text>
          <PressableScale style={styles.homeButton} onPress={refreshTodaysQuestions}>
            <Text style={styles.homeButtonText}>Try Again</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  if (todaysQuestions.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.doneTitle}>No quiz available yet</Text>
          <Text style={styles.doneSubtitle}>
            Nothing has been published for {profile.department} today — check back soon.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (pendingQuestions.length === 0 && !sessionFinished) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Today's quiz is done</Text>
          <Text style={styles.doneSubtitle}>Come back tomorrow to keep your streak alive.</Text>
          <PressableScale style={styles.homeButton} onPress={() => navigation.navigate("Home")}>
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const current = pendingQuestions[pointer];

  const handleSelect = async (optionIndex: number) => {
    if (selected !== null || grading) return;
    setSelected(optionIndex);
    setGrading(true);

    const result = await submitAnswer(current.id, optionIndex);

    setGrading(false);
    if (!result) {
      setSelected(null);
      return;
    }

    setCorrectIndex(result.correct_index);
    Haptics.notificationAsync(
      result.is_correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    if (result.is_correct) setCorrectCount((c) => c + 1);
    setPointsThisSession((p) => p + result.points_earned);
  };

  const handleNext = () => {
    if (pointer + 1 < pendingQuestions.length) {
      setPointer((p) => p + 1);
      setSelected(null);
      setCorrectIndex(null);
    } else {
      setSessionFinished(true);
      track(AnalyticsEvents.QUIZ_COMPLETED, {
        correct_count: correctCount,
        total_count: pendingQuestions.length,
        points_earned: pointsThisSession,
        department: profile?.department,
      });
    }
  };

  if (sessionFinished) {
    const perfect = correctCount === pendingQuestions.length;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ConfettiBurst active={showConfetti} />
          <Text style={styles.resultEmoji}>{perfect ? "🏆" : "📚"}</Text>
          <Text style={styles.doneTitle}>
            {correctCount}/{pendingQuestions.length} correct
          </Text>
          <View style={styles.pointsRow}>
            <Text style={styles.pointsPlus}>+</Text>
            <AnimatedNumber value={pointsThisSession} style={styles.pointsValue} duration={800} />
            <Text style={styles.pointsLabel}> points</Text>
          </View>
          <PressableScale style={styles.homeButton} onPress={() => navigation.navigate("Leaderboard")} haptic="medium">
            <Text style={styles.homeButtonText}>View Leaderboard</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.progressHeader}>
          <Text style={styles.progress}>
            Question {pointer + 1} of {pendingQuestions.length}
          </Text>
          <Text style={styles.progressDept}>{profile.department}</Text>
        </View>
        <ProgressBar progress={(pointer + (correctIndex !== null ? 1 : 0)) / pendingQuestions.length} />

        <Text style={styles.question}>{current.question}</Text>

        {current.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrectOption = correctIndex === i;
          const showState = correctIndex !== null;
          return (
            <PressableScale
              key={i}
              style={[
                styles.option,
                showState && isCorrectOption && styles.optionCorrect,
                showState && isSelected && !isCorrectOption && styles.optionWrong,
              ]}
              onPress={() => handleSelect(i)}
              disabled={selected !== null || grading}
              haptic="none"
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: selected !== null || grading }}
              accessibilityLabel={`Option ${i + 1}: ${opt}`}
            >
              <Text
                style={[
                  styles.optionText,
                  showState && (isCorrectOption || (isSelected && !isCorrectOption)) && styles.optionTextActive,
                ]}
              >
                {opt}
              </Text>
              {showState && isCorrectOption && <Text style={styles.optionIcon}>✓</Text>}
              {showState && isSelected && !isCorrectOption && <Text style={styles.optionIcon}>✕</Text>}
            </PressableScale>
          );
        })}

        {grading && (
          <View style={styles.gradingRow}>
            <ActivityIndicator color={colors.teal} size="small" />
            <Text style={styles.gradingText}>Checking...</Text>
          </View>
        )}

        {correctIndex !== null && !grading && (
          <PressableScale style={styles.nextButton} onPress={handleNext} haptic="medium">
            <Text style={styles.nextButtonText}>
              {pointer + 1 < pendingQuestions.length ? "Next Question" : "See Results"}
            </Text>
          </PressableScale>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, padding: spacing.xl },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: spacing.sm, marginBottom: spacing.sm },
  progress: { ...type.label, color: colors.textMuted },
  progressDept: { ...type.caption, color: colors.textFaint },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden", marginBottom: spacing.xl },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.teal },
  question: { ...type.h1, color: colors.text, marginBottom: spacing.xl },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  optionCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  optionWrong: { backgroundColor: colors.danger, borderColor: colors.danger },
  optionText: { ...type.bodyMedium, color: colors.text, flex: 1 },
  optionTextActive: { color: "#fff" },
  optionIcon: { color: "#fff", fontSize: 16, fontFamily: type.h3.fontFamily, marginLeft: spacing.sm },
  gradingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  gradingText: { marginLeft: spacing.sm, color: colors.textMuted, ...type.caption },
  nextButton: { marginTop: spacing.md, backgroundColor: colors.navy, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  nextButtonText: { color: "#fff", ...type.h3 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxxl },
  resultEmoji: { fontSize: 52, marginBottom: spacing.md },
  doneEmoji: { fontSize: 40, marginBottom: spacing.md },
  doneTitle: { ...type.h1, color: colors.text, textAlign: "center" },
  doneSubtitle: { ...type.body, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.xl },
  pointsRow: { flexDirection: "row", alignItems: "baseline", marginBottom: spacing.xxl },
  pointsPlus: { ...type.h1, color: colors.teal },
  pointsValue: { ...type.hero, fontSize: 32, color: colors.teal },
  pointsLabel: { ...type.body, color: colors.textMuted },
  homeButton: { backgroundColor: colors.teal, borderRadius: radii.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl },
  homeButtonText: { color: "#fff", ...type.h3 },
});
