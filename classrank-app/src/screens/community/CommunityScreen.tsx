import React from "react";
import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { spacing, colors } from "../../theme/tokens";
import { Back, Card, Muted, s } from "../../components/study/ui";

export default function CommunityScreen({ navigation }: any) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>Community</Text>
        <Muted style={{ marginTop: 4 }}>Study with your classmates and keep up with your courses.</Muted>
        <Card style={{ marginTop: spacing.lg, backgroundColor: colors.tealTint, borderWidth: 0 }} onPress={() => navigation.navigate("Courses")}>
          <Text style={s.h3}>🎓 My courses</Text>
          <Muted>Join with your teacher's code: announcements, exam dates, and practice questions that land in your study plan.</Muted>
        </Card>
        <Card style={{ backgroundColor: colors.violetTint, borderWidth: 0 }} onPress={() => navigation.navigate("Groups")}>
          <Text style={s.h3}>👥 Study groups</Text>
          <Muted>Discussions, questions, shared resources, and focus-time challenges with friends.</Muted>
        </Card>
        <Card onPress={() => navigation.navigate("Feed")}>
          <Text style={s.h3}>💬 Department feed</Text>
          <Muted>Posts from your department and campus.</Muted>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
