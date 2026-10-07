// Parses pasted multiple-choice questions so a teacher can add many at once. Pure + tested.
//
//   Q: What is the root of a tree?          (also "1." / "Question 1:")
//   A) The top node                          (also "A." "A:" "(A)")
//   B) A leaf
//   C) An edge
//   D) A cycle
//   Answer: A
//   Why: The root has no parent.             (optional; also "Explanation:")
//   Topic: Trees                             (optional)
//
// Questions are separated by a blank line.
export interface ParsedQuestion { topic: string; question: string; options: string[]; correctIndex: number; explanation: string }
export interface ParseResult { questions: ParsedQuestion[]; errors: { block: number; message: string }[] }

const L = "ABCD";

export function parseQuestionBlocks(text: string): ParseResult {
  const out: ParseResult = { questions: [], errors: [] };
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  blocks.forEach((block, bi) => {
    const q: string[] = [];
    const opts: string[] = ["", "", "", ""];
    let ans = -1, why = "", topic = "", cur = -1;
    let mode: "q" | "opt" | "why" | "none" = "q";
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(?:answer|ans|correct)\s*[:=\-]\s*\(?([A-Da-d])\)?(?![A-Za-z])/i))) { ans = L.indexOf(m[1].toUpperCase()); mode = "none"; continue; }
      if ((m = line.match(/^(?:why|explanation|reason)\s*[:\-]\s*(.*)$/i))) { why = m[1].trim(); mode = "why"; continue; }
      if ((m = line.match(/^topic\s*[:\-]\s*(.*)$/i))) { topic = m[1].trim(); mode = "none"; continue; }
      // An option line only counts once there's question text, so "A. Smith discovered…" as a first line stays a question.
      if (q.length > 0 && (m = line.match(/^\(?([A-Da-d])[\).:\-]\s+(.*)$/))) { cur = L.indexOf(m[1].toUpperCase()); opts[cur] = m[2].trim(); mode = "opt"; continue; }
      if (mode === "q") q.push(line.replace(/^(?:q(?:uestion)?\s*\d*\s*[:.)\-]|\d+\s*[.)])\s*/i, ""));
      else if (mode === "opt" && cur >= 0) opts[cur] = `${opts[cur]} ${line}`;
      else if (mode === "why") why = `${why} ${line}`;
    }
    const question = q.join(" ").trim();
    const fail = (message: string) => out.errors.push({ block: bi + 1, message });
    if (!question) return fail("Missing the question text");
    const missing = opts.findIndex((o) => !o.trim());
    if (missing >= 0) return fail(`Missing option ${L[missing]}`);
    if (ans < 0) return fail('Missing the "Answer: B" line');
    out.questions.push({ topic, question, options: opts.map((o) => o.trim()), correctIndex: ans, explanation: why.trim() });
  });
  return out;
}
