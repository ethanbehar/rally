'use strict';
/* ClubQuad front-end — vanilla JS, no build step. All DOM is built with h() so user text is never parsed as HTML. */

/* ---------- tiny toolkit ---------- */
const $ = (s, r = document) => r.querySelector(s);
const enc = encodeURIComponent;
const pick = a => a[Math.floor(Math.random() * a.length)];
function kids(e, list) {
  for (const k of list.flat(Infinity)) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
}
function h(tag, props, ...children) {
  const e = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  kids(e, children);
  if (value !== undefined) e.value = value;
  return e;
}
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && S.me) location.reload(); throw new Error(j.error || 'Something went wrong'); }
  return j;
}
const act = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
function toast(text, err) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, text);
  $('#toasts').append(t); setTimeout(() => t.remove(), err ? 4200 : 3000);
}
function confetti() {
  for (let i = 0; i < 28; i++) {
    const s = h('span', { class: 'conf' }, pick(['🎉', '✨', '🎊', '⭐', '💫', '🌟', '🎈']));
    s.style.left = 15 + Math.random() * 70 + 'vw'; s.style.setProperty('--dx', Math.random() * 300 - 150 + 'px'); s.style.animationDelay = Math.random() * .3 + 's';
    document.body.append(s); setTimeout(() => s.remove(), 2400);
  }
}
function modal(title, build, opts = {}) {
  const prevFocus = document.activeElement;
  const body = h('div', { class: 'modal-b' });
  const ov = h('div', { class: 'overlay', onmousedown: e => { if (e.target === ov) close(); } });
  const head = h('h3', {}, title);
  const m = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-h' }, head, h('button', { class: 'btn sm white', onclick: () => close(), 'aria-label': 'Close' }, '✕')), body);
  ov.append(m); document.body.append(ov);
  const onkey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onkey);
  function close() { ov.remove(); document.removeEventListener('keydown', onkey); prevFocus?.focus?.(); }
  const ctl = { close, body, setTitle: t => { head.textContent = t; } };
  build(body, ctl);
  (body.querySelector('input,textarea,select') || m).focus?.();
  return ctl;
}
const field = (label, input, hint) => h('label', { class: 'f' }, h('span', {}, label, hint ? h('small', {}, ' ' + hint) : null), input);

/* ---------- format helpers ---------- */
const fmtT = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
function dayLabel(ts) {
  const d = new Date(ts), t = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
const toLocalInput = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function fmt(text) {
  const out = []; const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s<]+)/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(h('code', {}, t.slice(1, -1)));
    else if (m[2]) out.push(h('b', {}, t.slice(2, -2)));
    else if (m[3]) out.push(h('i', {}, t.slice(1, -1)));
    else out.push(h('a', { href: t, target: '_blank', rel: 'noopener noreferrer' }, t));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const ROLE = { owner: ['👑', 'President'], officer: ['⭐', 'Officer'], member: ['', 'Member'], alumni: ['🎓', 'Alum'], advisor: ['🧑‍🏫', 'Advisor'] };
const isOff = r => r === 'owner' || r === 'officer';
const av = (u, cls = '', online) => h('div', { class: 'av ' + cls, style: { background: u.color }, title: u.name }, u.emoji, online !== undefined ? h('i', { class: 'dot' + (online ? ' on' : '') }) : null);
const stk = (c, cls = '') => h('div', { class: 'stk ' + cls, style: { background: c.color || c.clubColor } }, c.emoji || c.clubEmoji);
const chanIcon = ch => ch.kind === 'announce' ? '📣' : ch.access === 'officers' ? '🔒' : ch.access === 'alumni' ? '🎓' : ch.access === 'members' ? '🙋' : '#';

/* ---------- state ---------- */
const S = {
  me: null, clubs: [], inboxUnread: 0, opts: null, view: { type: 'explore' }, rt: 0,
  club: null, msgs: [], more: false, typing: {}, lastTypingSent: 0,
  events: [], evFilter: 'all', evClub: 0, allClubs: [], tags: [], q: '', tag: '',
  threads: [], thread: null, drawer: false, memOpen: false, es: null,
};
const els = {};
const myClub = id => S.clubs.find(c => c.id === id);
const curClub = () => S.view.clubId && myClub(S.view.clubId);
const curChan = () => curClub()?.channels.find(c => c.id === S.view.chId);
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

/* ---------- boot / auth ---------- */
async function boot() {
  try { await loadBootstrap(); } catch { return showAuth(); }
  S.opts = await api('/options').catch(() => ({ emojis: ['🦊'], colors: ['#ff6b6b'] }));
  buildShell(); connect(); route();
}
async function loadBootstrap() {
  const b = await api('/bootstrap');
  S.me = b.me; S.clubs = b.clubs; S.inboxUnread = b.inboxUnread; S.campus = b.campus; updateTitle();
}
function showAuth() {
  let mode = 'login';
  const root = $('#app'); root.replaceChildren();
  const err = h('div', { class: 'tiny', style: { color: 'var(--red)', fontWeight: 800, minHeight: '1.4em' } });
  const name = h('input', { placeholder: 'What should we call you?', autocomplete: 'name', maxlength: 40 });
  const email = h('input', { type: 'email', placeholder: 'you@school.edu', autocomplete: 'email', required: true });
  const pw = h('input', { type: 'password', placeholder: 'At least 6 characters', autocomplete: 'current-password' });
  const yr = h('select', {}, ...Array.from({ length: 8 }, (_, i) => { const y = new Date().getFullYear() - 1 + i; return h('option', { value: y, selected: y === new Date().getFullYear() + 2 }, "Class of " + y); }));
  const nameF = field('Name', name), yrF = field('Graduation year', yr, '(we use it to roll you into alumni later 🎓)');
  const title = h('h2', {}, 'Welcome back!'), submit = h('button', { class: 'btn pink', type: 'submit', style: { width: '100%', padding: '.8em' } }, 'Log in'), sw = h('button', { type: 'button', class: 'btn ghost sm' }, '');
  function setMode(m) {
    mode = m; nameF.classList.toggle('hidden', m === 'login'); yrF.classList.toggle('hidden', m === 'login');
    title.textContent = m === 'login' ? 'Welcome back!' : 'Join the quad 🎪'; submit.textContent = m === 'login' ? 'Log in' : 'Create my account';
    sw.textContent = m === 'login' ? 'New here? Make an account' : 'Have an account? Log in'; pw.autocomplete = m === 'login' ? 'current-password' : 'new-password'; err.textContent = '';
  }
  sw.onclick = () => setMode(mode === 'login' ? 'signup' : 'login');
  const form = h('form', { class: 'card auth-card', onsubmit: act(async e => {
    e.preventDefault(); err.textContent = '';
    try {
      if (mode === 'login') await api('/login', 'POST', { email: email.value, password: pw.value });
      else await api('/signup', 'POST', { name: name.value, email: email.value, password: pw.value, gradYear: yr.value });
      boot();
    } catch (x) { err.textContent = x.message; }
  }) }, title, h('div', { style: { height: '14px' } }), nameF, field('School email', email), field('Password', pw), yrF, err, submit,
  h('div', { class: 'row nofill', style: { marginTop: '10px', justifyContent: 'space-between' } }, sw,
    h('button', { type: 'button', class: 'btn sm white', onclick: () => { email.value = 'demo@student.edu'; pw.value = 'demo1234'; setMode('login'); form.requestSubmit(); } }, '✨ Try the demo')));
  root.append(
    ...['🎸', '🧩', '🚀', '🎨', '🏀'].map((e, i) => h('div', { class: 'doodle', style: { left: [3, 46, 90, 8, 80][i] + 'vw', top: [8, 4, 14, 86, 88][i] + 'vh', animationDelay: i * .6 + 's' }, 'aria-hidden': 'true' }, e)),
    h('div', { class: 'auth' }, h('div', {},
      h('div', { class: 'hand' }, 'ClubQuad 🎪'),
      h('h1', {}, 'Every club. ', h('span', {}, 'One'), ' ', h('span', { class: 'y' }, 'quad.')),
      h('p', { class: 'lead' }, 'Chat like Discord, but built for how campus clubs actually run: find clubs, join in one tap, see every event, reach any officer, and keep your alumni in the loop.'),
      h('div', { class: 'stickers' }, ...['💬 Club chat', '📅 One events board', '🙋 Volunteer calls', '💌 Message any officer', '🎓 Auto alumni rollover', '🧑‍🏫 Advisor view'].map(t => h('span', { class: 'pill ' + pick(['y', 'p', 'g', 'b', 'o', 'pu']) }, t)))),
      form));
  setMode('login');
}

