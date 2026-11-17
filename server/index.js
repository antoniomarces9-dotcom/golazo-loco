// CHAPAS LOCAS - servidor autoritativo (vista cenital tipo Haxball)
const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const app = express();
app.use(express.static(path.join(__dirname, '../client')));
app.get('/health', (_, res) => res.send('ok'));
const srv = http.createServer(app);
const io = new Server(srv, { cors: { origin: process.env.CLIENT_ORIGIN || '*' }, maxHttpBufferSize: 250e3 });

const FW = 1000, FH = 520, CY = 260;
const STAD = [[], [[330, 170, 20], [330, 350, 20], [670, 170, 20], [670, 350, 20]], [[500, 260, 30]], [[500, 110, 24], [500, 260, 24], [500, 410, 24]], []];
const MODES = { classic: {}, first5: {}, golden: {}, chaos: { ch: 9 }, powers: { pu: 1 }, locura: { ch: 6, pu: 1 } };
const MODS = [['¡BALÓN GIGANTE!', s => { s.br = 24; s.bm = 3; }], ['¡BALÓN DIMINUTO!', s => { s.br = 6; s.bm = .5; }], ['¡SUELO DE HIELO!', s => s.dr = .975],
  ['¡SUPERRÁPIDOS!', s => s.sp = 1.6], ['¡REBOTES LOCOS!', s => s.bo = 1.05], ['¡PORTERÍAS GIGANTES!', s => s.gh = 150], ['¡CHAPAS GIGANTES!', s => s.pr = 1.5]];
const rooms = new Map(), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mkCode = () => { let c = ''; for (let i = 0; i < 6; i++) c += AL[(Math.random() * AL.length) | 0]; return rooms.has(c) ? mkCode() : c; };
const tok = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clean = (d = {}) => ({ name: String(d.name || 'Jugador').slice(0, 14), color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#e63946',
  photo: typeof d.photo === 'string' && d.photo.startsWith('data:image/jpeg;base64,') && d.photo.length < 120000 ? d.photo : null });
const disc = (x, y, r, m) => ({ x, y, vx: 0, vy: 0, r, m });
const ev = (r, e) => io.to(r.code).emit('ev', e);

