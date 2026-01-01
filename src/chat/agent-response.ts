export type ParsedAgentResponse = {
  shouldRespond: boolean;
  content: string;
};

function stripJsonCodeFence(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

export function parseAgentResponse(content: string): ParsedAgentResponse {
  const cleaned = stripJsonCodeFence(content);
  try {
    const parsed = JSON.parse(cleaned) as { should_respond?: boolean; content?: string };
    return {
      shouldRespond: Boolean(parsed?.should_respond),
      content: typeof parsed?.content === "string" ? parsed.content : "",
    };
  } catch {
    return { shouldRespond: true, content: content.trim() };
  }
}