/* ---------- shell ---------- */
function buildShell() {
  const root = $('#app'); root.replaceChildren();
  els.shell = h('div', { class: 'shell' });
  els.rail = h('nav', { class: 'rail', 'aria-label': 'Clubs' }); els.side = h('aside', { class: 'side' });
  els.main = h('main', { class: 'main' }); els.right = h('aside', { class: 'right' });
  els.shell.append(els.rail, els.side, els.main, els.right); root.append(els.shell);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.view.type === 'club' && curChan()?.unread) markRead(S.view.chId); });
}
function renderAll() {
  const showRight = S.view.type === 'club';
  els.shell.classList.toggle('noright', !showRight); els.shell.classList.toggle('drawer', S.drawer); els.shell.classList.toggle('mem-open', S.memOpen && showRight);
  els.right.classList.toggle('hidden', !showRight);
  renderRail(); renderSide(); renderMain(); renderRight();
}
function railBtn(ic, title, href, on, badge, cls = '') {
  return h('a', { class: 'rail-btn ' + cls + (on ? ' act' : ''), href, title, 'aria-label': title, 'aria-current': on ? 'page' : null }, ic, badge ? h('span', { class: 'badge' }, badge > 99 ? '99+' : badge) : null);
}
function renderRail() {
  const v = S.view;
  els.rail.replaceChildren(
    h('a', { class: 'logo', href: '#/explore', title: 'ClubQuad' }, 'CQ'),
    railBtn('🧭', 'Explore clubs', '#/explore', v.type === 'explore'),
    railBtn('📅', 'Events', '#/events', v.type === 'events'),
    railBtn('💌', 'Inbox', '#/inbox', v.type === 'inbox', S.inboxUnread),
    h('div', { class: 'rail-sep' }),
    ...S.clubs.map(c => {
      const un = c.channels.reduce((n, ch) => n + ch.unread, 0);
      const b = railBtn(c.emoji, c.name, `#/club/${c.id}`, v.type === 'club' && v.clubId === c.id, un, 'club');
      if (!(v.type === 'club' && v.clubId === c.id)) b.style.background = c.color; return b;
    }),
    h('button', { class: 'rail-btn add', title: 'Start a club', 'aria-label': 'Start a club', onclick: createClubModal }, '+'),
    h('button', { class: 'rail-btn add', title: 'Join with an invite code', 'aria-label': 'Join with an invite code', onclick: codeModal }, '🔑'));
}
function meCard() {
  return h('div', { class: 'me-card', onclick: profileModal, role: 'button', tabindex: 0, onkeydown: e => { if (e.key === 'Enter') profileModal(); } }, av(S.me),
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('b', {}, S.me.name), h('div', { class: 'tiny muted' }, (S.me.alum ? 'Alum · ' : '') + 'Class of ' + S.me.gradYear)), h('span', {}, '⚙️'));
}
function renderSide() {
  const v = S.view; let head, body;
  if (v.type === 'club') {
    const c = curClub(); if (!c) return;
    const off = isOff(c.role);
    head = h('div', { class: 'side-head' }, h('div', { class: 'row nofill' }, stk(c), h('div', { class: 'grow', style: { minWidth: 0 } }, h('h3', {}, c.name), h('span', { class: 'pill y' }, (ROLE[c.role][0] + ' ' + ROLE[c.role][1]).trim()))),
      h('div', { class: 'row wrap', style: { marginTop: '12px' } }, !off ? h('button', { class: 'btn sm white', onclick: () => contactModal(c) }, '💌 Message officers') : null,
        h('a', { class: 'btn sm white', href: '#/events', onclick: () => { S.evClub = c.id; } }, '📅 Events'),
        off || c.role === 'advisor' ? h('button', { class: 'btn sm', onclick: () => clubSettings(c.id) }, '⚙️ Manage') : null));
    body = h('div', { class: 'side-body' }, h('h4', {}, 'Channels'),
      ...c.channels.map(ch => h('a', { class: 'chan' + (v.chId === ch.id ? ' act' : '') + (ch.unread ? ' unread' : ''), href: `#/club/${c.id}/${ch.id}` },
        h('span', { class: 'ic' }, chanIcon(ch)), h('span', { class: 'nm' }, ch.name), ch.unread ? h('span', { class: 'badge' }, ch.unread) : null)),
      off ? h('button', { class: 'chan muted', onclick: () => clubSettings(c.id, 'channels') }, h('span', { class: 'ic' }, '＋'), 'Add channel') : null,
      h('div', { style: { height: '20px' } }),
      c.role !== 'owner' ? h('button', { class: 'btn sm ghost muted', onclick: act(async () => { if (!confirm(`Leave ${c.name}?`)) return; await api(`/clubs/${c.id}/leave`, 'POST'); await loadBootstrap(); go('#/explore'); toast('You left ' + c.name); }) }, 'Leave club') : null);
  } else if (v.type === 'events') {
    head = h('div', { class: 'side-head' }, h('h3', {}, '📅 Events'), h('p', { class: 'tiny muted' }, 'Every club, one calendar.'));
    const f = (id, label) => h('button', { class: 'chan' + (S.evFilter === id ? ' act' : ''), onclick: () => { S.evFilter = id; loadEvents(); renderSide(); } }, label);
    body = h('div', { class: 'side-body' }, h('h4', {}, 'Show me'), f('all', '🗓️ Everything'), f('mine', "🎟️ Things I'm doing"), f('volunteer', '🙋 Volunteer spots'),
      h('h4', {}, 'From'), h('button', { class: 'chan' + (!S.evClub ? ' act' : ''), onclick: () => { S.evClub = 0; loadEvents(); renderSide(); } }, '🌎 All clubs'),
      ...S.clubs.map(c => h('button', { class: 'chan' + (S.evClub === c.id ? ' act' : ''), onclick: () => { S.evClub = c.id; loadEvents(); renderSide(); } }, h('span', { class: 'ic' }, c.emoji), h('span', { class: 'nm' }, c.name))));
  } else if (v.type === 'inbox') {
    head = h('div', { class: 'side-head' }, h('h3', {}, '💌 Inbox'), h('p', { class: 'tiny muted' }, 'Message any club’s officers without hunting for their Instagram.'));
    body = h('div', { class: 'side-body' }, S.threads.length ? S.threads.map(t => h('a', { class: 'thread' + (v.threadId === t.id ? ' act' : ''), href: '#/inbox/' + t.id },
      stk({ emoji: t.asOfficer ? t.student.emoji : t.clubEmoji, color: t.asOfficer ? t.student.color : t.clubColor }, 'sm'),
      h('div', { class: 'grow', style: { minWidth: 0 } }, h('b', {}, t.asOfficer ? t.student.name : t.clubName), h('div', { class: 'pv' }, t.asOfficer ? t.clubName + ' · ' + t.subject : t.subject)), t.unread ? h('span', { class: 'badge' }, t.unread) : null))
      : h('div', { class: 'empty' }, h('div', {}, h('div', { class: 'big' }, '📭'), 'No messages yet. Find a club in Explore and hit “Message officers”.')));
  } else {
    head = h('div', { class: 'side-head' }, h('h3', {}, '🧭 Explore'), h('p', { class: 'tiny muted' }, 'Hi ' + S.me.name.split(' ')[0] + '! What are we joining today?'));
    body = h('div', { class: 'side-body' }, h('h4', {}, 'Your clubs'),
      S.clubs.length ? S.clubs.map(c => h('a', { class: 'chan', href: '#/club/' + c.id }, h('span', { class: 'ic' }, c.emoji), h('span', { class: 'nm' }, c.name))) : h('p', { class: 'tiny muted', style: { padding: '4px 8px' } }, 'None yet — join one on the right 👉'),
      h('h4', {}, 'Quick stuff'), h('button', { class: 'chan', onclick: createClubModal }, h('span', { class: 'ic' }, '✨'), 'Start a new club'),
      h('button', { class: 'chan', onclick: codeModal }, h('span', { class: 'ic' }, '🔑'), 'I have an invite code'));
  }
  els.side.replaceChildren(head, body, meCard());
}
function topbar(...parts) {
  return h('div', { class: 'topbar' }, h('button', { class: 'btn sm white burger', 'aria-label': 'Menu', onclick: () => { S.drawer = !S.drawer; els.shell.classList.toggle('drawer', S.drawer); } }, '☰'), ...parts);
}