function reset(s) {
  s.ball = disc(FW / 2, CY, s.br, s.bm);
  s.p.forEach((p, i) => Object.assign(p, disc(i ? FW - 220 : 220, CY, 22, 1.5), { fx: {}, kc: 0, kick: 0 }));
}
function newMatch(r) {
  r.s = { p: [{ inp: {} }, { inp: {} }], score: [0, 0], t: r.dur, ph: 1, fr: 3.2, shots: [0, 0], golden: false, br: 11, bm: 1, sp: 1, dr: .88, bo: .6, gh: 85, pr: 1, mt: 6, mod: '', items: [], it: 4 };
  r.stad = r.stadSel >= 5 ? (Math.random() * 5) | 0 : r.stadSel;
  r.s.ob = STAD[r.stad].map(([x, y, rr]) => disc(x, y, rr, 1e9));
  if (r.mode === 'first5') r.s.t = 9999;
  reset(r.s); r.rem = [false, false];
}
function coll(a, b, e) { // choque elástico entre discos; devuelve la velocidad de impacto
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r; if (d >= m || d < .001) return 0;
  const nx = dx / d, ny = dy / d, ov = m - d, im = 1 / a.m + 1 / b.m;
  a.x -= nx * ov / a.m / im; a.y -= ny * ov / a.m / im; b.x += nx * ov / b.m / im; b.y += ny * ov / b.m / im;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (vn >= 0) return 0;
  const j = -(1 + e) * vn / im; a.vx -= j * nx / a.m; a.vy -= j * ny / a.m; b.vx += j * nx / b.m; b.vy += j * ny / b.m; return -vn;
}
function end(r) { r.s.ph = 3; ev(r, { t: 'end' }); io.to(r.code).emit('over', { score: r.s.score, shots: r.s.shots }); }
function goal(r, who) {
  const s = r.s; s.score[who]++; ev(r, { t: 'goal', who, sc: s.score, x: s.ball.x, y: s.ball.y });
  if ((r.mode === 'first5' && s.score[who] >= 5) || s.golden) return end(r);
  s.ph = 2; s.fr = 2.6;
}
function mods(r, dt, M) {
  const s = r.s;
  if (M.ch) { s.mt -= dt; if (s.mt <= 0) { Object.assign(s, { br: 11, bm: 1, sp: 1, dr: .88, bo: .6, gh: 85, pr: 1 });
    if (s.mod) { s.mod = ''; s.mt = M.ch; } else { const m = MODS[(Math.random() * MODS.length) | 0]; m[1](s); s.mod = m[0]; s.mt = M.ch + 3; ev(r, { t: 'mod', n: m[0] }); }
    s.ball.r = s.br; s.ball.m = s.bm; } }
  if (M.pu) { s.it -= dt;
    if (s.it <= 0 && s.items.length < 2) { s.it = 6; s.items.push({ x: 200 + Math.random() * 600, y: 80 + Math.random() * 360, k: (Math.random() * 5) | 0 }); }
    s.items = s.items.filter(it => { for (let i = 0; i < 2; i++) { const p = s.p[i];
      if (Math.hypot(p.x - it.x, p.y - it.y) < p.r + 18) { p.fx[it.k] = 8; ev(r, { t: 'pu', who: i, k: it.k }); return false; } } return true; }); }
}
function step(r, dt) {
  const s = r.s; if (r.pl.some(p => p.off) || s.ph === 3) return;
  if (s.ph === 1 || s.ph === 2) { s.fr -= dt; if (s.fr <= 0) { if (s.ph === 2) reset(s); s.ph = 0; ev(r, { t: 'go' }); } return; }
  const M = MODES[r.mode] || {};
  if (r.mode !== 'first5' && !s.golden) { s.t -= dt;
    if (s.t <= 0) { if (r.mode === 'golden' && s.score[0] === s.score[1]) { s.t = 0; s.golden = true; ev(r, { t: 'golden' }); } else return end(r); } }
  mods(r, dt, M);
  const b = s.ball, posts = [0, FW].flatMap(px => [-1, 1].map(sg => disc(px, CY + sg * s.gh, 8, 1e9))), all = [...s.ob, ...posts];
  s.p.forEach((p, i) => {
    const k = p.inp; for (const q in p.fx) p.fx[q] -= dt;
    p.r = 22 * s.pr * (p.fx[3] > 0 ? 1.5 : 1); p.m = p.r * p.r / 320;
    const ax = (k.r ? 1 : 0) - (k.l ? 1 : 0), ay = (k.d ? 1 : 0) - (k.u ? 1 : 0), n = Math.hypot(ax, ay) || 1;
    const acc = 2900 * s.sp * (p.fx[0] > 0 ? 1.5 : 1) * (s.p[1 - i].fx[4] > 0 ? .55 : 1);
    p.vx += ax / n * acc * dt; p.vy += ay / n * acc * dt;
    const dm = Math.pow(s.dr, dt * 60); p.vx *= dm; p.vy *= dm;
    p.kc -= dt; p.kick = Math.max(0, p.kick - dt);
    if (k.k && p.kc <= 0) { p.kc = .18; const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < p.r + b.r + 9) { const f = 760 * (p.fx[1] > 0 ? 1.5 : 1); p.kick = .15; b.vx += dx / d * f; b.vy += dy / d * f; s.shots[i]++; ev(r, { t: 'kick', x: b.x, y: b.y }); } }
    if (p.fx[2] > 0) { const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy); if (d < 260 && d > 1) { b.vx += dx / d * 1500 * dt; b.vy += dy / d * 1500 * dt; } }
    p.x += p.vx * dt; p.y += p.vy * dt;
  });
  const bd = Math.pow(.99, dt * 60); b.vx *= bd; b.vy *= bd; b.x += b.vx * dt; b.y += b.vy * dt;
  if (coll(s.p[0], s.p[1], .3) > 150) ev(r, { t: 'bump' });
  s.p.forEach(p => { if (coll(p, b, .5) > 120) ev(r, { t: 'touch' }); all.forEach(o => coll(o, p, .3)); });
  all.forEach(o => { if (coll(o, b, .9) > 150) ev(r, { t: 'post' }); });
  s.p.forEach(p => { // paredes
    if (p.x < p.r) { p.x = p.r; p.vx *= -.3; } if (p.x > FW - p.r) { p.x = FW - p.r; p.vx *= -.3; }
    if (p.y < p.r) { p.y = p.r; p.vy *= -.3; } if (p.y > FH - p.r) { p.y = FH - p.r; p.vy *= -.3; } });
  if (b.y < b.r) { b.y = b.r; b.vy *= -s.bo; } if (b.y > FH - b.r) { b.y = FH - b.r; b.vy *= -s.bo; }
  if (Math.abs(b.y - CY) < s.gh) { if (b.x < -b.r) return goal(r, 1); if (b.x > FW + b.r) return goal(r, 0); }
  else { if (b.x < b.r) { b.x = b.r; b.vx *= -s.bo; ev(r, { t: 'wall' }); } if (b.x > FW - b.r) { b.x = FW - b.r; b.vx *= -s.bo; ev(r, { t: 'wall' }); } }
}
const pub = r => ({ code: r.code, mode: r.mode, dur: r.dur, stad: r.stadSel, started: !!r.s,
  players: r.pl.map(p => ({ name: p.name, color: p.color, photo: p.photo, ready: p.ready, off: !!p.off })) });
