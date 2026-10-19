// ClubQuad — a Discord-style home for college clubs.
// Zero dependencies: Node 22+ (http, node:sqlite, crypto). Run: node server.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 3000;
const CAMPUS = process.env.CAMPUS || 'RPI';
const db = new DatabaseSync(process.env.DB || path.join(__dirname, 'clubquad.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
create table if not exists users(
  id integer primary key, email text unique not null, name text not null, pass text not null,
  grad_year integer not null, emoji text not null, color text not null, created_at integer not null);
create table if not exists sessions(token text primary key, user_id integer not null references users(id) on delete cascade, created_at integer not null);
create table if not exists clubs(
  id integer primary key, name text unique not null, emoji text not null, color text not null,
  description text not null default '', tags text not null default '', join_mode text not null default 'open',
  code text not null, require_approval integer not null default 0, created_at integer not null);
create table if not exists members(
  club_id integer not null references clubs(id) on delete cascade, user_id integer not null references users(id) on delete cascade,
  role text not null, joined_at integer not null, primary key(club_id,user_id));
create table if not exists requests(
  club_id integer not null references clubs(id) on delete cascade, user_id integer not null references users(id) on delete cascade,
  note text not null default '', created_at integer not null, primary key(club_id,user_id));
create table if not exists channels(
  id integer primary key, club_id integer not null references clubs(id) on delete cascade, name text not null,
  topic text not null default '', kind text not null default 'text', access text not null default 'all', pos integer not null default 0);
create table if not exists messages(
  id integer primary key, channel_id integer not null references channels(id) on delete cascade, user_id integer not null references users(id),
  body text not null, kind text not null default 'text', event_id integer, created_at integer not null);
create index if not exists msg_ch on messages(channel_id,id);
create table if not exists reactions(message_id integer not null references messages(id) on delete cascade, user_id integer not null, emoji text not null, primary key(message_id,user_id,emoji));
create table if not exists reads(user_id integer not null, channel_id integer not null references channels(id) on delete cascade, last_id integer not null default 0, primary key(user_id,channel_id));
create table if not exists events(
  id integer primary key, club_id integer not null references clubs(id) on delete cascade, title text not null, description text not null default '',
  location text not null default '', starts_at integer not null, ends_at integer, capacity integer, volunteers_needed integer not null default 0,
  public integer not null default 1, status text not null default 'approved', cancelled integer not null default 0,
  created_by integer not null, created_at integer not null);
create table if not exists rsvps(event_id integer not null references events(id) on delete cascade, user_id integer not null, kind text not null, primary key(event_id,user_id));
create table if not exists threads(id integer primary key, club_id integer not null references clubs(id) on delete cascade, user_id integer not null references users(id) on delete cascade, subject text not null, last_at integer not null, unique(club_id,user_id));
create table if not exists tmsgs(id integer primary key, thread_id integer not null references threads(id) on delete cascade, sender_id integer not null, body text not null, created_at integer not null);
create table if not exists treads(thread_id integer not null, user_id integer not null, last_id integer not null default 0, primary key(thread_id,user_id));
`);

/* ---------- tiny helpers ---------- */
const clean = a => a.map(v => (v === undefined ? null : v));
const q = (sql, ...p) => db.prepare(sql).all(...clean(p));
const one = (sql, ...p) => db.prepare(sql).get(...clean(p));
const run = (sql, ...p) => db.prepare(sql).run(...clean(p));
const now = () => Date.now();
class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (s, m) => { throw new HttpErr(s, m); };
const str = (v, max, name = 'field', req = true) => {
  v = typeof v === 'string' ? v.trim() : '';
  if (req && !v) fail(400, `${name} is required`);
  if (v.length > max) fail(400, `${name} is too long (max ${max})`);
  return v;
};
const EMOJIS = ['🦊', '🐙', '🦉', '🐸', '🐧', '🦄', '🐝', '🦋', '🐢', '🦖', '🐼', '🐨', '🦔', '🐳', '🐞', '🦦'];
const COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f1c', '#2ec4b6', '#f72585'];
const pick = a => a[Math.floor(Math.random() * a.length)];

function hashPass(p, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(p, salt, 32).toString('hex');
}
function checkPass(p, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(p, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const hits = new Map();
function limit(key, max, ms) {
  const t = now(), arr = (hits.get(key) || []).filter(x => t - x < ms);
  if (arr.length >= max) fail(429, 'Slow down a little!');
  arr.push(t); hits.set(key, arr);
}
setInterval(() => { const t = now(); for (const [k, v] of hits) if (!v.some(x => t - x < 60000)) hits.delete(k); }, 60000).unref();

// "Class rollover": someone is an alum from June of their grad year onward.
function isAlumYear(gradYear, d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth();
  return gradYear < y || (gradYear === y && m >= 5);
}

/* ---------- permissions ---------- */
const roleOf = (cid, uid) => one('select role from members where club_id=? and user_id=?', cid, uid)?.role;
const isOff = r => r === 'owner' || r === 'officer';
const canRead = (r, access) => {
  if (!r) return false;
  if (access === 'all') return true;
  if (access === 'members') return r !== 'alumni';
  if (access === 'officers') return r === 'owner' || r === 'officer' || r === 'advisor';
  if (access === 'alumni') return r !== 'member';
  return false;
};
const needOfficer = (cid, uid) => { const r = roleOf(cid, uid); if (!isOff(r)) fail(403, 'Officers only'); return r; };
function chanFor(chId, uid) {
  const ch = one('select * from channels where id=?', chId);
  if (!ch) fail(404, 'Channel not found');
  const r = roleOf(ch.club_id, uid);
  if (!canRead(r, ch.access)) fail(403, "You can't see that channel");
  return { ch, role: r };
}

/* ---------- realtime (SSE) ---------- */
const clients = new Map(); // userId -> Set(res)
function push(ids, type, payload) {
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const id of new Set(ids)) clients.get(id)?.forEach(res => res.write(data));
}
const pushAll = (type, payload) => push([...clients.keys()], type, payload);
const clubMemberIds = cid => q('select user_id from members where club_id=?', cid).map(r => r.user_id);
const channelReaderIds = ch => q('select user_id,role from members where club_id=?', ch.club_id).filter(m => canRead(m.role, ch.access)).map(m => m.user_id);
const coMemberIds = uid => q('select distinct user_id from members where club_id in (select club_id from members where user_id=?)', uid).map(r => r.user_id);

/* ---------- serializers ---------- */
const userOut = u => ({ id: u.id, name: u.name, emoji: u.emoji, color: u.color, gradYear: u.grad_year });
const tagsOut = s => (s ? s.split(',').filter(Boolean) : []);
function clubOut(c, uid) {
  const role = uid ? roleOf(c.id, uid) : null;
  const next = one('select id,title,starts_at from events where club_id=? and cancelled=0 and status=\'approved\' and public=1 and starts_at>? order by starts_at limit 1', c.id, now() - 3 * 3600e3);
  return {
    id: c.id, name: c.name, emoji: c.emoji, color: c.color, description: c.description, tags: tagsOut(c.tags),
    joinMode: c.join_mode, requireApproval: !!c.require_approval,
    memberCount: one("select count(*) n from members where club_id=? and role!='advisor'", c.id).n,
    role: role || null, pending: !!(uid && one('select 1 x from requests where club_id=? and user_id=?', c.id, uid)),
    next: next ? { id: next.id, title: next.title, startsAt: next.starts_at } : null,
    ...(isOff(role) ? { code: c.code } : {}),
  };
}
function msgOut(m) {
  const u = one('select * from users where id=?', m.user_id);
  const rx = {};
  for (const r of q('select emoji,user_id from reactions where message_id=? order by rowid', m.id)) (rx[r.emoji] ||= []).push(r.user_id);
  return {
    id: m.id, channelId: m.channel_id, body: m.body, kind: m.kind, createdAt: m.created_at,
    author: userOut(u), reactions: Object.entries(rx).map(([emoji, users]) => ({ emoji, users })),
    event: m.event_id ? eventBrief(m.event_id) : null,
  };
}
function eventBrief(id) {
  const e = one('select e.*,c.name cname,c.emoji cemoji,c.color ccolor from events e join clubs c on c.id=e.club_id where e.id=?', id);
  return e && { id: e.id, title: e.title, startsAt: e.starts_at, location: e.location, cancelled: !!e.cancelled, clubName: e.cname, clubEmoji: e.cemoji, clubColor: e.ccolor };
}
function eventOut(e, uid) {
  const going = one("select count(*) n from rsvps where event_id=? and kind='going'", e.id).n;
  const vol = one("select count(*) n from rsvps where event_id=? and kind='volunteer'", e.id).n;
  const mine = one('select kind from rsvps where event_id=? and user_id=?', e.id, uid)?.kind || null;
  return {
    id: e.id, clubId: e.club_id, clubName: e.cname, clubEmoji: e.cemoji, clubColor: e.ccolor, title: e.title, description: e.description,
    location: e.location, startsAt: e.starts_at, endsAt: e.ends_at, capacity: e.capacity, volunteersNeeded: e.volunteers_needed,
    public: !!e.public, status: e.status, cancelled: !!e.cancelled, going, volunteers: vol, mine,
  };
}
const EVENT_SQL = 'select e.*,c.name cname,c.emoji cemoji,c.color ccolor from events e join clubs c on c.id=e.club_id';

/* ---------- club bootstrap helpers ---------- */
function makeChannel(cid, name, o = {}) {
  const pos = one('select coalesce(max(pos),0)+1 p from channels where club_id=?', cid).p;
  return run('insert into channels(club_id,name,topic,kind,access,pos) values(?,?,?,?,?,?)', cid, name, o.topic || '', o.kind || 'text', o.access || 'all', pos).lastInsertRowid;
}
function createClub(owner, { name, emoji, color, description, tags, joinMode }) {
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const cid = run('insert into clubs(name,emoji,color,description,tags,join_mode,code,created_at) values(?,?,?,?,?,?,?,?)',
    name, emoji, color, description, tags, joinMode, code, now()).lastInsertRowid;
  run('insert into members values(?,?,?,?)', cid, owner, 'owner', now());
  makeChannel(cid, 'announcements', { topic: 'Official news from the officers 📣', kind: 'announce' });
  makeChannel(cid, 'general', { topic: 'Hang out, say hi, meme responsibly' });
  makeChannel(cid, 'officers', { topic: 'Officer planning (members cannot see this)', access: 'officers' });
  makeChannel(cid, 'alumni-lounge', { topic: 'Graduated? You still belong here 🎓', access: 'alumni' });
  return cid;
}
function systemPost(chId, userId, body, kind = 'system', eventId = null) {
  const id = run('insert into messages(channel_id,user_id,body,kind,event_id,created_at) values(?,?,?,?,?,?)', chId, userId, body, kind, eventId, now()).lastInsertRowid;
  const ch = one('select * from channels where id=?', chId);
  push(channelReaderIds(ch), 'message', msgOut(one('select * from messages where id=?', id)));
  return id;
}
const chanByName = (cid, name) => one('select * from channels where club_id=? and name=?', cid, name);
function addMember(cid, uid, role) {
  const u = one('select * from users where id=?', uid);
  if (role === 'member' && isAlumYear(u.grad_year)) role = 'alumni';
  run('insert or ignore into members values(?,?,?,?)', cid, uid, role, now());
  run('delete from requests where club_id=? and user_id=?', cid, uid);
  const g = chanByName(cid, 'general');
  if (g && role !== 'advisor') systemPost(g.id, uid, `${u.name} joined the club 🎉`);
  push(clubMemberIds(cid), 'members_changed', { clubId: cid });
  push([uid], 'my_clubs_changed', {});
}

/* ---------- API ---------- */
const routes = [];
const route = (method, pattern, fn, auth = true) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

route('POST', '/api/signup', ({ body, res, ip }) => {
  limit('su' + ip, 10, 60000);
  const email = str(body.email, 120, 'Email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'That email looks off');
  const name = str(body.name, 40, 'Name');
  const pw = str(body.password, 100, 'Password');
  if (pw.length < 6) fail(400, 'Password needs 6+ characters');
  const gy = Math.round(+body.gradYear);
  if (!(gy >= 2000 && gy <= 2100)) fail(400, 'Pick a graduation year');
  if (one('select 1 x from users where email=?', email)) fail(409, 'That email already has an account');
  const id = run('insert into users(email,name,pass,grad_year,emoji,color,created_at) values(?,?,?,?,?,?,?)', email, name, hashPass(pw), gy, pick(EMOJIS), pick(COLORS), now()).lastInsertRowid;
  startSession(res, id);
  return { ok: true };
}, false);
route('POST', '/api/login', ({ body, res, ip }) => {
  limit('li' + ip, 15, 60000);
  const u = one('select * from users where email=?', str(body.email, 120, 'Email').toLowerCase());
  if (!u || !checkPass(str(body.password, 100, 'Password'), u.pass)) fail(401, 'Wrong email or password');
  startSession(res, u.id);
  return { ok: true };
}, false);
route('POST', '/api/logout', ({ req, res }) => {
  const t = cookies(req).sid; if (t) run('delete from sessions where token=?', t);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  return { ok: true };
}, false);
function startSession(res, uid) {
  const token = crypto.randomBytes(24).toString('hex');
  run('insert into sessions values(?,?,?)', token, uid, now());
  const secure = res.req?.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax${secure}`);
}

