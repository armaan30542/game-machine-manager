/* eslint-disable */
// @ts-nocheck
// Partner settlement ledger.
// Framework-free: it renders into `root` with template strings and one set of
// delegated listeners, and reaches storage, image reading and estimates only
// through `caps` (see ledger-page-client.tsx). Returns an unmount function.
export function mountLedger(root, caps) {
'use strict';
const ctl = new AbortController();
const on = (type, fn) => root.addEventListener(type, fn, { signal: ctl.signal });
root.innerHTML = '<div class="range" id="lg-range"></div><nav class="tabs" aria-label="Ledger sections"><div id="lg-tabs"></div></nav><div class="lg-main" id="lg-view"></div>';
const $ = (s, el = root) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : Number(v); return Number.isFinite(n) ? n : 0; };
const sum = a => a.reduce((t, x) => t + num(x), 0);
const money = (n, dec) => { const v = dec ? Math.round(num(n) * 100) / 100 : Math.round(num(n)); const s = '$' + Math.abs(v).toLocaleString('en-US', dec ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}); return v < 0 ? '−' + s : s; };
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 + '%' : '–';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const plabel = p => { if (!/^\d{4}-\d{2}$/.test(p || '')) return p || 'No month'; const [y, m] = p.split('-'); return MONTHS[+m - 1] + ' ' + y; };
const dlabel = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return d || ''; const [y, m, dd] = d.split('-'); return MONTHS[+m - 1] + ' ' + (+dd) + ', ' + y; };
const nextMonth = p => { let [y, m] = p.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0'); };
const STATE_NAMES = { TX: 'Texas', VA: 'Virginia', FL: 'Florida' };
const STATE_ORDER = ['TX', 'VA', 'FL'];
const stateColor = s => ({ TX: 'var(--s1)', VA: 'var(--s2)', FL: 'var(--s3)' }[s] || 'var(--s4)');
const sname = s => STATE_NAMES[s] || s;
const CATS = { pay: "Manek's pay", papa: 'Papa (contractor)', commission: 'Commissions', cash: 'Cash expenses', card: 'Credit card', truck: 'Truck rental', decals: 'Decals and licences', systems: 'Systems and software', equipment: 'Equipment', tech: 'Technicians and installs', signs: 'Signs', accounting: 'Accounting', tax: 'IRS and taxes', family: 'Aunty', vehicle: 'Car payment', funded: 'Funded purchases', other: 'Other' };
const KINDS = { expense: 'Expense', pay: "Manek's pay", repay: 'Payback to SP and SS', tax: 'Tax' };
const DOC_TYPES = { receipt: 'Receipt', redemption_log: 'Redemption log', tax: 'Tax filing', payout_breakdown: 'Payout breakdown', other: 'Other' };
const PARTNERS = { SP: 'SP', SS: 'SS', SM: 'Manek' };
const VIEWS = [['overview', 'Overview'], ['statements', 'Statements'], ['add', 'Add image'], ['partners', 'Partners'], ['expenses', 'Expenses'], ['states', 'States'], ['funded', 'Funded items'], ['documents', 'Documents'], ['checks', 'Checks']];

const S = { db: null, sample: null, assets: null, downloads: null, canWrite: true, imgLimits: null, ready: false, noStore: false, slow: false, dead: null,
  reports: [], docs: [], investments: [], settings: {}, got: {},
  view: 'overview', from: '', to: '', open: null, confirm: null, draft: null, pending: null, reading: false, readErr: '', saveErr: '', saving: false, dupe: null, ctl: null, exFilter: '', exCat: '', est: {}, settling: null, settleErr: null, importMsg: '', importErr: '' };

/* ---------- calculations ---------- */
function calc(r) {
  const coll = sum((r.collections || []).map(c => c.amount));
  const lines = r.lines || [];
  const op = sum(lines.filter(l => l.section !== 'below').map(l => l.amount));
  const below = sum(lines.filter(l => l.section === 'below').map(l => l.amount));
  const net1 = coll - op, net2 = net1 - below, each = net2 / 3;
  const pay = sum(lines.filter(l => l.kind === 'pay').map(l => l.amount));
  const back = { SP: 0, SS: 0 }, front = { SP: 0, SS: 0 };
  for (const l of lines) for (const p of ['SP', 'SS']) { const v = num(l.reimb && l.reimb[p]); if (l.kind === 'repay') back[p] += v; else front[p] += v; }
  const due = { SP: each + back.SP + front.SP, SS: each + back.SS + front.SS, SM: each + pay };
  const repay = sum(lines.filter(l => l.kind === 'repay').map(l => l.amount));
  return { coll, op, below, net1, net2, each, pay, back, front, due, repay };
}
function reportChecks(r) {
  const c = calc(r), st = r.stated || {}, out = [];
  const has = v => v !== null && v !== undefined && v !== '';
  if (has(st.net1) && Math.abs(num(st.net1) - c.net1) > 0.5) out.push({ level: 'warn', text: `Net after expenses is ${money(st.net1)} on the sheet, but the lines add up to ${money(c.net1)}.` });
  if (has(st.net2) && Math.abs(num(st.net2) - c.net2) > 0.5) out.push({ level: 'warn', text: `Net to split is ${money(st.net2)} on the sheet, but the lines add up to ${money(c.net2)}.` });
  if (has(st.each) && Math.abs(num(st.each) - c.each) >= 1) out.push({ level: 'info', text: `The sheet pays ${money(st.each)} each; an exact third is ${money(c.each, true)}. That leaves ${money((c.each - num(st.each)) * 3)} undistributed.` });
  for (const p of ['SP', 'SS']) if (has(st[p]) && Math.abs(num(st[p]) - c.due[p]) >= 1) {
    const gap = c.due[p] - num(st[p]);
    out.push({ level: Math.abs(gap) > 10 ? 'warn' : 'info', text: `${p}: the sheet shows ${money(st[p])}, but share plus paybacks comes to ${money(c.due[p])}. ${gap > 0 ? money(gap) + ' is not shown as paid on the sheet.' : money(-gap) + ' more than the lines explain.'}` });
  }
  for (const l of r.lines || []) if (l.kind === 'repay') { const rb = num(l.reimb && l.reimb.SP) + num(l.reimb && l.reimb.SS); if (Math.abs(rb - num(l.amount)) > 0.5) out.push({ level: 'info', text: `“${l.label}” is a payback of ${money(l.amount)}, but only ${money(rb)} is assigned to SP and SS.` }); }
  for (const f of r.flags || []) out.push({ level: 'info', text: f });
  return out;
}
const inRange = r => (!S.from || r.period >= S.from) && (!S.to || r.period <= S.to);
const visible = () => S.reports.filter(inRange);
const reportTitle = r => `${plabel(r.period)} · ${(r.collections || []).map(c => sname(c.state)).join(' + ') || 'No collections'}`;
function byMonth(reports) {
  const m = new Map();
  for (const r of reports) {
    const c = calc(r); let x = m.get(r.period);
    if (!x) { x = { period: r.period, coll: 0, op: 0, below: 0, net1: 0, net2: 0, each: 0, pay: 0, repay: 0, due: { SP: 0, SS: 0, SM: 0 }, byState: {}, n: 0 }; m.set(r.period, x); }
    for (const k of ['coll', 'op', 'below', 'net1', 'net2', 'each', 'pay', 'repay']) x[k] += c[k];
    for (const p of ['SP', 'SS', 'SM']) x.due[p] += c.due[p];
    for (const cl of r.collections || []) x.byState[cl.state] = (x.byState[cl.state] || 0) + num(cl.amount);
    x.n++;
  }
  return [...m.values()].sort((a, b) => a.period < b.period ? -1 : 1);
}
function totals(reports) {
  const t = { coll: 0, op: 0, below: 0, net1: 0, net2: 0, each: 0, pay: 0, repay: 0, due: { SP: 0, SS: 0, SM: 0 }, back: { SP: 0, SS: 0 }, front: { SP: 0, SS: 0 } };
  for (const r of reports) { const c = calc(r); for (const k of ['coll', 'op', 'below', 'net1', 'net2', 'each', 'pay', 'repay']) t[k] += c[k]; for (const p of ['SP', 'SS', 'SM']) t.due[p] += c.due[p]; for (const p of ['SP', 'SS']) { t.back[p] += c.back[p]; t.front[p] += c.front[p]; } }
  return t;
}
function allStates(reports) { const s = new Set(); for (const r of reports) for (const c of r.collections || []) s.add(c.state); return [...s].sort((a, b) => { const i = STATE_ORDER.indexOf(a), j = STATE_ORDER.indexOf(b); return (i < 0 ? 9 : i) - (j < 0 ? 9 : j) || (a < b ? -1 : 1); }); }
function coverage(reports) {
  const months = byMonth(reports); if (!months.length) return { periods: [], states: [], gaps: [] };
  const states = allStates(S.reports), periods = []; let p = months[0].period; const last = months[months.length - 1].period;
  while (p <= last && periods.length < 240) { periods.push(p); p = nextMonth(p); }
  const map = new Map(months.map(m => [m.period, m])), gaps = [];
  for (const pr of periods) for (const s of states) if (!(map.get(pr) && map.get(pr).byState[s] !== undefined)) gaps.push({ period: pr, state: s });
  return { periods, states, gaps, map };
}
function globalChecks(reports) {
  const out = [], months = byMonth(reports);
  for (const m of months) {
    const pays = reports.filter(r => r.period === m.period).flatMap(r => (r.lines || []).filter(l => l.kind === 'pay'));
    if (!pays.length) out.push({ level: 'warn', text: `${plabel(m.period)}: no pay line for Manek on any sheet.` });
    else if (pays.length > 1) out.push({ level: 'warn', text: `${plabel(m.period)}: Manek's pay appears ${pays.length} times (${money(sum(pays.map(l => l.amount)))} in total).` });
    else if (num(pays[0].amount) !== 15000) out.push({ level: 'info', text: `${plabel(m.period)}: Manek's pay is ${money(pays[0].amount)}, not the usual $15,000.` });
  }
  for (const g of coverage(reports).gaps) out.push({ level: 'info', text: `${plabel(g.period)}: no ${sname(g.state)} collection on any sheet.` });
  return out;
}
function accounts() {
  const m = new Map(), get = name => { const k = String(name || 'Unnamed').trim().toLowerCase(); if (!m.has(k)) m.set(k, { name: String(name || 'Unnamed').trim(), put: 0, back: 0, hist: [] }); return m.get(k); };
  for (const i of S.investments) { const a = get(i.account); a.put += num(i.amount); a.hist.push({ date: i.date || '', type: 'put', amount: num(i.amount), note: i.note || '', inferred: !!i.inferred, id: i.id }); }
  for (const r of S.reports) for (const l of r.lines || []) if (l.kind === 'repay') { const a = get(l.account || l.label); a.back += num(l.amount); a.hist.push({ date: r.sentDate || r.period + '-28', type: 'back', amount: num(l.amount), note: `${l.label} (${reportTitle(r)})` }); }
  const list = [...m.values()]; for (const a of list) a.hist.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : (x.type === 'put' ? -1 : 1));
  return list.sort((a, b) => (b.put - b.back) - (a.put - a.back));
}
function allLines(reports) { const out = []; for (const r of reports) for (const l of r.lines || []) out.push({ r, l }); return out; }

