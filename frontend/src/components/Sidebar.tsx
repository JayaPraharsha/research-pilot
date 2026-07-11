import { NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/references', label: 'Reference Manager', icon: '▤' },
  { to: '/?agent=search', label: 'AI Search', icon: '🔍' },
  { to: '/?agent=chat_with_pdf', label: 'Chat with PDF', icon: '💬' },
  { to: '/?agent=deep_research', label: 'Deep Research Report', icon: '📄' },
  { to: '/my-chats', label: 'My Chats', icon: '🗂' },
  { to: '/my-notebooks', label: 'My Notebooks', icon: '📓' },
]

// NavLink's built-in isActive only compares pathname, so every "/?agent=..." item
// (plus Dashboard itself) would all match at once — compare the `agent` query param too.
function isNavItemActive(itemTo: string, pathname: string, search: string) {
  const [itemPath, itemQuery] = itemTo.split('?')
  if (pathname !== itemPath) return false
  const currentAgent = new URLSearchParams(search).get('agent')
  const itemAgent = itemQuery ? new URLSearchParams(itemQuery).get('agent') : null
  return currentAgent === itemAgent
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
              `sidebar-nav-item${isNavItemActive(item.to, location.pathname, location.search) ? ' active' : ''}`
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