route('GET', '/api/bootstrap', ({ user }) => {
  const mine = q('select c.*,m.role from clubs c join members m on m.club_id=c.id where m.user_id=? order by c.name', user.id);
  const clubs = mine.map(c => {
    const channels = q('select * from channels where club_id=? order by pos', c.id)
      .filter(ch => canRead(c.role, ch.access))
      .map(ch => {
        const last = one('select last_id from reads where user_id=? and channel_id=?', user.id, ch.id)?.last_id || 0;
        const unread = one('select count(*) n from messages where channel_id=? and id>? and user_id!=?', ch.id, last, user.id).n;
        return { id: ch.id, name: ch.name, topic: ch.topic, kind: ch.kind, access: ch.access, unread };
      });
    return { ...clubOut(c, user.id), channels };
  });
  return { campus: CAMPUS, me: { ...userOut(user), email: user.email, alum: isAlumYear(user.grad_year) }, clubs, inboxUnread: inboxUnread(user.id) };
});
route('PATCH', '/api/me', ({ user, body }) => {
  const name = str(body.name ?? user.name, 40, 'Name');
  const gy = Math.round(+(body.gradYear ?? user.grad_year));
  if (!(gy >= 2000 && gy <= 2100)) fail(400, 'Bad graduation year');
  const emoji = EMOJIS.includes(body.emoji) ? body.emoji : user.emoji;
  const color = COLORS.includes(body.color) ? body.color : user.color;
  run('update users set name=?,grad_year=?,emoji=?,color=? where id=?', name, gy, emoji, color, user.id);
  push(coMemberIds(user.id), 'members_changed', {});
  return { ok: true };
});
route('GET', '/api/options', () => ({ emojis: EMOJIS, colors: COLORS }), false);