/* ---------- shell ---------- */
function attentionCount() { return visible().reduce((t, r) => t + reportChecks(r).filter(c => c.level === 'warn').length, 0) + globalChecks(visible()).filter(c => c.level === 'warn').length; }
function renderShell() {
  const n = S.ready ? attentionCount() : 0;
  $('#lg-tabs').innerHTML = VIEWS.map(([k, l]) => `<a href="#${k}"${S.view === k ? ' aria-current="page"' : ''}>${l}${k === 'checks' && n ? `<span class="n">${n}</span>` : ''}</a>`).join('');
  const ps = [...new Set(S.reports.map(r => r.period))].sort();
  const opt = (v, cur, first) => `<option value="">${first}</option>` + ps.map(p => `<option value="${esc(p)}"${p === cur ? ' selected' : ''}>${esc(plabel(p))}</option>`).join('');
  $('#lg-range').innerHTML = ps.length ? `<label for="f-from">From</label><select id="f-from" data-range="from">${opt('', S.from, 'First month')}</select><label for="f-to">to</label><select id="f-to" data-range="to">${opt('', S.to, 'Latest month')}</select>` : '';
}
function banners() {
  let h = '';
  if (S.noStore) h += `<div class="banner crit">The ledger's data can't be reached. Reload the page, and check that you are signed in as an admin.</div>`;
  else if (S.dead) h += `<div class="banner crit">The connection to the ledger's data was lost. Reload the page to reconnect.</div>`;
  else if (S.slow && !S.ready) h += `<div class="banner">The data hasn't arrived yet. It may be a slow connection; this page will fill in when it answers.</div>`;
  if (S.ready && !S.canWrite) h += `<div class="banner info">You have view-only access, so adding and editing are turned off.</div>`;
  return h;
}
function render() {
  renderShell();
  const v = $('#lg-view');
  if (!S.ready && !S.noStore) { v.innerHTML = banners() + `<div class="empty"><span class="spin"></span>Loading statements, documents and funded items…</div>`; return; }
  const fn = { overview: vOverview, statements: vStatements, add: vAdd, partners: vPartners, expenses: vExpenses, states: vStates, funded: vFunded, documents: vDocuments, checks: vChecks }[S.view] || vOverview;
  v.innerHTML = banners() + fn();
  if (S.view === 'overview' || S.view === 'states') wireChart();
}
const emptyMsg = `<div class="empty">No statements yet. Go to <a href="#add">Add image</a> to upload one of Manek's sheets, enter one by hand, or import a backup.</div>`;

/* ---------- chart ---------- */
function chartHtml(months) {
  if (!months.length) return '';
  const states = allStates(S.reports), W = 720, H = 250, L = 46, R = 10, T = 22, B = 28;
  const max = Math.max(...months.map(m => m.coll), 1), step = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 500000].find(s => max / s <= 5) || 1000000, top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top), slot = (W - L - R) / months.length, bw = Math.min(24, slot * 0.5);
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line class="${v ? 'grid' : 'axis'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? v / 1000 + 'k' : v}</text>`;
  months.forEach((m, i) => {
    const cx = L + slot * i + slot / 2, x = cx - bw / 2; let acc = 0;
    const segs = states.filter(s => m.byState[s] > 0);
    segs.forEach((s, j) => {
      const v = m.byState[s], y1 = y(acc + v), y0 = y(acc) - (j ? 2 : 0), h = Math.max(1, y0 - y1), last = j === segs.length - 1, r = last ? Math.min(4, h) : 0;
      g += `<path fill="${stateColor(s)}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z"/>`;
      acc += v;
    });
    g += `<text class="tot" x="${cx}" y="${y(m.coll) - 6}" text-anchor="middle">${Math.round(m.coll / 1000)}k</text><text x="${cx}" y="${H - 9}" text-anchor="middle">${esc(plabel(m.period).replace(/ \d{2}(\d{2})$/, " '$1"))}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="${T - 10}" width="${slot}" height="${H - T - B + 10}"/>`;
  });
  return `<div class="legend">${states.map(s => `<span><i class="dot" style="background:${stateColor(s)}"></i>${esc(sname(s))}</span>`).join('')}</div>
  <div class="chart" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly collections by state, stacked bars">${g}</svg><div class="tip" id="tip" hidden></div></div>`;
}
function wireChart() {
  const ch = $('#chart'); if (!ch) return; const tip = $('#tip'), months = byMonth(visible()), states = allStates(S.reports);
  ch.addEventListener('pointermove', e => {
    const t = e.target.closest('.hit'); if (!t) { tip.hidden = true; return; }
    const m = months[+t.dataset.i]; if (!m) return;
    tip.textContent = ''; const b = document.createElement('b'); b.textContent = plabel(m.period); tip.append(b);
    for (const s of [...states].reverse()) if (m.byState[s] !== undefined) { const d = document.createElement('div'); const a = document.createElement('span'), i = document.createElement('i'); i.className = 'dot'; i.style.background = stateColor(s); a.append(i, sname(s)); const v = document.createElement('span'); v.textContent = money(m.byState[s]); d.append(a, v); tip.append(d); }
    const d = document.createElement('div'); d.style.fontWeight = '600'; const a = document.createElement('span'); a.textContent = 'Total'; const v = document.createElement('span'); v.textContent = money(m.coll); d.append(a, v); tip.append(d);
    tip.hidden = false; const box = ch.getBoundingClientRect(); let x = e.clientX - box.left + 12; if (x + 170 > box.width) x = e.clientX - box.left - 170; tip.style.left = Math.max(0, x) + 'px'; tip.style.top = Math.max(0, e.clientY - box.top - 20) + 'px';
  });
  ch.addEventListener('pointerleave', () => { tip.hidden = true; });
}

