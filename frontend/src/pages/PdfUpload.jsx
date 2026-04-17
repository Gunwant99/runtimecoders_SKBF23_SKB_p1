import React, { useState } from 'react';
import axios from 'axios';

const riskColor = {
  High:    '#f87171',
  Medium:  '#fbbf24',
  Low:     '#34d399',
  Unknown: '#94a3b8',
};

const confidencePalette = {
  High:    { color: '#34d399', bg: '#0a1f14', border: '#14532d', icon: '🔐' },
  Medium:  { color: '#fbbf24', bg: '#1c1400', border: '#78350f', icon: '🔒' },
  Low:     { color: '#f87171', bg: '#1f0a0a', border: '#7f1d1d', icon: '🔓' },
  Unknown: { color: '#94a3b8', bg: '#0f172a', border: '#1e293b', icon: '❓' },
};

const confLevel = {
  High:   { color: '#34d399', bg: '#0a1f14', border: '#14532d' },
  Medium: { color: '#fbbf24', bg: '#1c1400', border: '#78350f' },
  Low:    { color: '#f87171', bg: '#1f0a0a', border: '#7f1d1d' },
};

export default function PdfUpload() {
  const [file,     setFile]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && f.name.toLowerCase().endsWith('.pdf')) {
      setFile(f); setResult(null); setError(null);
    } else if (f) {
      setError('Only PDF files are accepted.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith('.pdf')) {
      setFile(f); setResult(null); setError(null);
    } else { setError('Only PDF files are accepted.'); }
  };

  const handleReset  = () => { setFile(null); setResult(null); setError(null); };
  const handleUpload = async () => {
    if (!file) { setError('Please select a PDF file first.'); return; }
    setLoading(true); setResult(null); setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post('http://localhost:5000/upload_pdf', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Is Flask running on port 5000?');
    } finally { setLoading(false); }
  };

  const esg        = result?.esg_extraction     ?? null;
  const confidence = result?.confidence         ?? null;
  const confP      = confidence ? confidencePalette[confidence] : null;
  const risk       = result?.validation?.risk   ?? null;
  const rCol       = risk ? riskColor[risk] : '#94a3b8';
  const extConf    = result?.source_info?.extraction_confidence ?? null;
  const extConfC   = extConf ? confLevel[extConf] : null;

  // Scope metrics derived purely from esg_extraction — no fake activity data
  const scopeMeta = [
    { label: 'Scope 1',  val: esg?.scope1, color: '#f87171', desc: 'Direct (Diesel / Fuel)' },
    { label: 'Scope 2',  val: esg?.scope2, color: '#fbbf24', desc: 'Indirect (Electricity)' },
    { label: 'Scope 3',  val: esg?.scope3, color: '#34d399', desc: 'Value Chain (Transport)' },
    { label: 'Total',    val: esg?.total,  color: '#818cf8', desc: 'All Scopes Combined'     },
  ];

  return (
    <div style={s.page}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <h2 style={s.title}>📄 PDF Report Upload</h2>
        <p style={s.subtitle}>
          Upload any ESG / BRSR / Sustainability PDF — our AI extracts scope emissions directly
          from the document text. Values are only shown if explicitly stated in the document.
        </p>
      </div>

      {/* ── Drop Zone ──────────────────────────────────────────────────────── */}
      <div
        style={{ ...s.dropZone, ...(dragOver ? s.dropZoneActive : {}), ...(file ? s.dropZoneReady : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('pdfInput').click()}
      >
        <input id="pdfInput" type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />
        {file ? (
          <>
            <div style={s.fileIcon}>📑</div>
            <p style={s.fileName}>{file.name}</p>
            <p style={s.fileSize}>{(file.size / 1024).toFixed(1)} KB — ready to analyse</p>
          </>
        ) : (
          <>
            <div style={s.uploadIcon}>📄</div>
            <p style={s.dropText}>Drag & drop your ESG PDF here</p>
            <p style={s.dropHint}>or click to browse — any sustainability / annual / BRSR report works</p>
          </>
        )}
      </div>

      {/* ── Buttons ────────────────────────────────────────────────────────── */}
      <div style={s.buttonRow}>
        <button
          onClick={handleUpload} disabled={loading || !file}
          style={{ ...s.btn, ...s.btnPrimary, opacity: (!file || loading) ? 0.6 : 1 }}
        >
          {loading ? '⏳ Extracting with AI…' : '🤖 Upload & Extract'}
        </button>
        {file && (
          <button onClick={handleReset} style={{ ...s.btn, ...s.btnSecondary }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && <div style={s.errorBox}>❌ {error}</div>}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* PDF Source Info bar */}
          <div style={s.sourceInfoBox}>
            <div style={s.sourceInfoLeft}>
              <span style={{ fontSize: 20 }}>📄</span>
              <div>
                <p style={s.sourceInfoTitle}>
                  Source: PDF (Unstructured Data) &nbsp;·&nbsp; {result.page_count} page{result.page_count !== 1 ? 's' : ''}
                </p>
                <p style={s.sourceInfoSub}>
                  Text extracted via PyPDF2 &nbsp;·&nbsp; Scope values parsed by Groq LLaMA 3.1
                  &nbsp;·&nbsp; No numbers invented
                </p>
              </div>
            </div>
            {extConf && extConfC && (
              <div style={{
                ...s.extractionConfBadge,
                background:  extConfC.bg,
                borderColor: extConfC.border,
                color:       extConfC.color,
              }}>
                🔍 Extraction Confidence: {extConf}
              </div>
            )}
          </div>

          {/* ── Extracted ESG Metrics ─────────────────────────────────────── */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>📊 Extracted ESG Metrics</h3>
            <p style={s.cardNote}>
              Values read directly from the PDF text. A scope marked{' '}
              <span style={{ color: '#f87171', fontWeight: 600 }}>Not Found</span> means
              the document did not explicitly state that figure — the system never guesses.
            </p>

            <div style={s.scopeGrid4}>
              {scopeMeta.map(({ label, val, color, desc }) => {
                const found = val !== null && val !== undefined;
                return (
                  <div key={label} style={{ ...s.scopeBox4, borderColor: found ? color + '44' : '#334155' }}>
                    <div style={s.scopeTop}>
                      <span style={{ ...s.scopeDot, background: found ? color : '#334155' }} />
                      <span style={{
                        ...s.scopeFoundBadge,
                        background:  found ? color + '18' : '#1e293b',
                        color:       found ? color        : '#475569',
                        borderColor: found ? color + '44' : '#334155',
                      }}>
                        {found ? '✅ Found' : '— Not found'}
                      </span>
                    </div>
                    <p style={s.scopeLabel4}>{label}</p>
                    <p style={s.scopeDesc}>{desc}</p>
                    <p style={{ ...s.scopeVal4, color: found ? color : '#334155' }}>
                      {found
                        ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : '—'}
                      {found && <span style={s.scopeUnit}> kg CO₂</span>}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* AI confidence + notes from structured extraction */}
            {esg && (
              <div style={s.esgMeta}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={s.esgMetaLabel}>AI Extraction Confidence</span>
                  {esg.confidence && confLevel[esg.confidence] && (
                    <span style={{
                      ...s.esgConfBadge,
                      background:  confLevel[esg.confidence].bg,
                      borderColor: confLevel[esg.confidence].border,
                      color:       confLevel[esg.confidence].color,
                    }}>
                      {esg.confidence}
                    </span>
                  )}
                </div>
                {esg.notes && <p style={s.esgNotes}>{esg.notes}</p>}
              </div>
            )}
          </div>

          {/* ── ESG Risk Flags ────────────────────────────────────────────── */}
          {esg?.risks?.length > 0 && (
            <div style={s.riskFlagsCard}>
              <div style={s.riskFlagsHeader}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <p style={s.riskFlagsTitle}>ESG Risk Flags Detected ({esg.risks.length})</p>
              </div>
              <ul style={s.riskFlagsList}>
                {esg.risks.map((r, i) => (
                  <li key={i} style={s.riskFlagsItem}>
                    <span style={s.riskFlagDot} />
                    <span style={s.riskFlagText}>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── AI Validation ─────────────────────────────────────────────── */}
          <div style={{ ...s.card, borderColor: rCol + '55' }}>
            <h3 style={s.cardTitle}>🤖 AI Validation Result</h3>
            <div style={s.riskRow}>
              <span style={s.riskLabel}>Fraud Risk Level</span>
              <span style={{ ...s.riskBadge, background: rCol + '22', color: rCol, borderColor: rCol }}>
                {risk ?? 'Unknown'}
              </span>
            </div>
            <p style={s.explanation}>{result.validation.explanation}</p>
          </div>

          {/* ── AI Recommendation ─────────────────────────────────────────── */}
          {result.recommendation && (
            <div style={s.recommendCard}>
              <div style={s.recommendHeader}>
                <span style={{ fontSize: 18 }}>💡</span>
                <p style={s.recommendTitle}>AI Recommendation</p>
              </div>
              <p style={s.recommendText}>{result.recommendation}</p>
            </div>
          )}

          {/* ── Data Confidence Score ─────────────────────────────────────── */}
          {confidence && confP && (
            <div style={{ ...s.confidenceCard, background: confP.bg, borderColor: confP.border }}>
              <div style={s.confidenceInner}>
                <div style={s.confidenceLeft}>
                  <span style={{ fontSize: 20 }}>{confP.icon}</span>
                  <div>
                    <p style={s.confidenceLabel}>Data Confidence</p>
                    <p style={s.confidenceHint}>Derived from AI risk assessment of extracted values</p>
                  </div>
                </div>
                <span style={{
                  ...s.confidenceBadge,
                  color: confP.color, background: confP.color + '18', borderColor: confP.color + '55',
                }}>
                  {confidence.toUpperCase()}
                </span>
              </div>
              <div style={s.confidenceBar}>
                <div style={{
                  ...s.confidenceFill,
                  width:      confidence === 'High' ? '90%' : confidence === 'Medium' ? '55%' : '20%',
                  background: confP.color,
                }} />
              </div>
            </div>
          )}

          {/* ── Audit Trail ───────────────────────────────────────────────── */}
          {result.audit && (
            <div style={s.auditBox}>
              <p style={s.auditTitle}>🧾 Audit Information</p>
              <div style={s.auditGrid}>
                {[
                  { label: 'Source',       val: result.audit.source_type?.toUpperCase()                  },
                  { label: 'Validated by', val: result.audit.validated_by                                },
                  { label: 'Timestamp',    val: new Date(result.audit.timestamp).toLocaleString('en-IN') },
                  { label: 'Status',       val: result.audit.validation_status                           },
                  { label: 'Company',      val: result.audit.company                                     },
                  { label: 'Sector',       val: result.audit.sector                                      },
                ].map(({ label, val }) => (
                  <div key={label} style={s.auditItem}>
                    <span style={s.auditLabel}>{label}</span>
                    <span style={{
                      ...s.auditVal,
                      color: label === 'Status'
                        ? (val === 'Verified' ? '#34d399' : '#f87171')
                        : '#94a3b8',
                    }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── How-it-works hint ──────────────────────────────────────────────── */}
      <div style={s.hintBox}>
        <p style={s.hintTitle}>💡 How it works</p>
        <p style={s.hintText}>
          1. PDF text is extracted via <strong>PyPDF2</strong> across all pages.<br />
          2. <strong>Groq LLaMA 3.1</strong> reads the text and extracts Scope 1, 2, 3 values{' '}
          <em>only if explicitly stated</em> — returning structured JSON.<br />
          3. Scopes not found in the document are shown as <strong>Not Found</strong> — no values are invented or estimated.<br />
          4. ESG risk flags, AI validation, and a confidence score are generated from the extracted data only.<br />
          5. An audit trail is saved automatically.
        </p>
      </div>

    </div>
  );
}

const s = {
  page:         { maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 },
  header:       { textAlign: 'center' },
  title:        { margin: '0 0 8px', fontSize: 22, color: '#f1f5f9' },
  subtitle:     { margin: 0, color: '#94a3b8', fontSize: 14, lineHeight: 1.6 },

  dropZone:      { border: '2px dashed #334155', borderRadius: 12, padding: '44px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#0f172a' },
  dropZoneActive:{ borderColor: '#6366f1', background: '#1e1b4b' },
  dropZoneReady: { borderColor: '#22d3ee', background: '#0c2231' },
  uploadIcon:   { fontSize: 48, marginBottom: 12 },
  fileIcon:     { fontSize: 40, marginBottom: 8 },
  dropText:     { color: '#cbd5e1', margin: '0 0 4px', fontWeight: 600 },
  dropHint:     { color: '#64748b', margin: 0, fontSize: 13 },
  fileName:     { color: '#22d3ee', margin: '0 0 4px', fontWeight: 600, fontSize: 16 },
  fileSize:     { color: '#94a3b8', margin: 0, fontSize: 13 },

  buttonRow:    { display: 'flex', gap: 12 },
  btn:          { flex: 1, padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimary:   { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' },
  btnSecondary: { background: '#1e293b', color: '#94a3b8', flex: '0 0 auto', padding: '12px 16px' },

  errorBox:     { background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '14px 18px', color: '#f87171' },

  sourceInfoBox:       { background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  sourceInfoLeft:      { display: 'flex', alignItems: 'center', gap: 12 },
  sourceInfoTitle:     { margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' },
  sourceInfoSub:       { margin: '3px 0 0', fontSize: 11, color: '#475569' },
  extractionConfBadge: { padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: '1px solid', whiteSpace: 'nowrap' },

  card:       { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '22px 24px' },
  cardTitle:  { margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#e2e8f0' },
  cardNote:   { margin: '0 0 18px', fontSize: 12, color: '#475569', lineHeight: 1.6 },

  scopeGrid4:      { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  scopeBox4:       { background: '#0a1628', border: '1px solid', borderRadius: 10, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  scopeTop:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  scopeDot:        { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  scopeFoundBadge: { padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, border: '1px solid' },
  scopeLabel4:     { margin: 0, fontSize: 12, fontWeight: 700, color: '#e2e8f0' },
  scopeDesc:       { margin: 0, fontSize: 10, color: '#475569' },
  scopeVal4:       { margin: 0, fontSize: 18, fontWeight: 700 },
  scopeUnit:       { fontSize: 10, color: '#64748b', fontWeight: 400 },

  esgMeta:      { background: '#0a111e', border: '1px solid #1e293b', borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  esgMetaLabel: { fontSize: 12, fontWeight: 600, color: '#64748b' },
  esgConfBadge: { padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid' },
  esgNotes:     { margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6, fontStyle: 'italic' },

  riskFlagsCard:   { background: '#1a0f00', border: '1px solid #78350f', borderRadius: 12, padding: '16px 20px' },
  riskFlagsHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  riskFlagsTitle:  { margin: 0, fontSize: 13, fontWeight: 700, color: '#fbbf24' },
  riskFlagsList:   { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 },
  riskFlagsItem:   { display: 'flex', alignItems: 'flex-start', gap: 10 },
  riskFlagDot:     { width: 6, height: 6, borderRadius: '50%', background: '#f87171', flexShrink: 0, marginTop: 5 },
  riskFlagText:    { fontSize: 13, color: '#fde68a', lineHeight: 1.5 },

  riskRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  riskLabel:   { fontSize: 14, fontWeight: 600, color: '#94a3b8' },
  riskBadge:   { padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid' },
  explanation: { margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.6 },

  recommendCard:   { background: '#0c1f0c', border: '1px solid #14532d', borderRadius: 12, padding: '16px 20px' },
  recommendHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  recommendTitle:  { margin: 0, fontSize: 13, fontWeight: 700, color: '#34d399' },
  recommendText:   { margin: 0, fontSize: 14, color: '#6ee7b7', lineHeight: 1.6 },

  confidenceCard:  { border: '1px solid', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  confidenceInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  confidenceLeft:  { display: 'flex', alignItems: 'center', gap: 10 },
  confidenceLabel: { margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
  confidenceHint:  { margin: 0, fontSize: 11, color: '#475569' },
  confidenceBadge: { padding: '5px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid', letterSpacing: '0.5px' },
  confidenceBar:   { height: 6, background: '#1e293b', borderRadius: 99, overflow: 'hidden' },
  confidenceFill:  { height: '100%', borderRadius: 99, transition: 'width 0.6s ease', opacity: 0.85 },

  auditBox:   { background: '#0a111e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '16px 20px' },
  auditTitle: { margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#7dd3fc' },
  auditGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  auditItem:  { display: 'flex', flexDirection: 'column', gap: 3 },
  auditLabel: { fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' },
  auditVal:   { fontSize: 12, fontWeight: 600 },

  hintBox:   { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 22px' },
  hintTitle: { margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#94a3b8' },
  hintText:  { margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.8 },
};