/* clubs */
route('GET', '/api/clubs', ({ user, url }) => {
  const s = (url.searchParams.get('q') || '').toLowerCase(), tag = (url.searchParams.get('tag') || '').toLowerCase();
  let list = q('select * from clubs order by name').map(c => clubOut(c, user.id));
  if (s) list = list.filter(c => (c.name + ' ' + c.description + ' ' + c.tags.join(' ')).toLowerCase().includes(s));
  if (tag) list = list.filter(c => c.tags.map(t => t.toLowerCase()).includes(tag));
  const tags = [...new Set(q('select tags from clubs').flatMap(r => tagsOut(r.tags)))].sort();
  return { clubs: list, tags };
});
route('POST', '/api/clubs', ({ user, body }) => {
  const name = str(body.name, 50, 'Club name');
  if (one('select 1 x from clubs where lower(name)=lower(?)', name)) fail(409, 'A club with that name already exists');
  const tags = [...new Set(String(body.tags || '').split(',').map(t => t.trim().slice(0, 20)).filter(Boolean))].slice(0, 5).join(',');
  const cid = createClub(user.id, {
    name, emoji: str(body.emoji || '✨', 8, 'Emoji'), color: COLORS.includes(body.color) ? body.color : pick(COLORS),
    description: str(body.description, 400, 'Description', false), tags, joinMode: body.joinMode === 'request' ? 'request' : 'open',
  });
  push([user.id], 'my_clubs_changed', {});
  return { id: cid };
});
route('GET', '/api/clubs/:id', ({ user, params }) => {
  const c = one('select * from clubs where id=?', +params.id); if (!c) fail(404, 'No such club');
  const role = roleOf(c.id, user.id);
  const out = clubOut(c, user.id);
  if (role) {
    out.members = q('select u.*,m.role from members m join users u on u.id=m.user_id where m.club_id=? order by u.name', c.id)
      .map(u => ({ ...userOut(u), role: u.role, online: clients.has(u.id) }));
  }
  return out;
});
route('PATCH', '/api/clubs/:id', ({ user, params, body }) => {
  const cid = +params.id; needOfficer(cid, user.id);
  const c = one('select * from clubs where id=?', cid);
  const name = str(body.name ?? c.name, 50, 'Club name');
  if (one('select 1 x from clubs where lower(name)=lower(?) and id!=?', name, cid)) fail(409, 'Name taken');
  const tags = body.tags === undefined ? c.tags : [...new Set(String(body.tags).split(',').map(t => t.trim().slice(0, 20)).filter(Boolean))].slice(0, 5).join(',');
  run('update clubs set name=?,emoji=?,color=?,description=?,tags=?,join_mode=?,require_approval=? where id=?',
    name, str(body.emoji ?? c.emoji, 8, 'Emoji'), COLORS.includes(body.color) ? body.color : c.color,
    str(body.description ?? c.description, 400, 'Description', false), tags,
    body.joinMode === 'request' ? 'request' : body.joinMode === 'open' ? 'open' : c.join_mode,
    body.requireApproval === undefined ? c.require_approval : body.requireApproval ? 1 : 0, cid);
  push(clubMemberIds(cid), 'my_clubs_changed', {});
  return { ok: true };
});
route('POST', '/api/clubs/:id/join', ({ user, params, body }) => {
  const c = one('select * from clubs where id=?', +params.id); if (!c) fail(404, 'No such club');
  if (roleOf(c.id, user.id)) fail(400, "You're already in this club");
  if (c.join_mode === 'open') { addMember(c.id, user.id, 'member'); return { joined: true }; }
  run('insert or replace into requests values(?,?,?,?)', c.id, user.id, str(body.note, 200, 'Note', false), now());
  push(q("select user_id from members where club_id=? and role in ('owner','officer')", c.id).map(r => r.user_id), 'requests_changed', { clubId: c.id });
  return { requested: true };
});
route('POST', '/api/join-code', ({ user, body }) => {
  const c = one('select * from clubs where code=?', str(body.code, 12, 'Code').toUpperCase());
  if (!c) fail(404, "That invite code doesn't match any club");
  if (!roleOf(c.id, user.id)) addMember(c.id, user.id, 'member');
  return { id: c.id };
});
route('POST', '/api/clubs/:id/leave', ({ user, params }) => {
  const cid = +params.id, r = roleOf(cid, user.id);
  if (!r) fail(400, 'Not a member');
  if (r === 'owner') fail(400, 'Transfer ownership before leaving');
  run('delete from members where club_id=? and user_id=?', cid, user.id);
  push(clubMemberIds(cid), 'members_changed', { clubId: cid }); push([user.id], 'my_clubs_changed', {});
  return { ok: true };
});
route('GET', '/api/clubs/:id/requests', ({ user, params }) => {
  needOfficer(+params.id, user.id);
  return q('select u.*,r.note,r.created_at rc from requests r join users u on u.id=r.user_id where r.club_id=? order by r.created_at', +params.id)
    .map(u => ({ ...userOut(u), note: u.note, at: u.rc }));
});
route('POST', '/api/clubs/:id/requests/:uid', ({ user, params, body }) => {
  const cid = +params.id; needOfficer(cid, user.id);
  if (!one('select 1 x from requests where club_id=? and user_id=?', cid, +params.uid)) fail(404, 'No such request');
  if (body.approve) addMember(cid, +params.uid, 'member'); else run('delete from requests where club_id=? and user_id=?', cid, +params.uid);
  push([+params.uid], 'my_clubs_changed', {});
  return { ok: true };
});
route('POST', '/api/clubs/:id/members/:uid', ({ user, params, body }) => {
  const cid = +params.id, uid = +params.uid, me = needOfficer(cid, user.id), target = roleOf(cid, uid);
  if (!target) fail(404, 'Not a member');
  if (target === 'owner') fail(400, 'Use ownership transfer to change the owner');
  const nr = body.role;
  if (!['officer', 'member', 'alumni', 'advisor'].includes(nr)) fail(400, 'Bad role');
  if ((nr === 'officer' || target === 'officer') && me !== 'owner') fail(403, 'Only the owner can add or remove officers');
  run('update members set role=? where club_id=? and user_id=?', nr, cid, uid);
  push(clubMemberIds(cid), 'members_changed', { clubId: cid }); push([uid], 'my_clubs_changed', {});
  return { ok: true };
});
route('DELETE', '/api/clubs/:id/members/:uid', ({ user, params }) => {
  const cid = +params.id, uid = +params.uid, me = needOfficer(cid, user.id), target = roleOf(cid, uid);
  if (!target) fail(404, 'Not a member');
  if (target === 'owner' || (target === 'officer' && me !== 'owner')) fail(403, "You can't remove them");
  run('delete from members where club_id=? and user_id=?', cid, uid);
  push(clubMemberIds(cid), 'members_changed', { clubId: cid }); push([uid], 'my_clubs_changed', {});
  return { ok: true };
});
route('POST', '/api/clubs/:id/advisor', ({ user, params, body }) => {
  const cid = +params.id; if (roleOf(cid, user.id) !== 'owner') fail(403, 'Owner only');
  const u = one('select * from users where email=?', str(body.email, 120, 'Email').toLowerCase());
  if (!u) fail(404, 'No account with that email yet — ask your advisor to sign up first');
  const r = roleOf(cid, u.id);
  if (r === 'owner') fail(400, "That's you!");
  if (r) run("update members set role='advisor' where club_id=? and user_id=?", cid, u.id); else addMember(cid, u.id, 'advisor');
  push(clubMemberIds(cid), 'members_changed', { clubId: cid }); push([u.id], 'my_clubs_changed', {});
  return { ok: true };
});
route('GET', '/api/clubs/:id/rollover', ({ user, params }) => {
  needOfficer(+params.id, user.id);
  const list = q("select u.* from members m join users u on u.id=m.user_id where m.club_id=? and m.role in ('member','officer')", +params.id).filter(u => isAlumYear(u.grad_year));
  return { count: list.length, people: list.map(userOut) };
});
route('POST', '/api/clubs/:id/rollover', ({ user, params }) => {
  const cid = +params.id; needOfficer(cid, user.id);
  const list = q("select u.* from members m join users u on u.id=m.user_id where m.club_id=? and m.role='member'", cid).filter(u => isAlumYear(u.grad_year));
  for (const u of list) run("update members set role='alumni' where club_id=? and user_id=?", cid, u.id);
  const a = chanByName(cid, 'announcements');
  if (a && list.length) systemPost(a.id, user.id, `🎓 Class rollover: ${list.length} graduating member${list.length > 1 ? 's' : ''} moved to Alumni. Congrats, y'all — you're always welcome in #alumni-lounge!`);
  push(clubMemberIds(cid), 'members_changed', { clubId: cid }); push(clubMemberIds(cid), 'my_clubs_changed', {});
  return { moved: list.length };
});
route('POST', '/api/clubs/:id/transfer', ({ user, params, body }) => {
  const cid = +params.id; if (roleOf(cid, user.id) !== 'owner') fail(403, 'Only the owner can transfer the club');
  const to = +body.userId, r = roleOf(cid, to);
  if (!r || r === 'advisor' || to === user.id) fail(400, 'Pick another member');
  run("update members set role='owner' where club_id=? and user_id=?", cid, to);
  run("update members set role='officer' where club_id=? and user_id=?", cid, user.id);
  push(clubMemberIds(cid), 'members_changed', { clubId: cid }); push(clubMemberIds(cid), 'my_clubs_changed', {});
  return { ok: true };
});
route('GET', '/api/clubs/:id/overview', ({ user, params }) => {
  const cid = +params.id, r = roleOf(cid, user.id);
  if (!isOff(r) && r !== 'advisor') fail(403, 'Officers and advisors only');
  const week = now() - 7 * 864e5;
  return {
    roles: Object.fromEntries(q('select role,count(*) n from members where club_id=? group by role', cid).map(x => [x.role, x.n])),
    messages7d: one('select count(*) n from messages m join channels c on c.id=m.channel_id where c.club_id=? and m.created_at>? and m.kind=\'text\'', cid, week).n,
    activeMembers7d: one('select count(distinct m.user_id) n from messages m join channels c on c.id=m.channel_id where c.club_id=? and m.created_at>? and m.kind=\'text\'', cid, week).n,
    upcoming: one('select count(*) n from events where club_id=? and cancelled=0 and status=\'approved\' and starts_at>?', cid, now()).n,
    pending: q(`${EVENT_SQL} where e.club_id=? and e.status='pending' and e.cancelled=0 order by e.starts_at`, cid).map(e => eventOut(e, user.id)),
    advisors: q("select u.* from members m join users u on u.id=m.user_id where m.club_id=? and m.role='advisor'", cid).map(userOut),
  };
});

