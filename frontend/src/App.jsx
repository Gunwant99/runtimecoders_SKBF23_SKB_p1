import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import DataInput from './pages/DataInput';
import CsvUpload from './pages/CsvUpload';

const tabs = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'input',     label: '✏️ Manual Input' },
  { id: 'csv',       label: '📂 CSV Upload' },
];

export default function App() {
  const [active, setActive] = useState('dashboard');

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🌍</span>
          <div>
            <p style={styles.logoTitle}>Carbon Intelligence</p>
            <p style={styles.logoSub}>ESG Reporting OS</p>
          </div>
        </div>

        <nav style={styles.nav}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActive(t.id)}
              style={{ ...styles.navBtn, ...(active === t.id ? styles.navBtnActive : {}) }}>
              {t.label}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <p style={styles.footerText}>Powered by Groq + LLaMA 3.1</p>
          <div style={styles.dot} />
        </div>
      </aside>

      {/* Main */}
      <div style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>{tabs.find(t => t.id === active)?.label}</h1>
            <p style={styles.pageDate}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div style={styles.headerBadge}>🟢 System Online</div>
        </header>

        <main style={styles.content}>
          {active === 'dashboard' && <Dashboard />}
          {active === 'input'     && <DataInput />}
          {active === 'csv'       && <CsvUpload />}
        </main>
      </div>
    </div>
  );
}

const styles = {
  root:         { display: 'flex', minHeight: '100vh', background: '#020817', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' },
  sidebar:      { width: 220, background: '#0a0f1e', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0 },
  logo:         { display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 28px', borderBottom: '1px solid #1e293b' },
  logoIcon:     { fontSize: 28 },
  logoTitle:    { margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' },
  logoSub:      { margin: 0, fontSize: 11, color: '#475569' },
  nav:          { display: 'flex', flexDirection: 'column', gap: 4, padding: '20px 12px', flex: 1 },
  navBtn:       { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 500, transition: 'all 0.15s' },
  navBtnActive: { background: '#1e293b', color: '#f1f5f9', fontWeight: 600 },
  sidebarFooter:{ padding: '16px 20px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 },
  footerText:   { margin: 0, fontSize: 11, color: '#334155' },
  dot:          { width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginLeft: 'auto', boxShadow: '0 0 6px #22c55e' },
  main:         { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:       { padding: '24px 32px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#020817' },
  pageTitle:    { margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' },
  pageDate:     { margin: '4px 0 0', fontSize: 12, color: '#475569' },
  headerBadge:  { padding: '6px 14px', background: '#0a1f14', border: '1px solid #14532d', borderRadius: 20, fontSize: 12, color: '#34d399' },
  content:      { flex: 1, padding: '28px 32px', overflowY: 'auto' },
};