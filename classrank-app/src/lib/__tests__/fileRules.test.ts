import { validateFile, safeFileName, storagePath, mimeFor, fmtSize, MAX_FILE_BYTES } from "../fileRules";

describe("file rules", () => {
  it("allows documents and images, rejects scripts and web pages", () => {
    expect(validateFile("notes.pdf", 1000)).toBeNull();
    expect(validateFile("Slides.PPTX", 1000)).toBeNull();
    expect(validateFile("evil.html", 10)).toMatch(/supported/);
    expect(validateFile("pic.svg", 10)).toMatch(/supported/);
    expect(validateFile("run.exe", 10)).toMatch(/supported/);
    expect(validateFile("noextension", 10)).toMatch(/supported/);
  });
  it("enforces size", () => {
    expect(validateFile("a.pdf", MAX_FILE_BYTES)).toBeNull();
    expect(validateFile("a.pdf", MAX_FILE_BYTES + 1)).toMatch(/limit/);
    expect(validateFile("a.pdf", 0)).toMatch(/empty/);
    expect(validateFile("a.pdf", null)).toBeNull();
  });
  it("derives the MIME type from the extension", () => {
    expect(mimeFor("a.jpeg")).toBe("image/jpeg");
    expect(mimeFor("x.docx")).toMatch(/wordprocessingml/);
    expect(mimeFor("x.zip")).toBeNull();
  });
  it("sanitises names", () => {
    expect(safeFileName("../../My Notes (final)!.pdf")).toBe("My_Notes_final.pdf");
    expect(safeFileName("...pdf")).toBe("file.pdf");
    expect(safeFileName("résumé.docx")).toBe("resume.docx");
    expect(safeFileName("a/b\\c.txt")).toBe("a_b_c.txt");
    expect(storagePath("c1", "u1", "My Notes.pdf")).toBe("c1/u1-My_Notes.pdf");
    expect(storagePath("c1", "u1", "x".repeat(200) + ".pdf").length).toBeLessThan(80);
  });
  it("formats sizes", () => {
    expect(fmtSize(500)).toBe("500 B");
    expect(fmtSize(2048)).toBe("2 KB");
    expect(fmtSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});
