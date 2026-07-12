import { Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { ReferenceManager } from './pages/ReferenceManager'
import { ChatThread } from './pages/ChatThread'
import { MyChats } from './pages/MyChats'
import { MyNotebooks } from './pages/MyNotebooks'
import { ReaderPage } from './pages/ReaderPage'

function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/references" element={<ReferenceManager />} />
          <Route path="/papers/:id/read" element={<ReaderPage />} />
          <Route path="/chats/:chatId" element={<ChatThread />} />
          <Route path="/my-chats" element={<MyChats />} />
          <Route path="/my-notebooks" element={<MyNotebooks />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