/* ---------- views ---------- */
function vOverview() {
  const rs = visible(); if (!rs.length) return emptyMsg;
  const t = totals(rs), months = byMonth(rs), warn = attentionCount();
  const kp = (l, v, d, cls) => `<div class="kpi ${cls || ''}"><span class="l">${l}</span><span class="v">${v}</span><span class="d">${d}</span></div>`;
  return `<section>
    <div class="kpis">
      ${kp('Collections', money(t.coll), `${rs.length} statements, ${months.length} months`)}
      ${kp('Operating expenses', money(t.op), `${pct(t.op, t.coll)} of collections, incl. ${money(t.pay)} pay`)}
      ${kp('Net after expenses', money(t.net1), `${pct(t.net1, t.coll)} of collections`)}
      ${kp('Paybacks, tax, prepaid', money(t.below), `${money(t.repay)} of it paid back to SP and SS`)}
      ${kp('Profit split three ways', money(t.net2), `${money(t.each)} per partner`)}
    </div>
    ${warn ? `<div class="banner">${warn} item${warn > 1 ? 's' : ''} on the sheets ${warn > 1 ? "don't" : "doesn't"} add up. <a href="#checks">Open Checks</a></div>` : ''}
  </section>
  <section><div class="hd"><h2>Collections by month</h2><p>Stacked by state. Hover a bar for the figures.</p></div>
    <div class="panel">${chartHtml(months)}</div></section>
  <section><div class="hd"><h2>Month by month</h2>${S.downloads ? `<div class="row"><button data-act="csv-months">Export months (CSV)</button><button data-act="csv-lines">Export every line (CSV)</button></div>` : ''}</div>
    <div class="scroll"><table><thead><tr><th>Month</th><th>Collections</th><th>Operating exp.</th><th>Net after exp.</th><th>Paybacks, tax</th><th>Profit split</th><th>Each</th><th>SP total</th><th>SS total</th><th>Manek total</th></tr></thead><tbody>
    ${months.map(m => `<tr><td>${esc(plabel(m.period))}</td><td>${money(m.coll)}</td><td>${money(m.op)}</td><td>${money(m.net1)}</td><td>${money(m.below)}</td><td>${money(m.net2)}</td><td>${money(m.each)}</td><td>${money(m.due.SP)}</td><td>${money(m.due.SS)}</td><td>${money(m.due.SM)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${money(t.coll)}</td><td>${money(t.op)}</td><td>${money(t.net1)}</td><td>${money(t.below)}</td><td>${money(t.net2)}</td><td>${money(t.each)}</td><td>${money(t.due.SP)}</td><td>${money(t.due.SS)}</td><td>${money(t.due.SM)}</td></tr>
    </tbody></table></div>
    <p class="note">Partner totals are what each should receive under the rules: a third of the profit, plus paybacks on purchases SP and SS funded, plus Manek's pay for him. Compare them with what the sheets show under Partners.</p></section>`;
}

function vStatements() {
  if (S.open) { const r = S.reports.find(x => x.id === S.open); if (r) { loadEstimate(r.id); return statementDetail(r); } S.open = null; }
  const rs = visible().slice().sort((a, b) => (b.period + (b.sentDate || '')).localeCompare(a.period + (a.sentDate || '')));
  if (!rs.length) return emptyMsg;
  return `<section><div class="hd"><h2>Statements</h2><p>Select a row to see it laid out like the sheet.</p></div>
  <div class="scroll"><table><thead><tr><th>Month</th><th class="t">States</th><th class="t">Sent</th><th>Collections</th><th>Net to split</th><th>Each</th><th>SP total</th><th class="t">Checks</th></tr></thead><tbody>
  ${rs.map(r => { const c = calc(r), ck = reportChecks(r), w = ck.filter(x => x.level === 'warn').length; return `<tr class="click" data-act="open" data-id="${esc(r.id)}" tabindex="0"><td>${esc(plabel(r.period))}</td><td class="t">${(r.collections || []).map(x => esc(x.state)).join(', ')}</td><td class="t">${esc(dlabel(r.sentDate))}</td><td>${money(c.coll)}</td><td>${money(c.net2)}</td><td>${money(c.each)}</td><td>${money(c.due.SP)}</td><td class="t">${w ? `<span class="pill warn">${w} to review</span>` : ck.length ? `<span class="pill muted">${ck.length} note${ck.length > 1 ? 's' : ''}</span>` : `<span class="pill ok">Adds up</span>`}</td></tr>`; }).join('')}
  </tbody></table></div></section>`;
}
function statementDetail(r) {
  const c = calc(r), st = r.stated || {}, ck = reportChecks(r);
  const has = v => v !== null && v !== undefined && v !== '';
  const cmp = (stated, actual) => !has(stated) ? '' : Math.abs(num(stated) - actual) < 1 ? ` <span class="pill ok">Matches sheet</span>` : ` <span class="pill warn">Sheet says ${money(stated)}</span>`;
  const lineRow = l => { const rb = (l.reimb || {}), sp = num(rb.SP), ss = num(rb.SS); let tag = ''; if (l.kind === 'repay') tag = `<span class="pill acc">Payback${l.account ? ': ' + esc(l.account) : ''}</span>`; else if (l.kind === 'pay') tag = `<span class="pill muted">Pay</span>`; else if (l.kind === 'tax') tag = `<span class="pill muted">Tax</span>`;
    const to = sp || ss ? `<span class="dim">${sp ? 'SP ' + money(sp) : ''}${sp && ss ? ' · ' : ''}${ss ? 'SS ' + money(ss) : ''}</span>` : '';
    return `<tr><td class="wrapcell">${esc(l.label)} ${tag}</td><td class="t dim">${esc(CATS[l.category] || 'Other')}</td><td class="t">${to}</td><td class="neg">${money(-num(l.amount))}</td></tr>`; };
  const op = (r.lines || []).filter(l => l.section !== 'below'), below = (r.lines || []).filter(l => l.section === 'below');
  const who = (p, rows, total) => `<div class="card"><h3>${PARTNERS[p]}</h3><div class="big">${money(total)}</div><dl>${rows.filter(x => x[1]).map(x => `<dt>${x[0]}</dt><dd>${money(x[1])}</dd>`).join('')}</dl>${p !== 'SM' && has(st[p]) ? `<p>${Math.abs(num(st[p]) - total) < 1 ? '<span class="pill ok">Matches sheet</span>' : `<span class="pill warn">Sheet says ${money(st[p])}</span>`}</p>` : ''}</div>`;
  return `<section>
    <div class="hd"><div><button class="link" data-act="back">← All statements</button><h2 style="margin-top:6px">${esc(reportTitle(r))}</h2><p>${r.sentDate ? 'Sent ' + esc(dlabel(r.sentDate)) : ''}${r.source ? ' · ' + esc(r.source) : ''}</p></div>
    ${S.canWrite ? `<div class="row">${S.confirm === r.id ? `<span>Delete this statement?</span><button class="danger" data-act="del-yes" data-id="${esc(r.id)}">Yes, delete</button><button data-act="del-no">Keep it</button>` : `<button data-act="received" data-id="${esc(r.id)}">${r.received ? 'Mark payouts not received' : 'Mark payouts received'}</button><button data-act="edit" data-id="${esc(r.id)}">Edit</button><button class="danger" data-act="del" data-id="${esc(r.id)}">Delete</button>`}</div>` : ''}</div>
    ${r.received ? `<div class="banner info">Payouts for this statement are marked as received.</div>` : ''}
    <div class="cols">
      <div class="scroll"><table><thead><tr><th>Line</th><th class="t">Category</th><th class="t">Paid back to</th><th>Amount</th></tr></thead><tbody>
        <tr class="grp"><td colspan="4">Collections</td></tr>
        ${(r.collections || []).map(x => `<tr><td><i class="dot" style="background:${stateColor(x.state)}"></i>${esc(sname(x.state))}</td><td></td><td></td><td>${money(x.amount)}</td></tr>`).join('')}
        <tr class="sub"><td colspan="3">Total collections</td><td>${money(c.coll)}</td></tr>
        <tr class="grp"><td colspan="4">Operating expenses</td></tr>
        ${op.map(lineRow).join('') || `<tr><td colspan="4" class="dim">None</td></tr>`}
        <tr class="sub"><td colspan="3">Net after expenses${cmp(st.net1, c.net1)}</td><td>${money(c.net1)}</td></tr>
        ${below.length ? `<tr class="grp"><td colspan="4">Paybacks, tax and prepaid items</td></tr>${below.map(lineRow).join('')}<tr class="sub"><td colspan="3">Net to split${cmp(st.net2, c.net2)}</td><td>${money(c.net2)}</td></tr>` : ''}
        <tr class="tot"><td colspan="3">Each partner, one third${cmp(st.each, c.each)}</td><td>${money(c.each, true)}</td></tr>
      </tbody></table></div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div class="who" style="grid-template-columns:minmax(0,1fr)">
          ${who('SP', [['Profit share', c.each], ['Paybacks on funded items', c.back.SP], ['Out-of-pocket repaid', c.front.SP]], c.due.SP)}
          ${who('SS', [['Profit share', c.each], ['Paybacks on funded items', c.back.SS], ['Out-of-pocket repaid', c.front.SS]], c.due.SS)}
          ${who('SM', [['Profit share', c.each], ['Monthly pay', c.pay]], c.due.SM)}
        </div>
        ${ck.length ? `<ul class="list">${ck.map(x => `<li><span class="pill ${x.level === 'warn' ? 'warn' : 'muted'}">${x.level === 'warn' ? 'Review' : 'Note'}</span><div>${esc(x.text)}</div></li>`).join('')}</ul>` : ''}
        ${r.notes ? `<p class="note">${esc(r.notes)}</p>` : ''}
      </div>
    </div>
    ${estimateBlock(r)}
    ${(r.images || []).length ? `<h3>Original image${r.images.length > 1 ? 's' : ''}</h3><div class="thumbs">${r.images.map(id => `<a href="${esc(caps.imageUrl(id))}" target="_blank" rel="noopener"><img src="${esc(caps.imageUrl(id))}" alt="Original sheet" loading="lazy"></a>`).join('')}</div>` : ''}
  </section>`;
}

function estimateBlock(r) {
  if (!caps.estimates) return '';
  const rows = S.est[r.id], busy = S.settling && S.settling.id === r.id ? S.settling : null;
  const btn = label => S.canWrite && !busy ? `<button data-act="settle" data-id="${esc(r.id)}">${label}</button>` : '';
  const prog = busy ? `<p><span class="spin"></span>${esc(busy.label)}</p>` : '';
  const err = S.settleErr && S.settleErr.id === r.id ? `<div class="banner crit">${esc(S.settleErr.text)}</div>` : '';
  if (rows === undefined) return `<section><h3>Estimate vs actual</h3><p class="note">Loading the estimate…</p></section>`;
  if (!rows.length) return `<section><div class="hd"><h3>Estimate vs actual</h3>${btn('Calculate estimate')}</div>${prog}${err}<p class="note">No estimate has been taken for this sheet. Calculating one checks ksys22 for this sheet's states, then claims every cleared period that no other sheet has used.</p></section>`;
  const tot = rows.reduce((t, x) => ({ e: t.e + num(x.estimate), a: t.a + num(x.actual) }), { e: 0, a: 0 });
  const diffCell = d => `<td class="${d < 0 ? 'neg' : ''}">${d > 0 ? '+' : ''}${money(d)}</td>`;
  return `<section><div class="hd"><h3>Estimate vs actual</h3><div class="row"><a href="/estimates">Open Estimates</a>${btn('Recalculate estimate')}</div></div>${prog}${err}
    <div class="scroll"><table><thead><tr><th>State</th><th>Estimate</th><th>Actual on sheet</th><th>Difference</th><th>Locations cleared</th><th>Not cleared</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td><i class="dot" style="background:${stateColor(x.state)}"></i>${esc(sname(x.state))}</td><td>${money(x.estimate)}</td><td>${money(x.actual)}</td>${diffCell(num(x.actual) - num(x.estimate))}<td>${num(x.cleared_count)}</td><td>${num(x.not_cleared_count)}</td></tr>`).join('')}
    ${rows.length > 1 ? `<tr class="tot"><td>Total</td><td>${money(tot.e)}</td><td>${money(tot.a)}</td>${diffCell(tot.a - tot.e)}<td></td><td></td></tr>` : ''}
    </tbody></table></div>
    ${rows.map(x => { const nc = (x.details && x.details.not_cleared) || []; return nc.length ? `<p class="note"><strong>${esc(sname(x.state))}, not cleared (${nc.length}):</strong> ${nc.map(c => esc(c.location_number + ' - ' + c.name)).join('; ')}</p>` : ''; }).join('')}
    <p class="note">The estimate is each cleared location's ksys22 period net, less fees, times its % share. Taken ${esc(dlabel(String(rows[0].created_at || '').slice(0, 10)))}.</p></section>`;
}
async function loadEstimate(id) {
  if (!caps.estimates || S.est[id] !== undefined) return;
  try { S.est[id] = await caps.estimates.get(id); } catch (e) { S.est[id] = []; }
  if (S.view === 'statements' && S.open === id) render();
}
async function runSettle(id) {
  const r = S.reports.find(x => x.id === id); if (!r || !caps.estimates || S.settling) return;
  const states = [...new Set((r.collections || []).map(c => c.state))];
  S.settleErr = null; S.settling = { id, label: 'Checking ksys22 for new clears…' }; render();
  try {
    await caps.estimates.refresh(states, (done, total) => { S.settling = { id, label: `Checking ksys22 for new clears: ${done} of ${total} locations` }; if (S.view === 'statements' && S.open === id) render(); });
    S.settling = { id, label: 'Taking the estimate…' }; if (S.view === 'statements' && S.open === id) render();
    S.est[id] = await caps.estimates.settle({ statement_id: id, period: r.period, sheet_date: r.sentDate || null, collections: (r.collections || []).map(c => ({ state: c.state, amount: num(c.amount) })) });
  } catch (e) { S.settleErr = { id, text: "The estimate couldn't be taken. " + ((e && e.message) || 'Try again.') }; }
  S.settling = null; if (S.view === 'statements') render();
}
async function importBackup(file) {
  S.importMsg = 'Reading the backup…'; S.importErr = ''; render();
  try {
    const b = JSON.parse(await file.text()), map = {}, imgs = Object.entries(b.images || {});
    if (!b.reports && !b.docs && !b.investments) throw new Error('not a backup');
    let n = 0;
    for (const [oldId, im] of imgs) {
      S.importMsg = `Uploading images: ${++n} of ${imgs.length}`; render();
      const bin = atob(im.data), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const up = await S.assets.upload(new File([bytes], im.name || 'image.jpg', { type: im.type || 'image/jpeg' })); map[oldId] = up.id;
    }
    const fix = d => Object.assign({}, d, d.images ? { images: d.images.map(i => map[i] || i) } : {});
    let count = 0;
    for (const col of ['reports', 'docs', 'investments', 'settings']) for (const [id, d] of Object.entries(b[col] || {})) { S.importMsg = `Saving records: ${++count}`; render(); await S.db.doc(col + '/' + id).set(fix(d)); }
    S.importMsg = `Imported ${count} records and ${imgs.length} images.`;
  } catch (e) { S.importMsg = ''; S.importErr = "That file couldn't be imported. Choose the ledger backup (.json) file."; }
  render();
}

