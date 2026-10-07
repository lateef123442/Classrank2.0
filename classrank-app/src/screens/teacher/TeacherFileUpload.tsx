import React, { useState } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "../../theme/tokens";
import { Btn, Muted, s } from "../../components/study/ui";
import { uploadMaterialFile } from "../../lib/courseApi";
import { validateFile, fmtSize, ALLOWED_EXTENSIONS, PICKER_TYPES } from "../../lib/fileRules";

type Picked = { uri: string; name: string; size: number | null };

/** Pick a document from the phone and attach it to the course as a material. */
export default function TeacherFileUpload({ courseId, topic, onAdded }: { courseId: string; topic: string; onAdded: () => void | Promise<void> }) {
  const [file, setFile] = useState<Picked | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const bad = validateFile(a.name, a.size);
      if (bad) return Alert.alert("Can't use that file", bad);
      setFile({ uri: a.uri, name: a.name, size: a.size ?? null });
      if (!title.trim()) setTitle(a.name.replace(/\.[^.]+$/, "").slice(0, 120));
    } catch (e: any) { Alert.alert("Couldn't open the file picker", e?.message ?? "Try again."); }
  };

  const upload = async () => {
    if (!file || !title.trim() || busy) return;
    setBusy(true);
    try {
      await uploadMaterialFile({ courseId, uri: file.uri, name: file.name, size: file.size, topic: topic.trim(), title: title.trim() });
      setFile(null); setTitle("");
      await onAdded();
    } catch (e: any) { Alert.alert("Couldn't upload", e?.message ?? "Check your connection and try again."); }
    finally { setBusy(false); }
  };

  return (
    <View>
      <Muted>PDF, images, Word, PowerPoint, Excel or text, up to 10 MB. Students open it from the course page. Uses the topic above if you filled it in.</Muted>
      <Btn ghost label={file ? "Choose a different file" : "📎 Choose a file"} onPress={pick} disabled={busy} />
      {file && (
        <>
          <Muted style={{ marginTop: 8 }}>{file.name}{file.size != null ? ` · ${fmtSize(file.size)}` : ""}</Muted>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Title students will see" placeholderTextColor={colors.textFaint} />
          <Btn label={busy ? "Uploading…" : "Upload & add"} disabled={busy || !title.trim()} onPress={upload} />
        </>
      )}
      {!file && <Muted style={{ marginTop: 4 }}>Accepted: {ALLOWED_EXTENSIONS.join(", ")}</Muted>}
    </View>
  );
}
