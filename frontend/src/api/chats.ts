import { fetchEventSource } from '@microsoft/fetch-event-source'
import { api } from './client'
import type { Chat, ChatSummary } from './types'

export const chatsApi = {
  list: () => api.get<ChatSummary[]>('/chats'),
  get: (id: string) => api.get<Chat>(`/chats/${id}`),
  create: (sourcePaperIds: string[], title?: string) =>
    api.post<Chat>('/chats', { sourcePaperIds, title }),
  rename: (id: string, title: string) => api.patch<Chat>(`/chats/${id}`, { title }),
  remove: (id: string) => api.delete(`/chats/${id}`),
  addSource: (id: string, paperId: string) => api.post<Chat>(`/chats/${id}/sources`, { paperId }),

  streamMessage: (
    chatId: string,
    content: string,
    handlers: { onDelta: (text: string) => void; onDone: (fullText: string) => void; onError: (err: unknown) => void },
  ) => {
    const controller = new AbortController()
    fetchEventSource(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: controller.signal,
      onmessage(ev) {
        const payload = JSON.parse(ev.data) as { delta?: string; done?: boolean; content?: string }
        if (payload.delta) handlers.onDelta(payload.delta)
        if (payload.done) handlers.onDone(payload.content ?? '')
      },
      onerror(err) {
        handlers.onError(err)
        throw err // stop retrying
      },
    })
    return controller
  },
}
