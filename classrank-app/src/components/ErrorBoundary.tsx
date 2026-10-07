import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius } from "../theme/colors";
import { captureException } from "../lib/errorReporting";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Catches otherwise-uncaught render errors anywhere in the tree below it.
// Without this, a single unexpected null/undefined deep in a screen crashes
// to a blank white screen in production with no way for the user to recover
// short of force-quitting the app.
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app hit an unexpected error. Try again — if it keeps happening, please report it.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: "800", color: colors.navy, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 8, marginBottom: 24 },
  button: { backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
