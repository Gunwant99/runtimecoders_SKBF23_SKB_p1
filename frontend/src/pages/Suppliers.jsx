import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API      = 'http://localhost:5000';
const medal    = (i) => ['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`;
const barColor = (pct) => pct > 40 ? '#f87171' : pct > 20 ? '#fbbf24' : '#34d399';

export default function Suppliers() {
  const [suppliers,  setSuppliers]  = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [top2Pct,    setTop2Pct]    = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(null);
  const [proofState, setProofState] = useState({});
  const [pdfLoading, setPdfLoading] = useState(false);

  const emptyForm = { supplier_name: '', transport_km: '', material_kg: '', energy_kwh: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchSummary = () => {
    setLoading(true);
    axios.get(`${API}/supplier_summary`)
      .then(res => {
        setSuppliers(res.data.suppliers ?? []);
        setGrandTotal(res.data.grand_total ?? 0);
        setTop2Pct(res.data.top2_pct ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchSummary(); }, []);

  const handleSubmit = async () => {
    if (!form.supplier_name.trim()) { setError('Supplier name is required.'); return; }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      const res = await axios.post(`${API}/supplier`, form);
      setSuccess(`✅ ${res.data.supplier_name} added — ${res.data.total_emissions} kg CO₂`);
      setForm(emptyForm);
      fetchSummary();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to connect to backend.');
    } finally { setSubmitting(false); }
  };

  const handleProofUpload = async (supplierId, file) => {
    if (!file) return;
    setProofState(ps => ({ ...ps, [supplierId]: { uploading: true, done: false, error: null } }));
    const fd = new FormData();
    fd.append('proof', file);
    try {
      await axios.post(`${API}/supplier_proof/${supplierId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProofState(ps => ({ ...ps, [supplierId]: { uploading: false, done: true, error: null } }));
      fetchSummary();
    } catch {
      setProofState(ps => ({ ...ps, [supplierId]: { uploading: false, done: false, error: 'Upload failed' } }));
    }
  };

  const handleDownloadAudit = async () => {
    setPdfLoading(true);
    try {
      const res  = await axios.get(`${API}/audit_report`, { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `AuditReport_${new Date().toISOString().slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert('PDF generation failed. Is Flask running?'); }
    finally  { setPdfLoading(false); }
  };

  const verifiedCount = suppliers.filter(s => s.proof_filename).length;

  return (
    <div style={s.page}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.title}>🏭 Supplier Emissions</h2>
          <p style={s.subtitle}>Track and rank Scope 3 supplier contributions · Sorted by emissions (highest first)</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {!loading && suppliers.length > 0 && (
            <div style={s.totalBadge}>
              <span style={s.totalLabel}>Total Tracked</span>
              <span style={s.totalVal}>{grandTotal.toFixed(1)} kg CO₂</span>
            </div>
          )}
          <button onClick={handleDownloadAudit} disabled={pdfLoading}
            style={{ ...s.auditBtn, opacity: pdfLoading ? 0.7 : 1 }}>
            {pdfLoading ? '⏳ Generating…' : '📄 Download Audit Report'}
          </button>
        </div>
      </div>

      {/* ── Add Supplier ─────────────────────────────────────────────────────── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>➕ Add Supplier</h3>
        <div style={s.formGrid}>
          {[
            { key: 'supplier_name', label: 'Supplier Name',  placeholder: 'e.g. Acme Logistics', type: 'text'   },
            { key: 'transport_km',  label: 'Transport (km)', placeholder: 'e.g. 1200',            type: 'number' },
            { key: 'material_kg',   label: 'Materials (kg)', placeholder: 'e.g. 5000',            type: 'number' },
            { key: 'energy_kwh',    label: 'Energy (kWh)',   placeholder: 'e.g. 3000',            type: 'number' },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key} style={s.field}>
              <label style={s.label}>{label}</label>
              <input type={type} placeholder={placeholder} value={form[key]}
                onChange={e => setForm({ ...form, [key]: e.target.value })} style={s.input} />
            </div>
          ))}
        </div>
        <p style={s.factorHint}>Emission factors: Transport × 0.21 · Materials × 0.05 · Energy × 0.82 (kg CO₂)</p>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ ...s.btn, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? '⏳ Saving…' : '💾 Add Supplier'}
        </button>
        {error   && <div style={s.errorBox}>❌ {error}</div>}
        {success && <div style={s.successBox}>{success}</div>}
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      {!loading && suppliers.length > 0 && (
        <div style={s.kpiRow}>
          {[
            { label: 'Suppliers Tracked',  val: suppliers.length,                                         color: '#6366f1' },
            { label: 'Top Contributor',    val: suppliers[0]?.supplier_name ?? '—',                      color: '#f87171' },
            { label: 'Highest Emissions',  val: `${suppliers[0]?.total_emissions?.toFixed(1)} kg CO₂`,   color: '#fbbf24' },
            { label: 'Avg Emissions',      val: `${(grandTotal / suppliers.length).toFixed(1)} kg CO₂`,  color: '#34d399' },
            { label: 'Proof Verified',     val: `${verifiedCount}/${suppliers.length}`,                   color: '#22d3ee' },
          ].map(({ label, val, color }) => (
            <div key={label} style={s.kpiCard}>
              <p style={s.kpiLabel}>{label}</p>
              <p style={{ ...s.kpiVal, color }}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Top Contributors Insight ──────────────────────────────────────────── */}
      {!loading && suppliers.length >= 2 && top2Pct > 0 && (
        <div style={s.insightBanner}>
          <span style={{ fontSize: 20 }}>📌</span>
          <p style={s.insightText}>
            Top <strong>{Math.min(2, suppliers.length)}</strong> supplier{suppliers.length > 1 ? 's' : ''}{' '}
            (<strong style={{ color: '#fbbf24' }}>{suppliers.slice(0, 2).map(s => s.supplier_name).join(', ')}</strong>)
            {' '}contribute{' '}
            <strong style={{ color: '#f87171' }}>{top2Pct}%</strong> of total Scope 3 emissions.
            {top2Pct > 60 && ' ⚠️ High concentration risk — negotiate greener logistics with these suppliers immediately.'}
            {top2Pct <= 60 && top2Pct > 40 && ' Consider targeted sustainability audits for these suppliers.'}
          </p>
        </div>
      )}

      {/* ── Rankings + Proof + Data Quality ──────────────────────────────────── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>📊 Supplier Rankings, Data Quality &amp; Proof Documents</h3>

        {loading && <div style={s.empty}>⏳ Loading…</div>}
        {!loading && suppliers.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏭</div>
            <p>No suppliers yet. Add one above.</p>
          </div>
        )}

        {!loading && suppliers.length > 0 && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {[
                      'Rank', 'Supplier', 'Trans km', 'Mat kg', 'Energy kWh',
                      'Emissions kg CO₂', 'Contribution %', 'Data Quality', 'Proof Doc',
                    ].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((sup, i) => {
                    const ps       = proofState[sup.id] ?? {};
                    const hasProof = sup.proof_filename || ps.done;
                    const dq       = sup.data_quality ?? (hasProof ? 'High' : 'Low');

                    return (
                      <tr key={sup.id} style={{ background: i % 2 === 0 ? '#0a111e' : 'transparent' }}>
                        {/* Rank */}
                        <td style={{ ...s.td, fontSize: 16 }}>{medal(i)}</td>

                        {/* Supplier name */}
                        <td style={{ ...s.td, fontWeight: 600, color: '#e2e8f0' }}>{sup.supplier_name}</td>

                        {/* Numeric columns */}
                        <td style={s.td}>{sup.transport_km.toFixed(0)}</td>
                        <td style={s.td}>{sup.material_kg.toFixed(0)}</td>
                        <td style={s.td}>{sup.energy_kwh.toFixed(0)}</td>

                        {/* Emissions */}
                        <td style={{ ...s.td, fontWeight: 700, color: '#38bdf8' }}>
                          {sup.total_emissions.toFixed(2)}
                        </td>

                        {/* Contribution bar */}
                        <td style={s.td}>
                          <div style={s.barWrap}>
                            <div style={{
                              ...s.barFill,
                              width:      `${Math.min(sup.contribution_pct, 100)}%`,
                              background: barColor(sup.contribution_pct),
                            }} />
                            <span style={{ ...s.barLabel, color: barColor(sup.contribution_pct) }}>
                              {sup.contribution_pct}%
                            </span>
                          </div>
                        </td>

                        {/* Data Quality */}
                        <td style={s.td}>
                          <span style={dq === 'High' ? s.badgeGreen : s.badgeRed}>
                            {dq === 'High' ? '✅ High' : '⚠ Low'}
                          </span>
                        </td>

                        {/* Proof Doc */}
                        <td style={s.td}>
                          {hasProof ? (
                            <span style={s.badgeGreen}>✅ Verified</span>
                          ) : ps.uploading ? (
                            <span style={s.badgeYellow}>⏳ Uploading…</span>
                          ) : ps.error ? (
                            <span style={s.badgeRed}>❌ Failed</span>
                          ) : (
                            <>
                              <input
                                type="file"
                                id={`proof-${sup.id}`}
                                style={{ display: 'none' }}
                                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv"
                                onChange={e => handleProofUpload(sup.id, e.target.files[0])}
                              />
                              <label htmlFor={`proof-${sup.id}`} style={s.uploadLabel}>
                                📎 Upload
                              </label>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div style={s.legend}>
              <span style={s.badgeGreen}>✅ High</span>
              <span style={s.legendText}>= proof document uploaded (auditable)</span>
              <span style={s.badgeRed}>⚠ Low</span>
              <span style={s.legendText}>= no proof, self-reported only</span>
              <span style={s.uploadLabel}>📎 Upload</span>
              <span style={s.legendText}>= click to attach PDF, image or spreadsheet</span>
            </div>
          </>
        )}
      </div>

      {/* ── Audit Report CTA ──────────────────────────────────────────────────── */}
      <div style={s.auditCard}>
        <div style={s.auditLeft}>
          <span style={{ fontSize: 32 }}>📋</span>
          <div>
            <p style={s.auditCardTitle}>Download Full Audit Report</p>
            <p style={s.auditCardSub}>
              GHG Protocol-aligned PDF — Scope 1, 2 &amp; 3 totals · Supplier rankings ·
              Data quality ratings · Fraud risk analysis · Proof verification · Compliance checklist
            </p>
          </div>
        </div>
        <button onClick={handleDownloadAudit} disabled={pdfLoading}
          style={{ ...s.auditBtn, opacity: pdfLoading ? 0.7 : 1, flexShrink: 0 }}>
          {pdfLoading ? '⏳ Generating PDF…' : '⬇️ Download Audit PDF'}
        </button>
      </div>

    </div>
  );
}

const s = {
  page:       { display: 'flex', flexDirection: 'column', gap: 22 },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  title:      { margin: '0 0 4px', fontSize: 22, color: '#f1f5f9' },
  subtitle:   { margin: 0, color: '#94a3b8', fontSize: 13 },

  totalBadge: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 18px', textAlign: 'right' },
  totalLabel: { display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 },
  totalVal:   { display: 'block', fontSize: 18, fontWeight: 700, color: '#38bdf8' },

  card:       { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '22px 24px' },
  cardTitle:  { margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#e2e8f0' },
  formGrid:   { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 10 },
  field:      { display: 'flex', flexDirection: 'column', gap: 5 },
  label:      { fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input:      { padding: '9px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none' },
  factorHint: { fontSize: 11, color: '#475569', marginBottom: 14 },
  btn:        { padding: '11px 22px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  errorBox:   { marginTop: 12, background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13 },
  successBox: { marginTop: 12, background: '#0a1f14', border: '1px solid #14532d', borderRadius: 8, padding: '10px 14px', color: '#34d399', fontSize: 13 },

  kpiRow:  { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 },
  kpiCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 18px' },
  kpiLabel:{ margin: '0 0 6px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  kpiVal:  { margin: 0, fontSize: 16, fontWeight: 700 },

  insightBanner: { background: '#1a0f00', border: '1px solid #78350f', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 },
  insightText:   { margin: 0, fontSize: 13, color: '#fde68a', lineHeight: 1.6 },

  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #1e293b' },
  td:         { padding: '10px 12px', color: '#94a3b8', borderBottom: '1px solid #0f172a', verticalAlign: 'middle' },
  barWrap:    { display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 },
  barFill:    { height: 6, borderRadius: 99, transition: 'width 0.4s ease', minWidth: 2 },
  barLabel:   { fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  empty:      { textAlign: 'center', padding: '40px 0', color: '#475569', fontSize: 14 },

  badgeGreen:  { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#0a1f14', border: '1px solid #14532d', color: '#34d399', whiteSpace: 'nowrap' },
  badgeYellow: { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#1c1400', border: '1px solid #78350f', color: '#fbbf24', whiteSpace: 'nowrap' },
  badgeRed:    { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#1f0a0a', border: '1px solid #7f1d1d', color: '#f87171', whiteSpace: 'nowrap' },
  uploadLabel: { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' },
  legend:      { display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' },
  legendText:  { color: '#64748b', fontSize: 11 },

  auditCard:     { background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' },
  auditLeft:     { display: 'flex', alignItems: 'flex-start', gap: 16 },
  auditCardTitle:{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#e2e8f0' },
  auditCardSub:  { margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6, maxWidth: 480 },
  auditBtn:      { padding: '11px 20px', background: 'linear-gradient(135deg, #1d4ed8, #6366f1)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
};