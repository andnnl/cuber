export const CFOP_THEME_CSS = `
.cfop-root { position:relative; height:100vh; user-select:none; overflow:hidden; background:#eef1f7; }
.cfop-cube { position:absolute; top:0; left:0; right:0; height:49vh; background:var(--cube-background, #eef1f7); }
.cfop-panel { position:absolute; z-index:5; left:0; right:0; bottom:0; height:51vh; overflow:auto;
  padding:12px max(12px,calc((100vw - 850px)/2)); background:#fff; box-shadow:0 -4px 18px #18203922; }
.cfop-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:6px 0; }
.cfop-panel input[type=text] { flex:1 1 260px; min-width:0; }
.cfop-panel input[type=number] { width:68px; }
.cfop-panel button,.cfop-panel input,.cfop-panel select { font-size:14px; min-height:32px; }
.cfop-panel button { border:0; border-radius:5px; padding:4px 9px; background:#ecebff; color:#27205b; }
.cfop-panel button:disabled { opacity:.48; }
.cfop-options { display:flex; flex-wrap:wrap; gap:6px; max-height:92px; overflow:auto; }
.cfop-tracking { display:flex; flex-wrap:wrap; gap:12px; font-size:13px; }
.cfop-tracking span { display:inline-flex; align-items:center; gap:5px; }
.cfop-tracking i { display:inline-block; width:12px; height:12px; border-radius:3px; }
.cfop-option { text-align:left; }
.cfop-segment { border:1px solid #d9deef; padding:7px; margin:6px 0; border-radius:7px; cursor:pointer; }
.cfop-label { display:block; font-weight:600; font-size:14px; }
.cfop-formula { display:flex; flex-wrap:wrap; gap:4px; white-space:normal; overflow-wrap:anywhere; font-size:16px; }
.cfop-token { display:inline-block; min-width:22px; padding:1px 3px; text-align:center; }
.cfop-token.active { background:#4737b5; border-radius:4px; color:white; }
.cfop-error { color:#a12b24; }
@media(max-width:600px) { .cfop-cube { height:42vh; } .cfop-panel { height:58vh; padding:9px; } }
`;
