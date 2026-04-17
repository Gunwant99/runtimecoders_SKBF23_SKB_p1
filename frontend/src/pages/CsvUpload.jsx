import React, { useState } from 'react';
import axios from 'axios';

export default function CsvUpload() {
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    setFile(selected);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith('.csv')) {
      setFile(dropped);
      setResult(null);
      setError(null);
    } else {
      setError('Only .csv files are accepted.');
    }
  };

  const handleUpload = async () => {
    if (!file) { setError('Please select a CSV file first.'); return; }
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://localhost:5000/upload_csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Is Flask running?');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => { setFile(null); setResult(null); setError(null); };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>📂 Bulk CSV Upload</h2>
        <p style={styles.subtitle}>
          Upload a CSV with columns: <code style={styles.code}>electricity_kwh</code>,{' '}
          <code style={styles.code}>diesel_liters</code>,{' '}
          <code style={styles.code}>transport_km</code>
        </p>
      </div>

      {/* Drop Zone */}
      <div
        style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}), ...(file ? styles.dropZoneReady : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('csvInput').click()}
      >
        <input id="csvInput" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
        {file ? (
          <div>
            <div style={styles.fileIcon}>📄</div>
            <p style={styles.fileName}>{file.name}</p>
            <p style={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB — ready to upload</p>
          </div>
        ) : (
          <div>
            <div style={styles.uploadIcon}>☁️</div>
            <p style={styles.dropText}>Drag & drop your CSV here</p>
            <p style={styles.dropHint}>or click to browse</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={styles.buttonRow}>
        <button onClick={handleUpload} disabled={loading || !file} style={{ ...styles.btn, ...styles.btnPrimary, opacity: (!file || loading) ? 0.6 : 1 }}>
          {loading ? <><span style={styles.spinner}>⏳</span> Processing…</> : '🚀 Upload & Process'}
        </button>
        {file && (
          <button onClick={handleReset} style={{ ...styles.btn, ...styles.btnSecondary }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <span>❌</span> {error}
        </div>
      )}

      {/* Success */}
      {result && (
        <div style={styles.successBox}>
          <div style={styles.successHeader}>
            <span style={styles.successIcon}>✅</span>
            <div>
              <p style={styles.successTitle}>Upload Complete</p>
              <p style={styles.successMsg}>{result.message}</p>
            </div>
          </div>
          <div style={styles.statsRow}>
            <div style={styles.stat}>
              <span style={styles.statNum}>{result.inserted}</span>
              <span style={styles.statLabel}>Records Inserted</span>
            </div>
            <div style={styles.stat}>
              <span style={{ ...styles.statNum, color: result.errors?.length ? '#f87171' : '#34d399' }}>
                {result.errors?.length ?? 0}
              </span>
              <span style={styles.statLabel}>Errors</span>
            </div>
          </div>
          {result.errors?.length > 0 && (
            <div style={styles.errList}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Row errors:</p>
              {result.errors.map((e, i) => <p key={i} style={{ color: '#f87171', fontSize: 13 }}>• {e}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Template hint */}
      <div style={styles.templateBox}>
        <p style={{ fontWeight: 600, marginBottom: 8, color: '#a0aec0' }}>📋 Expected CSV format</p>
        <pre style={styles.pre}>{`electricity_kwh,diesel_liters,transport_km\n5000,200,1500\n8000,350,2200\n3200,120,800`}</pre>
        <p style={{ fontSize: 12, color: '#718096', marginTop: 8 }}>
          Leave a field empty to auto-estimate via AI. Groq validation runs on every row.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page:            { maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 },
  header:          { textAlign: 'center' },
  title:           { margin: '0 0 8px', fontSize: 22, color: '#f1f5f9' },
  subtitle:        { margin: 0, color: '#94a3b8', fontSize: 14 },
  code:            { background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', color: '#7dd3fc' },
  dropZone:        { border: '2px dashed #334155', borderRadius: 12, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#0f172a' },
  dropZoneActive:  { borderColor: '#6366f1', background: '#1e1b4b' },
  dropZoneReady:   { borderColor: '#22d3ee', background: '#0c2231' },
  uploadIcon:      { fontSize: 48, marginBottom: 12 },
  fileIcon:        { fontSize: 40, marginBottom: 8 },
  dropText:        { color: '#cbd5e1', margin: '0 0 4px', fontWeight: 600 },
  dropHint:        { color: '#64748b', margin: 0, fontSize: 13 },
  fileName:        { color: '#22d3ee', margin: '0 0 4px', fontWeight: 600, fontSize: 16 },
  fileSize:        { color: '#94a3b8', margin: 0, fontSize: 13 },
  buttonRow:       { display: 'flex', gap: 12 },
  btn:             { flex: 1, padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimary:      { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' },
  btnSecondary:    { background: '#1e293b', color: '#94a3b8', flex: '0 0 auto', padding: '12px 16px' },
  spinner:         { display: 'inline-block' },
  errorBox:        { background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '14px 18px', color: '#f87171', display: 'flex', alignItems: 'center', gap: 10 },
  successBox:      { background: '#0a1f14', border: '1px solid #14532d', borderRadius: 12, padding: 20 },
  successHeader:   { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 },
  successIcon:     { fontSize: 28 },
  successTitle:    { margin: '0 0 4px', fontWeight: 700, color: '#34d399', fontSize: 16 },
  successMsg:      { margin: 0, color: '#6ee7b7', fontSize: 14 },
  statsRow:        { display: 'flex', gap: 20, marginBottom: 12 },
  stat:            { background: '#0f2d1c', borderRadius: 8, padding: '12px 20px', flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 },
  statNum:         { fontSize: 28, fontWeight: 700, color: '#34d399' },
  statLabel:       { fontSize: 12, color: '#94a3b8' },
  errList:         { background: '#1a0f0f', borderRadius: 8, padding: 12, marginTop: 8 },
  templateBox:     { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 20 },
  pre:             { background: '#1e293b', borderRadius: 6, padding: 14, fontFamily: 'monospace', fontSize: 13, color: '#7dd3fc', overflowX: 'auto', margin: 0, whiteSpace: 'pre' },
};