// src/render/constellation.mjs
import { DRIVER_GROUPS, DRIVER_LABELS, GROUP_LABELS } from '../drivers.mjs';
import { esc } from './html.mjs';

const COL_W = 300;
const ROW_H = 46;
const PAD = 16;

function state(id, primary, secondary) {
  if (id === primary) return 'primary';
  if (secondary.includes(id)) return 'secondary';
  return 'dark';
}

function column(ids, x, primary, secondary, heading) {
  const rows = ids.map((id, i) => {
    const y = PAD + 42 + i * ROW_H;
    return `<g data-driver="${esc(id)}" data-state="${esc(state(id, primary, secondary))}" class="vs-node">
<circle cx="${x + 7}" cy="${y - 5}" r="4"/>
<text x="${x + 24}" y="${y}">${esc(DRIVER_LABELS[id])}</text>
</g>`;
  }).join('\n');
  return `<text class="vs-node__heading" x="${x}" y="${PAD + 12}">${esc(heading)}</text>\n${rows}`;
}

export function constellation({ primary, secondary } = {}) {
  const sec = Array.isArray(secondary) ? secondary : [];
  const rows = Math.max(DRIVER_GROUPS.effectiveness.length, DRIVER_GROUPS.efficiency.length);
  const height = PAD * 2 + 42 + rows * ROW_H;
  return `<figure class="vs-constellation">
<svg viewBox="0 0 ${COL_W * 2} ${height}" role="img"
     aria-label="Value drivers claimed by this initiative">
${column(DRIVER_GROUPS.effectiveness, PAD, primary, sec, GROUP_LABELS.effectiveness)}
${column(DRIVER_GROUPS.efficiency, COL_W + PAD, primary, sec, GROUP_LABELS.efficiency)}
</svg>
</figure>`;
}

export const CONSTELLATION_CSS = `
.vs-constellation{margin:0;padding:0 var(--vs-gutter)}
.vs-constellation svg{width:100%;height:auto;overflow:visible}
.vs-node text{font-family:var(--vs-font-display);font-size:14px;
  fill:var(--vs-ink-faint);dominant-baseline:middle}
.vs-node circle{fill:var(--vs-ink-faint)}
.vs-node__heading{font-family:var(--vs-font-display);font-size:11px;
  text-transform:uppercase;letter-spacing:0.16em;fill:var(--vs-ink-dim)}
.vs-node[data-state="primary"] text{fill:var(--vs-ink);font-weight:650}
.vs-node[data-state="primary"] circle{fill:var(--vs-accent);r:6}
.vs-node[data-state="secondary"] text{fill:var(--vs-ink-dim)}
.vs-node[data-state="secondary"] circle{fill:var(--vs-ink-dim)}
.vs-node[data-state="dark"] text{fill:var(--vs-ink-faint);opacity:0.45}
.vs-node[data-state="dark"] circle{fill:var(--vs-ink-faint);opacity:0.3}
@media print{.vs-node[data-state="dark"]{opacity:0.35}}
`;
