export const OVERLAY_STYLES = `
:host {
  --es-bg: rgba(12, 14, 17, .97);
  --es-card: #171a1f;
  --es-line: rgba(255,255,255,.1);
  --es-muted: #9aa2ae;
  --es-text: #f5f7fa;
  --es-accent: #ff5500;
  --es-good: #3be477;
  --es-bad: #ff4164;
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
.es-panel {
  position: fixed; right: 68px; top: 72px; width: min(720px, calc(100vw - 92px)); max-height: calc(100vh - 96px);
  overflow: auto; overscroll-behavior: contain; background: var(--es-bg); border: 1px solid var(--es-line); border-radius: 14px;
  box-shadow: 0 18px 60px #000c; backdrop-filter: blur(16px);
}
:host([data-layout="profile-inline"]) {
  display:block; width:100%; min-width:0; flex:0 0 auto;
}
:host([data-layout="profile-inline"]) .es-shell {
  position:relative; inset:auto; z-index:auto; width:100%; pointer-events:auto;
}
:host([data-layout="profile-inline"]) .es-panel {
  position:relative; inset:auto; width:100%; max-height:none; overflow:visible; overscroll-behavior:auto;
  background:#101216; border-radius:7px; box-shadow:none; backdrop-filter:none;
}
:host([data-layout="profile-inline"]) .es-head {
  position:static; padding:12px 14px; background:#101216;
}
:host([data-layout="profile-inline"]) .es-content { padding:14px; }
:host([data-layout="profile-inline"]) .es-state { min-height:92px; }
:host([data-layout="profile-inline"]) .es-table-wrap { overflow-x:auto; overflow-y:visible; }
.es-panel[hidden], .es-positions[hidden] { display: none; }
.es-head { position:sticky; top:0; z-index:2; display:flex; gap:12px; align-items:center; padding:14px 16px; background:#101216f2; border-bottom:1px solid var(--es-line); }
.es-title { font-size:15px; font-weight:800; letter-spacing:.01em; }
.es-badge { display:inline-flex; align-items:center; padding:3px 7px; border-radius:999px; color:#ffc19e; background:#ff55001d; border:1px solid #ff55004d; font-size:11px; }
.es-spacer { flex:1; }
.es-content { padding:14px; }
.es-state { min-height:130px; display:grid; place-items:center; color:var(--es-muted); text-align:center; padding:24px; }
.es-grid { display:grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap:8px; }
.es-stat { min-width:0; padding:10px; border:1px solid var(--es-line); border-radius:10px; background:var(--es-card); }
.es-stat b { display:block; color:#fff; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.es-stat span { color:var(--es-muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
.es-profile-line { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
.es-progress { margin:-2px 0 12px; padding:9px 10px; border:1px solid var(--es-line); border-radius:9px; background:#111419; }
.es-progress-track { height:4px; margin-top:7px; overflow:hidden; border-radius:999px; background:#2a3038; }
.es-progress-fill { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#70ed80,#46ccff); }
.es-player-name { font-size:22px; font-weight:900; }
.es-level { width:38px; height:38px; display:grid; place-items:center; border-radius:50%; border:2px solid #45cdfc; color:#7bdcff; font-weight:900; }
.es-section-title { margin:15px 0 8px; color:#d9dde5; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
.es-window { color:var(--es-text); background:var(--es-card); border:1px solid var(--es-line); border-radius:8px; padding:5px 7px; }
.es-battery { display:inline-flex; align-items:center; gap:2px; height:20px; padding:3px 5px; border:1px solid currentColor; border-radius:5px; color:#737b87; }
.es-battery::after { content:""; width:2px; height:7px; margin-left:2px; border-radius:0 2px 2px 0; background:currentColor; }
.es-battery-bar { width:4px; height:10px; border-radius:1px; background:#3a3f48; }
.es-battery-bar[data-on="true"] { background:currentColor; }
.es-battery-score { margin-left:4px; min-width:22px; font-weight:800; font-size:10px; }
.es-battery:focus-visible { outline:2px solid #fff; outline-offset:2px; }
.es-map-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
.es-map { padding:9px; border:1px solid var(--es-line); border-radius:9px; background:var(--es-card); }
.es-map[data-selected="true"] { border-color:#ff6a2b; box-shadow:0 0 0 1px #ff6a2b44 inset; }
.es-map strong { display:block; text-transform:uppercase; }
.es-map span { display:block; margin-top:3px; }
.es-muted { color:var(--es-muted); }
.es-positive { color:var(--es-good); }
.es-negative { color:var(--es-bad); }
.es-table-wrap { overflow:auto; border:1px solid var(--es-line); border-radius:10px; }
.es-table { width:100%; border-collapse:collapse; white-space:nowrap; font-size:12px; }
.es-table th { position:sticky; top:0; padding:8px; color:var(--es-muted); background:#121419; text-align:left; font-size:10px; text-transform:uppercase; }
.es-table td { padding:8px; border-top:1px solid var(--es-line); }
.es-table tbody tr[data-clickable="true"] { cursor:pointer; }
.es-table tbody tr[data-clickable="true"]:hover { background:#ffffff08; }
.es-detail td { white-space:normal; color:var(--es-muted); background:#0b0d10; }
.es-history-detail { display:grid; grid-template-columns:1fr 1fr; gap:10px; color:var(--es-text); }
.es-detail-team { min-width:0; padding:8px; border:1px solid var(--es-line); border-radius:9px; background:#111419; }
.es-detail-table { width:100%; margin-top:6px; border-collapse:collapse; white-space:nowrap; font-size:11px; }
.es-detail-table th, .es-detail-table td { padding:5px 6px; border-top:1px solid var(--es-line); text-align:right; }
.es-detail-table th:first-child, .es-detail-table td:first-child { text-align:left; }
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
@media (max-width: 760px) {
  .es-panel { right:10px; left:10px; width:auto; top:124px; }
  .es-grid { grid-template-columns:repeat(2,1fr); }
  .es-map-list { grid-template-columns:repeat(2,1fr); }
  .es-history-detail { grid-template-columns:1fr; }
}
`;
