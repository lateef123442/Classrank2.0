import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing, type } from "../theme/tokens";
import { useApp } from "../context/AppContext";
import PressableScale from "../components/animated/PressableScale";

export default function SetNewPasswordScreen() {
  const { completePasswordRecovery, authError } = useApp();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = password.length >= 8 && password === confirm;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const success = await completePasswordRecovery(password);
    setSubmitting(false);
    if (success) setDone(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{done ? "Password updated ✅" : "Set a new password"}</Text>
        <Text style={styles.subtitle}>
          {done ? "You can now log in with your new password." : "Choose a new password for your account."}
        </Text>

        {!done && (
          <>
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters, with a number"
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter your new password"
              placeholderTextColor={colors.textFaint}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
            />
            {confirm.length > 0 && password !== confirm && (
              <Text style={styles.hintText}>Passwords don't match.</Text>
            )}

            {authError && <Text style={styles.errorText}>{authError}</Text>}

            <PressableScale
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              haptic="medium"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update Password</Text>}
            </PressableScale>
          </>
        )}

        {done && (
          <Text style={styles.doneHint}>
            Close and reopen the app, or it will pick this up automatically in a moment.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, padding: spacing.xxl, justifyContent: "center" },
  title: { ...type.h1, color: colors.navy, textAlign: "center" },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.xxl },
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
  hintText: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  errorText: { ...type.caption, color: colors.danger, marginTop: spacing.lg, textAlign: "center" },
  button: { marginTop: spacing.xxl, backgroundColor: colors.navy, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", ...type.h3 },
  doneHint: { ...type.caption, color: colors.textMuted, textAlign: "center" },
});
