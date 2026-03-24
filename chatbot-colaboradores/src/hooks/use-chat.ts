import { useState, useRef, useCallback } from "react";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export function useChat() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isEvaluationComplete, setIsEvaluationComplete] = useState(false);

  // Parse SSE Stream manually because EventSource doesn't support POST/body
  const sendMessage = useCallback(async (content: string, currentConvId: number) => {
    if (!content.trim()) return;

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // 1. Optimistic UI update for User
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content },
      { id: assistantMsgId, role: "assistant", content: "" }, // Placeholder for stream
    ]);
    
    setIsTyping(true);

    try {
      const response = await fetch(`/api/openai/conversations/${currentConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to send message");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantFullResponse = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.done) {
                  done = true;
                } else if (data.content) {
                  assistantFullResponse += data.content;
                  
                  // Update the placeholder message with streamed content
                  setMessages((prev) => 
                    prev.map((msg) => 
                      msg.id === assistantMsgId 
                        ? { ...msg, content: assistantFullResponse }
                        : msg
                    )
                  );
                }
              } catch (e) {
                // Ignore partial JSON parse errors from chunking
                console.warn("Failed to parse chunk", line);
              }
            }
          }
        }
      }

      setIsTyping(false);

      // Only mark complete when the AI sends the exact report marker
      if (assistantFullResponse.includes("---REPORTE_INICIO---")) {
        setIsEvaluationComplete(true);
      }

    } catch (error) {
      console.error("Chat error:", error);
      setIsTyping(false);
      // Remove placeholder on error
      setMessages((prev) => prev.filter(msg => msg.id !== assistantMsgId));
    }
  }, [messages.length]);

  const resetChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setIsEvaluationComplete(false);
    setIsTyping(false);
  }, []);

  return {
    conversationId,
    setConversationId,
    messages,
    isTyping,
    sendMessage,
    isEvaluationComplete,
    resetChat
  };
}
