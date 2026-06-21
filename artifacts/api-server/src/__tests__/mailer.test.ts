import { escapeHtml, sanitizeHeaderValue } from "../lib/mailer";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes angle brackets to prevent tag injection", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes double quotes to prevent attribute-context breakout", () => {
    expect(escapeHtml('"onmouseover="alert(1)')).toBe(
      "&quot;onmouseover=&quot;alert(1)"
    );
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("It's a trap")).toBe("It&#39;s a trap");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });

  it("handles a combined XSS-style payload safely", () => {
    const input = `<img src=x onerror="alert('xss')">`;
    const escaped = escapeHtml(input);
    expect(escaped).not.toContain("<img");
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("'");
  });
});

describe("sanitizeHeaderValue", () => {
  it("strips CRLF to prevent SMTP header injection", () => {
    expect(sanitizeHeaderValue("Subject\r\nBcc: attacker@evil.com")).toBe(
      "Subject Bcc: attacker@evil.com"
    );
  });

  it("strips bare LF", () => {
    expect(sanitizeHeaderValue("Line1\nLine2")).toBe("Line1 Line2");
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeHeaderValue("  Hello  ")).toBe("Hello");
  });

  it("leaves a normal subject line untouched", () => {
    expect(sanitizeHeaderValue("Your payment receipt")).toBe("Your payment receipt");
  });
});
