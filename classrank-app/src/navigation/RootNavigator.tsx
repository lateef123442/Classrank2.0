import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { useApp } from "../context/AppContext";

import AuthScreen from "../screens/AuthScreen";
import SetNewPasswordScreen from "../screens/SetNewPasswordScreen";
import OnboardingCarousel, { ONBOARDING_SEEN_KEY } from "../screens/OnboardingCarousel";
import HomeScreen from "../screens/HomeScreen";
import QuizScreen from "../screens/QuizScreen";
import LeaderboardScreen from "../screens/LeaderboardScreen";
import FeedScreen from "../screens/social/FeedScreen";
import CardsScreen from "../screens/CardsScreen";
import ProgressScreen from "../screens/ProgressScreen";
import CompanionScreen from "../screens/CompanionScreen";
import PlannerScreen from "../screens/PlannerScreen";
import StudyScreen from "../screens/StudyScreen";
import ProfileScreen from "../screens/ProfileScreen";
import LearnScreen from "../screens/LearnScreen";
import PracticeScreen from "../screens/PracticeScreen";
import PracticeSessionScreen from "../screens/PracticeSessionScreen";
import SubjectRoomScreen from "../screens/SubjectRoomScreen";
import StudySetupScreen from "../screens/StudySetupScreen";
import { useStudyReminderSync } from "../hooks/useStudyReminderSync";
import { usePushRegistration, usePushTapNavigation } from "../hooks/usePushSync";
import { useStudyCloudSync } from "../hooks/useStudyCloudSync";
import TabIcon from "../components/animated/TabIcon";
import { LoadingScreen } from "../components/animated/Loader";
import CommunityScreen from "../screens/community/CommunityScreen";
import CoursesScreen from "../screens/community/CoursesScreen";
import CourseDetailScreen from "../screens/community/CourseDetailScreen";
import GroupsScreen from "../screens/community/GroupsScreen";
import GroupDetailScreen from "../screens/community/GroupDetailScreen";
import GroupQuizScreen from "../screens/community/GroupQuizScreen";
import ExamScreen from "../screens/community/ExamScreen";
import TeacherCoursesScreen from "../screens/teacher/TeacherCoursesScreen";
import TeacherCourseScreen from "../screens/teacher/TeacherCourseScreen";
import TeacherDashboardScreen from "../screens/teacher/TeacherDashboardScreen";
import TeacherQuestionsScreen from "../screens/teacher/TeacherQuestionsScreen";
import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen";
import AdminDepartmentsScreen from "../screens/admin/AdminDepartmentsScreen";
import AdminUsersScreen from "../screens/admin/AdminUsersScreen";

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Planner: undefined;
  Cards: undefined;
  Progress: undefined;
  Companion: { prompt?: string } | undefined;
  PracticeSession: { mode: "quick" | "topic" | "subject" | "mock" | "daily"; subjectId?: string; topicId?: string };
  Subject: { subjectId: string };
  StudySetup: undefined;
  Community: undefined;
  Courses: undefined;
  Course: { courseId: string };
  Groups: undefined;
  Group: { groupId: string };
  GroupQuiz: { quizId: string };
  Exam: { examId: string; mode?: "take" | "review" };
  TeacherCourse: { courseId: string };
  Teacher: undefined;
  Admin: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Learn: undefined;
  Practice: undefined;
  Study: { subject?: string; notes?: string } | undefined;
  Leaderboard: undefined;
  // Still registered (Home/Practice link to them) but hidden from the tab bar to keep it to six items.
  Quiz: undefined;
  Feed: undefined;
  Profile: undefined;
};

export type TeacherTabParamList = {
  TeacherDashboard: undefined;
  TeacherQuestions: undefined;
  TeacherCourses: undefined;
  Profile: undefined;
};

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminDepartments: undefined;
  AdminUsers: undefined;
  AdminCourses: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const TeacherTab = createBottomTabNavigator<TeacherTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

