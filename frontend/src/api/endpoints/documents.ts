import { apiClient } from "../client";
import type { DocumentChatResponse } from "../types";

export async function askDocument(
  question: string,
  documentIds?: string[],
  topK?: number,
  minScore?: number
): Promise<DocumentChatResponse> {
  return apiClient.post<DocumentChatResponse>("/api/chat", {
    question,
    document_ids: documentIds,
    top_k: topK,
    min_score: minScore,
  });
}

export async function summarizeDocument(
  documentId: string
): Promise<DocumentChatResponse> {
  return apiClient.post<DocumentChatResponse>("/api/chat", {
    question: "Summarize this document",
    document_ids: [documentId],
  });
}
