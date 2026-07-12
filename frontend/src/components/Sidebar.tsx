import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NotebookPen } from 'lucide-react'

const NAV_ITEMS: { to: string; label: string; icon: ReactNode; isAgentGroup?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/references', label: 'Reference Manager', icon: '▤' },
  { to: '/?agent=search', label: 'Research Agents', icon: '🤖', isAgentGroup: true },
  { to: '/my-chats', label: 'My Chats', icon: '🗂' },
  { to: '/my-notebooks', label: 'My Notebooks', icon: <NotebookPen size={16} /> },
]

// NavLink's built-in isActive only compares pathname, so Dashboard and "Research Agents"
// (both routed to "/") would always match together — compare the `agent` query param too.
// "Research Agents" covers all 3 agent types (its own in-page dropdown switches between
// them, per Dashboard.tsx's AGENTS list), so it's active for *any* agent value, while
// Dashboard is only active when there's no agent param at all.
function isNavItemActive(item: { to: string; isAgentGroup?: boolean }, pathname: string, search: string) {
  const [itemPath] = item.to.split('?')
  if (pathname !== itemPath) return false
  const currentAgent = new URLSearchParams(search).get('agent')
  return item.isAgentGroup ? currentAgent !== null : currentAgent === null
}

export function Sidebar() {
  const location = useLocation()
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="dot" />
        ResearchPilot
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            // NavLink always appends its own pathname-only "active" class even when className
            // is a string, so it must be a function here to fully replace that logic instead.
            className={() =>
              `sidebar-nav-item${isNavItemActive(item, location.pathname, location.search) ? ' active' : ''}`
            }
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar">J</span>
        <div>
          <div className="sidebar-footer-name">Johnson</div>
          <div className="sidebar-footer-email">johnson@example.com</div>
        </div>
      </div>
    </aside>
  )
}
