import { api } from './client'
import type { Notebook } from './types'

export const notebooksApi = {
  list: () => api.get<Notebook[]>('/notebooks'),
  get: (id: string) => api.get<Notebook & { messagesSnapshot: { role: string; content: string }[] }>(
    `/notebooks/${id}`,
  ),
  create: (chatId: string, title: string) => api.post<Notebook>('/notebooks', { chatId, title }),
  rename: (id: string, title: string) => api.patch<Notebook>(`/notebooks/${id}`, { title }),
  remove: (id: string) => api.delete(`/notebooks/${id}`),
}