const sync = r => r.pl.forEach((p, i) => p.sid && io.to(p.sid).emit('room', { ...pub(r), you: i }));
const close = (r, why) => { io.to(r.code).emit('closed', why); io.in(r.code).socketsLeave(r.code); rooms.delete(r.code); };

io.on('connection', sock => {
  let R = null, me = -1, bad = 0, blockUntil = 0;
  const enter = (r, i) => { R = r; me = i; sock.join(r.code); sync(r); };
  const join = (r, d) => { const p = { ...clean(d), ready: false, sid: sock.id, token: tok(), off: 0 }; r.pl.push(p); sock.emit('token', p.token); enter(r, r.pl.length - 1); };
  sock.on('create', d => { const r = { code: mkCode(), pl: [], mode: 'classic', dur: 90, stadSel: 5, born: Date.now() }; rooms.set(r.code, r); join(r, d); });
  sock.on('join', d => {
    if (Date.now() < blockUntil) return sock.emit('err', 'Demasiados intentos. Espera un minuto.');
    const r = rooms.get(String(d?.code || '').toUpperCase().trim());
    if (!r) { if (++bad >= 6) { blockUntil = Date.now() + 60000; bad = 0; } return sock.emit('err', 'Esa sala no existe.'); }
    if (r.s) return sock.emit('err', 'La partida ya ha empezado.');
    if (r.pl.length >= 2) return sock.emit('err', 'La sala está completa.');
    join(r, d); });
  sock.on('rejoin', d => { const r = rooms.get(String(d?.code || '')); const i = r ? r.pl.findIndex(p => p.token === d.token) : -1;
    if (i < 0) return sock.emit('closed', 'La sala ya no existe.'); r.pl[i].sid = sock.id; r.pl[i].off = 0; enter(r, i); });
  sock.on('profile', d => { if (!R || R.s) return; Object.assign(R.pl[me], clean(d)); sync(R); });
  sock.on('ready', v => { if (!R || R.s) return; R.pl[me].ready = !!v; sync(R); });
  sock.on('opts', d => { if (!R || me !== 0 || R.s) return;
    if (MODES[d.mode]) R.mode = d.mode; if ([60, 90, 120, 180].includes(d.dur)) R.dur = d.dur; if (d.stad >= 0 && d.stad <= 5) R.stadSel = d.stad | 0; sync(R); });
  sock.on('start', () => { if (!R || me !== 0 || R.s || R.pl.length < 2 || !R.pl.every(p => p.ready)) return; newMatch(R); sync(R); io.to(R.code).emit('begin', R.stad); });
  sock.on('input', d => { if (!R || !R.s || !d) return; R.s.p[me].inp = { l: !!d.l, r: !!d.r, u: !!d.u, d: !!d.d, k: !!d.k }; });
  sock.on('rematch', () => { if (!R || !R.s || R.s.ph !== 3) return; R.rem[me] = true; io.to(R.code).emit('rem', R.rem);
    if (R.rem[0] && R.rem[1]) { newMatch(R); io.to(R.code).emit('begin', R.stad); } });
  const leave = () => { if (!R) return; const r = R; R = null; sock.leave(r.code); if (me === 0 || r.s) close(r, 'El rival ha abandonado la sala.'); else { r.pl.splice(me, 1); sync(r); } };
  sock.on('leave', leave);
  sock.on('disconnect', () => { if (!R) return; const r = R, p = r.pl[me]; if (!r.s) return leave(); p.off = Date.now(); p.sid = null; sync(r); });
});
setInterval(() => { for (const r of rooms.values()) if (r.s) step(r, 1 / 60); }, 1000 / 60);
const rd = v => Math.round(v);
setInterval(() => { for (const r of rooms.values()) if (r.s) { const s = r.s, b = s.ball;
  io.to(r.code).volatile.emit('st', { b: [rd(b.x), rd(b.y), b.r], p: s.p.map(p => [rd(p.x), rd(p.y), rd(p.r), p.kick > 0 ? 1 : 0, Object.keys(p.fx).filter(q => p.fx[q] > 0).map(Number)]),
    it: s.items.map(i => [rd(i.x), rd(i.y), i.k]), m: s.mod, gh: s.gh, sc: s.score, t: Math.ceil(s.t), ph: s.ph, fr: +s.fr.toFixed(1), g: s.golden }); } }, 1000 / 30);
setInterval(() => { const now = Date.now(); for (const r of rooms.values()) {
  if (r.pl.some(p => p.off && now - p.off > 30000)) close(r, 'Un jugador no pudo reconectar.'); else if (now - r.born > 4 * 3600e3) close(r, 'Sala caducada.'); } }, 5000);
srv.listen(process.env.PORT || 3000, () => console.log('Chapas Locas en puerto', process.env.PORT || 3000));