/* ---------- routing ---------- */
async function route() {
  const rt = ++S.rt, parts = location.hash.replace(/^#\/?/, '').split('/'), t = parts[0] || 'explore';
  S.drawer = false; S.memOpen = false;
  try {
    if (t === 'club') {
      const c = myClub(+parts[1]); if (!c) return go('#/explore');
      let chId = +parts[2]; if (!c.channels.some(x => x.id === chId)) chId = (c.channels.find(x => x.name === 'general') || c.channels[0])?.id;
      S.view = { type: 'club', clubId: c.id, chId }; S.msgs = []; S.more = false; renderAll();
      const [club, ms] = await Promise.all([api('/clubs/' + c.id), api(`/channels/${chId}/messages`)]);
      if (rt !== S.rt) return;
      S.club = club; S.msgs = ms.messages; S.more = ms.more; renderRight(); renderMsgs(true); markRead(chId);
    } else if (t === 'events') {
      S.view = { type: 'events' }; renderAll(); await loadEvents();
    } else if (t === 'inbox') {
      S.view = { type: 'inbox', threadId: +parts[1] || 0 }; S.thread = null; await loadInbox(); if (rt !== S.rt) return; renderAll();
      if (S.view.threadId) { S.thread = await api('/threads/' + S.view.threadId); if (rt !== S.rt) return; await loadInbox(); renderAll(); }
    } else {
      S.view = { type: 'explore' }; renderAll(); await loadExplore();
    }
  } catch (e) { toast(e.message, true); if (t !== 'explore') go('#/explore'); }
}
window.addEventListener('hashchange', () => S.me && route());

function renderMain() {
  const v = S.view;
  if (v.type === 'club') return renderClubMain();
  if (v.type === 'events') return renderEventsMain();
  if (v.type === 'inbox') return renderInboxMain();
  return renderExploreMain();
}

/* ---------- explore ---------- */
function renderExploreMain() {
  let t;
  const search = h('input', { type: 'search', placeholder: 'Search clubs: robotics, music, outdoors…', value: S.q, 'aria-label': 'Search clubs', oninput: e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; loadExplore(); }, 200); } });
  els.main.replaceChildren(topbar(h('h2', {}, 'Find your people')),
    h('div', { class: 'scroll' }, h('div', { class: 'hero' }, h('h1', {}, 'Every club on campus, ', h('em', {}, 'one tap'), ' to join.'),
      h('p', { class: 'muted', style: { margin: '10px 0 14px' } }, 'No more expired links or hunting down an officer’s Instagram.'), search),
      h('div', { class: 'chips', id: 'chips' }), h('div', { class: 'grid', id: 'grid' })));
  renderExploreList();
}
async function loadExplore() { const r = await api(`/clubs?q=${enc(S.q)}&tag=${enc(S.tag)}`); S.allClubs = r.clubs; S.tags = r.tags; if (S.view.type === 'explore') renderExploreList(); }
function renderExploreList() {
  const chips = $('#chips'), grid = $('#grid'); if (!chips) return;
  chips.replaceChildren(h('button', { class: 'chip' + (!S.tag ? ' on' : ''), onclick: () => { S.tag = ''; loadExplore(); } }, 'All'),
    ...S.tags.map(t => h('button', { class: 'chip' + (S.tag === t ? ' on' : ''), onclick: () => { S.tag = t; loadExplore(); } }, '#' + t)));
  grid.replaceChildren(...(S.allClubs.length ? S.allClubs.map(clubCard) : [h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, h('div', {}, h('div', { class: 'big' }, '🔍'), 'No clubs match that. Start it yourself?', h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn pink', onclick: createClubModal }, '✨ Start a club'))))]));
}
function clubCard(c) {
  const join = act(async () => {
    const r = await api(`/clubs/${c.id}/join`, 'POST', {});
    if (r.joined) { await loadBootstrap(); confetti(); toast(`Welcome to ${c.name}! 🎉`); go('#/club/' + c.id); }
    else { toast('Request sent! The officers will see it 🤞'); loadExplore(); }
  });
  return h('article', { class: 'card club-card' },
    h('div', { class: 'row nofill' }, stk(c, 'lg'), h('div', { class: 'grow', style: { minWidth: 0 } }, h('h3', {}, c.name), h('div', { class: 'tiny muted' }, `${c.memberCount} member${c.memberCount === 1 ? '' : 's'}${c.joinMode === 'request' ? ' · by request' : ''}`))),
    h('p', { class: 'desc' }, c.description || 'No description yet.'),
    h('div', { class: 'tags' }, ...c.tags.map(t => h('span', { class: 'pill', style: { cursor: 'pointer' }, onclick: () => { S.tag = t; loadExplore(); } }, '#' + t))),
    c.next ? h('div', { class: 'nx' }, '📅 Next: ', h('b', {}, c.next.title), ' · ', dayLabel(c.next.startsAt), ' ', fmtT(c.next.startsAt)) : null,
    h('div', { class: 'row' },
      c.role ? h('a', { class: 'btn green', href: '#/club/' + c.id }, '✓ Open club') : c.pending ? h('button', { class: 'btn white', disabled: true }, 'Requested ⏳') : h('button', { class: 'btn pink', onclick: join }, c.joinMode === 'open' ? '🙌 Join' : '✋ Request to join'),
      !isOff(c.role) ? h('button', { class: 'btn white', onclick: () => contactModal(c) }, '💌 Message officers') : null));
}

/* ---------- club chat ---------- */
function renderClubMain() {
  const c = curClub(), ch = curChan(); if (!c || !ch) return;
  const off = isOff(c.role), canPost = ch.kind !== 'announce' || off;
  const ta = h('textarea', { rows: 1, placeholder: `Message #${ch.name}`, maxlength: 2000, 'aria-label': 'Message' });
  const send = act(async () => {
    const body = ta.value.trim(); if (!body) return; ta.value = ''; ta.style.height = '38px';
    try { const m = await api(`/channels/${ch.id}/messages`, 'POST', { body }); if (!S.msgs.some(x => x.id === m.id)) { S.msgs.push(m); renderMsgs(true); } }
    catch (e) { ta.value = body; throw e; }
  });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  ta.addEventListener('input', () => {
    ta.style.height = '38px'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    if (Date.now() - S.lastTypingSent > 3000 && ta.value) { S.lastTypingSent = Date.now(); api(`/channels/${ch.id}/typing`, 'POST').catch(() => { }); }
  });
  const emoji = h('button', { class: 'ib', 'aria-label': 'Emoji', type: 'button', onclick: e => emojiPop(e.currentTarget, em => { ta.setRangeText(em, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); }) }, '😊');
  els.main.replaceChildren(
    topbar(h('h2', {}, chanIcon(ch) + ' ' + ch.name), h('span', { class: 'topic' }, ch.topic), h('span', { class: 'sp' }),
      h('button', { class: 'btn sm white', title: 'Members', onclick: () => { S.memOpen = !S.memOpen; els.shell.classList.toggle('mem-open', S.memOpen); } }, '👥')),
    h('div', { class: 'msgs', id: 'msgs', onscroll: e => { if (e.target.scrollTop < 40 && S.more) loadOlder(); } }),
    h('div', { class: 'typing', id: 'typing', 'aria-live': 'polite' }),
    canPost ? h('div', { class: 'composer' }, h('div', { class: 'box' }, emoji, ta, h('button', { class: 'btn pink sm', onclick: send, type: 'button' }, 'Send ➤'))) : h('div', { class: 'locked' }, '📣 Only officers can post here — react to show some love!'));
  renderTyping();
}
async function loadOlder() {
  if (S.loadingOlder || !S.msgs.length) return; S.loadingOlder = true;
  try {
    const box = $('#msgs'), prev = box.scrollHeight;
    const r = await api(`/channels/${S.view.chId}/messages?before=${S.msgs[0].id}`);
    S.msgs = [...r.messages, ...S.msgs]; S.more = r.more; renderMsgs(false); box.scrollTop = box.scrollHeight - prev;
  } finally { S.loadingOlder = false; }
}
function roleOfUser(id) { return S.club?.members?.find(m => m.id === id)?.role; }
function renderMsgs(stick) {
  const box = $('#msgs'); if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const c = curClub(), off = isOff(c?.role);
  const nodes = []; let prev = null;
  if (!S.msgs.length) nodes.push(h('div', { class: 'empty' }, h('div', {}, h('div', { class: 'big' }, '🦗'), 'Crickets… be the first to say something!')));
  else if (!S.more) nodes.push(h('div', { class: 'empty', style: { padding: '14px' } }, h('div', { class: 'hand' }, `This is the start of #${curChan()?.name} ✨`)));
  for (const m of S.msgs) {
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) nodes.push(h('div', { class: 'daysep' }, dayLabel(m.createdAt)));
    if (m.kind === 'system') { nodes.push(h('div', { class: 'sysmsg' }, '🎈', h('span', {}, m.body))); prev = null; continue; }
    const cont = prev && prev.author.id === m.author.id && prev.kind !== 'system' && m.createdAt - prev.createdAt < 5 * 60e3 && sameDay(prev.createdAt, m.createdAt);
    const rl = roleOfUser(m.author.id);
    nodes.push(h('div', { class: 'msg' + (cont ? ' cont' : ''), dataset: { id: m.id } },
      cont ? h('div', { class: 'gut' }, fmtT(m.createdAt)) : av(m.author),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        cont ? null : h('div', {}, h('span', { class: 'who', style: { color: 'var(--ink)' } }, m.author.name), rl && ROLE[rl][0] && rl !== 'member' ? h('span', { class: 'pill ' + (rl === 'alumni' ? 'pu' : rl === 'advisor' ? 'g' : 'y'), style: { marginRight: '6px' } }, ROLE[rl][0] + ' ' + ROLE[rl][1]) : null, h('span', { class: 'when' }, fmtT(m.createdAt))),
        m.kind === 'event' && m.event ? eventChip(m.event) : h('div', { class: 'txt' }, fmt(m.body)),
        m.reactions.length ? h('div', { class: 'rx' }, ...m.reactions.map(r => h('button', { class: r.users.includes(S.me.id) ? 'mine' : '', title: 'React', onclick: act(() => api(`/messages/${m.id}/react`, 'POST', { emoji: r.emoji })) }, r.emoji + ' ' + r.users.length))) : null),
      h('div', { class: 'tools' },
        h('button', { title: 'Add reaction', 'aria-label': 'Add reaction', onclick: e => emojiPop(e.currentTarget, em => act(() => api(`/messages/${m.id}/react`, 'POST', { emoji: em }))(), ['👍', '❤️', '😂', '🎉', '🔥', '👀', '🙌', '😭']) }, '😀'),
        m.author.id === S.me.id || off ? h('button', { title: 'Delete', 'aria-label': 'Delete message', onclick: act(async () => { if (confirm('Delete this message?')) await api('/messages/' + m.id, 'DELETE'); }) }, '🗑️') : null)));
    prev = m;
  }
  box.replaceChildren(...nodes);
  if (stick || near) box.scrollTop = box.scrollHeight;
}
function eventChip(e) {
  return h('div', { class: 'evcard' + (e.cancelled ? ' x' : '') }, h('div', { class: 'stk', style: { background: e.clubColor } }, e.clubEmoji),
    h('div', { class: 'grow' }, h('b', {}, e.title), h('div', { class: 'tiny muted' }, `${dayLabel(e.startsAt)} · ${fmtT(e.startsAt)}${e.location ? ' · ' + e.location : ''}`)),
    e.cancelled ? h('span', { class: 'pill p' }, 'Cancelled') : h('button', { class: 'btn sm green', onclick: act(async () => { await api(`/events/${e.id}/rsvp`, 'POST', { kind: 'going' }); toast("You're going! 🎟️"); }) }, "I'm in!"));
}
function emojiPop(anchor, onPick, list) {
  document.querySelectorAll('.pop').forEach(p => p.remove());
  const L = list || ['😀', '😂', '🥹', '😍', '🤔', '😭', '😎', '🥳', '👍', '👎', '🙌', '👏', '🔥', '💯', '❤️', '💀', '🎉', '✨', '🍕', '☕', '📚', '🎿', '🚀', '🎸'];
  const p = h('div', { class: 'pop' }, ...L.map(e => h('button', { onclick: ev => { ev.stopPropagation(); p.remove(); onPick(e); } }, e)));
  const r = anchor.getBoundingClientRect(); document.body.append(p);
  p.style.position = 'fixed'; p.style.left = Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 8)) + 'px'; p.style.top = Math.max(8, r.top - p.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', () => p.remove(), { once: true }), 0);
}
function renderTyping() {
  const el = $('#typing'); if (!el) return;
  const names = Object.keys(S.typing[S.view.chId] || {});
  el.textContent = names.length ? (names.length > 2 ? 'Several people are typing…' : names.join(' and ') + (names.length === 1 ? ' is' : ' are') + ' typing…') : '';
}
function renderRight() {
  if (S.view.type !== 'club') return;
  const ms = S.club?.members || [];
  const grp = (title, filter) => { const l = ms.filter(filter); return l.length ? [h('h4', {}, `${title} — ${l.length}`), ...l.map(m => h('div', { class: 'mem' + (m.online ? '' : ' off') }, av(m, 'sm', m.online), h('span', { class: 'nm' }, m.name), m.id === S.me.id ? h('span', { class: 'tiny muted' }, '(you)') : null))] : []; };
  els.right.replaceChildren(h('div', { class: 'row nofill', style: { justifyContent: 'space-between' } }, h('b', { class: 'hand' }, 'The crew 🎒'), h('button', { class: 'btn sm white', onclick: () => { S.memOpen = false; els.shell.classList.remove('mem-open'); } }, '✕')),
    ...grp('Officers', m => isOff(m.role)), ...grp('Advisors', m => m.role === 'advisor'), ...grp('Members', m => m.role === 'member'), ...grp('Alumni 🎓', m => m.role === 'alumni'));
}
const markRead = debounce(async chId => {
  const c = curClub(); const ch = c?.channels.find(x => x.id === chId); if (!ch || document.hidden) return;
  if (ch.unread) { ch.unread = 0; renderRail(); renderSide(); updateTitle(); }
  api(`/channels/${chId}/read`, 'POST').catch(() => { });
}, 250);
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function updateTitle() {
  const n = S.clubs.reduce((s, c) => s + c.channels.reduce((a, ch) => a + ch.unread, 0), 0) + S.inboxUnread;
  document.title = (n ? `(${n}) ` : '') + 'ClubQuad — every club, one quad';
}

/* ---------- events ---------- */
async function loadEvents() {
  const r = await api(`/events?scope=${S.evFilter}${S.evClub ? '&club=' + S.evClub : ''}`); S.events = r;
  if (S.view.type === 'events') renderEventList();
}
function renderEventsMain() {
  const officerClubs = S.clubs.filter(c => isOff(c.role));
  els.main.replaceChildren(topbar(h('h2', {}, '📅 What’s happening'), h('span', { class: 'sp' }),
    officerClubs.length ? h('button', { class: 'btn pink', onclick: () => eventModal(officerClubs) }, '＋ New event') : null),
    h('div', { class: 'scroll' }, h('div', { class: 'evlist', id: 'evlist' })));
  renderEventList();
}
function renderEventList() {
  const box = $('#evlist'); if (!box) return;
  if (!S.events.length) { box.replaceChildren(h('div', { class: 'empty' }, h('div', {}, h('div', { class: 'big' }, S.evFilter === 'volunteer' ? '🙋' : '🏜️'), S.evFilter === 'mine' ? 'You haven’t RSVP’d to anything yet. Go browse!' : 'Nothing scheduled. Officers can add events with the pink button!'))); return; }
  const nodes = []; let last = null;
  for (const e of S.events) {
    if (!last || !sameDay(last, e.startsAt)) nodes.push(h('div', { class: 'evday' }, dayLabel(e.startsAt)));
    last = e.startsAt; nodes.push(ticket(e));
  }
  box.replaceChildren(...nodes);
}
function ticket(e) {
  const c = myClub(e.clubId), off = isOff(c?.role), adv = c?.role === 'advisor', d = new Date(e.startsAt);
  const rsvp = kind => act(async () => { await api(`/events/${e.id}/rsvp`, 'POST', { kind }); if (kind === 'going') { confetti(); toast("You're on the list! 🎟️"); } if (kind === 'volunteer') toast('Thanks for volunteering! 🙌'); });
  const full = e.capacity && e.going >= e.capacity && e.mine !== 'going';
  return h('article', { class: 'ticket' + (e.status === 'pending' ? ' pending' : '') },
    h('div', { class: 'stub', style: { background: e.clubColor } }, h('small', {}, d.toLocaleDateString([], { month: 'short' })), h('b', {}, d.getDate()), h('small', {}, d.toLocaleDateString([], { weekday: 'short' }))),
    h('div', { class: 'body' },
      h('div', { class: 'row nofill wrap', style: { gap: '8px' } }, h('span', { class: 'pill', style: { background: e.clubColor } }, e.clubEmoji + ' ' + e.clubName), e.status === 'pending' ? h('span', { class: 'pill y' }, '⏳ Waiting for advisor') : null, !e.public ? h('span', { class: 'pill' }, '🔒 Members only') : null),
      h('h3', { style: { marginTop: '6px' } }, e.title),
      h('div', { class: 'meta' }, h('span', {}, '🕒 ' + fmtT(e.startsAt) + (e.endsAt ? ' – ' + fmtT(e.endsAt) : '')), e.location ? h('span', {}, '📍 ' + e.location) : null, h('span', {}, `🎟️ ${e.going} going`), e.volunteersNeeded ? h('span', {}, `🙋 ${e.volunteers}/${e.volunteersNeeded} volunteers`) : null),
      e.description ? h('p', { style: { fontSize: '.93em' } }, e.description) : null,
      e.capacity ? h('div', { class: 'row nofill', style: { marginTop: '8px' } }, h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, e.going / e.capacity * 100) + '%' } })), h('span', { class: 'tiny muted' }, `${e.going}/${e.capacity} spots`)) : null,
      h('div', { class: 'acts' },
        e.status === 'approved' ? [
          e.mine === 'going' ? h('button', { class: 'btn green', onclick: rsvp('none') }, '✓ Going (undo)') : h('button', { class: 'btn', disabled: !!full, onclick: rsvp('going') }, full ? 'Full' : "🎟️ I'm going"),
          e.volunteersNeeded ? (e.mine === 'volunteer' ? h('button', { class: 'btn green', onclick: rsvp('none') }, '✓ Volunteering (undo)') : h('button', { class: 'btn pink', onclick: rsvp('volunteer') }, '🙋 Volunteer')) : null] : null,
        adv && e.status === 'pending' ? [h('button', { class: 'btn green', onclick: act(async () => { await api(`/events/${e.id}/approve`, 'POST', { approve: true }); toast('Approved & announced ✅'); }) }, '✅ Approve'), h('button', { class: 'btn red', onclick: act(() => api(`/events/${e.id}/approve`, 'POST', { approve: false })) }, 'Decline')] : null,
        off ? [h('button', { class: 'btn sm white', onclick: () => peopleModal(e) }, '👀 Who’s coming'), h('button', { class: 'btn sm white', onclick: act(async () => { if (confirm(`Cancel "${e.title}"? Everyone who RSVP'd gets notified.`)) await api(`/events/${e.id}/cancel`, 'POST'); }) }, '🗑️ Cancel')] : null)));
}
function peopleModal(e) {
  modal('Who’s coming — ' + e.title, async body => {
    body.append(h('p', { class: 'muted' }, 'Loading…'));
    const ps = await api(`/events/${e.id}/people`).catch(() => []);
    body.replaceChildren(ps.length ? ps.map(p => h('div', { class: 'listrow' }, av(p, 'sm'), h('span', { class: 'grow' }, p.name), h('span', { class: 'pill ' + (p.kind === 'volunteer' ? 'p' : 'g') }, p.kind === 'volunteer' ? '🙋 Volunteer' : '🎟️ Going'))) : h('p', { class: 'muted' }, 'Nobody yet.'));
  });
}
function eventModal(clubs) {
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(18, 0, 0, 0);
  modal('Plan an event 🎉', (body, m) => {
    const club = h('select', {}, ...clubs.map(c => h('option', { value: c.id, selected: c.id === S.evClub || c.id === S.view.clubId }, c.emoji + ' ' + c.name)));
    const title = h('input', { maxlength: 80, placeholder: 'Gear swap, bake sale, launch night…' }), when = h('input', { type: 'datetime-local', value: toLocalInput(start) });
    const end = h('input', { type: 'datetime-local' }), loc = h('input', { maxlength: 80, placeholder: 'Room, building, or “the quad”' });
    const desc = h('textarea', { maxlength: 800, placeholder: 'What should people know?' }), cap = h('input', { type: 'number', min: 1, placeholder: 'No limit' }), vol = h('input', { type: 'number', min: 0, value: 0 });
    const pub = h('input', { type: 'checkbox', checked: true, style: { width: 'auto' } });
    body.append(field('Club', club), field('Title', title), h('div', { class: 'row' }, field('Starts', when), field('Ends', end, '(optional)')), field('Where', loc), field('Details', desc),
      h('div', { class: 'row' }, field('Capacity', cap), field('Volunteers needed', vol)),
      h('label', { class: 'f row nofill' }, pub, h('span', {}, 'Visible to every student (not just members)')),
      h('button', { class: 'btn pink', style: { width: '100%' }, onclick: act(async () => {
        const r = await api(`/clubs/${club.value}/events`, 'POST', { title: title.value, startsAt: new Date(when.value).getTime(), endsAt: end.value ? new Date(end.value).getTime() : null, location: loc.value, description: desc.value, capacity: cap.value, volunteersNeeded: vol.value, public: pub.checked });
        m.close(); toast(r.status === 'pending' ? 'Sent to your advisor for approval ⏳' : 'Event posted & announced! 📣'); if (S.view.type === 'events') loadEvents();
      }) }, 'Post event'));
  });
}

