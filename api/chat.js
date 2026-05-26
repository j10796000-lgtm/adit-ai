const systemPrompt = `You are Adit AI, a research-focused assistant. Behave like a search engine with judgment:
- answer directly first, then explain evidence and tradeoffs
- cite sources when web search is available
- flag uncertainty and dated information
- use attached file excerpts as primary evidence when relevant
- never claim the stored vault is server-readable; the client encrypts saved chats locally`;

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { query = "", history = [], attachments = [], search = true } = request.body || {};
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!key) {
    response.status(200).json({
      answer: demoAnswer(query, attachments),
      sources: [],
      demo: true,
    });
    return;
  }

  const fileContext = attachments
    .map((file) => {
      const body = file.text
        ? file.text
        : `[${file.name}: ${file.type || "unknown"} file, ${file.size || 0} bytes. No text preview was available.]`;
      return `\n--- Attachment: ${file.name} ---\n${body}`;
    })
    .join("\n");

  const recentHistory = history
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "Adit AI" : "User"}: ${item.content}`)
    .join("\n\n");

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `${recentHistory ? `Recent conversation:\n${recentHistory}\n\n` : ""}Current research request:\n${query}${
            fileContext ? `\n\nUse these attached file excerpts when useful:${fileContext}` : ""
          }`,
        },
      ],
    },
  ];

  const body = {
    model,
    instructions: systemPrompt,
    input,
    store: false,
    temperature: 0.25,
    tools: search ? [{ type: "web_search_preview", search_context_size: "medium" }] : [],
    include: search ? ["web_search_call.action.sources"] : [],
  };

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await aiResponse.json();
  if (!aiResponse.ok) {
    response.status(aiResponse.status).json({
      answer: payload.error?.message || "The AI provider returned an error.",
      sources: [],
    });
    return;
  }

  response.status(200).json({
    answer: extractText(payload),
    sources: extractSources(payload),
  });
};

function demoAnswer(query, attachments) {
  const fileLine = attachments.length
    ? `\n\nI also detected ${attachments.length} attached file${attachments.length === 1 ? "" : "s"}: ${attachments
        .map((file) => file.name)
        .join(", ")}. Text-based attachments will be included in the research prompt once an API key is configured.`
    : "";
  return `Adit AI is deployed in secure demo mode. Add OPENAI_API_KEY in Vercel to enable live AI answers and web research.\n\nYour query was: "${query || "No query provided"}".${fileLine}\n\nThe encrypted vault, sign-in slide, file attachment flow, research workspace, and Vercel API route are ready.`;
}

function extractText(payload) {
  if (payload.output_text) return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n\n") || "No text response was returned.";
}

function extractSources(payload) {
  const sources = [];
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.url && !seen.has(value.url)) {
      seen.add(value.url);
      sources.push({ url: value.url, title: value.title || value.url });
    }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return sources.slice(0, 8);
}