/* channels & messages */
route('POST', '/api/clubs/:id/channels', ({ user, params, body }) => {
  const cid = +params.id; needOfficer(cid, user.id);
  const name = str(body.name, 30, 'Channel name').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name) fail(400, 'Use letters and numbers');
  if (chanByName(cid, name)) fail(409, 'That channel already exists');
  const access = ['all', 'members', 'officers', 'alumni'].includes(body.access) ? body.access : 'all';
  const id = makeChannel(cid, name, { topic: str(body.topic, 120, 'Topic', false), kind: body.kind === 'announce' ? 'announce' : 'text', access });
  push(clubMemberIds(cid), 'my_clubs_changed', {});
  return { id };
});
route('DELETE', '/api/channels/:id', ({ user, params }) => {
  const ch = one('select * from channels where id=?', +params.id); if (!ch) fail(404, 'No such channel');
  needOfficer(ch.club_id, user.id);
  if (['announcements', 'general'].includes(ch.name)) fail(400, "Can't delete the core channels");
  run('delete from channels where id=?', ch.id);
  push(clubMemberIds(ch.club_id), 'my_clubs_changed', {});
  return { ok: true };
});
route('GET', '/api/channels/:id/messages', ({ user, params, url }) => {
  chanFor(+params.id, user.id);
  const before = +url.searchParams.get('before') || 9e15;
  const rows = q('select * from messages where channel_id=? and id<? order by id desc limit 60', +params.id, before).reverse();
  return { messages: rows.map(msgOut), more: rows.length === 60 };
});
route('POST', '/api/channels/:id/messages', ({ user, params, body }) => {
  limit('msg' + user.id, 20, 10000);
  const { ch, role } = chanFor(+params.id, user.id);
  if (ch.kind === 'announce' && !isOff(role)) fail(403, 'Only officers can post in announcement channels');
  const text = str(body.body, 2000, 'Message');
  const id = run('insert into messages(channel_id,user_id,body,created_at) values(?,?,?,?)', ch.id, user.id, text, now()).lastInsertRowid;
  run('insert into reads values(?,?,?) on conflict(user_id,channel_id) do update set last_id=excluded.last_id', user.id, ch.id, id);
  const out = msgOut(one('select * from messages where id=?', id));
  push(channelReaderIds(ch), 'message', out);
  return out;
});
route('POST', '/api/channels/:id/read', ({ user, params }) => {
  const { ch } = chanFor(+params.id, user.id);
  const last = one('select coalesce(max(id),0) m from messages where channel_id=?', ch.id).m;
  run('insert into reads values(?,?,?) on conflict(user_id,channel_id) do update set last_id=excluded.last_id', user.id, ch.id, last);
  return { ok: true };
});
route('POST', '/api/channels/:id/typing', ({ user, params }) => {
  limit('typ' + user.id, 8, 5000);
  const { ch } = chanFor(+params.id, user.id);
  push(channelReaderIds(ch).filter(i => i !== user.id), 'typing', { channelId: ch.id, name: user.name });
  return { ok: true };
});
route('POST', '/api/messages/:id/react', ({ user, params, body }) => {
  const m = one('select * from messages where id=?', +params.id); if (!m) fail(404, 'No such message');
  const { ch } = chanFor(m.channel_id, user.id);
  const emoji = str(body.emoji, 8, 'Emoji');
  if (one('select 1 x from reactions where message_id=? and user_id=? and emoji=?', m.id, user.id, emoji)) run('delete from reactions where message_id=? and user_id=? and emoji=?', m.id, user.id, emoji);
  else run('insert into reactions values(?,?,?)', m.id, user.id, emoji);
  push(channelReaderIds(ch), 'reactions', { id: m.id, channelId: ch.id, reactions: msgOut(m).reactions });
  return { ok: true };
});
route('DELETE', '/api/messages/:id', ({ user, params }) => {
  const m = one('select * from messages where id=?', +params.id); if (!m) fail(404, 'No such message');
  const { ch, role } = chanFor(m.channel_id, user.id);
  if (m.user_id !== user.id && !isOff(role)) fail(403, "That's not yours to delete");
  run('delete from messages where id=?', m.id);
  push(channelReaderIds(ch), 'message_deleted', { id: m.id, channelId: ch.id });
  return { ok: true };
});