/* ---------- inbox ---------- */
async function loadInbox() { S.threads = await api('/inbox'); S.inboxUnread = S.threads.filter(t => t.unread).length; updateTitle(); }
function renderInboxMain() {
  const t = S.thread;
  if (!t) { els.main.replaceChildren(topbar(h('h2', {}, '💌 Inbox')), h('div', { class: 'empty', style: { flex: 1 } }, h('div', {}, h('div', { class: 'big' }, '💌'), h('p', {}, 'Pick a conversation, or message any club from '), h('a', { class: 'btn sm', href: '#/explore', style: { marginTop: '10px' } }, 'Explore clubs')))); return; }
  const ta = h('textarea', { rows: 1, placeholder: 'Write a reply…', maxlength: 2000, 'aria-label': 'Reply' });
  const send = act(async () => { const body = ta.value.trim(); if (!body) return; ta.value = ''; try { await api(`/threads/${t.id}/messages`, 'POST', { body }); } catch (e) { ta.value = body; throw e; } });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  const box = h('div', { class: 'msgs', id: 'tmsgs' }, ...t.messages.map(m => h('div', { class: 'bub-row' + (m.sender.id === S.me.id ? ' me' : '') }, av(m.sender, 'sm'), h('div', {}, h('div', { class: 'bubble' }, fmt(m.body)), h('div', { class: 'tiny muted', style: { margin: '2px 6px' } }, m.sender.name + ' · ' + dayLabel(m.at) + ' ' + fmtT(m.at))))));
  els.main.replaceChildren(topbar(stk(t.club, 'sm'), h('h2', {}, t.subject), h('span', { class: 'topic' }, t.club.name + (t.student.id !== S.me.id ? ' · from ' + t.student.name : ' · officers will reply here'))), box,
    h('div', { class: 'composer' }, h('div', { class: 'box' }, ta, h('button', { class: 'btn pink sm', onclick: send }, 'Send ➤'))));
  box.scrollTop = box.scrollHeight;
}
function contactModal(c) {
  modal(`Message ${c.name}'s officers`, (body, m) => {
    const subj = h('input', { maxlength: 80, value: 'Question about ' + c.name }), msg = h('textarea', { maxlength: 2000, placeholder: 'Hi! I wanted to ask about…' });
    body.append(h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'All of the club’s officers see this — no need to find the right person first.'), field('Subject', subj), field('Message', msg),
      h('button', { class: 'btn pink', style: { width: '100%' }, onclick: act(async () => { const r = await api(`/clubs/${c.id}/contact`, 'POST', { subject: subj.value, body: msg.value }); m.close(); toast('Sent! 💌'); go('#/inbox/' + r.id); }) }, 'Send message'));
  });
}

