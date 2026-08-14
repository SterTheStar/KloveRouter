export function chatGptContent(content: unknown) {
  if (typeof content === "string") return [{ content_type: "text", parts: [content] }];
  if (!Array.isArray(content)) return [{ content_type: "text", parts: [String(content ?? "")] }];
  const text = content.filter((part: any) => part?.type === "text" || part?.type === "input_text").map((part: any) => part.text ?? "").join("\n");
  return [{ content_type: "text", parts: [text] }];
}

export function chatGptRequestBody(body: any, model: string, conversationId?: string) {
  const messages = (body?.messages ?? []).map((message: any) => ({
    id: message.id ?? crypto.randomUUID(),
    author: { role: message.role === "tool" ? "tool" : message.role, ...(message.name ? { name: message.name } : {}) },
    content: { content_type: "text", parts: chatGptContent(message.content).flatMap((part: any) => part.parts) },
    ...(message.metadata ? { metadata: message.metadata } : {}),
  }));
  const requestMessages = messages.length ? messages : [{ id: crypto.randomUUID(), author: { role: "user" }, content: { content_type: "text", parts: [""] } }];
  return {
    action: "next",
    messages: requestMessages,
    parent_message_id: crypto.randomUUID(),
    ...(conversationId ? { conversation_id: conversationId } : {}),
    model,
    timezone_offset_min: new Date().getTimezoneOffset(),
    history_and_training_disabled: true,
    ...(body?.tools?.length ? { tools: body.tools } : {}),
  };
}

export function chatgptStreamToOpenAI(
  response: Response,
  model: string,
  onConversationId?: (conversationId: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ChatGPT returned an empty response");
  const decoder = new TextDecoder(); const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID()}`; let buffer = ""; let cancelled = false; let emittedFinish = false;
  return new Response(new ReadableStream({
    async start(controller) {
      const emit = (payload: any) => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); };
      const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model };
      let emittedText = "";
      const event = (raw: string) => {
        const line = raw.split(/\r?\n/).find((item) => item.startsWith("data:")); const data = line?.slice(5).trim();
        if (!data || data === "[DONE]") return;
        let parsed: any; try { parsed = JSON.parse(data); } catch { return; }
        const conversationId = parsed.conversation_id ?? parsed.conversation?.id;
        if (typeof conversationId === "string" && conversationId) onConversationId?.(conversationId);
        if (parsed.error) { emit({ error: { message: parsed.error.message ?? String(parsed.error) } }); return; }
        const cumulative = parsed.message?.content?.parts?.join("") ?? parsed.message?.content?.text;
        const text =
          typeof parsed.delta === "string" || typeof parsed.text === "string"
            ? parsed.delta ?? parsed.text
            : typeof cumulative === "string"
              ? cumulative.slice(emittedText.length)
              : undefined;
        if (typeof cumulative === "string") emittedText = cumulative;
        if (typeof text === "string" && text) emit({ ...base, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
        const done = parsed.is_complete || parsed.message?.status === "finished_successfully" || parsed.type === "done";
        if (done && !emittedFinish) { emittedFinish = true; emit({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }); }
      };
      try { while (true) { const { done, value } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }); const parts = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = parts.pop() ?? ""; parts.forEach(event); if (done || cancelled) break; } if (!cancelled && buffer.trim()) event(buffer); if (!cancelled) controller.enqueue(encoder.encode("data: [DONE]\n\n")); }
      catch (error: any) { if (!cancelled) emit({ error: { message: error.message } }); }
      finally { if (!cancelled) controller.close(); }
    }, cancel() { cancelled = true; void reader.cancel(); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