/* events */
route('GET', '/api/events', ({ user, url }) => {
  const scope = url.searchParams.get('scope') || 'upcoming', club = +url.searchParams.get('club') || 0;
  let rows = q(`${EVENT_SQL} where e.cancelled=0 and e.starts_at>? order by e.starts_at limit 300`, now() - 3 * 3600e3);
  rows = rows.filter(e => {
    const r = roleOf(e.club_id, user.id);
    if (e.status !== 'approved') return isOff(r) || r === 'advisor';
    return e.public || !!r;
  });
  if (club) rows = rows.filter(e => e.club_id === club);
  let out = rows.map(e => eventOut(e, user.id));
  if (scope === 'mine') out = out.filter(e => e.mine);
  if (scope === 'volunteer') out = out.filter(e => e.volunteersNeeded > 0 && e.status === 'approved');
  return out;
});
route('POST', '/api/clubs/:id/events', ({ user, params, body }) => {
  const cid = +params.id; needOfficer(cid, user.id);
  const c = one('select * from clubs where id=?', cid);
  const startsAt = +body.startsAt; if (!(startsAt > 0)) fail(400, 'Pick a date and time');
  const hasAdvisor = !!one("select 1 x from members where club_id=? and role='advisor'", cid);
  const status = c.require_approval && hasAdvisor ? 'pending' : 'approved';
  const id = run('insert into events(club_id,title,description,location,starts_at,ends_at,capacity,volunteers_needed,public,status,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)',
    cid, str(body.title, 80, 'Title'), str(body.description, 800, 'Description', false), str(body.location, 80, 'Location', false), startsAt,
    +body.endsAt > startsAt ? +body.endsAt : null, +body.capacity > 0 ? Math.round(+body.capacity) : null, Math.max(0, Math.min(500, Math.round(+body.volunteersNeeded) || 0)),
    body.public === false ? 0 : 1, status, user.id, now()).lastInsertRowid;
  if (status === 'approved') announceEvent(id, user.id);
  else push(q("select user_id from members where club_id=? and role='advisor'", cid).map(r => r.user_id), 'requests_changed', { clubId: cid });
  pushAll('events_changed', {});
  return { id, status };
});
function announceEvent(eid, uid) {
  const e = one('select * from events where id=?', eid), a = chanByName(e.club_id, 'announcements');
  if (a) systemPost(a.id, uid, `New event: ${e.title}`, 'event', eid);
}
route('POST', '/api/events/:id/approve', ({ user, params, body }) => {
  const e = one('select * from events where id=?', +params.id); if (!e) fail(404, 'No such event');
  if (roleOf(e.club_id, user.id) !== 'advisor') fail(403, 'Advisors approve events');
  if (body.approve) { run("update events set status='approved' where id=?", e.id); announceEvent(e.id, e.created_by); }
  else run('update events set cancelled=1 where id=?', e.id);
  pushAll('events_changed', {});
  return { ok: true };
});
route('POST', '/api/events/:id/cancel', ({ user, params }) => {
  const e = one('select * from events where id=?', +params.id); if (!e) fail(404, 'No such event');
  needOfficer(e.club_id, user.id);
  run('update events set cancelled=1 where id=?', e.id);
  const a = chanByName(e.club_id, 'announcements');
  const n = one('select count(*) n from rsvps where event_id=?', e.id).n;
  if (a) systemPost(a.id, user.id, `❌ Cancelled: "${e.title}". ${n} RSVP${n === 1 ? '' : 's'} notified.`);
  push(q('select user_id from rsvps where event_id=?', e.id).map(r => r.user_id), 'toast', { text: `"${e.title}" was cancelled` });
  pushAll('events_changed', {});
  return { ok: true };
});
route('POST', '/api/events/:id/rsvp', ({ user, params, body }) => {
  const e = one('select * from events where id=?', +params.id); if (!e || e.cancelled || e.status !== 'approved') fail(404, 'Event not available');
  const kind = body.kind;
  if (!['going', 'volunteer', 'none'].includes(kind)) fail(400, 'Bad RSVP');
  if (kind === 'none') run('delete from rsvps where event_id=? and user_id=?', e.id, user.id);
  else {
    const cur = one('select kind from rsvps where event_id=? and user_id=?', e.id, user.id)?.kind;
    if (kind === 'going' && e.capacity && cur !== 'going' && one("select count(*) n from rsvps where event_id=? and kind='going'", e.id).n >= e.capacity) fail(409, "Sorry, that event is full!");
    run('insert or replace into rsvps values(?,?,?)', e.id, user.id, kind);
  }
  pushAll('events_changed', {});
  return { ok: true };
});
route('GET', '/api/events/:id/people', ({ user, params }) => {
  const e = one('select * from events where id=?', +params.id); if (!e) fail(404, 'No such event');
  needOfficer(e.club_id, user.id);
  return q('select u.*,r.kind from rsvps r join users u on u.id=r.user_id where r.event_id=? order by r.kind,u.name', e.id).map(u => ({ ...userOut(u), kind: u.kind }));
});

