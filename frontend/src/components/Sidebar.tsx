import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/references', label: 'Reference Manager', icon: '▤' },
  { to: '/my-chats', label: 'My Chats', icon: '💬' },
  { to: '/my-notebooks', label: 'My Notebooks', icon: '📓' },
]

export function Sidebar() {
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
            end={item.to === '/'}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
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
