export const OVERLAY_STYLES = `
:host {
  --es-bg: rgba(12, 14, 17, .97);
  --es-card: #171a1f;
  --es-line: rgba(255,255,255,.1);
  --es-muted: #9aa2ae;
  --es-text: #f5f7fa;
  --es-accent: #ff5500;
  color: var(--es-text);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.35;
}
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor:not-allowed; opacity:.48; }
.es-shell { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
.es-shell > * { pointer-events: auto; }
.es-positions[hidden] { display: none; }
.es-badge { display:inline-flex; align-items:center; padding:3px 7px; border-radius:999px; color:#ffc19e; background:#ff55001d; border:1px solid #ff55004d; font-size:11px; }
.es-spacer { flex:1; }
.es-window { color:var(--es-text); background:var(--es-card); border:1px solid var(--es-line); border-radius:8px; padding:5px 7px; }
.es-muted { color:var(--es-muted); }
.es-positions { position:fixed; left:50%; bottom:14px; transform:translateX(-50%); width:min(400px,calc(100vw - 32px)); max-height:40vh; overflow:auto; padding:10px; border:1px solid var(--es-line); border-radius:14px; background:var(--es-bg); box-shadow:0 12px 46px #000c; }
.es-positions-head { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.es-position-grid { display:flex; gap:8px; overflow:auto; padding-bottom:2px; }
.es-position-card { flex:0 0 180px; padding:9px; border:1px solid var(--es-line); border-radius:10px; background:var(--es-card); }
.es-position-card[data-selected="true"] { border-color:var(--es-accent); }
.es-position-card textarea { width:100%; min-height:52px; resize:vertical; margin:7px 0; color:var(--es-text); background:#0e1014; border:1px solid var(--es-line); border-radius:7px; padding:6px; }
.es-row { display:flex; align-items:center; gap:7px; }
.es-row > label { flex:1; }
.es-select { color:var(--es-text); background:#0e1014; border:1px solid var(--es-line); border-radius:7px; padding:6px 7px; }
.es-primary { border:0; border-radius:8px; padding:7px 10px; color:#fff; background:var(--es-accent); font-weight:800; }
.es-status { min-height:16px; margin-top:5px; color:var(--es-muted); font-size:11px; }
.es-match-accept-preview { position:fixed; left:50%; top:50%; transform:translate(-50%, calc(-50% - 150px)); width:min(420px,calc(100vw - 32px)); z-index:2147483001; pointer-events:none; }
.es-match-accept-card { padding:12px 14px; border:1px solid var(--es-line); border-radius:14px; background:var(--es-bg); box-shadow:0 16px 48px #000d; }
.es-match-accept-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
.es-match-accept-section { display:grid; gap:6px; margin-top:10px; }
.es-match-accept-label { color:var(--es-muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
.es-match-accept-value { font-weight:600; }
.es-match-accept-maps { display:flex; flex-wrap:wrap; gap:6px; }
.es-match-accept-map { display:inline-flex; padding:4px 8px; border-radius:999px; border:1px solid var(--es-line); background:var(--es-card); font-size:12px; }
.es-match-accept-teams { display:grid; gap:8px; }
.es-match-accept-team { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.es-match-accept-team-name { font-weight:700; }
.es-match-accept-team-elo { color:#ffc19e; font-weight:700; }
.es-match-accept-players { display:flex; flex-wrap:wrap; gap:4px; }
.es-match-accept-player { padding:2px 6px; border-radius:6px; background:#ffffff0d; font-size:11px; color:var(--es-muted); }
.es-match-accept-note { margin:10px 0 0; color:var(--es-muted); font-size:11px; }
`;