/* inbox: reach any club's officers from one place */
function inboxUnread(uid) {
  return inboxThreads(uid).filter(t => t.unread).length;
}
function inboxThreads(uid) {
  const rows = q(`select t.*,c.name cname,c.emoji cemoji,c.color ccolor,u.name uname,u.emoji uemoji,u.color ucolor,
      (select role from members where club_id=t.club_id and user_id=?) myrole from threads t
      join clubs c on c.id=t.club_id join users u on u.id=t.user_id order by t.last_at desc`, uid)
    .filter(t => t.user_id === uid || isOff(t.myrole));
  return rows.map(t => {
    const last = one('select last_id from treads where thread_id=? and user_id=?', t.id, uid)?.last_id || 0;
    const lm = one('select body,sender_id from tmsgs where thread_id=? order by id desc limit 1', t.id);
    return {
      id: t.id, clubId: t.club_id, clubName: t.cname, clubEmoji: t.cemoji, clubColor: t.ccolor, subject: t.subject, lastAt: t.last_at,
      student: { id: t.user_id, name: t.uname, emoji: t.uemoji, color: t.ucolor }, asOfficer: t.user_id !== uid,
      preview: lm?.body.slice(0, 90) || '', unread: one('select count(*) n from tmsgs where thread_id=? and id>? and sender_id!=?', t.id, last, uid).n,
    };
  });
}
const threadPeople = t => [t.user_id, ...q("select user_id from members where club_id=? and role in ('owner','officer')", t.club_id).map(r => r.user_id)];
route('GET', '/api/inbox', ({ user }) => inboxThreads(user.id));
route('POST', '/api/clubs/:id/contact', ({ user, params, body }) => {
  limit('ct' + user.id, 10, 60000);
  const c = one('select * from clubs where id=?', +params.id); if (!c) fail(404, 'No such club');
  const text = str(body.body, 2000, 'Message');
  let t = one('select * from threads where club_id=? and user_id=?', c.id, user.id);
  if (!t) { const id = run('insert into threads(club_id,user_id,subject,last_at) values(?,?,?,?)', c.id, user.id, str(body.subject || 'Hello!', 80, 'Subject'), now()).lastInsertRowid; t = one('select * from threads where id=?', id); }
  addThreadMsg(t, user.id, text);
  return { id: t.id };
});
function addThreadMsg(t, uid, text) {
  const id = run('insert into tmsgs(thread_id,sender_id,body,created_at) values(?,?,?,?)', t.id, uid, text, now()).lastInsertRowid;
  run('update threads set last_at=? where id=?', now(), t.id);
  run('insert into treads values(?,?,?) on conflict(thread_id,user_id) do update set last_id=excluded.last_id', t.id, uid, id);
  const u = one('select * from users where id=?', uid);
  push(threadPeople(t), 'thread', { threadId: t.id, message: { id, body: text, at: now(), sender: userOut(u) } });
}
route('GET', '/api/threads/:id', ({ user, params }) => {
  const t = one('select * from threads where id=?', +params.id); if (!t) fail(404, 'No such conversation');
  if (t.user_id !== user.id && !isOff(roleOf(t.club_id, user.id))) fail(403, 'Not your conversation');
  const c = one('select * from clubs where id=?', t.club_id), s = one('select * from users where id=?', t.user_id);
  const msgs = q('select * from tmsgs where thread_id=? order by id', t.id).map(m => ({ id: m.id, body: m.body, at: m.created_at, sender: userOut(one('select * from users where id=?', m.sender_id)) }));
  const last = msgs.length ? msgs[msgs.length - 1].id : 0;
  run('insert into treads values(?,?,?) on conflict(thread_id,user_id) do update set last_id=excluded.last_id', t.id, user.id, last);
  return { id: t.id, subject: t.subject, club: { id: c.id, name: c.name, emoji: c.emoji, color: c.color }, student: userOut(s), messages: msgs };
});
route('POST', '/api/threads/:id/messages', ({ user, params, body }) => {
  limit('tm' + user.id, 20, 10000);
  const t = one('select * from threads where id=?', +params.id); if (!t) fail(404, 'No such conversation');
  if (t.user_id !== user.id && !isOff(roleOf(t.club_id, user.id))) fail(403, 'Not your conversation');
  addThreadMsg(t, user.id, str(body.body, 2000, 'Message'));
  return { ok: true };
});

