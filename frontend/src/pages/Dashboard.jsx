import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b'];
const riskColor = { High: '#f87171', Medium: '#fbbf24', Low: '#34d399', Unknown: '#94a3b8' };

export default function Dashboard() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('http://localhost:5000/dashboard')
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const latest = data[data.length - 1];
  const pieData = latest ? [
    { name: 'Scope 1 · Diesel',       value: parseFloat(latest.scope1.toFixed(2)) },
    { name: 'Scope 2 · Electricity',  value: parseFloat(latest.scope2.toFixed(2)) },
    { name: 'Scope 3 · Transport',    value: parseFloat(latest.scope3.toFixed(2)) },
  ] : [];

  const lineData = data.map((d, i) => ({
    name: `#${i + 1}`,
    Total: parseFloat(d.total_emissions.toFixed(2)),
  }));

  const totalAll = data.reduce((s, d) => s + d.total_emissions, 0);
  const avgTotal = data.length ? totalAll / data.length : 0;
  const highRisk = data.filter(d => d.fraud_risk === 'High').length;

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Loading dashboard…</div>
  );

  if (data.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 48 }}>🌿</div>
      <p style={{ color: '#94a3b8', marginTop: 12 }}>No records yet. Add data via Manual Input or CSV Upload.</p>
    </div>
  );

  return (
    <div style={styles.page}>
      {/* KPI Cards */}
      <div style={styles.kpiRow}>
        {[
          { label: 'Total Records',      val: data.length,           suffix: '',          color: '#6366f1' },
          { label: 'Avg Emissions',      val: avgTotal.toFixed(1),   suffix: ' kg CO₂',   color: '#22d3ee' },
          { label: 'High Risk Entries',  val: highRisk,              suffix: '',          color: '#f87171' },
          { label: 'Latest Risk',        val: latest?.fraud_risk ?? '—', suffix: '',      color: riskColor[latest?.fraud_risk] ?? '#94a3b8' },
        ].map(({ label, val, suffix, color }) => (
          <div key={label} style={styles.kpiCard}>
            <p style={styles.kpiLabel}>{label}</p>
            <p style={{ ...styles.kpiVal, color }}>{val}{suffix}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={styles.chartRow}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Latest Scope Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => `${v} kg CO₂`} contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
              <Legend iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Emissions Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip formatter={v => `${v} kg CO₂`} contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
              <Line type="monotone" dataKey="Total" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Records Table */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Recent Records</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>{['#', 'Scope 1', 'Scope 2', 'Scope 3', 'Total (kg CO₂)', 'Risk'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {[...data].reverse().slice(0, 8).map((d, i) => (
                <tr key={d.id} style={{ background: i % 2 === 0 ? '#0a111e' : 'transparent' }}>
                  <td style={styles.td}>{data.length - i}</td>
                  <td style={styles.td}>{d.scope1.toFixed(2)}</td>
                  <td style={styles.td}>{d.scope2.toFixed(2)}</td>
                  <td style={styles.td}>{d.scope3.toFixed(2)}</td>
                  <td style={{ ...styles.td, fontWeight: 700, color: '#38bdf8' }}>{d.total_emissions.toFixed(2)}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, color: riskColor[d.fraud_risk], background: riskColor[d.fraud_risk] + '18', border: `1px solid ${riskColor[d.fraud_risk]}44` }}>
                      {d.fraud_risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page:      { display: 'flex', flexDirection: 'column', gap: 20 },
  kpiRow:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  kpiCard:   { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 20px' },
  kpiLabel:  { margin: '0 0 6px', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  kpiVal:    { margin: 0, fontSize: 26, fontWeight: 700 },
  chartRow:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card:      { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '20px 24px' },
  cardTitle: { margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#e2e8f0' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:        { padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #1e293b' },
  td:        { padding: '10px 14px', color: '#94a3b8', borderBottom: '1px solid #0f172a' },
  badge:     { padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
};