/* ---------- modals: profile, create club, code ---------- */
function profileModal() {
  modal('Your profile', (body, m) => {
    let emoji = S.me.emoji, color = S.me.color;
    const name = h('input', { value: S.me.name, maxlength: 40 }), yr = h('input', { type: 'number', value: S.me.gradYear, min: 2000, max: 2100 });
    const prev = h('div', { class: 'av lg', style: { background: color }, }, emoji);
    const upd = () => { prev.textContent = emoji; prev.style.background = color; eb.forEach(b => b.classList.toggle('on', b.textContent === emoji)); cb.forEach(b => b.classList.toggle('on', b.dataset.c === color)); };
    const eb = S.opts.emojis.map(e => h('button', { type: 'button', onclick: () => { emoji = e; upd(); }, 'aria-label': e }, e));
    const cb = S.opts.colors.map(c => h('button', { type: 'button', dataset: { c }, style: { background: c }, onclick: () => { color = c; upd(); }, 'aria-label': 'Color ' + c }));
    body.append(h('div', { class: 'row nofill', style: { marginBottom: '14px' } }, prev, h('div', { class: 'tiny muted' }, S.me.email)), field('Name', name), field('Graduation year', yr, '(clubs roll you into alumni automatically)'),
      h('div', { class: 'f' }, h('span', { style: { fontWeight: 700, fontSize: '.85em' } }, 'Avatar')), h('div', { class: 'pickrow' }, ...eb), h('div', { style: { height: '10px' } }), h('div', { class: 'pickrow cols' }, ...cb), h('div', { style: { height: '16px' } }),
      h('div', { class: 'row' }, h('button', { class: 'btn pink', onclick: act(async () => { await api('/me', 'PATCH', { name: name.value, gradYear: yr.value, emoji, color }); await loadBootstrap(); m.close(); renderAll(); toast('Saved ✨'); }) }, 'Save'),
        h('button', { class: 'btn white', onclick: act(async () => { await api('/logout', 'POST'); location.href = '/'; }) }, 'Log out')));
    upd();
  });
}
function createClubModal() {
  modal('Start a club ✨', (body, m) => {
    let emoji = '🎨', color = pick(S.opts.colors);
    const name = h('input', { maxlength: 50, placeholder: 'Midnight Baking Society' }), desc = h('textarea', { maxlength: 400, placeholder: 'What’s your club about? Who should join?' }), tags = h('input', { placeholder: 'music, social, outdoors', maxlength: 80 });
    const mode = h('select', {}, h('option', { value: 'open' }, 'Open — anyone can join instantly'), h('option', { value: 'request' }, 'By request — officers approve'));
    const prev = h('div', { class: 'stk lg' }); const set = () => { prev.textContent = emoji; prev.style.background = color; eb.forEach(b => b.classList.toggle('on', b.textContent === emoji)); cb.forEach(b => b.classList.toggle('on', b.dataset.c === color)); };
    const eb = ['🎨', '🎸', '🧪', '🏀', '📚', '🍕', '🎮', '🌱', '🤖', '🎭', '🧗', '📷', '♟️', '🚀', '💃', '🎬'].map(e => h('button', { type: 'button', onclick: () => { emoji = e; set(); } }, e));
    const cb = S.opts.colors.map(c => h('button', { type: 'button', dataset: { c }, style: { background: c }, onclick: () => { color = c; set(); }, 'aria-label': 'Color' }));
    body.append(h('div', { class: 'row nofill', style: { marginBottom: '12px' } }, prev, h('p', { class: 'muted tiny' }, 'You’ll be the president. We’ll set up announcements, general, an officers-only room and an alumni lounge.')),
      field('Club name', name), field('Description', desc), field('Tags', tags, '(comma separated)'), field('Who can join?', mode),
      h('div', { class: 'pickrow' }, ...eb), h('div', { style: { height: '8px' } }), h('div', { class: 'pickrow cols' }, ...cb), h('div', { style: { height: '16px' } }),
      h('button', { class: 'btn pink', style: { width: '100%' }, onclick: act(async () => { const r = await api('/clubs', 'POST', { name: name.value, description: desc.value, tags: tags.value, joinMode: mode.value, emoji, color }); await loadBootstrap(); m.close(); confetti(); go('#/club/' + r.id); }) }, 'Create club 🚀'));
    set();
  });
}
function codeModal() {
  modal('Join with an invite code 🔑', (body, m) => {
    const code = h('input', { placeholder: 'e.g. 9F3A1C', maxlength: 12, style: { textTransform: 'uppercase', letterSpacing: '.15em', textAlign: 'center', fontSize: '1.3em' } });
    body.append(h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Officers can find their club’s code under Manage → Toolkit. Works even for by-request clubs.'), field('Code', code),
      h('button', { class: 'btn pink', style: { width: '100%' }, onclick: act(async () => { const r = await api('/join-code', 'POST', { code: code.value }); await loadBootstrap(); m.close(); confetti(); go('#/club/' + r.id); }) }, 'Join'));
  });
}