/* live stream */
route('GET', '/api/stream', ({ req, res, user }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 2000\n\n');
  const first = !clients.has(user.id);
  if (first) clients.set(user.id, new Set());
  clients.get(user.id).add(res);
  if (first) push(coMemberIds(user.id), 'presence', { userId: user.id, online: true });
  const hb = setInterval(() => res.write(': hb\n\n'), 25000);
  req.on('close', () => {
    clearInterval(hb);
    const set = clients.get(user.id); set?.delete(res);
    if (set && !set.size) { clients.delete(user.id); push(coMemberIds(user.id), 'presence', { userId: user.id, online: false }); }
  });
  return undefined; // handled
});

/* ---------- server ---------- */
function cookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
  return o;
}
const MIME = { '.webmanifest': 'application/manifest+json',  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = routes.map(rt => ({ rt, m: rt.method === req.method && rt.re.exec(url.pathname) })).find(x => x.m);
      if (!r) fail(404, 'Not found');
      let user = null;
      const tok = cookies(req).sid;
      if (tok) user = one('select u.* from sessions s join users u on u.id=s.user_id where s.token=?', tok);
      if (r.rt.auth && !user) fail(401, 'Please log in');
      let body = {};
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        let raw = '', size = 0;
        for await (const ch of req) { size += ch.length; if (size > 50000) fail(413, 'Too big'); raw += ch; }
        try { body = raw ? JSON.parse(raw) : {}; } catch { fail(400, 'Bad JSON'); }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) body = {};
      }
      const out = r.rt.fn({ req, res, user, url, body, params: r.m.groups || {}, ip: req.socket.remoteAddress });
      if (res.headersSent) return;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(out ?? { ok: true }));
    }
    // static
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(PUB, path.normalize(p));
    if (!file.startsWith(PUB + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(fs.readFileSync(path.join(PUB, 'index.html')));
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    if (!(e instanceof HttpErr)) console.error(e);
    if (res.headersSent) return res.end();
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e instanceof HttpErr ? e.message : 'Something broke on our side' }));
  }
});

module.exports = { db, createClub, addMember, hashPass, makeChannel, systemPost, EMOJIS, COLORS };
if (require.main === module) {
  if (process.env.SEED !== '0') require('./seed.js').seed(module.exports);
  server.listen(PORT, '0.0.0.0', () => console.log(`ClubQuad is live → http://localhost:${PORT}`));
}
