import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "../../theme/tokens";
import { useApp } from "../../context/AppContext";
import { Back, Bar, Btn, Card, Chip, Label, Muted, Tag, s, ListSkeleton } from "../../components/study/ui";
import {
  StudyGroup, GroupPost, GroupReply, Challenge, Standing, fetchMyGroups, fetchPosts, createPost, deletePost, fetchReplies, createReply,
  fetchChallenge, fetchStandings, startChallenge, reportChallengeProgress, leaveGroup, deleteGroup,
  GroupQuizSummary, fetchGroupQuizzes, createGroupQuiz, deleteGroupQuiz,
} from "../../lib/groupApi";
import { pickQuizQuestions, MIN_GROUP_QUIZ } from "../../lib/groupQuiz";
import { useStudy, getStudyData, focusMinutesSince, dateStr } from "../../lib/studyStore";

type Kind = GroupPost["kind"];
const KINDS: { k: Kind; label: string }[] = [{ k: "discussion", label: "💬 Discussion" }, { k: "question", label: "❓ Question" }, { k: "resource", label: "📎 Resource" }];
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

export default function GroupDetailScreen({ navigation, route }: any) {
  const { groupId } = route.params as { groupId: string };
  const { profile } = useApp();
  const [group, setGroup] = useState<StudyGroup | null>(null);
  const [posts, setPosts] = useState<GroupPost[] | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [kind, setKind] = useState<Kind>("discussion"), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, GroupReply[]>>({});
  const [reply, setReply] = useState("");
  const [cTitle, setCTitle] = useState("Focus challenge"), [cTarget, setCTarget] = useState(300), [cDays, setCDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const { data: study } = useStudy();
  const [quizzes, setQuizzes] = useState<GroupQuizSummary[] | null>(null); // null = quizzes unavailable (migration 018 not deployed)
  const [qzSubject, setQzSubject] = useState<string | null>(null), [qzCount, setQzCount] = useState(5), [qzTitle, setQzTitle] = useState("");
  const quizzable = study.subjects.filter((x) => study.questions.filter((q) => q.subjectId === x.id).length >= MIN_GROUP_QUIZ);
  const isOwner = !!group && group.owner_id === profile?.id;

  const load = useCallback(async () => {
    try {
      const [gs, ps, ch, qz] = await Promise.all([fetchMyGroups(), fetchPosts(groupId), fetchChallenge(groupId), fetchGroupQuizzes(groupId).catch(() => null)]);
      setQuizzes(qz);
      setGroup(gs.find((g) => g.id === groupId) ?? null); setPosts(ps); setChallenge(ch); setError(null);
      if (ch) {
        // Self-report my focus minutes inside the challenge window, then show everyone's standings.
        if (ch.ends_on >= dateStr()) await reportChallengeProgress(ch.id, focusMinutesSince(getStudyData(), null, ch.starts_on)).catch(() => {});
        setStandings(await fetchStandings(ch.id));
      }
    } catch (e: any) { setError(e?.message ?? "Couldn't load this group."); setPosts((p) => p ?? []); }
  }, [groupId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>, fail: string) => { if (busy) return; setBusy(true); try { await fn(); } catch (e: any) { Alert.alert(fail, e?.message ?? "Try again."); } finally { setBusy(false); } };
  const post = () => act(async () => { await createPost(groupId, kind, title, body); setTitle(""); setBody(""); await load(); }, "Couldn't post");
  const toggle = async (p: GroupPost) => {
    if (open === p.id) return setOpen(null);
    setOpen(p.id); setReply("");
    try { setReplies((r) => ({ ...r, [p.id]: [] })); const rs = await fetchReplies(p.id); setReplies((r) => ({ ...r, [p.id]: rs })); } catch {}
  };
  const sendReply = (p: GroupPost) => act(async () => {
    await createReply(p.id, reply); setReply("");
    setReplies((r) => ({ ...r })); const rs = await fetchReplies(p.id); setReplies((r) => ({ ...r, [p.id]: rs }));
    setPosts((ps) => ps && ps.map((x) => (x.id === p.id ? { ...x, reply_count: rs.length } : x)));
  }, "Couldn't reply");
  const remove = (p: GroupPost) => Alert.alert("Delete post?", "This also removes its replies.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => act(async () => { await deletePost(p.id); await load(); }, "Couldn't delete") }]);
  const leave = () => Alert.alert(isOwner ? "Delete this group?" : "Leave this group?", isOwner ? "All posts and the challenge will be deleted for everyone." : "You can rejoin later with the code.", [
    { text: "Cancel", style: "cancel" },
    { text: isOwner ? "Delete" : "Leave", style: "destructive", onPress: () => act(async () => { await (isOwner ? deleteGroup(groupId) : leaveGroup(groupId)); navigation.goBack(); }, "Couldn't do that") },
  ]);
  const shareQuiz = () => act(async () => {
    const sid = qzSubject ?? quizzable[0]?.id;
    const sub = study.subjects.find((x) => x.id === sid);
    const items = sid ? pickQuizQuestions(study, sid, qzCount) : [];
    if (!sub || !items.length) throw new Error(`You need at least ${MIN_GROUP_QUIZ} questions in a subject to share a quiz.`);
    await createGroupQuiz(groupId, qzTitle.trim() || `${sub.name} quiz`, items);
    setQzTitle("");
    await load();
    Alert.alert("Quiz shared", `${items.length} questions from ${sub.name} are now in the group.`);
  }, "Couldn't share quiz");
  const removeQuiz = (qz: GroupQuizSummary) => Alert.alert("Delete quiz?", "Results are deleted for everyone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => act(() => deleteGroupQuiz(qz.id), "Couldn't delete") }]);
  const newChallenge = () => act(async () => { await startChallenge(groupId, cTitle, cTarget, cDays); await load(); }, "Couldn't start challenge");

  if (error && !group) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><Text style={s.h1}>Group unavailable</Text><Muted style={{ marginTop: 8 }}>{error}</Muted></View></SafeAreaView>;
  if (!posts) return <SafeAreaView style={s.safe}><View style={{ padding: spacing.xl }}><Back onPress={() => navigation.goBack()} /><ListSkeleton /></View></SafeAreaView>;

  const live = challenge && challenge.ends_on >= dateStr();
  const mine = standings.find((x) => x.profile_id === profile?.id)?.minutes ?? 0;
  const shown = posts.filter((p) => filter === "all" || p.kind === filter);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }} keyboardShouldPersistTaps="handled">
        <Back onPress={() => navigation.goBack()} />
        <Text style={s.h1}>{group?.name ?? "Group"}</Text>
        <Muted>{group?.member_count ?? 0} members{group?.description ? ` · ${group.description}` : ""}</Muted>
        {isOwner && group?.join_code && <Card style={{ marginTop: spacing.md, backgroundColor: colors.violetTint, borderWidth: 0 }}><Muted>Invite code</Muted><Text style={s.h2}>{group.join_code}</Text></Card>}

        <Label>CHALLENGE</Label>
        {live ? (
          <Card>
            <Text style={s.h3}>🏁 {challenge!.title}</Text>
            <Muted>{challenge!.target_minutes} focus minutes each · ends {challenge!.ends_on}</Muted>
            <View style={{ marginVertical: spacing.sm }}><Bar value={mine / challenge!.target_minutes} color={colors.violet} /></View>
            <Text style={type.bodyMedium}>You: {mine} / {challenge!.target_minutes} min</Text>
            {standings.slice(0, 5).map((x, i) => <Muted key={x.profile_id} style={{ marginTop: 2 }}>{i + 1}. {x.name}{x.profile_id === profile?.id ? " (you)" : ""} — {x.minutes} min</Muted>)}
            <Muted style={{ marginTop: 6 }}>Minutes come from your own Focus sessions and update when you open this screen.</Muted>
          </Card>
        ) : isOwner ? (
          <Card>
            <Text style={s.h3}>Start a focus challenge</Text>
            <TextInput style={s.input} value={cTitle} onChangeText={setCTitle} placeholder="Title" placeholderTextColor={colors.textFaint} />
            <Muted style={{ marginTop: spacing.sm }}>Minutes each</Muted>
            <View style={[s.row, { marginTop: 6 }]}>{[120, 300, 600].map((m) => <Chip key={m} label={`${m}`} on={cTarget === m} onPress={() => setCTarget(m)} />)}</View>
            <Muted style={{ marginTop: spacing.sm }}>Days</Muted>
            <View style={[s.row, { marginTop: 6 }]}>{[3, 7, 14].map((d) => <Chip key={d} label={`${d}`} on={cDays === d} onPress={() => setCDays(d)} />)}</View>
            <Btn label="Start challenge" onPress={newChallenge} disabled={busy || !cTitle.trim()} />
          </Card>
        ) : <Muted>No active challenge. The owner can start one.</Muted>}

        {quizzes && (
          <>
            <Label>GROUP QUIZZES</Label>
            {quizzes.length === 0 && <Muted>No quizzes yet. Share one made from your own practice questions.</Muted>}
            {quizzes.map((qz) => (
              <Card key={qz.id} style={{ marginTop: spacing.sm }}>
                <Text style={s.h3}>🧠 {qz.title}</Text>
                <Muted>{qz.question_count} questions · by {qz.author_name} · {qz.participants} taken</Muted>
                <View style={[s.row, { marginTop: spacing.sm }]}>
                  <Chip label={qz.my_result ? `Your score: ${qz.my_result.correct}/${qz.my_result.total} · results` : "Take quiz"} on={!qz.my_result} onPress={() => navigation.navigate("GroupQuiz", { quizId: qz.id })} />
                  {(qz.created_by === profile?.id || isOwner) && <Chip label="Delete" on={false} onPress={() => removeQuiz(qz)} />}
                </View>
              </Card>
            ))}
            <Card style={{ marginTop: spacing.sm }}>
              <Text style={s.h3}>Share a quiz</Text>
              {quizzable.length === 0 ? <Muted>Add at least {MIN_GROUP_QUIZ} practice questions to a subject first (Learn → subject → Questions).</Muted> : (
                <>
                  <Muted style={{ marginTop: 4 }}>Questions are picked at random from one of your subjects.</Muted>
                  <View style={[s.row, { marginTop: spacing.sm }]}>{quizzable.map((x) => <Chip key={x.id} label={x.name} on={(qzSubject ?? quizzable[0].id) === x.id} onPress={() => setQzSubject(x.id)} />)}</View>
                  <View style={[s.row, { marginTop: spacing.sm }]}>{[5, 10].map((n) => <Chip key={n} label={`${n} questions`} on={qzCount === n} onPress={() => setQzCount(n)} />)}</View>
                  <TextInput style={s.input} value={qzTitle} onChangeText={setQzTitle} placeholder="Title (optional)" placeholderTextColor={colors.textFaint} />
                  <Btn label="Share with group" onPress={shareQuiz} disabled={busy} />
                </>
              )}
            </Card>
          </>
        )}

        <Label>DISCUSSIONS</Label>
        <View style={s.row}>
          <Chip label="All" on={filter === "all"} onPress={() => setFilter("all")} />
          {KINDS.map((k) => <Chip key={k.k} label={k.label} on={filter === k.k} onPress={() => setFilter(k.k)} />)}
        </View>
        {shown.length === 0 && <Muted style={{ marginTop: spacing.sm }}>Nothing here yet. Start the conversation below.</Muted>}
        {shown.map((p) => (
          <Card key={p.id} style={{ marginTop: spacing.sm }} onPress={() => toggle(p)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Tag label={p.kind} color={p.kind === "question" ? colors.ember : p.kind === "resource" ? colors.violet : colors.teal} />
              <Muted>{p.author_name} · {ago(p.created_at)}</Muted>
            </View>
            <Text style={[s.h3, { marginTop: 6 }]}>{p.title}</Text>
            {!!p.body && <Text style={[type.body, { color: colors.text, marginTop: 4 }]}>{p.body}</Text>}
            <Muted style={{ marginTop: 6 }}>{p.reply_count} repl{p.reply_count === 1 ? "y" : "ies"} · {open === p.id ? "hide" : "tap to open"}</Muted>
            {open === p.id && (
              <View style={{ marginTop: spacing.sm }}>
                {(replies[p.id] ?? []).map((r) => <View key={r.id} style={{ marginTop: 6 }}><Muted>{r.author_name} · {ago(r.created_at)}</Muted><Text style={[type.body, { color: colors.text }]}>{r.body}</Text></View>)}
                <TextInput style={s.input} value={reply} onChangeText={setReply} placeholder="Write a reply…" placeholderTextColor={colors.textFaint} multiline />
                <View style={[s.row, { marginTop: 6 }]}>
                  <Chip label="Reply" on onPress={() => reply.trim() && sendReply(p)} />
                  {(p.author_id === profile?.id || isOwner) && <Chip label="Delete post" on={false} onPress={() => remove(p)} />}
                </View>
              </View>
            )}
          </Card>
        ))}

        <Label>NEW POST</Label>
        <View style={s.row}>{KINDS.map((k) => <Chip key={k.k} label={k.label} on={kind === k.k} onPress={() => setKind(k.k)} />)}</View>
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={kind === "question" ? "Your question" : kind === "resource" ? "Resource title" : "Topic"} placeholderTextColor={colors.textFaint} />
        <TextInput style={[s.input, { minHeight: 80, textAlignVertical: "top" }]} multiline value={body} onChangeText={setBody} placeholder={kind === "resource" ? "Link or description" : "Details (optional)"} placeholderTextColor={colors.textFaint} />
        <Btn label="Post" onPress={post} disabled={busy || !title.trim()} />
        <Btn ghost label={isOwner ? "Delete group" : "Leave group"} onPress={leave} />
      </ScrollView>
    </SafeAreaView>
  );
}