function vPartners() {
  const rs = visible().slice().sort((a, b) => (a.period + (a.sentDate || '')).localeCompare(b.period + (b.sentDate || ''))); if (!rs.length) return emptyMsg;
  const t = totals(rs), has = v => v !== null && v !== undefined && v !== '';
  const investor = p => { let stSum = 0, gapSum = 0, any = false;
    const rows = rs.map(r => { const c = calc(r), st = (r.stated || {})[p]; let stc = '<td class="dim">not shown</td><td></td>'; if (has(st)) { any = true; const g = c.due[p] - num(st); stSum += num(st); gapSum += g; stc = `<td>${money(st)}</td><td class="${Math.abs(g) >= 1 ? 'neg' : 'dim'}">${Math.abs(g) < 1 ? '–' : money(g)}</td>`; }
      return `<tr class="click" data-act="open" data-id="${esc(r.id)}" tabindex="0"><td>${esc(reportTitle(r))}</td><td>${money(c.each)}</td><td>${money(c.back[p])}</td><td>${money(c.front[p])}</td><td>${money(c.due[p])}</td>${stc}<td class="t">${r.received ? '<span class="pill ok">Received</span>' : '<span class="pill muted">Not marked</span>'}</td></tr>`; }).join('');
    return `<section><div class="hd"><h2>${PARTNERS[p]}</h2><p>Share of profit plus money paid back</p></div>
    <div class="scroll"><table><thead><tr><th>Statement</th><th>Profit share</th><th>Paybacks</th><th>Out-of-pocket repaid</th><th>Total due</th><th>Sheet shows</th><th>Gap</th><th class="t">Payout</th></tr></thead><tbody>${rows}
    <tr class="tot"><td>Total</td><td>${money(t.each)}</td><td>${money(t.back[p])}</td><td>${money(t.front[p])}</td><td>${money(t.due[p])}</td><td>${any ? money(stSum) : ''}</td><td class="${Math.abs(gapSum) >= 1 ? 'neg' : ''}">${any ? money(gapSum) : ''}</td><td></td></tr></tbody></table></div></section>`; };
  const papa = allLines(rs).filter(x => x.l.category === 'papa');
  return `<section><div class="kpis">
      <div class="kpi"><span class="l">SP total due</span><span class="v">${money(t.due.SP)}</span><span class="d">${money(t.each)} share + ${money(t.back.SP + t.front.SP)} paid back</span></div>
      <div class="kpi"><span class="l">SS total due</span><span class="v">${money(t.due.SS)}</span><span class="d">${money(t.each)} share + ${money(t.back.SS + t.front.SS)} paid back</span></div>
      <div class="kpi"><span class="l">Manek total</span><span class="v">${money(t.due.SM)}</span><span class="d">${money(t.each)} share + ${money(t.pay)} pay</span></div>
      <div class="kpi"><span class="l">Papa (contractor)</span><span class="v">${money(sum(papa.map(x => x.l.amount)))}</span><span class="d">${papa.length} payments</span></div>
    </div>
    <p class="note">Gap is total due minus what the sheet shows for that partner. A positive gap is money the rules say is owed that the sheet does not show being paid. Sheets that don't list partner totals show no gap.</p></section>
  ${investor('SP')}${investor('SS')}
  <section><div class="hd"><h2>Manek</h2><p>Managing partner: monthly pay plus a third of profit</p></div>
    <div class="scroll"><table><thead><tr><th>Statement</th><th>Profit share</th><th>Pay</th><th>Total</th></tr></thead><tbody>
    ${rs.map(r => { const c = calc(r); return `<tr class="click" data-act="open" data-id="${esc(r.id)}" tabindex="0"><td>${esc(reportTitle(r))}</td><td>${money(c.each)}</td><td>${c.pay ? money(c.pay) : '<span class="dim">–</span>'}</td><td>${money(c.due.SM)}</td></tr>`; }).join('')}
    <tr class="tot"><td>Total</td><td>${money(t.each)}</td><td>${money(t.pay)}</td><td>${money(t.due.SM)}</td></tr></tbody></table></div></section>
  <section><div class="hd"><h2>Papa</h2><p>Contractor paid from collections</p></div>
    <div class="scroll"><table><thead><tr><th>Statement</th><th class="t">Line</th><th>Amount</th></tr></thead><tbody>
    ${papa.map(x => `<tr><td>${esc(reportTitle(x.r))}</td><td class="t">${esc(x.l.label)}</td><td>${money(x.l.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="dim">No payments in this range</td></tr>'}
    <tr class="tot"><td colspan="2">Total</td><td>${money(sum(papa.map(x => x.l.amount)))}</td></tr></tbody></table></div></section>`;
}

function expenseRows() {
  const q = S.exFilter.trim().toLowerCase();
  const ls = allLines(visible()).filter(x => (!S.exCat || x.l.category === S.exCat) && (!q || String(x.l.label).toLowerCase().includes(q))).sort((a, b) => num(b.l.amount) - num(a.l.amount));
  return ls.map(x => `<tr><td class="wrapcell">${esc(x.l.label)}</td><td class="t">${esc(CATS[x.l.category] || 'Other')}</td><td class="t">${esc(KINDS[x.l.kind] || 'Expense')}</td><td class="t">${esc(reportTitle(x.r))}</td><td>${money(x.l.amount)}</td></tr>`).join('') + `<tr class="tot"><td colspan="4">${ls.length} lines</td><td>${money(sum(ls.map(x => x.l.amount)))}</td></tr>`;
}
function vExpenses() {
  const rs = visible(); if (!rs.length) return emptyMsg;
  const t = totals(rs), months = byMonth(rs), cat = new Map(), grid = new Map();
  for (const { r, l } of allLines(rs)) { const k = CATS[l.category] ? l.category : 'other'; cat.set(k, (cat.get(k) || 0) + num(l.amount)); const g = grid.get(k) || {}; g[r.period] = (g[r.period] || 0) + num(l.amount); grid.set(k, g); }
  const cats = [...cat.entries()].sort((a, b) => b[1] - a[1]), all = t.op + t.below, max = cats.length ? cats[0][1] : 1;
  return `<section><div class="hd"><h2>Where the money went</h2><p>Every deduction on the sheets, ${money(all)} in total (${pct(all, t.coll)} of collections)</p></div>
    <div class="panel bars">${cats.map(([k, v]) => `<div class="bar"><span class="lab">${esc(CATS[k])}</span><span class="track"><span class="fill" style="display:block;width:${Math.max(1, v / max * 100)}%"></span></span><span>${money(v)} <span class="dim">${pct(v, t.coll)}</span></span></div>`).join('')}</div>
    <p class="note">Percentages are of collections. Funded purchases and car payments are paybacks to SP and SS, not outside spending.</p></section>
  <section><div class="hd"><h2>Category by month</h2></div>
    <div class="scroll"><table><thead><tr><th>Category</th>${months.map(m => `<th>${esc(plabel(m.period))}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${cats.map(([k, v]) => `<tr><td>${esc(CATS[k])}</td>${months.map(m => { const x = (grid.get(k) || {})[m.period]; return `<td>${x ? money(x) : '<span class="dim">–</span>'}</td>`; }).join('')}<td>${money(v)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td>${months.map(m => `<td>${money(m.op + m.below)}</td>`).join('')}<td>${money(all)}</td></tr></tbody></table></div></section>
  <section><div class="hd"><h2>Every line</h2><div class="row"><input id="ex-q" type="search" placeholder="Search lines" value="${esc(S.exFilter)}" aria-label="Search lines"><select id="ex-cat" aria-label="Category"><option value="">All categories</option>${Object.entries(CATS).map(([k, l]) => `<option value="${k}"${S.exCat === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
    <div class="scroll"><table><thead><tr><th>Line</th><th class="t">Category</th><th class="t">Type</th><th class="t">Statement</th><th>Amount</th></tr></thead><tbody id="ex-body">${expenseRows()}</tbody></table></div></section>`;
}

function vStates() {
  const rs = visible(); if (!rs.length) return emptyMsg;
  const months = byMonth(rs), cov = coverage(rs), t = totals(rs), st = {};
  for (const m of months) for (const [s, v] of Object.entries(m.byState)) st[s] = (st[s] || 0) + v;
  return `<section><div class="hd"><h2>Collections by state</h2><p>Hover a bar for the figures.</p></div><div class="panel">${chartHtml(months)}</div></section>
  <section><div class="scroll"><table><thead><tr><th>Month</th>${cov.states.map(s => `<th>${esc(sname(s))}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${cov.periods.map(p => { const m = cov.map.get(p); return `<tr><td>${esc(plabel(p))}</td>${cov.states.map(s => m && m.byState[s] !== undefined ? `<td>${money(m.byState[s])}</td>` : `<td><span class="pill warn">No sheet</span></td>`).join('')}<td>${m ? money(m.coll) : '<span class="dim">–</span>'}</td></tr>`; }).join('')}
    <tr class="tot"><td>Total</td>${cov.states.map(s => `<td>${money(st[s] || 0)}</td>`).join('')}<td>${money(t.coll)}</td></tr>
    <tr><td>Share of collections</td>${cov.states.map(s => `<td>${pct(st[s] || 0, t.coll)}</td>`).join('')}<td>100%</td></tr>
    <tr><td>Average per reported month</td>${cov.states.map(s => { const n = months.filter(m => m.byState[s] !== undefined).length; return `<td>${n ? money((st[s] || 0) / n) : '–'}</td>`; }).join('')}<td>${money(t.coll / months.length)}</td></tr>
  </tbody></table></div>
  <p class="note">“No sheet” means no statement in the ledger lists that state for that month. ${cov.gaps.length ? `There ${cov.gaps.length > 1 ? 'are' : 'is'} ${cov.gaps.length} such gap${cov.gaps.length > 1 ? 's' : ''} in this range.` : 'Every state is covered for every month in this range.'}</p></section>`;
}

function vFunded() {
  const acc = accounts(), put = sum(acc.map(a => a.put)), back = sum(acc.map(a => a.back)), known = acc.filter(a => a.put > 0);
  const owed = sum(known.map(a => Math.max(0, a.put - a.back)));
  return `<section><div class="kpis">
      <div class="kpi"><span class="l">Put in by SP and SS</span><span class="v">${money(put)}</span><span class="d">Purchases entered so far</span></div>
      <div class="kpi"><span class="l">Paid back on the sheets</span><span class="v">${money(back)}</span><span class="d">All months, half to each investor</span></div>
      <div class="kpi me"><span class="l">Still owed to SP and SS</span><span class="v">${money(owed)}</span><span class="d">${money(owed / 2)} each, on items with an amount entered</span></div>
    </div>
    <p class="note">Balances always use every month, whatever range is selected above. Amounts marked “worked back” were inferred from the balance notes on the sheets; replace them with the real purchase amounts when you have them.</p></section>
  <section><div class="hd"><h2>Balances</h2></div>
    ${acc.length ? `<div class="scroll"><table><thead><tr><th>Item</th><th>Put in</th><th>Paid back</th><th>Balance</th><th class="t">Status</th></tr></thead><tbody>
    ${acc.map(a => { const bal = a.put - a.back; return `<tr><td>${esc(a.name)}</td><td>${a.put ? money(a.put) : '<span class="dim">not entered</span>'}</td><td>${money(a.back)}</td><td>${a.put ? money(bal) : '<span class="dim">–</span>'}</td><td class="t">${!a.put ? '<span class="pill warn">Purchase amount needed</span>' : bal > 0.5 ? '<span class="pill acc">Being repaid</span>' : bal < -0.5 ? '<span class="pill warn">Paid back more than entered</span>' : '<span class="pill ok">Cleared</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="empty">No funded items yet. They appear when a statement has a payback line, or when you add a purchase below.</div>`}</section>
  ${S.canWrite ? `<section><div class="hd"><h2>Add a purchase SP and SS paid for</h2></div>
    <form class="panel grid2" id="inv-form">
      <label class="fld"><span>Item</span><input id="inv-account" list="inv-accounts" required placeholder="e.g. Banilla / Omega"><datalist id="inv-accounts">${acc.map(a => `<option value="${esc(a.name)}">`).join('')}</datalist></label>
      <label class="fld"><span>Date</span><input id="inv-date" type="date" required></label>
      <label class="fld"><span>Amount</span><input id="inv-amount" inputmode="decimal" required placeholder="0"></label>
      <label class="fld"><span>Note</span><input id="inv-note" placeholder="Optional"></label>
      <div style="align-self:end"><button class="primary" type="submit">Add purchase</button></div>
    </form></section>` : ''}
  ${acc.map(a => { let bal = 0; return `<section><div class="hd"><h3>${esc(a.name)}</h3></div><div class="scroll"><table><thead><tr><th>Date</th><th class="t">What happened</th><th>Put in</th><th>Paid back</th><th>Balance</th><th></th></tr></thead><tbody>
    ${a.hist.map(h => { bal += h.type === 'put' ? h.amount : -h.amount; return `<tr><td>${esc(dlabel(h.date))}</td><td class="t wrapcell">${esc(h.note || (h.type === 'put' ? 'Purchase' : 'Payback'))}${h.inferred ? ' <span class="pill muted">worked back</span>' : ''}</td><td>${h.type === 'put' ? money(h.amount) : ''}</td><td>${h.type === 'back' ? money(h.amount) : ''}</td><td>${a.put ? money(bal) : '<span class="dim">–</span>'}</td><td>${h.id && S.canWrite ? (S.confirm === 'inv:' + h.id ? `<button class="danger" data-act="inv-del-yes" data-id="${esc(h.id)}">Yes, remove</button> <button data-act="del-no">Keep</button>` : `<button class="link" data-act="inv-del" data-id="${esc(h.id)}">Remove</button>`) : ''}</td></tr>`; }).join('')}
    </tbody></table></div></section>`; }).join('')}`;
}

function vDocuments() {
  const ds = S.docs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<section><div class="hd"><h2>Documents</h2><p>Receipts, machine logs, tax screens and anything else that is not a monthly sheet</p></div>
  ${ds.length ? `<div class="cards">${ds.map(d => `<div class="card"><div class="row" style="justify-content:space-between"><span class="pill acc">${esc(DOC_TYPES[d.type] || 'Other')}</span><span class="dim">${esc(dlabel(d.date))}</span></div><h3>${esc(d.title || 'Untitled')}</h3>${d.vendor ? `<p class="dim">${esc(d.vendor)}</p>` : ''}${d.amount !== null && d.amount !== undefined && d.amount !== '' ? `<p style="font-family:var(--font-head);font-size:18px;font-weight:600">${money(d.amount, true)}</p>` : ''}<p>${esc(d.summary || '')}</p>
    ${(d.images || []).length ? `<div class="thumbs">${d.images.map(id => `<a href="${esc(caps.imageUrl(id))}" target="_blank" rel="noopener"><img src="${esc(caps.imageUrl(id))}" alt="${esc(d.title || 'Document')}" loading="lazy" style="height:110px"></a>`).join('')}</div>` : ''}
    ${S.canWrite ? `<div class="row">${S.confirm === 'doc:' + d.id ? `<button class="danger" data-act="doc-del-yes" data-id="${esc(d.id)}">Yes, delete</button><button data-act="del-no">Keep it</button>` : `<button class="link" data-act="doc-del" data-id="${esc(d.id)}">Delete</button>`}</div>` : ''}</div>`).join('')}</div>` : `<div class="empty">No documents yet. Upload a receipt or screenshot under <a href="#add">Add image</a>.</div>`}</section>`;
}

function vChecks() {
  const rs = visible().slice().sort((a, b) => (a.period + (a.sentDate || '')).localeCompare(b.period + (b.sentDate || ''))); if (!rs.length) return emptyMsg;
  const li = x => `<li><span class="pill ${x.level === 'warn' ? 'warn' : 'muted'}">${x.level === 'warn' ? 'Review' : 'Note'}</span><div>${esc(x.text)}</div></li>`;
  const g = globalChecks(rs);
  const per = rs.map(r => ({ r, ck: reportChecks(r) }));
  return `<section><div class="hd"><h2>Checks</h2><p>The arithmetic on every sheet is redone here, and anything that doesn't add up is listed.</p></div>
    <div class="scroll"><table><thead><tr><th>Statement</th><th>Net after exp.</th><th>Net to split</th><th>Each</th><th class="t">Result</th></tr></thead><tbody>
    ${per.map(({ r, ck }) => { const c = calc(r), w = ck.filter(x => x.level === 'warn').length; return `<tr class="click" data-act="open" data-id="${esc(r.id)}" tabindex="0"><td>${esc(reportTitle(r))}</td><td>${money(c.net1)}</td><td>${money(c.net2)}</td><td>${money(c.each, true)}</td><td class="t">${w ? `<span class="pill warn">${w} to review</span>` : ck.length ? `<span class="pill muted">${ck.length} note${ck.length > 1 ? 's' : ''}</span>` : '<span class="pill ok">Adds up</span>'}</td></tr>`; }).join('')}
    </tbody></table></div></section>
  ${per.filter(x => x.ck.length).map(({ r, ck }) => `<section><div class="hd"><h3>${esc(reportTitle(r))}</h3><button class="link" data-act="open" data-id="${esc(r.id)}">Open statement</button></div><ul class="list">${ck.map(li).join('')}</ul></section>`).join('')}
  ${g.length ? `<section><div class="hd"><h3>Across months</h3></div><ul class="list">${g.map(li).join('')}</ul></section>` : ''}`;
}

/* ---------- add / edit ---------- */
function blankReport() { return { kind: 'report', _id: null, period: '', sentDate: '', source: 'Entered by hand', collections: [{ state: 'TX', amount: '' }], lines: [{ label: '', amount: '', section: 'op', kind: 'expense', category: 'other', account: '', sp: '', ss: '' }], stated: { net1: '', net2: '', each: '', SP: '', SS: '' }, notes: '', flags: [], images: [], received: false }; }
function blankDoc() { return { kind: 'doc', type: 'receipt', title: '', date: '', vendor: '', amount: '', summary: '', images: [] }; }
function draftFromReport(r) { return { kind: 'report', _id: r.id, period: r.period || '', sentDate: r.sentDate || '', source: r.source || '', collections: (r.collections || []).map(c => ({ state: c.state, amount: c.amount })), lines: (r.lines || []).map(l => ({ label: l.label, amount: l.amount, section: l.section === 'below' ? 'below' : 'op', kind: l.kind || 'expense', category: l.category || 'other', account: l.account || '', sp: num(l.reimb && l.reimb.SP) || '', ss: num(l.reimb && l.reimb.SS) || '' })), stated: Object.assign({ net1: '', net2: '', each: '', SP: '', SS: '' }, Object.fromEntries(Object.entries(r.stated || {}).map(([k, v]) => [k, v === null || v === undefined ? '' : v]))), notes: r.notes || '', flags: (r.flags || []).slice(), images: (r.images || []).slice(), received: !!r.received }; }
function draftToReport(d) {
  const nn = v => v === '' || v === null || v === undefined ? null : num(v);
  const collections = d.collections.filter(c => c.state && c.amount !== '').map(c => ({ state: String(c.state).trim().toUpperCase().slice(0, 12), amount: num(c.amount) }));
  return { period: d.period, sentDate: d.sentDate || null, source: d.source || '', states: collections.map(c => c.state), collections,
    lines: d.lines.filter(l => l.label || l.amount !== '').map(l => ({ label: String(l.label || 'Unlabelled').slice(0, 200), amount: num(l.amount), section: l.section === 'below' ? 'below' : 'op', kind: KINDS[l.kind] ? l.kind : 'expense', category: CATS[l.category] ? l.category : 'other', account: l.kind === 'repay' ? (String(l.account || '').trim() || String(l.label || '').trim()) : null, reimb: { SP: num(l.sp), SS: num(l.ss) } })),
    stated: { net1: nn(d.stated.net1), net2: nn(d.stated.net2), each: nn(d.stated.each), SP: nn(d.stated.SP), SS: nn(d.stated.SS) }, notes: d.notes || '', flags: d.flags || [], images: d.images || [], received: !!d.received, updatedAt: new Date().toISOString().slice(0, 10) };
}
function draftSummary() {
  const d = S.draft; if (!d || d.kind !== 'report') return '';
  const r = draftToReport(d), c = calc(r), ck = reportChecks(Object.assign({}, r, { flags: [] }));
  return `<div class="kpis">
    <div class="kpi"><span class="l">Collections</span><span class="v">${money(c.coll)}</span></div>
    <div class="kpi"><span class="l">Net after expenses</span><span class="v">${money(c.net1)}</span></div>
    <div class="kpi"><span class="l">Net to split</span><span class="v">${money(c.net2)}</span></div>
    <div class="kpi"><span class="l">Each</span><span class="v">${money(c.each, true)}</span></div>
    <div class="kpi"><span class="l">SP total</span><span class="v">${money(c.due.SP)}</span></div>
    <div class="kpi"><span class="l">SS total</span><span class="v">${money(c.due.SS)}</span></div>
  </div>${ck.length ? `<ul class="list" style="margin-top:10px">${ck.map(x => `<li><span class="pill ${x.level === 'warn' ? 'warn' : 'muted'}">${x.level === 'warn' ? 'Review' : 'Note'}</span><div>${esc(x.text)}</div></li>`).join('')}</ul>` : `<p class="note" style="margin-top:8px">The lines agree with the totals written on the sheet.</p>`}`;
}
function editorHtml() {
  const d = S.draft, f = (label, path, val, attrs = '') => `<label class="fld"><span>${label}</span><input id="e-${path.replace(/\./g, '-')}" data-p="${path}" value="${esc(val)}" ${attrs}></label>`;
  const sel = (label, path, val, opts) => `<label class="fld"><span>${label}</span><select id="e-${path.replace(/\./g, '-')}" data-p="${path}">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const preview = S.pending ? `<div class="thumbs"><img src="${esc(S.pending.url)}" alt="The image you uploaded" style="height:auto;max-height:520px"></div>` : (d.images || []).length ? `<div class="thumbs">${d.images.map(id => `<img src="${esc(caps.imageUrl(id))}" alt="Original sheet" style="height:auto;max-height:520px">`).join('')}</div>` : '';
  if (d.kind === 'doc') return `<section><div class="hd"><h2>${S.pending ? 'Check what was read' : 'Add a document'}</h2><p>This doesn't look like a monthly sheet, so it will be filed under Documents.</p></div>
    <div class="cols"><div class="panel" style="display:flex;flex-direction:column;gap:10px"><div class="grid2">
      ${sel('Type', 'type', d.type, Object.entries(DOC_TYPES))}${f('Date', 'date', d.date, 'type="date"')}${f('Amount', 'amount', d.amount, 'inputmode="decimal"')}${f('From', 'vendor', d.vendor)}</div>
      ${f('Title', 'title', d.title)}<label class="fld"><span>Summary</span><textarea id="e-summary" data-p="summary">${esc(d.summary)}</textarea></label>
      ${S.saveErr ? `<div class="banner crit">${esc(S.saveErr)}</div>` : ''}
      <div class="row"><button class="primary" data-act="save-doc"${S.saving ? ' disabled' : ''}>${S.saving ? 'Saving…' : 'Save document'}</button><button data-act="as-report">It is a monthly sheet</button><button data-act="cancel">Discard</button></div></div>
    <div>${preview}</div></div></section>`;
  const states = [['TX', 'Texas'], ['VA', 'Virginia'], ['FL', 'Florida']];
  return `<section><div class="hd"><h2>${d._id ? 'Edit statement' : S.pending ? 'Check what was read' : 'New statement'}</h2><p>Fix anything that was misread, then save. Totals update as you type.</p></div>
    ${(d.flags || []).length ? `<ul class="list">${d.flags.map((x, i) => `<li><span class="pill muted">Note</span><div>${esc(x)}</div><button class="link" data-act="rm-flag" data-i="${i}">Dismiss</button></li>`).join('')}</ul>` : ''}
    <div class="cols"><div style="display:flex;flex-direction:column;gap:14px;min-width:0">
      <div class="panel"><div class="grid2">${f('Month covered', 'period', d.period, 'type="month" required')}${f('Date sent', 'sentDate', d.sentDate, 'type="date"')}${f('Source', 'source', d.source)}</div></div>
      <div class="panel"><h3>Collections</h3>
        ${d.collections.map((c, i) => `<div class="crow">${sel('State', `collections.${i}.state`, c.state, states.some(s => s[0] === c.state) || !c.state ? states : states.concat([[c.state, c.state]]))}${f('Amount', `collections.${i}.amount`, c.amount, 'inputmode="decimal"')}<button data-act="rm-coll" data-i="${i}" aria-label="Remove collection">×</button></div>`).join('')}
        <div class="row" style="margin-top:8px"><button data-act="add-coll">Add a state</button></div></div>
      <div class="panel"><h3>Deductions</h3><p class="note">Before first net: ordinary monthly expenses. After first net: paybacks, IRS and big prepaid items. For a payback, the SP and SS boxes say who gets the money back.</p>
        ${d.lines.map((l, i) => `<div class="line">${f('Line', `lines.${i}.label`, l.label)}${f('Amount', `lines.${i}.amount`, l.amount, 'inputmode="decimal"')}${sel('Where', `lines.${i}.section`, l.section, [['op', 'Before first net'], ['below', 'After first net']])}${sel('Type', `lines.${i}.kind`, l.kind, Object.entries(KINDS))}${sel('Category', `lines.${i}.category`, l.category, Object.entries(CATS))}${f('Funded item', `lines.${i}.account`, l.account, `list="acc-list"${l.kind === 'repay' ? '' : ' disabled'}`)}${f('Back to SP', `lines.${i}.sp`, l.sp, 'inputmode="decimal"')}${f('Back to SS', `lines.${i}.ss`, l.ss, 'inputmode="decimal"')}<button data-act="rm-line" data-i="${i}" aria-label="Remove line">×</button></div>`).join('')}
        <datalist id="acc-list">${accounts().map(a => `<option value="${esc(a.name)}">`).join('')}</datalist>
        <div class="row" style="margin-top:10px"><button data-act="add-line">Add a line</button></div></div>
      <div class="panel"><h3>Totals written on the sheet</h3><p class="note">Leave blank if the sheet doesn't show one. They are only used to check the arithmetic.</p>
        <div class="grid2" style="margin-top:8px">${f('Net after expenses', 'stated.net1', d.stated.net1, 'inputmode="decimal"')}${f('Net to split', 'stated.net2', d.stated.net2, 'inputmode="decimal"')}${f('Each partner', 'stated.each', d.stated.each, 'inputmode="decimal"')}${f('SP final total', 'stated.SP', d.stated.SP, 'inputmode="decimal"')}${f('SS final total', 'stated.SS', d.stated.SS, 'inputmode="decimal"')}</div>
        <label class="fld" style="margin-top:10px"><span>Notes</span><textarea id="e-notes" data-p="notes">${esc(d.notes)}</textarea></label></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;min-width:0">${preview}</div></div>
    <div id="draft-sum">${draftSummary()}</div>
    ${S.dupe ? `<div class="banner">A statement for ${esc(plabel(d.period))} with the same states is already in the ledger. <button data-act="save-replace">Replace it</button> <button data-act="save-both">Keep both</button></div>` : ''}
    ${S.saveErr ? `<div class="banner crit">${esc(S.saveErr)}</div>` : ''}
    <div class="row"><button class="primary" data-act="save-report"${S.saving ? ' disabled' : ''}>${S.saving ? 'Saving…' : 'Save statement'}</button>${!d._id ? `<button data-act="as-doc">File as a document instead</button>` : ''}<button data-act="cancel">Discard</button></div></section>`;
}
function vAdd() {
  if (!S.canWrite) return `<div class="empty">You have view-only access, so you can't add statements.</div>`;
  if (S.draft) return editorHtml();
  const canRead = S.sample && S.imgLimits;
  return `<section><div class="hd"><h2>Add an image</h2><p>A monthly sheet, a receipt, a machine log or a screenshot</p></div>
    <div class="drop" id="drop">
      ${S.pending ? `<div class="thumbs"><img src="${esc(S.pending.url)}" alt="The image you chose" style="height:220px"></div><p>${esc(S.pending.file.name)}</p>` : `<p><strong>Choose a photo or drop it here.</strong> ${canRead ? 'Claude reads the figures, and you check them before anything is saved.' : ''}</p>`}
      <div class="row"><input type="file" id="file" accept="${esc(canRead ? S.imgLimits.mediaTypes.join(',') : 'image/*')}" aria-label="Image file">
      ${S.pending ? (S.reading ? `<button data-act="stop">Stop</button>` : `${canRead ? `<button class="primary" data-act="read">Read this image</button>` : ''}<button data-act="clear-file">Remove</button>`) : ''}</div>
      ${S.reading ? `<p><span class="spin"></span>Reading the image. Handwriting usually takes 20 to 60 seconds.</p>` : ''}
      ${S.readErr ? `<div class="banner crit">${esc(S.readErr)}</div>` : ''}
      ${!canRead ? `<div class="banner">Image reading isn't available in this view, so figures have to be typed in. The image is still kept with the statement.</div>` : ''}
    </div>
    <div class="row"><button data-act="manual-report">Enter a statement by hand</button><button data-act="manual-doc">Add a document by hand</button><label class="btn" style="cursor:pointer">Import a ledger backup<input type="file" id="backup-file" accept="application/json,.json" hidden></label></div>
    ${S.importMsg ? `<div class="banner info">${esc(S.importMsg)}</div>` : ''}${S.importErr ? `<div class="banner crit">${esc(S.importErr)}</div>` : ''}
    <p class="note">Images are read by Claude through this app's Anthropic API key, at a few cents per image. Saving a new statement also checks ksys22 and takes the estimate for its states.</p></section>`;
}
function buildPrompt(file) {
  const al = (S.settings && S.settings.aliases) || {}, sent = (String(file.name).match(/(20\d{2})-(\d{2})-(\d{2})/) || [])[0] || '';
  const accs = accounts().map(a => a.name).join(', ') || 'none yet';
  return `You are reading one photo for a small business ledger. Reply with only one JSON object and no other text.

THE BUSINESS. Three partners. SP and SS are investors who pay for equipment up front. Manek (also "SM") is the managing partner and runs skill-game machines in Texas (TX), Virginia (VA) and Florida (FL). Each month Manek sends a settlement sheet, handwritten or a spreadsheet screenshot: collections by state, minus operating expenses and his own monthly pay, giving a first net; then sometimes more deductions (paybacks on purchases SP and SS funded, IRS, big prepaid items), giving a final net that is split into three equal shares. Paybacks on funded purchases go back to SP and SS, half each, on top of their share. Some sheets end with a small table that adds those paybacks to each investor's share.
Names you may see: SP = ${(al.SP || ['SP']).join(', ')}. SS = ${(al.SS || ['SS']).join(', ')}. Manek = ${(al.SM || ['Manek']).join(', ')}. "Papa" or "Pappa" is a contractor.
Funded items already in the ledger: ${accs}. Car payments are also paybacks (funded item "Car").
File name: ${file.name}. ${sent ? 'It was sent on ' + sent + '.' : ''}

JSON SHAPE
{"docType":"settlement"|"payout_breakdown"|"receipt"|"redemption_log"|"tax"|"other",
 "period":"YYYY-MM" or null,
 "collections":[{"state":"TX"|"VA"|"FL","amount":number}],
 "lines":[{"label":string,"amount":number,"section":"op"|"below","kind":"expense"|"pay"|"repay"|"tax","category":string,"account":string or null,"reimb":{"SP":number,"SS":number}}],
 "stated":{"net1":number or null,"net2":number or null,"each":number or null,"SP":number or null,"SS":number or null},
 "warnings":[string],
 "doc":{"title":string,"date":"YYYY-MM-DD" or null,"vendor":string or null,"amount":number or null,"summary":string}}

RULES
- docType "settlement" is a monthly sheet with collections and deductions. Anything else: leave collections and lines empty and fill "doc" (for a receipt: vendor, date, total; for a machine redemption log: machine id, date, total of PAID rows; for a tax screen: what it shows).
- Amounts are positive numbers without signs, commas or currency symbols. One line per deduction, in sheet order, with the label as written (include bracketed notes such as "30k balance").
- section: "op" for deductions before the first net or subtotal, "below" for deductions after it.
- kind: "pay" for Manek's monthly pay (written like "June pay" or "Pay Oct"); "repay" for payments toward a purchase SP and SS funded (the funded items above, car payments, equipment bought in bulk, named people or vendors being paid down with a balance); "tax" for IRS; otherwise "expense".
- category, exactly one of: pay, papa, commission, cash, card, truck (Penske), decals, systems, equipment, tech (technicians, installs), signs, accounting, tax, family (any "Aunty" line), vehicle (car payment), funded (other paybacks), other.
- account: for "repay" lines the funded item's name, reusing a name from the list above when it matches; otherwise null.
- reimb: dollars of this line that go back to SP and to SS. For "repay" lines use half each unless the sheet shows otherwise. If the sheet's payout table adds an expense back to one investor only (for example a gift card or an aunty amount under one column), put that amount under that investor. Otherwise 0 and 0.
- period: the month the sheet covers. Take it from the pay label when there is one; otherwise use the month before the sent date.
- stated: totals as written on the sheet. net1 = first net after operating deductions, net2 = final net that is split, each = one partner's share, SP and SS = each investor's final total if the sheet shows one. Use null for anything not written.
- Check the arithmetic. If a handwritten digit is ambiguous, choose the reading that makes the sheet's own subtotals work and say so in "warnings". Add a warning for every written total that does not equal its parts, and for anything you could not read.`;
}
const READ_ERRORS = { not_configured: "Image reading isn't set up on this copy of the app: the Anthropic API key is missing or was rejected. Use the live site, or check ANTHROPIC_API_KEY in Vercel.", not_granted: "Claude wasn't given permission to read images on this page, so the figures need to be typed in.", rate_limited: "Claude is busy or you've reached a usage limit. Try again in a little while.", image_rejected: "That file can't be read. Use a JPEG or PNG photo under 20 MB.", images_unavailable: "Image reading isn't available in this view.", refused: "Claude declined to read this image.", invalid_json: "The image was read, but the answer came back in a form the ledger couldn't use. Try again.", session_expired: 'Your session has expired. Sign in again and retry.', sampling_disabled: "Claude isn't available for this account here." };
async function readImage() {
  if (!S.pending || !S.sample) return;
  S.reading = true; S.readErr = ''; S.ctl = new AbortController(); render();
  try {
    const out = await S.sample.json(buildPrompt(S.pending.file), { images: [S.pending.file], modelTier: 'complex', signal: S.ctl.signal });
    S.draft = draftFromRead(out || {}, S.pending.file);
  } catch (e) { if (!e || e.code !== 'cancelled') S.readErr = READ_ERRORS[e && e.code] || "The image couldn't be read just now. Try again, or enter the figures by hand."; }
  S.reading = false; S.ctl = null; render();
}
function draftFromRead(o, file) {
  const sent = (String(file.name).match(/(20\d{2})-(\d{2})-(\d{2})/) || [])[0] || '';
  const str = v => typeof v === 'string' ? v : '', nv = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '' : Number(v);
  if (o.docType && o.docType !== 'settlement') { const dc = o.doc || {}; return { kind: 'doc', type: DOC_TYPES[o.docType] ? o.docType : 'other', title: str(dc.title), date: /^\d{4}-\d{2}-\d{2}$/.test(str(dc.date)) ? dc.date : sent, vendor: str(dc.vendor), amount: nv(dc.amount), summary: str(dc.summary), images: [] }; }
  const d = blankReport(); d.source = 'Read from image'; d.sentDate = sent; d.period = /^\d{4}-\d{2}$/.test(str(o.period)) ? o.period : '';
  d.collections = (Array.isArray(o.collections) ? o.collections : []).map(c => ({ state: str(c && c.state).toUpperCase().slice(0, 12), amount: nv(c && c.amount) }));
  if (!d.collections.length) d.collections = [{ state: 'TX', amount: '' }];
  d.lines = (Array.isArray(o.lines) ? o.lines : []).map(l => ({ label: str(l && l.label), amount: nv(l && l.amount), section: l && l.section === 'below' ? 'below' : 'op', kind: KINDS[l && l.kind] ? l.kind : 'expense', category: CATS[l && l.category] ? l.category : 'other', account: str(l && l.account), sp: nv(l && l.reimb && l.reimb.SP) || '', ss: nv(l && l.reimb && l.reimb.SS) || '' }));
  const st = o.stated || {}; d.stated = { net1: nv(st.net1), net2: nv(st.net2), each: nv(st.each), SP: nv(st.SP), SS: nv(st.SS) };
  d.flags = (Array.isArray(o.warnings) ? o.warnings : []).filter(x => typeof x === 'string').slice(0, 12);
  return d;
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
async function uploadPending() { if (!S.pending || !S.assets) return null; try { const r = await S.assets.upload(S.pending.file); return r.id; } catch (e) { return null; } }
async function saveReport(mode) {
  const d = S.draft, r = draftToReport(d); S.saveErr = '';
  if (!/^\d{4}-\d{2}$/.test(r.period)) { S.saveErr = 'Choose the month this statement covers.'; render(); return; }
  if (!r.collections.length) { S.saveErr = 'Add at least one collection amount.'; render(); return; }
  let id = d._id;
  if (!id) { id = r.period + '-' + r.states.map(s => s.toLowerCase()).sort().join('-'); id = slug(id);
    if (S.reports.some(x => x.id === id)) { if (!mode) { S.dupe = id; render(); return; } if (mode === 'both') { let n = 2; while (S.reports.some(x => x.id === id + '-' + n)) n++; id = id + '-' + n; } else { const old = S.reports.find(x => x.id === id); r.images = [...new Set([...(old.images || []), ...r.images])]; } } }
  S.saving = true; S.dupe = null; render();
  const isNew = !d._id;
  try { const img = await uploadPending(); if (img) r.images = [...r.images, img]; await S.db.doc('reports/' + id).set(r); clearPending(); S.draft = null; S.open = id; S.saving = false; location.hash = '#statements'; if (S.view === 'statements') render(); if (isNew && caps.estimates) { delete S.est[id]; setTimeout(() => runSettle(id), 400); } }
  catch (e) { S.saving = false; S.saveErr = saveErrText(e); render(); }
}
async function saveDoc() {
  const d = S.draft; S.saveErr = '';
  if (!d.title.trim()) { S.saveErr = 'Give the document a title.'; render(); return; }
  S.saving = true; render();
  try { const img = await uploadPending(); const doc = { type: DOC_TYPES[d.type] ? d.type : 'other', title: d.title.trim().slice(0, 200), date: d.date || null, vendor: d.vendor || null, amount: d.amount === '' ? null : num(d.amount), summary: d.summary || '', images: img ? [img] : (d.images || []), updatedAt: new Date().toISOString().slice(0, 10) };
    let id = slug(doc.title + '-' + (doc.date || '')), n = 2; const base = id; while (S.docs.some(x => x.id === id)) id = base + '-' + n++;
    await S.db.doc('docs/' + id).set(doc); clearPending(); S.draft = null; S.saving = false; location.hash = '#documents'; if (S.view === 'documents') render(); }
  catch (e) { S.saving = false; S.saveErr = saveErrText(e); render(); }
}
const saveErrText = e => e && e.code === 'quota_exceeded' ? 'The ledger is full. Delete something you no longer need and try again.' : e && e.code === 'invalid_argument' ? "This couldn't be saved. You may not have permission to change the ledger." : "Saving didn't go through. Check your connection and try again.";
function clearPending() { if (S.pending) { try { URL.revokeObjectURL(S.pending.url); } catch (e) {} } S.pending = null; S.readErr = ''; }
function setFile(file) { if (!file || !/^image\//.test(file.type)) { S.readErr = 'Choose an image file (a photo or screenshot).'; render(); return; } clearPending(); S.pending = { file, url: URL.createObjectURL(file) }; render(); }

/* ---------- exports ---------- */
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
async function exportCsv(which) {
  if (!S.downloads) return; const rs = visible(); let rows, name;
  if (which === 'months') { name = 'ledger-months.csv'; rows = [['Month', 'Collections', 'Operating expenses', 'Net after expenses', 'Paybacks tax prepaid', 'Profit split', 'Each', 'SP total', 'SS total', 'Manek total']].concat(byMonth(rs).map(m => [m.period, m.coll, m.op, m.net1, m.below, m.net2, Math.round(m.each * 100) / 100, Math.round(m.due.SP * 100) / 100, Math.round(m.due.SS * 100) / 100, Math.round(m.due.SM * 100) / 100])); }
  else { name = 'ledger-lines.csv'; rows = [['Month', 'Sent', 'Statement', 'Entry', 'Type', 'Category', 'Label', 'Amount', 'Funded item', 'Back to SP', 'Back to SS']];
    for (const r of rs) { for (const c of r.collections || []) rows.push([r.period, r.sentDate || '', r.id, 'Collection', '', '', sname(c.state), num(c.amount), '', '', '']); for (const l of r.lines || []) rows.push([r.period, r.sentDate || '', r.id, l.section === 'below' ? 'After first net' : 'Before first net', KINDS[l.kind] || 'Expense', CATS[l.category] || 'Other', l.label, -num(l.amount), l.account || '', num(l.reimb && l.reimb.SP), num(l.reimb && l.reimb.SS)]); } }
  try { await S.downloads.save({ filename: name, data: toCsv(rows) }); } catch (e) {}
}

/* ---------- events ---------- */
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val; }
on('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.p && S.draft) { setPath(S.draft, t.dataset.p, t.value); const el = $('#draft-sum'); if (el) el.innerHTML = draftSummary(); return; }
  if (t.id === 'ex-q') { S.exFilter = t.value; const b = $('#ex-body'); if (b) b.innerHTML = expenseRows(); }
});
on('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.range) { S[t.dataset.range] = t.value; if (S.from && S.to && S.from > S.to) { if (t.dataset.range === 'from') S.to = S.from; else S.from = S.to; } render(); return; }
  if (t.id === 'file') { setFile(t.files && t.files[0]); return; }
  if (t.id === 'backup-file') { if (t.files && t.files[0]) importBackup(t.files[0]); return; }
  if (t.id === 'ex-cat') { S.exCat = t.value; const b = $('#ex-body'); if (b) b.innerHTML = expenseRows(); return; }
  if (t.dataset && t.dataset.p && S.draft && S.draft.kind === 'report') {
    const m = t.dataset.p.match(/^lines\.(\d+)\.(kind|amount)$/); if (!m) return; const l = S.draft.lines[+m[1]]; if (!l) return;
    if (m[2] === 'kind') { if (l.kind === 'repay') { const h = num(l.amount) / 2; l.sp = h || ''; l.ss = h || ''; if (l.category !== 'vehicle') l.category = 'funded'; if (!l.account) l.account = l.label; } else if (l.kind === 'pay') l.category = 'pay'; else if (l.kind === 'tax') l.category = 'tax'; render(); }
    else if (l.kind === 'repay' && Math.abs(num(l.sp) + num(l.ss) - num(l.amount)) > 0.5) { const h = num(l.amount) / 2; l.sp = h || ''; l.ss = h || ''; render(); }
  }
});
on('submit', async e => {
  if (e.target.id !== 'inv-form') return; e.preventDefault();
  const account = $('#inv-account').value.trim(), date = $('#inv-date').value, amount = num($('#inv-amount').value), note = $('#inv-note').value.trim();
  if (!account || !date || !(amount > 0)) return;
  let id = slug(account + '-' + date), n = 2; const base = id; while (S.investments.some(x => x.id === id)) id = base + '-' + n++;
  try { await S.db.doc('investments/' + id).set({ account, date, amount, note, inferred: false }); } catch (err) {}
});
on('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.click')) { e.preventDefault(); e.target.click(); } });
on('dragover', e => { if (e.target.closest && e.target.closest('#drop')) e.preventDefault(); });
on('drop', e => { if (e.target.closest && e.target.closest('#drop')) { e.preventDefault(); setFile(e.dataTransfer.files && e.dataTransfer.files[0]); } });
on('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act, id = t.dataset.id, i = +t.dataset.i, d = S.draft;
  const go = h => { if (location.hash === '#' + h) render(); else location.hash = '#' + h; };
  switch (a) {
    case 'open': S.open = id; S.confirm = null; go('statements'); root.scrollIntoView({ block: 'start' }); break;
    case 'back': S.open = null; S.confirm = null; render(); break;
    case 'edit': { const r = S.reports.find(x => x.id === id); if (r) { clearPending(); S.draft = draftFromReport(r); S.saveErr = ''; S.dupe = null; go('add'); root.scrollIntoView({ block: 'start' }); } break; }
    case 'del': S.confirm = id; render(); break;
    case 'del-no': S.confirm = null; render(); break;
    case 'del-yes': S.confirm = null; S.open = null; try { await S.db.doc('reports/' + id).delete(); if (caps.estimates) { delete S.est[id]; await caps.estimates.release(id); } } catch (err) {} render(); break;
    case 'settle': runSettle(id); break;
    case 'received': { const r = S.reports.find(x => x.id === id); if (r) try { await S.db.doc('reports/' + id).update({ received: !r.received }); } catch (err) {} break; }
    case 'doc-del': S.confirm = 'doc:' + id; render(); break;
    case 'doc-del-yes': S.confirm = null; try { await S.db.doc('docs/' + id).delete(); } catch (err) {} render(); break;
    case 'inv-del': S.confirm = 'inv:' + id; render(); break;
    case 'inv-del-yes': S.confirm = null; try { await S.db.doc('investments/' + id).delete(); } catch (err) {} render(); break;
    case 'csv-months': exportCsv('months'); break;
    case 'csv-lines': exportCsv('lines'); break;
    case 'read': readImage(); break;
    case 'stop': if (S.ctl) S.ctl.abort(); break;
    case 'clear-file': clearPending(); render(); break;
    case 'manual-report': S.draft = blankReport(); S.saveErr = ''; S.dupe = null; render(); break;
    case 'manual-doc': S.draft = blankDoc(); S.saveErr = ''; render(); break;
    case 'as-report': { const b = blankReport(); b.sentDate = d.date || ''; b.source = S.pending ? 'Read from image' : b.source; S.draft = b; render(); break; }
    case 'as-doc': { const b = blankDoc(); b.date = d.sentDate || ''; b.summary = d.notes || ''; S.draft = b; S.dupe = null; render(); break; }
    case 'cancel': S.draft = null; S.saveErr = ''; S.dupe = null; clearPending(); render(); break;
    case 'add-coll': d.collections.push({ state: ['TX', 'VA', 'FL'].find(s => !d.collections.some(c => c.state === s)) || 'TX', amount: '' }); render(); break;
    case 'rm-coll': d.collections.splice(i, 1); render(); break;
    case 'add-line': d.lines.push({ label: '', amount: '', section: d.lines.length ? d.lines[d.lines.length - 1].section : 'op', kind: 'expense', category: 'other', account: '', sp: '', ss: '' }); render(); break;
    case 'rm-line': d.lines.splice(i, 1); render(); break;
    case 'rm-flag': d.flags.splice(i, 1); render(); break;
    case 'save-report': saveReport(); break;
    case 'save-replace': saveReport('replace'); break;
    case 'save-both': saveReport('both'); break;
    case 'save-doc': saveDoc(); break;
  }
});
function route() { const h = (location.hash || '').slice(1); const v = VIEWS.some(x => x[0] === h) ? h : 'overview'; if (v !== 'statements') S.open = null; S.confirm = null; S.view = v; render(); }
window.addEventListener('hashchange', route, { signal: ctl.signal });

/* ---------- data ---------- */
let rafQ = 0;
function dataChanged() { if (rafQ) return; rafQ = requestAnimationFrame(() => { rafQ = 0; if (S.view === 'add' && (S.draft || S.reading)) { renderShell(); return; } render(); }); }
function subscribe() {
  const timer = setTimeout(() => { S.slow = true; render(); }, 10000);
  const mark = k => { S.got[k] = true; if (S.got.reports && S.got.docs && S.got.investments) { S.ready = true; S.slow = false; clearTimeout(timer); } };
  const fail = e => { clearTimeout(timer); S.dead = e || true; S.ready = true; render(); };
  const col = k => S.db.collection(k).onSnapshot(snap => { S[k] = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })); mark(k); dataChanged(); }, fail);
  col('reports'); col('docs'); col('investments');
  S.db.doc('settings/main').onSnapshot(snap => { S.settings = snap.exists ? snap.data() : {}; }, () => {});
}
function boot() {
  S.db = caps.db; S.sample = caps.sample; S.assets = caps.assets; S.downloads = caps.downloads;
  S.canWrite = caps.canWrite !== false; S.imgLimits = caps.imageTypes ? { mediaTypes: caps.imageTypes } : null;
  route();
  if (!S.db) { S.noStore = true; render(); return; }
  subscribe(); render();
}
boot();
return () => { ctl.abort(); clearPending(); root.innerHTML = ''; };
}