/* ---------- club settings (officers + advisors) ---------- */
function clubSettings(clubId, tab) {
  const c0 = myClub(clubId); const off = isOff(c0.role);
  const tabs = off ? [['basics', '🎨 Basics'], ['people', '👥 People'], ['channels', '# Channels'], ['toolkit', '🧰 Toolkit'], ['overview', '📊 Overview']] : [['overview', '📊 Overview']];
  let cur = tab || tabs[0][0];
  modal('Manage ' + c0.name, (body, m) => {
    const tabBar = h('div', { class: 'tabs' }), pane = h('div', {}); body.append(tabBar, pane);
    const show = async t => { cur = t; tabBar.replaceChildren(...tabs.map(([id, l]) => h('button', { class: cur === id ? 'on' : '', onclick: () => show(id) }, l))); pane.replaceChildren(h('p', { class: 'muted' }, 'Loading…')); try { pane.replaceChildren(await SET[t](clubId, show, m)); } catch (e) { pane.replaceChildren(h('p', {}, e.message)); } };
    show(cur);
  }, { wide: true });
}
const SET = {
  async basics(id, show, m) {
    const c = await api('/clubs/' + id); let emoji = c.emoji, color = c.color;
    const name = h('input', { value: c.name, maxlength: 50 }), desc = h('textarea', { maxlength: 400, value: c.description }), tags = h('input', { value: c.tags.join(', ') });
    const mode = h('select', { value: c.joinMode }, h('option', { value: 'open' }, 'Open — anyone can join instantly'), h('option', { value: 'request' }, 'By request — officers approve'));
    const appr = h('input', { type: 'checkbox', checked: c.requireApproval, style: { width: 'auto' } });
    const prev = h('div', { class: 'stk lg' }); const set = () => { prev.textContent = emoji; prev.style.background = color; eb.forEach(b => b.classList.toggle('on', b.textContent === emoji)); cb.forEach(b => b.classList.toggle('on', b.dataset.c === color)); };
    const eb = ['🎨', '🎸', '🧪', '🏀', '📚', '🍕', '🎮', '🌱', '🤖', '🎭', '🧗', '📷', '♟️', '🚀', '🏂', '🍜', '🎪', '🩸'].map(e => h('button', { type: 'button', onclick: () => { emoji = e; set(); } }, e));
    const cb = S.opts.colors.map(x => h('button', { type: 'button', dataset: { c: x }, style: { background: x }, onclick: () => { color = x; set(); }, 'aria-label': 'Color' }));
    const wrap = h('div', {}, h('div', { class: 'row nofill', style: { marginBottom: '12px' } }, prev, h('div', { class: 'pickrow' }, ...eb)), h('div', { class: 'pickrow cols', style: { marginBottom: '14px' } }, ...cb),
      field('Club name', name), field('Description', desc), field('Tags', tags), field('Who can join?', mode),
      h('label', { class: 'f row nofill' }, appr, h('span', {}, 'New events need my advisor’s approval (only applies once an advisor is added)')),
      h('button', { class: 'btn pink', onclick: act(async () => { await api('/clubs/' + id, 'PATCH', { name: name.value, description: desc.value, tags: tags.value, joinMode: mode.value, emoji, color, requireApproval: appr.checked }); await loadBootstrap(); renderAll(); toast('Club updated ✨'); }) }, 'Save changes'));
    set(); return wrap;
  },
  async people(id, show) {
    const [club, reqs] = await Promise.all([api('/clubs/' + id), api(`/clubs/${id}/requests`)]); const me = myClub(id).role;
    const roleSel = u => { const s = h('select', { style: { width: 'auto' }, disabled: u.role === 'owner' || (me !== 'owner' && (u.role === 'officer')), onchange: act(async e => { await api(`/clubs/${id}/members/${u.id}`, 'POST', { role: e.target.value }); toast('Role updated'); show('people'); }) },
      ...['member', 'officer', 'alumni', 'advisor'].filter(r => u.role === 'owner' ? false : true).map(r => h('option', { value: r, disabled: r === 'officer' && me !== 'owner' }, ROLE[r][1]))); s.value = u.role === 'owner' ? '' : u.role; return u.role === 'owner' ? h('span', { class: 'pill y' }, '👑 President') : s; };
    return h('div', {}, reqs.length ? [h('h3', { style: { marginBottom: '8px' } }, `✋ Join requests (${reqs.length})`), ...reqs.map(r => h('div', { class: 'listrow' }, av(r, 'sm'), h('div', { class: 'grow' }, h('b', {}, r.name), h('div', { class: 'tiny muted' }, `Class of ${r.gradYear}${r.note ? ' · “' + r.note + '”' : ''}`)),
      h('button', { class: 'btn sm green', onclick: act(async () => { await api(`/clubs/${id}/requests/${r.id}`, 'POST', { approve: true }); show('people'); }) }, 'Accept'), h('button', { class: 'btn sm white', onclick: act(async () => { await api(`/clubs/${id}/requests/${r.id}`, 'POST', { approve: false }); show('people'); }) }, 'Decline'))), h('div', { style: { height: '18px' } })] : null,
      h('h3', { style: { marginBottom: '8px' } }, `Everyone (${club.members.length})`),
      ...club.members.map(u => h('div', { class: 'listrow' }, av(u, 'sm', u.online), h('div', { class: 'grow' }, h('b', {}, u.name), h('div', { class: 'tiny muted' }, 'Class of ' + u.gradYear)), roleSel(u),
        u.role !== 'owner' && u.id !== S.me.id && (me === 'owner' || u.role !== 'officer') ? h('button', { class: 'btn sm white', title: 'Remove', onclick: act(async () => { if (confirm(`Remove ${u.name}?`)) { await api(`/clubs/${id}/members/${u.id}`, 'DELETE'); show('people'); } }) }, '🗑️') : null)));
  },
  async channels(id, show) {
    const c = await api('/clubs/' + id); const chans = myClub(id).channels;
    const name = h('input', { placeholder: 'trip-planning', maxlength: 30 }), topic = h('input', { placeholder: 'What’s this channel for?', maxlength: 120 });
    const access = h('select', {}, h('option', { value: 'all' }, 'Everyone in the club'), h('option', { value: 'members' }, 'Current members only (no alumni)'), h('option', { value: 'officers' }, 'Officers + advisor only'), h('option', { value: 'alumni' }, 'Alumni + officers'));
    const kind = h('select', {}, h('option', { value: 'text' }, 'Chat — everyone can post'), h('option', { value: 'announce' }, 'Announcements — officers post'));
    return h('div', {}, h('h3', { style: { marginBottom: '8px' } }, 'Channels'), ...chans.map(ch => h('div', { class: 'listrow' }, h('span', {}, chanIcon(ch)), h('b', { class: 'grow' }, ch.name), h('span', { class: 'tiny muted' }, ch.access === 'all' ? 'everyone' : ch.access),
      !['announcements', 'general'].includes(ch.name) ? h('button', { class: 'btn sm white', onclick: act(async () => { if (confirm(`Delete #${ch.name} and its messages?`)) { await api('/channels/' + ch.id, 'DELETE'); await loadBootstrap(); renderAll(); show('channels'); } }) }, '🗑️') : null)),
      h('h3', { style: { margin: '20px 0 8px' } }, 'New channel'), field('Name', name), field('Topic', topic), h('div', { class: 'row' }, field('Who can see it?', access), field('Type', kind)),
      h('button', { class: 'btn pink', onclick: act(async () => { await api(`/clubs/${id}/channels`, 'POST', { name: name.value, topic: topic.value, access: access.value, kind: kind.value }); await loadBootstrap(); renderAll(); toast('Channel created #️⃣'); show('channels'); }) }, 'Create channel'));
  },
  async toolkit(id, show, m) {
    const c = await api('/clubs/' + id), me = myClub(id).role;
    const prevBox = h('div', { class: 'muted tiny' }, 'Checking who graduated…'); api(`/clubs/${id}/rollover`).then(r => { prevBox.textContent = r.count ? `${r.count} member${r.count > 1 ? 's' : ''} (${r.people.slice(0, 4).map(p => p.name.split(' ')[0]).join(', ')}${r.count > 4 ? '…' : ''}) have graduated.` : 'Nobody to roll over right now — everyone’s still enrolled.'; });
    const adv = h('input', { type: 'email', placeholder: 'advisor@school.edu' }); const members = c.members.filter(u => u.role !== 'owner' && u.role !== 'advisor'); const to = h('select', {}, ...members.map(u => h('option', { value: u.id }, u.name)));
    return h('div', {},
      h('div', { class: 'card', style: { padding: '14px', marginBottom: '16px' } }, h('h3', {}, '🔑 Invite code'), h('p', { class: 'muted tiny', style: { margin: '4px 0 8px' } }, 'Share it anywhere — flyers, group chats, Instagram bios.'),
        h('div', { class: 'row nofill' }, h('code', { style: { fontSize: '1.6em', letterSpacing: '.15em', fontWeight: 800 } }, c.code), h('button', { class: 'btn sm', onclick: () => { navigator.clipboard?.writeText(c.code); toast('Copied!'); } }, 'Copy'))),
      h('div', { class: 'card', style: { padding: '14px', marginBottom: '16px' } }, h('h3', {}, '🎓 Class rollover'), h('p', { class: 'muted tiny', style: { margin: '4px 0 8px' } }, 'Moves graduated members into Alumni so they keep access to the alumni lounge and announcements, and your member list stays fresh.'), prevBox,
        h('button', { class: 'btn pink', style: { marginTop: '10px' }, onclick: act(async () => { const r = await api(`/clubs/${id}/rollover`, 'POST'); toast(r.moved ? `Moved ${r.moved} to Alumni 🎓` : 'Nothing to move'); show('toolkit'); }) }, 'Run rollover')),
      me === 'owner' ? [
        h('div', { class: 'card', style: { padding: '14px', marginBottom: '16px' } }, h('h3', {}, '🧑‍🏫 Faculty advisor'), h('p', { class: 'muted tiny', style: { margin: '4px 0 8px' } }, 'Advisors get read access to every channel plus an overview dashboard, and can approve events. They must have a ClubQuad account.'),
          h('div', { class: 'row' }, adv, h('button', { class: 'btn', style: { flex: 'none' }, onclick: act(async () => { await api(`/clubs/${id}/advisor`, 'POST', { email: adv.value }); toast('Advisor added'); adv.value = ''; }) }, 'Add'))),
        h('div', { class: 'card', style: { padding: '14px' } }, h('h3', {}, '🔁 Transfer ownership'), h('p', { class: 'muted tiny', style: { margin: '4px 0 8px' } }, 'Passing the torch? Everything stays: channels, messages, alumni. You become an officer.'),
          h('div', { class: 'row' }, to, h('button', { class: 'btn red', style: { flex: 'none' }, disabled: !members.length, onclick: act(async () => { if (confirm('Transfer the club to ' + to.selectedOptions[0].text + '?')) { await api(`/clubs/${id}/transfer`, 'POST', { userId: +to.value }); await loadBootstrap(); renderAll(); m.close(); toast('Ownership transferred 🔁'); } }) }, 'Transfer')))] : null);
  },
  async overview(id) {
    const o = await api(`/clubs/${id}/overview`), me = myClub(id).role;
    const st = (n, l) => h('div', { class: 'stat' }, h('b', {}, n), h('span', { class: 'tiny muted' }, l));
    const rc = o.roles;
    return h('div', {}, h('div', { class: 'row wrap', style: { marginBottom: '18px' } }, st((rc.owner || 0) + (rc.officer || 0) + (rc.member || 0), 'active members'), st(rc.alumni || 0, 'alumni'), st(o.activeMembers7d, 'chatted this week'), st(o.messages7d, 'messages (7d)'), st(o.upcoming, 'upcoming events')),
      h('p', { class: 'muted' }, o.advisors.length ? '🧑‍🏫 Advisor' + (o.advisors.length > 1 ? 's: ' : ': ') + o.advisors.map(a => a.name).join(', ') : 'No advisor linked yet — add one in the Toolkit tab.'),
      h('h3', { style: { margin: '18px 0 8px' } }, '⏳ Awaiting approval'),
      o.pending.length ? o.pending.map(e => h('div', { class: 'listrow' }, h('div', { class: 'grow' }, h('b', {}, e.title), h('div', { class: 'tiny muted' }, dayLabel(e.startsAt) + ' ' + fmtT(e.startsAt) + (e.location ? ' · ' + e.location : ''))),
        me === 'advisor' ? [h('button', { class: 'btn sm green', onclick: act(async () => { await api(`/events/${e.id}/approve`, 'POST', { approve: true }); toast('Approved ✅'); }) }, 'Approve'), h('button', { class: 'btn sm red', onclick: act(async () => { await api(`/events/${e.id}/approve`, 'POST', { approve: false }); }) }, 'Decline')] : h('span', { class: 'pill y' }, 'Waiting on advisor'))) : h('p', { class: 'muted' }, 'All caught up! 🎉'));
  },
};

