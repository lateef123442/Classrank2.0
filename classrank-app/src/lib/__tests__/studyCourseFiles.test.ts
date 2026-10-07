import { mergeCourseContent, courseFilePaths, CourseBundle } from "../studyCourseSync";
import { StudyData } from "../studyTypes";

const empty = (): StudyData => ({ subjects: [], topics: [], notes: [], questions: [], attempts: [], cards: [], focus: [], sessions: [], prefs: { setupDone: true } } as any);
let n = 0; const id = () => `id${++n}`;
const bundle = (): CourseBundle => ({
  course: { id: "c1", code: "BIO101", title: "Biology" },
  materials: [
    { id: "m1", topic: "Cells", title: "Slides", kind: "file", body: "c1/a-slides.pdf", file_name: "slides.pdf" },
    { id: "m2", topic: "", title: "Syllabus", kind: "file", body: "c1/b-syllabus.docx", file_name: "syllabus.docx" },
    { id: "m3", topic: "Genetics", title: "Notes", kind: "file", body: "c1/c-genetics.pdf" },
    { id: "m4", topic: "Cells", title: "Text note", kind: "note", body: "Mitosis…" },
  ],
  questions: [], events: [],
});

describe("course files for the student's AI tools", () => {
  const merged = () => mergeCourseContent(empty(), bundle(), id).data as StudyData;
  it("keeps the storage path on file notes only", () => {
    const d = merged();
    expect(d.notes.find((x) => x.remoteId === "m1")?.filePath).toBe("c1/a-slides.pdf");
    expect(d.notes.find((x) => x.remoteId === "m4")?.filePath).toBeUndefined();
  });
  it("picks files for the topic, plus untopiced ones", () => {
    const d = merged(); const sub = d.subjects[0].id; const cells = d.topics.find((t) => t.name === "Cells")!.id;
    expect(courseFilePaths(d, sub, cells).sort()).toEqual(["c1/a-slides.pdf", "c1/b-syllabus.docx"]);
    expect(courseFilePaths(d, sub).length).toBe(3);
    expect(courseFilePaths(d, sub, undefined, 2).length).toBe(2);
  });
  it("returns nothing for a subject that isn't a course", () => {
    const d = merged(); d.subjects.push({ id: "own", name: "Mine" });
    d.notes.push({ id: "x", subjectId: "own", title: "t", body: "b", date: "2026-10-03", filePath: "c1/z.pdf" });
    expect(courseFilePaths(d, "own")).toEqual([]);
  });
});
