import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PressableScale from "../../components/animated/PressableScale";
import { colors, radius } from "../../theme/colors";
import { useApp } from "../../context/AppContext";
import { fetchTeacherQuestions, upsertQuestion, deleteQuestion } from "../../lib/teacherApi";
import { TeacherQuestion } from "../../types";

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const DATE_QUICK_OPTIONS = [
  { label: "Today", value: todayISO(0) },
  { label: "Tomorrow", value: todayISO(1) },
  { label: "+2 days", value: todayISO(2) },
];

interface FormState {
  id: string | null;
  question: string;
  options: string[];
  correctIndex: number;
  quizDate: string;
}

const emptyForm = (quizDate: string): FormState => ({
  id: null,
  question: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  quizDate,
});

export default function TeacherQuestionsScreen() {
  const { profile } = useApp();
  const [selectedDate, setSelectedDate] = useState(todayISO(0));
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.department_id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTeacherQuestions(profile.department_id, selectedDate);
      setQuestions(result);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load questions.");
    } finally {
      setLoading(false);
    }
  }, [profile?.department_id, selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile || !profile.department_id) return null;

  const startNew = () => {
    setFormError(null);
    setForm(emptyForm(selectedDate));
  };

  const startEdit = (q: TeacherQuestion) => {
    if (q.has_attempts) return;
    setFormError(null);
    setForm({ id: q.id, question: q.question, options: [...q.options], correctIndex: q.correct_index, quizDate: q.quiz_date });
  };

  const updateOption = (index: number, text: string) => {
    if (!form) return;
    const next = [...form.options];
    next[index] = text;
    setForm({ ...form, options: next });
  };

  const addOption = () => {
    if (!form || form.options.length >= 6) return;
    setForm({ ...form, options: [...form.options, ""] });
  };

  const removeOption = (index: number) => {
    if (!form || form.options.length <= 2) return;
    const next = form.options.filter((_, i) => i !== index);
    const nextCorrect = form.correctIndex === index ? 0 : form.correctIndex > index ? form.correctIndex - 1 : form.correctIndex;
    setForm({ ...form, options: next, correctIndex: nextCorrect });
  };

  const handleSave = async () => {
    if (!form || !profile.department_id) return;
    const trimmedOptions = form.options.map((o) => o.trim());
    if (form.question.trim().length === 0) {
      setFormError("Enter the question text.");
      return;
    }
    if (trimmedOptions.some((o) => o.length === 0)) {
      setFormError("Fill in every option, or remove empty ones.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.quizDate)) {
      setFormError("Date must be in YYYY-MM-DD format.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await upsertQuestion({
        id: form.id,
        departmentId: profile.department_id,
        quizDate: form.quizDate,
        question: form.question.trim(),
        options: trimmedOptions,
        correctIndex: form.correctIndex,
      });
      setForm(null);
      load();
    } catch (err: any) {
      setFormError(err?.message ?? "Couldn't save the question.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (q: TeacherQuestion) => {
    if (q.has_attempts) return;
    Alert.alert("Delete this question?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteQuestion(q.id);
            load();
          } catch (err: any) {
            Alert.alert("Couldn't delete", err?.message ?? "Something went wrong.");
          }
        },
      },
    ]);
  };

  if (form) {
    return (
      <SafeAreaView style={styles.safe}>
        <FlatList
          data={[1]}
          keyExtractor={() => "form"}
          contentContainerStyle={styles.container}
          renderItem={() => (
            <View>
              <Text style={styles.title}>{form.id ? "Edit Question" : "New Question"}</Text>

              <Text style={styles.label}>Quiz date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={form.quizDate}
                onChangeText={(t) => setForm({ ...form, quizDate: t })}
                placeholder="2026-07-31"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>Question</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.question}
                onChangeText={(t) => setForm({ ...form, question: t })}
                placeholder="What is..."
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={styles.label}>Options (tap the circle to mark the correct one)</Text>
              {form.options.map((opt, i) => (
                <View key={i} style={styles.optionRow}>
                  <PressableScale
                    style={[styles.radio, form.correctIndex === i && styles.radioSelected]}
                    onPress={() => setForm({ ...form, correctIndex: i })}
                  />
                  <TextInput
                    style={[styles.input, styles.optionInput]}
                    value={opt}
                    onChangeText={(t) => updateOption(i, t)}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={colors.textMuted}
                  />
                  {form.options.length > 2 && (
                    <PressableScale onPress={() => removeOption(i)} style={styles.removeButton}>
                      <Text style={styles.removeButtonText}>✕</Text>
                    </PressableScale>
                  )}
                </View>
              ))}

              {form.options.length < 6 && (
                <PressableScale onPress={addOption} style={styles.addOptionButton}>
                  <Text style={styles.addOptionText}>+ Add option</Text>
                </PressableScale>
              )}

              {formError && <Text style={styles.errorText}>{formError}</Text>}

              <View style={styles.formButtonRow}>
                <PressableScale style={styles.cancelButton} onPress={() => setForm(null)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </PressableScale>
                <PressableScale style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
                </PressableScale>
              </View>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Questions</Text>
        <View style={styles.dateRow}>
          {DATE_QUICK_OPTIONS.map((opt) => (
            <PressableScale
              key={opt.value}
              style={[styles.dateChip, selectedDate === opt.value && styles.dateChipSelected]}
              onPress={() => setSelectedDate(opt.value)}
            >
              <Text style={[styles.dateChipText, selectedDate === opt.value && styles.dateChipTextSelected]}>
                {opt.label}
              </Text>
            </PressableScale>
          ))}
        </View>
        <PressableScale style={styles.newButton} onPress={startNew}>
          <Text style={styles.newButtonText}>+ New Question</Text>
        </PressableScale>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Couldn't load questions</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <PressableScale style={styles.retryButton} onPress={load}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </PressableScale>
        </View>
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(q) => q.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No questions for this date yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{item.question}</Text>
              <Text style={styles.optionsPreview}>
                {item.options.length} options · Correct: {item.options[item.correct_index]}
              </Text>
              <View style={styles.cardFooter}>
                {item.has_attempts ? (
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedBadgeText}>🔒 Answered by students</Text>
                  </View>
                ) : (
                  <View style={styles.cardActions}>
                    <PressableScale onPress={() => startEdit(item)}>
                      <Text style={styles.actionText}>Edit</Text>
                    </PressableScale>
                    <PressableScale onPress={() => handleDelete(item)}>
                      <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                    </PressableScale>
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: "800", color: colors.navy, marginBottom: 12 },
  dateRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  dateChipSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  dateChipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  dateChipTextSelected: { color: "#fff" },
  newButton: { backgroundColor: colors.navy, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  newButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  list: { padding: 20, paddingTop: 8 },
  container: { padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40, fontSize: 13 },
  questionCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  questionText: { fontSize: 14, fontWeight: "700", color: colors.navy, marginBottom: 4 },
  optionsPreview: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  cardFooter: { flexDirection: "row", justifyContent: "flex-end" },
  cardActions: { flexDirection: "row", gap: 20 },
  actionText: { fontSize: 13, fontWeight: "700", color: colors.teal },
  deleteText: { color: colors.danger },
  lockedBadge: { backgroundColor: colors.tealLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  lockedBadgeText: { fontSize: 11, color: colors.navy, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  optionRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  optionInput: { flex: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  radioSelected: { backgroundColor: colors.success, borderColor: colors.success },
  removeButton: { padding: 6 },
  removeButtonText: { color: colors.danger, fontSize: 16, fontWeight: "700" },
  addOptionButton: { marginTop: 4, marginBottom: 8 },
  addOptionText: { color: colors.teal, fontWeight: "600", fontSize: 13 },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 12, textAlign: "center" },
  formButtonRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" },
  saveButton: { flex: 1, backgroundColor: colors.navy, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "700" },
  errorTitle: { fontSize: 18, fontWeight: "800", color: colors.navy, textAlign: "center" },
  errorSubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 8, marginBottom: 20 },
  retryButton: { backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
