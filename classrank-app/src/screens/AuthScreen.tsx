import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type, shadow } from "../theme/tokens";
import { useApp } from "../context/AppContext";
import { isValidEmail } from "../utils/validation";
import PressableScale from "../components/animated/PressableScale";

type Mode = "signup" | "teacher" | "login";
const YEARS = [1, 2, 3, 4, 5];

export default function AuthScreen() {
  const { departments, signUp, signUpTeacher, signIn, resetPassword, authError, authLoading, clearAuthError } =
    useApp();
  const [mode, setMode] = useState<Mode>("signup");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("Greenfield University");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const emailLooksValid = isValidEmail(email);

  const canSubmit =
    mode === "login"
      ? emailLooksValid && password.length > 0
      : mode === "signup"
      ? emailLooksValid && password.length >= 8 && name.trim().length > 0 && departmentId !== null && year !== null
      : emailLooksValid &&
        password.length >= 8 &&
        name.trim().length > 0 &&
        departmentId !== null &&
        inviteCode.trim().length > 0;

  const switchMode = (next: Mode) => {
    clearAuthError();
    setMode(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit || authLoading) return;
    if (mode === "login") {
      await signIn(email, password);
    } else if (mode === "signup" && departmentId && year) {
      await signUp({ email, password, name, university, departmentId, year, referralCode: referralCode.trim() || undefined });
    } else if (mode === "teacher" && departmentId) {
      await signUpTeacher({ email, password, name, university, departmentId, inviteCode });
    }
  };

  const handleForgotPassword = async () => {
    await resetPassword(email);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>ClassRank</Text>
        <Text style={styles.subtitle}>Every department. One leaderboard.</Text>

        <View style={styles.modeRow}>
          {(["signup", "teacher", "login"] as Mode[]).map((m) => (
            <PressableScale
              key={m}
              style={[styles.modeButton, mode === m && styles.modeButtonActive]}
              onPress={() => switchMode(m)}
              haptic="selection"
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m === "signup" ? "Student" : m === "teacher" ? "Teacher" : "Log In"}
              </Text>
            </PressableScale>
          ))}
        </View>

        {mode === "teacher" && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              Teacher accounts require an invite code from your department admin. Ask them for one before signing up
              here.
            </Text>
          </View>
        )}

        {(mode === "signup" || mode === "teacher") && (
          <>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Jordan Smith"
              placeholderTextColor={colors.textFaint}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Text style={styles.label}>University</Text>
            <TextInput
              style={styles.input}
              value={university}
              onChangeText={setUniversity}
              placeholder="Your university"
              placeholderTextColor={colors.textFaint}
            />
          </>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@university.edu"
          placeholderTextColor={colors.textFaint}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        {email.length > 0 && !emailLooksValid && <Text style={styles.hintText}>That doesn't look like a valid email.</Text>}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder={mode === "login" ? "Your password" : "At least 8 characters, with a number"}
          placeholderTextColor={colors.textFaint}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {mode === "login" && (
          <PressableScale onPress={handleForgotPassword} style={styles.forgotLink} haptic="none">
            <Text style={styles.forgotLinkText}>Forgot password?</Text>
          </PressableScale>
        )}

        {(mode === "signup" || mode === "teacher") && (
          <>
            <Text style={styles.label}>Department</Text>
            <View style={styles.chipWrap}>
              {departments.map((d) => (
                <PressableScale
                  key={d.id}
                  style={[styles.chip, departmentId === d.id && styles.chipSelected]}
                  onPress={() => setDepartmentId(d.id)}
                  haptic="selection"
                >
                  <Text style={[styles.chipText, departmentId === d.id && styles.chipTextSelected]}>{d.name}</Text>
                </PressableScale>
              ))}
            </View>
            {departments.length === 0 && (
              <Text style={styles.hintText}>Loading departments — if this doesn't fill in, check your connection.</Text>
            )}
          </>
        )}

        {mode === "signup" && (
          <>
            <Text style={styles.label}>Year of study</Text>
            <View style={styles.chipWrap}>
              {YEARS.map((y) => (
                <PressableScale
                  key={y}
                  style={[styles.chip, year === y && styles.chipSelected]}
                  onPress={() => setYear(y)}
                  haptic="selection"
                >
                  <Text style={[styles.chipText, year === y && styles.chipTextSelected]}>Year {y}</Text>
                </PressableScale>
              ))}
            </View>

            <Text style={styles.label}>Referral code (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Got one from a friend? Enter it here"
              placeholderTextColor={colors.textFaint}
              value={referralCode}
              onChangeText={setReferralCode}
              autoCapitalize="characters"
            />
          </>
        )}

        {mode === "teacher" && (
          <>
            <Text style={styles.label}>Invite code</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. A1B2C3D4"
              placeholderTextColor={colors.textFaint}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
            />
          </>
        )}

        {authError && <Text style={styles.errorText}>{authError}</Text>}

        <PressableScale
          style={[styles.button, (!canSubmit || authLoading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || authLoading}
          haptic="medium"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || authLoading }}
        >
          {authLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "login" ? "Log In" : mode === "teacher" ? "Create Teacher Account" : "Create Account"}
            </Text>
          )}
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  title: { ...type.hero, fontSize: 32, lineHeight: 36, color: colors.navy, marginTop: spacing.md },
  subtitle: { ...type.body, color: colors.tealDeep, marginTop: spacing.xs, marginBottom: spacing.xl, fontStyle: "italic" },
  modeRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radii.md, padding: 4, marginBottom: spacing.md, ...shadow.card },
  modeButton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.sm, alignItems: "center" },
  modeButtonActive: { backgroundColor: colors.navy },
  modeText: { fontSize: 13, fontFamily: type.bodyBold.fontFamily, color: colors.textMuted },
  modeTextActive: { color: "#fff" },
  noticeBox: { backgroundColor: colors.violetTint, borderRadius: radii.sm, padding: spacing.md, marginBottom: 4 },
  noticeText: { ...type.caption, color: colors.text, lineHeight: 17 },
  label: { ...type.label, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    fontFamily: type.body.fontFamily,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  hintText: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  forgotLink: { alignSelf: "flex-end", marginTop: spacing.sm },
  forgotLinkText: { fontSize: 13, color: colors.teal, fontFamily: type.bodySemibold.fontFamily },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.text, fontSize: 13, fontFamily: type.bodySemibold.fontFamily },
  chipTextSelected: { color: "#fff" },
  errorText: { color: colors.danger, ...type.caption, marginTop: spacing.lg, textAlign: "center" },
  button: {
    marginTop: spacing.xxl,
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    ...shadow.floating,
  },
  buttonDisabled: { opacity: 0.4, shadowOpacity: 0 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: type.h3.fontFamily },
});
