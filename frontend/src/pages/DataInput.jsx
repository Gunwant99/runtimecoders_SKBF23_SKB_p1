import React, { useState } from 'react';
import axios from 'axios';

export default function DataInput() {
  const [formData, setFormData]         = useState({ electricity_kwh: '', diesel_liters: '', transport_km: '' });
  const [validationResult, setResult]   = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await axios.post('http://localhost:5000/data', formData);
      setResult(res.data);
      setFormData({ electricity_kwh: '', diesel_liters: '', transport_km: '' });
    } catch (err) {
      setError('Failed to connect to backend. Is Flask running on port 5000?');
    } finally {
      setLoading(false);
    }
  };

  const riskColor = { High: '#f87171', Medium: '#fbbf24', Low: '#34d399', Unknown: '#94a3b8' };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>📝 Manual Data Entry</h2>
        <p style={styles.subtitle}>Enter facility activity data. Leave blank to auto-estimate via AI.</p>
      </div>

      <div style={styles.card}>
        <form onSubmit={handleSubmit} style={styles.form}>
          {[
            { key: 'electricity_kwh', label: 'Electricity', unit: 'kWh', icon: '⚡' },
            { key: 'diesel_liters',   label: 'Diesel',      unit: 'Liters', icon: '🛢️' },
            { key: 'transport_km',    label: 'Transport',   unit: 'km', icon: '🚛' },
          ].map(({ key, label, unit, icon }) => (
            <div key={key} style={styles.field}>
              <label style={styles.label}>{icon} {label} <span style={styles.unitTag}>{unit}</span></label>
              <input
                type="number"
                placeholder={`e.g. 5000`}
                value={formData[key]}
                onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                style={styles.input}
              />
            </div>
          ))}

          <button type="submit" disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}>
            {loading ? '⏳ Validating with AI…' : '🤖 Submit & Validate'}
          </button>
          <p style={styles.hint}>* Empty fields will be estimated using Groq AI</p>
        </form>
      </div>

      {error && <div style={styles.errorBox}>❌ {error}</div>}

      {validationResult && (
        <>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📊 Calculated Emissions</h3>
            <div style={styles.scopeGrid}>
              {[
                { label: 'Scope 1 — Diesel',        val: validationResult.calculated.scope1 },
                { label: 'Scope 2 — Electricity',   val: validationResult.calculated.scope2 },
                { label: 'Scope 3 — Transport',     val: validationResult.calculated.scope3 },
              ].map(({ label, val }) => (
                <div key={label} style={styles.scopeBox}>
                  <p style={styles.scopeLabel}>{label}</p>
                  <p style={styles.scopeVal}>{val.toFixed(2)} <span style={styles.unit}>kg CO₂</span></p>
                </div>
              ))}
              <div style={{ ...styles.scopeBox, background: '#1e293b', border: '1px solid #6366f1' }}>
                <p style={styles.scopeLabel}>Total Emissions</p>
                <p style={{ ...styles.scopeVal, color: '#818cf8', fontSize: 22 }}>
                  {validationResult.calculated.total.toFixed(2)} <span style={styles.unit}>kg CO₂</span>
                </p>
              </div>
            </div>
          </div>

          <div style={{ ...styles.card, borderColor: riskColor[validationResult.validation.risk] + '55' }}>
            <h3 style={styles.cardTitle}>🤖 AI Validation Result</h3>
            <div style={styles.riskRow}>
              <span style={styles.riskLabel}>Risk Level</span>
              <span style={{ ...styles.riskBadge, background: riskColor[validationResult.validation.risk] + '22', color: riskColor[validationResult.validation.risk], borderColor: riskColor[validationResult.validation.risk] }}>
                {validationResult.validation.risk}
              </span>
            </div>
            <p style={styles.explanation}>{validationResult.validation.explanation}</p>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page:         { maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  header:       { textAlign: 'center' },
  title:        { margin: '0 0 8px', fontSize: 22, color: '#f1f5f9' },
  subtitle:     { margin: 0, color: '#94a3b8', fontSize: 14 },
  card:         { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '24px 28px' },
  cardTitle:    { margin: '0 0 18px', fontSize: 16, fontWeight: 600, color: '#e2e8f0' },
  form:         { display: 'flex', flexDirection: 'column', gap: 16 },
  field:        { display: 'flex', flexDirection: 'column', gap: 6 },
  label:        { fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 },
  unitTag:      { marginLeft: 'auto', background: '#1e293b', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#64748b', fontWeight: 400 },
  input:        { padding: '10px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 15, outline: 'none', transition: 'border 0.2s' },
  btn:          { padding: '13px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 4 },
  hint:         { margin: '4px 0 0', fontSize: 12, color: '#475569', textAlign: 'center' },
  errorBox:     { background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '14px 18px', color: '#f87171' },
  scopeGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  scopeBox:     { background: '#0a1628', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px' },
  scopeLabel:   { margin: '0 0 6px', fontSize: 12, color: '#64748b' },
  scopeVal:     { margin: 0, fontSize: 18, fontWeight: 700, color: '#38bdf8' },
  unit:         { fontSize: 11, color: '#64748b', fontWeight: 400 },
  riskRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  riskLabel:    { fontSize: 14, fontWeight: 600, color: '#94a3b8' },
  riskBadge:    { padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid' },
  explanation:  { margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.6 },
};