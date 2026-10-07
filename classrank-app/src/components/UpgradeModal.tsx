import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ActivityIndicator, ScrollView } from "react-native";
import { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { colors, radii, spacing, type, shadow } from "../theme/tokens";
import PressableScale from "./animated/PressableScale";
import { getProOffering, purchasePackage, restorePurchases } from "../lib/purchases";
import { useApp } from "../context/AppContext";
import { track, AnalyticsEvents } from "../lib/analytics";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const BENEFITS = [
  { emoji: "🛡️", title: "Streak Shield", body: "Miss one day without losing your streak — free accounts reset immediately." },
  { emoji: "👑", title: "Pro Badge", body: "A gold crown next to your name on every leaderboard." },
  { emoji: "💜", title: "Support the app", body: "Keeps quizzes free for the whole department." },
];

export default function UpgradeModal({ visible, onClose }: Props) {
  const { refreshProfileAfterPurchase } = useApp();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null); // package identifier being purchased
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSuccess(false);
    setLoadingOffering(true);
    getProOffering()
      .then((o) => {
        setOffering(o);
        if (!o) setError("Subscriptions aren't configured yet — check EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY.");
      })
      .finally(() => setLoadingOffering(false));
  }, [visible]);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(pkg.identifier);
    setError(null);
    const result = await purchasePackage(pkg);
    setPurchasing(null);

    if (result.cancelled) return;
    if (!result.success) {
      setError(result.error ?? "Purchase failed. Try again.");
      return;
    }

    const confirmed = await refreshProfileAfterPurchase();
    setSuccess(true);
    track(AnalyticsEvents.PURCHASE_COMPLETED, { package_id: pkg.identifier, db_confirmed: confirmed });
    if (!confirmed) {
      // Purchase genuinely succeeded (Apple/Google already charged) — this
      // just means our DB mirror hasn't caught up yet. Say so plainly
      // rather than implying something went wrong.
      setError("Purchase complete — your Pro status will appear within a minute.");
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    const info = await restorePurchases();
    setRestoring(false);
    if (!info) {
      setError("Couldn't restore purchases. Try again.");
      return;
    }
    const confirmed = await refreshProfileAfterPurchase();
    if (confirmed) {
      setSuccess(true);
    } else {
      setError("No active subscription found on this account.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Go Pro</Text>

            {BENEFITS.map((b) => (
              <View key={b.title} style={styles.benefitRow}>
                <Text style={styles.benefitEmoji}>{b.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitBody}>{b.body}</Text>
                </View>
              </View>
            ))}

            {success ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>🎉 You're Pro! Welcome to the club.</Text>
              </View>
            ) : loadingOffering ? (
              <ActivityIndicator color={colors.teal} style={{ marginVertical: spacing.xl }} />
            ) : offering && offering.availablePackages.length > 0 ? (
              offering.availablePackages.map((pkg) => (
                <PressableScale
                  key={pkg.identifier}
                  style={styles.packageButton}
                  onPress={() => handlePurchase(pkg)}
                  disabled={purchasing !== null}
                  haptic="medium"
                >
                  {purchasing === pkg.identifier ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.packageTitle}>{pkg.product.title || "ClassRank Pro"}</Text>
                      <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
                    </>
                  )}
                </PressableScale>
              ))
            ) : (
              <Text style={styles.notConfiguredText}>
                Subscriptions aren't set up yet in this build. See the README's "Monetization" section.
              </Text>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <PressableScale onPress={handleRestore} style={styles.restoreButton} haptic="none" disabled={restoring}>
              {restoring ? (
                <ActivityIndicator color={colors.teal} size="small" />
              ) : (
                <Text style={styles.restoreText}>Restore Purchases</Text>
              )}
            </PressableScale>

            <PressableScale onPress={onClose} style={styles.closeButton} haptic="light">
              <Text style={styles.closeText}>{success ? "Done" : "Not Now"}</Text>
            </PressableScale>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,22,44,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xxl,
    maxHeight: "85%",
    ...shadow.floating,
  },
  title: { ...type.hero, fontSize: 28, color: colors.navy, marginBottom: spacing.xl, textAlign: "center" },
  benefitRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg, gap: spacing.md },
  benefitEmoji: { fontSize: 26 },
  benefitTitle: { ...type.h3, color: colors.text },
  benefitBody: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  successBox: { backgroundColor: colors.successTint, borderRadius: radii.md, padding: spacing.lg, marginVertical: spacing.lg, alignItems: "center" },
  successText: { ...type.h3, color: colors.success },
  packageButton: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.md,
  },
  packageTitle: { color: "#fff", ...type.h3 },
  packagePrice: { color: "rgba(255,255,255,0.75)", ...type.caption, marginTop: 2 },
  notConfiguredText: { ...type.caption, color: colors.textMuted, textAlign: "center", marginVertical: spacing.lg },
  errorText: { ...type.caption, color: colors.danger, textAlign: "center", marginTop: spacing.md },
  restoreButton: { alignItems: "center", marginTop: spacing.xl, paddingVertical: spacing.sm },
  restoreText: { ...type.caption, color: colors.teal, fontFamily: type.bodySemibold.fontFamily },
  closeButton: { alignItems: "center", marginTop: spacing.sm, paddingVertical: spacing.md },
  closeText: { ...type.caption, color: colors.textMuted },
});
