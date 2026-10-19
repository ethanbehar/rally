// Demo data so the app feels alive on first run. Disable with SEED=0.
// All demo accounts use password: demo1234
'use strict';
exports.seed = function seed({ db, createClub, hashPass, EMOJIS, COLORS, systemPost }) {
  if (db.prepare('select count(*) n from users').get().n > 0) return;
  const t0 = Date.now(), H = 3600e3, D = 24 * H;
  const mid = new Date(); mid.setHours(0, 0, 0, 0); const mid0 = mid.getTime();
  const pass = hashPass('demo1234');
  const people = [
    ['demo@student.edu', 'Alex Demo', 2028], ['advisor@school.edu', 'Dr. Rivera', 2000],
    ['maya@student.edu', 'Maya Chen', 2027], ['jordan@student.edu', 'Jordan Okafor', 2028], ['sam@student.edu', 'Sam Patel', 2029],
    ['riley@student.edu', 'Riley Brooks', 2027], ['kai@student.edu', 'Kai Nakamura', 2030], ['luz@student.edu', 'Luz Herrera', 2028],
    ['dev@student.edu', 'Dev Malhotra', 2029], ['tess@alum.edu', 'Tess Lindqvist', 2025], ['omar@alum.edu', 'Omar Haddad', 2026],
    ['bea@student.edu', 'Bea Fontaine', 2027],
  ];
  const ins = db.prepare('insert into users(email,name,pass,grad_year,emoji,color,created_at) values(?,?,?,?,?,?,?)');
  const U = {};
  people.forEach(([e, n, g], i) => { U[n.split(' ')[0].replace('Dr.', 'Rivera')] = Number(ins.run(e, n, pass, g, EMOJIS[i % EMOJIS.length], COLORS[i % COLORS.length], t0).lastInsertRowid); });

  const mk = (owner, o) => createClub(owner, o);
  const ski = mk(U.Maya, { name: 'Ski & Snowboard Club', emoji: '🏂', color: '#4d96ff', tags: 'outdoors,sports,travel', joinMode: 'open', description: 'Weekly trips to the slopes, gear swaps, and way too many group chats (now just one!). All levels welcome.' });
  const rocket = mk(U.Jordan, { name: 'Rocket Society', emoji: '🚀', color: '#ff6b6b', tags: 'engineering,stem,build', joinMode: 'open', description: 'We build, launch, and occasionally recover high-power rockets. Come for the launches, stay for the pizza.' });
  const anime = mk(U.Riley, { name: 'Anime & Manga Club', emoji: '🍜', color: '#c77dff', tags: 'arts,social,gaming', joinMode: 'open', description: 'Weekly screenings, cosplay workshops, and heated opinions about the best season ever.' });
  const chess = mk(U.Luz, { name: 'Chess Club', emoji: '♟️', color: '#2ec4b6', tags: 'games,social,competitive', joinMode: 'open', description: 'Casual blitz nights and tournament prep. Beginners get free coaching.' });
  const cab = mk(U.Bea, { name: 'Campus Activities Board', emoji: '🎪', color: '#ff9f1c', tags: 'events,volunteer,social', joinMode: 'request', description: 'We run the big stuff: concerts, festivals, and weekend events. Always looking for volunteers and club partners!' });
  const blood = mk(U.Dev, { name: 'Red Cross Blood Drive Crew', emoji: '🩸', color: '#f72585', tags: 'volunteer,service,health', joinMode: 'open', description: 'Organizing campus blood drives. Every donation saves up to three lives.' });

  const addM = db.prepare('insert or ignore into members values(?,?,?,?)');
  const join = (c, u, r = 'member') => addM.run(c, U[u], r, t0 - Math.random() * 90 * D);
  ['Alex', 'Jordan', 'Sam', 'Riley', 'Kai', 'Luz', 'Dev'].forEach(u => join(ski, u));
  join(ski, 'Alex', 'member'); db.prepare("update members set role='officer' where club_id=? and user_id=?").run(ski, U.Alex);
  join(ski, 'Tess', 'alumni'); join(ski, 'Omar', 'alumni'); join(ski, 'Rivera', 'advisor'); join(ski, 'Bea');
  ['Alex', 'Sam', 'Kai', 'Dev', 'Maya'].forEach(u => join(rocket, u)); join(rocket, 'Omar', 'alumni');
  ['Alex', 'Maya', 'Bea', 'Kai', 'Luz', 'Sam'].forEach(u => join(anime, u));
  ['Maya', 'Dev', 'Jordan', 'Riley'].forEach(u => join(chess, u)); join(chess, 'Tess', 'alumni');
  ['Maya', 'Jordan', 'Riley', 'Luz', 'Alex'].forEach(u => join(cab, u)); join(cab, 'Rivera', 'advisor');
  ['Alex', 'Bea', 'Sam', 'Luz'].forEach(u => join(blood, u));
  db.prepare('update clubs set require_approval=1 where id=?').run(cab);

  const chan = (c, n) => db.prepare('select id from channels where club_id=? and name=?').get(c, n).id;
  const addCh = db.prepare('insert into channels(club_id,name,topic,kind,access,pos) values(?,?,?,?,?,?)');
  const trips = Number(addCh.run(ski, 'trip-signups', 'Cars, carpools, and who owes whom gas money ⛽', 'text', 'members', 10).lastInsertRowid);
  const memes = Number(addCh.run(ski, 'wipeout-memes', 'Post your best falls', 'text', 'all', 11).lastInsertRowid);
  const builds = Number(addCh.run(rocket, 'build-log', 'Photos, CAD, and cursed wiring', 'text', 'all', 10).lastInsertRowid);
  const watch = Number(addCh.run(anime, 'this-week-watch', 'Screening votes happen here', 'text', 'all', 10).lastInsertRowid);

  const say = db.prepare('insert into messages(channel_id,user_id,body,kind,event_id,created_at) values(?,?,?,?,?,?)');
  let tt = t0 - 2 * D;
  const m = (ch, u, body, mins = 7) => { tt += mins * 60e3 + Math.random() * 60e3; return Number(say.run(ch, U[u], body, 'text', null, tt).lastInsertRowid); };
  m(chan(ski, 'announcements'), 'Maya', '🎿 Welcome to the new Ski Club HQ! Everything lives here now: signups, carpools, payments, and updates. No more 60 Google Forms. 🙏', 30);
  m(chan(ski, 'general'), 'Jordan', 'wait is this actually replacing the discord, the groupme, AND the sheets?? 😭');
  m(chan(ski, 'general'), 'Maya', 'yes!! and alumni can stay in the loop too — hi Tess 👋');
  m(chan(ski, 'general'), 'Tess', 'hi from the real world 🎓 still want first dibs on the Whiteface trip tho');
  const m1 = m(chan(ski, 'general'), 'Sam', 'does anyone have an extra pair of goggles I can borrow for Saturday?');
  m(chan(ski, 'general'), 'Kai', 'i have a spare pair! bringing them to the Friday meeting 🥽');
  m(trips, 'Alex', 'Whiteface carpools — reply with your car + seats. I\'ll make the groups tonight.');
  m(trips, 'Luz', 'I\'ve got a Subaru with 4 open seats 🚗');
  m(trips, 'Dev', 'putting my name down for Luz\'s car, thanks!!');
  m(memes, 'Riley', 'caught on camera: me meeting a tree at 3mph 🌲💀');
  m(chan(ski, 'officers'), 'Maya', 'Reminder: we need the advisor sign-off before posting the overnight trip. Alex can you draft the event?');
  m(chan(ski, 'alumni-lounge'), 'Omar', 'Class of \'26 checking in 🥲 who is still going on the spring trip?');
  m(chan(rocket, 'general'), 'Jordan', 'Static fire test is Thursday. Bring safety glasses!! 🔥');
  m(builds, 'Kai', 'nosecone printed. only took 3 tries and one sad spaghetti incident 🍝');
  m(chan(anime, 'general'), 'Riley', 'vote: what are we screening Friday? 🍿');
  m(watch, 'Bea', 'Option A: the sports one. Option B: the time-loop one. Option C: chaos.');
  m(chan(chess, 'general'), 'Luz', 'blitz night tomorrow, bring a clock if you own one ⏱️');
  m(chan(cab, 'announcements'), 'Bea', '📣 Spring festival planning kicks off soon — we need clubs to run booths and 40+ volunteers.');
  m(chan(blood, 'announcements'), 'Dev', '🩸 Next drive needs 15 volunteers + as many clubs as we can get. Sign up on the Events tab!');
  db.prepare('insert into reactions values(?,?,?)').run(m1, U.Kai, '🙌');
  db.prepare('insert into reactions values(?,?,?)').run(m1, U.Maya, '🥽');

  const ev = db.prepare('insert into events(club_id,title,description,location,starts_at,ends_at,capacity,volunteers_needed,public,status,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)');
  const E = (c, u, title, desc, loc, dt, o = {}) => Number(ev.run(c, title, desc, loc, mid0 + dt, mid0 + dt + (o.len || 2) * H, o.cap || null, o.vol || 0, 1, o.status || 'approved', U[u], t0).lastInsertRowid);
  const e1 = E(ski, 'Alex', 'Whiteface Day Trip 🎿', 'Carpools leave at 5am. Lift tickets are discounted for members. All skill levels!', 'Meet at Union lot', 3 * D + 5 * H, { cap: 28, len: 12 });
  E(ski, 'Maya', 'Ski Club Gear Swap', 'Bring your old gear, take someone else\'s. Free hot chocolate.', 'Student Union Atrium', 1 * D + 17 * H);
  E(rocket, 'Jordan', 'Static Fire Test 🔥', 'Come watch (from a safe distance). Safety talk first.', 'North Field', 2 * D + 16 * H);
  E(anime, 'Riley', 'Friday Screening Night', 'Vote in #this-week-watch. Snacks provided.', 'Lecture Hall 3', 4 * D + 19 * H, { len: 3 });
  E(chess, 'Luz', 'Blitz Night', 'Casual speed chess. Beginners welcome, free coaching table.', 'Library Lounge', 1 * D + 19 * H);
  const e6 = E(blood, 'Dev', 'Fall Blood Drive 🩸', 'We need volunteers for check-in, snacks, and donor escort. Training provided!', 'Armory Gym', 8 * D + 10 * H, { vol: 15, len: 7 });
  E(cab, 'Bea', 'Spring Fest Booth Planning', 'Clubs: come claim a booth and meet the planning team!', 'Student Union 3rd Floor', 6 * D + 18 * H, { vol: 40 });
  E(cab, 'Bea', 'Open Mic Night 🎤', 'Awaiting advisor approval.', 'The Pub', 10 * D + 20 * H, { status: 'pending' });
  const rs = db.prepare('insert or ignore into rsvps values(?,?,?)');
  ['Maya', 'Sam', 'Luz', 'Kai', 'Alex'].forEach(u => rs.run(e1, U[u], 'going'));
  ['Sam', 'Luz'].forEach(u => rs.run(e6, U[u], 'volunteer'));
  say.run(chan(ski, 'announcements'), U.Alex, 'New event: Whiteface Day Trip 🎿', 'event', e1, t0 - H);

  const th = db.prepare('insert into threads(club_id,user_id,subject,last_at) values(?,?,?,?)').run(ski, U.Luz, 'Co-hosting a gear swap + chess night?', t0 - 5 * H);
  db.prepare('insert into tmsgs(thread_id,sender_id,body,created_at) values(?,?,?,?)').run(th.lastInsertRowid, U.Luz, 'Hey Ski Club! Chess Club wants to co-host a combined hot-cocoa + blitz night after your gear swap. Who is the best person to talk to?', t0 - 5 * H);
  console.log('Seeded demo data. Demo login: demo@student.edu / demo1234 (also advisor@school.edu)');
};
