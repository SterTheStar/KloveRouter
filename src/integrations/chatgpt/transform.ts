function isAllowedImageUrl(value: string): boolean {
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function chatGptPart(part: any): unknown {
  if (part?.type === "text" || part?.type === "input_text") return part.text ?? "";
  if (part?.type === "image_url" || part?.type === "input_image") {
    const image = part.image_url;
    const url = typeof image === "string" ? image : image?.url ?? part.url;
    if (typeof url === "string" && url && isAllowedImageUrl(url)) {
      return { content_type: "image_url", image_url: { url, ...(image?.detail ? { detail: image.detail } : {}) } };
    }
  }
  return null;
}

export function chatGptContent(content: unknown) {
  if (typeof content === "string") return [{ content_type: "text", parts: [content] }];
  if (!Array.isArray(content)) return [{ content_type: "text", parts: [String(content ?? "")] }];
  const parts = content.map(chatGptPart).filter((part) => part !== null);
  return [{ content_type: parts.some((part) => typeof part !== "string") ? "multimodal_text" : "text", parts }];
}

export function chatGptRequestBody(body: any, model: string, conversationId?: string) {
  const messages = (body?.messages ?? []).map((message: any) => ({
    id: message.id ?? crypto.randomUUID(),
    author: { role: message.role === "tool" ? "tool" : message.role, ...(message.name ? { name: message.name } : {}) },
    content: chatGptContent(message.content)[0],
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
        const data = raw.split(/\r?\n/).filter((item) => item.startsWith("data:")).map((item) => item.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") return;
        let parsed: any; try { parsed = JSON.parse(data); } catch { return; }
        const conversationId = parsed.conversation_id ?? parsed.conversation?.id;
        if (typeof conversationId === "string" && conversationId) onConversationId?.(conversationId);
        if (parsed.error) {
          const error = parsed.error;
          emit({ error: { message: error?.message ?? error?.detail ?? String(error) } });
          return;
        }
        const cumulative = parsed.message?.content?.parts?.filter((part: unknown) => typeof part === "string").join("") ?? parsed.message?.content?.text;
        const delta = parsed.choices?.[0]?.delta?.content ?? parsed.delta ?? parsed.text;
        const text = typeof delta === "string" ? delta : typeof cumulative === "string" ? cumulative.slice(emittedText.length) : undefined;
        if (typeof cumulative === "string") emittedText = cumulative;
        if (typeof text === "string" && text) emit({ ...base, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
        const done = parsed.is_complete || parsed.message?.status === "finished_successfully" || parsed.type === "done" || parsed.choices?.[0]?.finish_reason;
        if (done && !emittedFinish) { emittedFinish = true; emit({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }); }
      };
      try { while (true) { const { done, value } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }); const parts = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = parts.pop() ?? ""; parts.forEach(event); if (done || cancelled) break; } if (!cancelled && buffer.trim()) event(buffer); if (!cancelled) controller.enqueue(encoder.encode("data: [DONE]\n\n")); }
      catch (error: any) { if (!cancelled) emit({ error: { message: error.message } }); }
      finally { if (!cancelled) controller.close(); }
    }, cancel() { cancelled = true; void reader.cancel(); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