function MainTabs() {
  useStudyReminderSync();
  useStudyCloudSync();
  usePushRegistration();
  usePushTapNavigation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { paddingBottom: 6, paddingTop: 6, height: 58 },
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: "home",
            Learn: "library",
            Practice: "help-circle",
            Quiz: "help-circle",
            Leaderboard: "trophy",
            Study: "timer",
            Feed: "chatbubbles",
            Profile: "person-circle",
          };
          return <TabIcon name={iconMap[route.name]} size={size} color={color} focused={focused} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Learn" component={LearnScreen} />
      <Tab.Screen name="Practice" component={PracticeScreen} />
      <Tab.Screen name="Study" component={StudyScreen} options={{ title: "Focus" }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Quiz" component={QuizScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function TeacherTabs() {
  return (
    <TeacherTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { paddingBottom: 6, paddingTop: 6, height: 58 },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<keyof TeacherTabParamList, keyof typeof Ionicons.glyphMap> = {
            TeacherDashboard: "stats-chart",
            TeacherQuestions: "create",
            TeacherCourses: "school",
            Profile: "person-circle",
          };
          return <TabIcon name={iconMap[route.name]} size={size} color={color} focused={focused} />;
        },
      })}
    >
      <TeacherTab.Screen name="TeacherDashboard" component={TeacherDashboardScreen} options={{ title: "Dashboard" }} />
      <TeacherTab.Screen name="TeacherQuestions" component={TeacherQuestionsScreen} options={{ title: "Daily quiz" }} />
      <TeacherTab.Screen name="TeacherCourses" component={TeacherCoursesScreen} options={{ title: "Courses" }} />
      <TeacherTab.Screen name="Profile" component={ProfileScreen} />
    </TeacherTab.Navigator>
  );
}

function AdminTabs() {
  return (
    <AdminTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { paddingBottom: 6, paddingTop: 6, height: 58 },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<keyof AdminTabParamList, keyof typeof Ionicons.glyphMap> = {
            AdminDashboard: "speedometer",
            AdminDepartments: "business",
            AdminUsers: "people",
            AdminCourses: "school",
            Profile: "person-circle",
          };
          return <TabIcon name={iconMap[route.name]} size={size} color={color} focused={focused} />;
        },
      })}
    >
      <AdminTab.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: "Dashboard" }} />
      <AdminTab.Screen name="AdminDepartments" component={AdminDepartmentsScreen} options={{ title: "Departments" }} />
      <AdminTab.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: "Users" }} />
      <AdminTab.Screen name="AdminCourses" component={TeacherCoursesScreen} options={{ title: "Courses" }} />
      <AdminTab.Screen name="Profile" component={ProfileScreen} />
    </AdminTab.Navigator>
  );
}

export default function RootNavigator() {
  const { initializing, session, profile, passwordRecoveryMode } = useApp();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then((value) => setHasSeenOnboarding(value === "true"))
      .catch(() => setHasSeenOnboarding(false))
      .finally(() => setOnboardingChecked(true));
  }, []);

  if (initializing || !onboardingChecked) return <LoadingScreen />;

  // Takes priority over everything else: the session Supabase just
  // established from a password-reset deep link is a special recovery
  // session, not a normal login. Show the "set new password" screen
  // regardless of role or auth state until that's resolved.
  if (passwordRecoveryMode) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={SetNewPasswordScreen} />
      </Stack.Navigator>
    );
  }

  const isAuthenticated = !!session && !!profile;

  // Only shown to signed-out, first-time users — an already-authenticated
  // user (e.g. reopening the app) never sees marketing slides again
  // regardless of the stored flag.
  if (!isAuthenticated && !hasSeenOnboarding) {
    return <OnboardingCarousel onDone={() => setHasSeenOnboarding(true)} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", animationDuration: 280 }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ animation: "fade" }} />
      ) : profile.role === "admin" ? (
        <>
          <Stack.Screen name="Admin" component={AdminTabs} />
          <Stack.Screen name="TeacherCourse" component={TeacherCourseScreen} />
        </>
      ) : profile.role === "teacher" ? (
        <>
          <Stack.Screen name="Teacher" component={TeacherTabs} />
          <Stack.Screen name="TeacherCourse" component={TeacherCourseScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Planner" component={PlannerScreen} />
          <Stack.Screen name="Cards" component={CardsScreen} />
          <Stack.Screen name="Progress" component={ProgressScreen} />
          <Stack.Screen name="Companion" component={CompanionScreen} options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="PracticeSession" component={PracticeSessionScreen} options={{ animation: "fade_from_bottom", gestureEnabled: false }} />
          <Stack.Screen name="Subject" component={SubjectRoomScreen} />
          <Stack.Screen name="StudySetup" component={StudySetupScreen} />
          <Stack.Screen name="Community" component={CommunityScreen} />
          <Stack.Screen name="Courses" component={CoursesScreen} />
          <Stack.Screen name="Course" component={CourseDetailScreen} />
          <Stack.Screen name="Groups" component={GroupsScreen} />
          <Stack.Screen name="Group" component={GroupDetailScreen} />
          <Stack.Screen name="GroupQuiz" component={GroupQuizScreen} options={{ animation: "fade_from_bottom", gestureEnabled: false }} />
          <Stack.Screen name="Exam" component={ExamScreen} options={{ animation: "fade_from_bottom", gestureEnabled: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