/* ---------- live updates ---------- */
function connect() {
  const es = new EventSource('/api/stream'); S.es = es; let opened = false;
  es.onopen = () => { if (opened) refresh(); opened = true; };
  const on = (t, fn) => es.addEventListener(t, e => { try { fn(JSON.parse(e.data)); } catch (x) { console.error(x); } });
  on('message', m => {
    const c = S.clubs.find(c => c.channels.some(ch => ch.id === m.channelId)); if (!c) return;
    const ch = c.channels.find(x => x.id === m.channelId), mine = m.author.id === S.me.id, viewing = S.view.type === 'club' && S.view.chId === m.channelId;
    if (S.typing[m.channelId]) { delete S.typing[m.channelId][m.author.name]; renderTyping(); }
    if (viewing) { if (!S.msgs.some(x => x.id === m.id)) { S.msgs.push(m); renderMsgs(mine); } if (!mine) { if (document.hidden) ch.unread++; else markRead(ch.id); } }
    else if (!mine) { ch.unread++; if (m.kind !== 'system') toast(`💬 ${m.author.name} in ${c.name} #${ch.name}`); }
    renderRail(); renderSide(); updateTitle();
  });
  on('message_deleted', d => { if (S.view.chId === d.channelId) { S.msgs = S.msgs.filter(m => m.id !== d.id); renderMsgs(false); } });
  on('reactions', d => { const m = S.msgs.find(x => x.id === d.id); if (m) { m.reactions = d.reactions; renderMsgs(false); } });
  on('typing', d => {
    const t = S.typing[d.channelId] ||= {}; clearTimeout(t[d.name]?.t); t[d.name] = { t: setTimeout(() => { delete t[d.name]; renderTyping(); }, 4000) };
    // keep only names as keys for rendering
    S.typing[d.channelId] = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v])); renderTyping();
  });
  on('presence', d => { const m = S.club?.members?.find(x => x.id === d.userId); if (m) { m.online = d.online; renderRight(); } });
  on('members_changed', async d => { if (S.view.type === 'club' && (!d.clubId || d.clubId === S.view.clubId)) { S.club = await api('/clubs/' + S.view.clubId).catch(() => S.club); renderRight(); renderMsgs(false); } });
  on('my_clubs_changed', async () => { await loadBootstrap(); if (S.view.type === 'club' && !myClub(S.view.clubId)) return go('#/explore'); const ch = curChan(); if (S.view.type === 'club' && !ch) return route(); renderRail(); renderSide(); if (S.view.type !== 'club') renderMain(); else renderRight(); });
  on('events_changed', () => { if (S.view.type === 'events') loadEvents(); if (S.view.type === 'explore') loadExplore(); });
  on('thread', async d => {
    await loadInbox();
    if (S.view.type === 'inbox' && S.view.threadId === d.threadId) { S.thread = await api('/threads/' + d.threadId); await loadInbox(); renderInboxMain(); }
    else if (d.message.sender.id !== S.me.id) toast(`💌 New message from ${d.message.sender.name}`);
    renderRail(); if (S.view.type === 'inbox') renderSide();
  });
  on('toast', d => toast('📣 ' + d.text));
  on('requests_changed', () => toast('✋ New request waiting for review'));
}
async function refresh() { await loadBootstrap(); if (S.view.type === 'club') { const r = await api(`/channels/${S.view.chId}/messages`).catch(() => null); if (r) { S.msgs = r.messages; renderMsgs(true); } } renderRail(); renderSide(); }

boot();
