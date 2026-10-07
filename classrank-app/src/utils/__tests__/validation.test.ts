import { isValidEmail, checkPasswordStrength, isNonEmpty } from "../validation";

describe("isValidEmail", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("student@university.edu")).toBe(true);
    expect(isValidEmail("a.b+c@example.co.uk")).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("@no-local-part.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(isValidEmail("  student@university.edu  ")).toBe(true);
  });
});

describe("checkPasswordStrength", () => {
  it("rejects passwords under 8 characters", () => {
    const result = checkPasswordStrength("abc123");
    expect(result.valid).toBe(false);
  });

  it("rejects passwords without a number", () => {
    const result = checkPasswordStrength("abcdefgh");
    expect(result.valid).toBe(false);
  });

  it("rejects passwords without a letter", () => {
    const result = checkPasswordStrength("12345678");
    expect(result.valid).toBe(false);
  });

  it("accepts a valid password", () => {
    const result = checkPasswordStrength("abcd1234");
    expect(result.valid).toBe(true);
  });
});

describe("isNonEmpty", () => {
  it("rejects empty or whitespace-only strings", () => {
    expect(isNonEmpty("")).toBe(false);
    expect(isNonEmpty("   ")).toBe(false);
  });

  it("accepts non-empty strings", () => {
    expect(isNonEmpty("Jordan Smith")).toBe(true);
  });
});
