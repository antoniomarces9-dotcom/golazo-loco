// GOLAZO LOCO - servidor autoritativo (Node + Express + Socket.IO)
const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const app = express();
app.use(express.static(path.join(__dirname, '../client')));
app.get('/health', (_, res) => res.send('ok'));
const srv = http.createServer(app);
const io = new Server(srv, { cors: { origin: process.env.CLIENT_ORIGIN || '*' }, maxHttpBufferSize: 250e3 });

const W = 1200, G = 520, GH = 170, BR0 = 16, PR = 30, POST = { x: 0, y: G - GH };
const rooms = new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mkCode = () => { let c = ''; for (let i = 0; i < 6; i++) c += A[(Math.random() * A.length) | 0]; return rooms.has(c) ? mkCode() : c; };
const tok = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clean = (d = {}) => ({
  name: String(d.name || 'Jugador').slice(0, 14),
  color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#e63946',
  photo: typeof d.photo === 'string' && d.photo.startsWith('data:image/jpeg;base64,') && d.photo.length < 120000 ? d.photo : null,
});

function reset(s) {
  s.ball = { x: W / 2, y: 300, vx: 0, vy: 0 };
  s.p.forEach((p, i) => Object.assign(p, { x: i ? W - 260 : 260, y: G, vx: 0, vy: 0, ch: 0, held: false, fx: {} }));
}
function newMatch(r) {
  r.s = { p: [{ inp: {} }, { inp: {} }], score: [0, 0], t: r.dur, ph: 1, fr: 3.2, shots: [0, 0], golden: false, br: 16, bg: 1400, sp: 1, jm: 1, bo: 0.68, mt: 8, mod: '', items: [], it: 5 }; r.stad = (Math.random() * 5) | 0;
  reset(r.s); r.rem = [false, false];
}
const ev = (r, e) => io.to(r.code).emit('ev', e);

function kick(r, i) {
  const s = r.s, p = s.p[i], b = s.ball, BR = s.br;
  const dx = b.x - p.x, dy = b.y - (p.y - PR), d = Math.hypot(dx, dy);
  if (d > PR + BR + 30) return;
  const pw = (520 + p.ch * 780) * (p.fx[1] > 0 ? 1.6 : 1);
  const ang = Math.atan2(dy - 40 * (1 - p.ch), dx || 0.001);
  b.vx = Math.cos(ang) * pw; b.vy = Math.sin(ang) * pw - 150 - 250 * p.ch;
  s.shots[i]++; ev(r, { t: 'kick', pw: p.ch });
}
function end(r) { r.s.ph = 3; ev(r, { t: 'end' }); io.to(r.code).emit('over', { score: r.s.score, shots: r.s.shots }); }
function goal(r, who) {
  const s = r.s; s.score[who]++;
  ev(r, { t: 'goal', who, sc: s.score });
  if ((r.mode === 'first5' && s.score[who] >= 5) || s.golden) return end(r);
  s.ph = 2; s.fr = 2.4;
}
const MODS = [['¡BALÓN GIGANTE!', s => s.br = 30], ['¡BALÓN DIMINUTO!', s => s.br = 9], ['¡GRAVEDAD LUNAR!', s => s.bg = 600], ['¡SUPERRÁPIDOS!', s => s.sp = 1.7], ['¡REBOTES LOCOS!', s => s.bo = 1.0], ['¡SALTOS ENORMES!', s => s.jm = 1.5]];
function modsAndItems(r, dt) {
  const s = r.s;
  if (r.mode === 'chaos') { s.mt -= dt; if (s.mt <= 0) {
    Object.assign(s, { br: 16, bg: 1400, sp: 1, jm: 1, bo: 0.68 });
    if (s.mod) { s.mod = ''; s.mt = 6; } else { const m = MODS[(Math.random() * MODS.length) | 0]; m[1](s); s.mod = m[0]; s.mt = 9; ev(r, { t: 'mod', n: m[0] }); } } }
  s.it -= dt;
  if (s.it <= 0 && s.items.length < 2) { s.it = 7; s.items.push({ x: 250 + Math.random() * 700, y: G - 70, k: (Math.random() * 6) | 0 }); }
  s.items = s.items.filter(it => { for (let i = 0; i < 2; i++) { const p = s.p[i];
    if (Math.hypot(p.x - it.x, p.y - 40 - it.y) < 55) { p.fx[it.k] = it.k === 5 ? 12 : 8; ev(r, { t: 'pu', who: i, k: it.k }); return false; } } return true; });
}
function step(r, dt) {
  const s = r.s;
  if (r.pl.some(p => p.off)) return; // pausa por desconexión
  const BR = s.br;
  if (s.ph === 3) return;
  if (s.ph === 1 || s.ph === 2) { s.fr -= dt; if (s.fr <= 0) { if (s.ph === 2) reset(s); s.ph = 0; ev(r, { t: 'go' }); } return; }
  if (r.mode !== 'first5' && !s.golden) {
    s.t -= dt;
    if (s.t <= 0) { if (r.mode === 'golden' && s.score[0] === s.score[1]) { s.t = 0; s.golden = true; ev(r, { t: 'golden' }); } else return end(r); }
  }
  modsAndItems(r, dt);
  s.p.forEach((p, i) => {
    const k = p.inp;
    for (const q in p.fx) p.fx[q] -= dt;
    const dir = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    p.vx = dir * 340 * s.sp * (p.fx[0] > 0 ? 1.5 : 1);
    if (k.s && p.fx[5] > 0) { p.x = clamp(p.x + (dir || (s.ball.x > p.x ? 1 : -1)) * 230, PR, W - PR); p.fx[5] = 0; ev(r, { t: 'tele' }); }
    if (k.j && p.y >= G) { p.vy = -740 * s.jm * (p.fx[3] > 0 ? 1.4 : 1); ev(r, { t: 'jump' }); }
    p.vy += 1900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y > G) { p.y = G; p.vy = 0; }
    p.x = clamp(p.x, PR, W - PR);
    if (k.k) { p.ch = Math.min(1, p.ch + dt / 0.8); p.held = true; }
    else if (p.held) { kick(r, i); p.ch = 0; p.held = false; }
  });
  const [a, c] = s.p; // jugador vs jugador
  const dx = c.x - a.x, dy = c.y - a.y;
  if (Math.abs(dx) < PR * 2 && Math.abs(dy) < PR * 1.6) { const o = (PR * 2 - Math.abs(dx)) / 2, sg = dx >= 0 ? 1 : -1; const sa = a.fx[4] > 0, sc = c.fx[4] > 0; a.x -= o * sg * (sa && !sc ? 0 : sc && !sa ? 2 : 1); c.x += o * sg * (sc && !sa ? 0 : sa && !sc ? 2 : 1); ev(r, { t: 'bump' }); }
  const b = s.ball;
  s.p.forEach(p => { if (p.fx[2] > 0) { const d = Math.hypot(p.x - b.x, p.y - PR - b.y); if (d < 320 && d > 1) { b.vx += (p.x - b.x) / d * 900 * dt; b.vy += (p.y - PR - b.y) / d * 500 * dt; } } });
  b.vy += s.bg * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.y > G - BR) { b.y = G - BR; if (Math.abs(b.vy) > 120) ev(r, { t: 'bounce' }); b.vy *= -s.bo; b.vx *= 0.985; if (Math.abs(b.vy) < 60) b.vy = 0; }
  if (b.y < BR) { b.y = BR; b.vy *= -0.7; }
  b.vx *= (1 - 0.15 * dt);
  s.p.forEach(p => { // jugador vs balón
    const cx = p.x, cy = p.y - PR, ddx = b.x - cx, ddy = b.y - cy, d = Math.hypot(ddx, ddy), m = PR + BR;
    if (d < m && d > 0.01) { const nx = ddx / d, ny = ddy / d; b.x = cx + nx * m; b.y = cy + ny * m;
      const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
      b.vx += p.vx * 0.5; ev(r, { t: 'touch' }); }
  });
  for (const px of [0, W]) { // postes (larguero)
    const ddx = b.x - px, ddy = b.y - POST.y, d = Math.hypot(ddx, ddy), m = BR + 7;
    if (d < m && d > 0.01) { const nx = ddx / d, ny = ddy / d, vn = b.vx * nx + b.vy * ny;
      b.x = px + nx * m; b.y = POST.y + ny * m; if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; } ev(r, { t: 'post' }); }
  }
  if (b.y > POST.y + BR) { // dentro de la boca de gol
    if (b.x < -BR) return goal(r, 1);
    if (b.x > W + BR) return goal(r, 0);
  } else {
    if (b.x < BR) { b.x = BR; b.vx *= -0.8; } if (b.x > W - BR) { b.x = W - BR; b.vx *= -0.8; }
  }
  if (Math.hypot(b.vx, b.vy) < 5 && b.y >= G - BR - 1 && Math.abs(b.x - W / 2) < 2) b.vx += 30; // anti-atasco
}
const pub = r => ({ code: r.code, mode: r.mode, dur: r.dur, started: !!r.s, host: 0,
  players: r.pl.map(p => ({ name: p.name, color: p.color, photo: p.photo, ready: p.ready, off: !!p.off })) });
const sync = r => { r.pl.forEach((p, i) => p.sid && io.to(p.sid).emit('room', { ...pub(r), you: i })); };
const close = (r, why) => { io.to(r.code).emit('closed', why); io.in(r.code).socketsLeave(r.code); rooms.delete(r.code); };

io.on('connection', sock => {
  let R = null, me = -1, bad = 0, blockUntil = 0;
  const enter = (r, i) => { R = r; me = i; sock.join(r.code); sync(r); };
  const join = (r, d) => { const p = { ...clean(d), ready: false, sid: sock.id, token: tok(), off: 0 };
    r.pl.push(p); sock.emit('token', p.token); enter(r, r.pl.length - 1); };
  sock.on('create', d => { const r = { code: mkCode(), pl: [], mode: 'classic', dur: 90, born: Date.now() };
    rooms.set(r.code, r); join(r, d); });
  sock.on('join', d => {
    if (Date.now() < blockUntil) return sock.emit('err', 'Demasiados intentos. Espera un minuto.');
    const r = rooms.get(String(d?.code || '').toUpperCase().trim());
    if (!r) { if (++bad >= 6) { blockUntil = Date.now() + 60000; bad = 0; } return sock.emit('err', 'Esa sala no existe.'); }
    if (r.s) return sock.emit('err', 'La partida ya ha empezado.');
    if (r.pl.length >= 2) return sock.emit('err', 'La sala está completa.');
    join(r, d);
  });
  sock.on('rejoin', d => {
    const r = rooms.get(String(d?.code || '')); const i = r ? r.pl.findIndex(p => p.token === d.token) : -1;
    if (i < 0) return sock.emit('closed', 'La sala ya no existe.');
    r.pl[i].sid = sock.id; r.pl[i].off = 0; enter(r, i);
  });
  sock.on('profile', d => { if (!R || R.s) return; Object.assign(R.pl[me], clean(d)); sync(R); });
  sock.on('ready', v => { if (!R || R.s) return; R.pl[me].ready = !!v; sync(R); });
  sock.on('opts', d => { if (!R || me !== 0 || R.s) return;
    if (['classic', 'first5', 'golden', 'chaos'].includes(d.mode)) R.mode = d.mode;
    if ([60, 90, 120].includes(d.dur)) R.dur = d.dur; sync(R); });
  sock.on('start', () => { if (!R || me !== 0 || R.s || R.pl.length < 2 || !R.pl.every(p => p.ready)) return;
    newMatch(R); if (R.mode === 'first5') R.s.t = 9999; sync(R); io.to(R.code).emit('begin', R.stad); });
  sock.on('input', d => { if (!R || !R.s || !d) return; R.s.p[me].inp = { l: !!d.l, r: !!d.r, j: !!d.j, k: !!d.k, s: !!d.s }; });
  sock.on('rematch', () => { if (!R || !R.s || R.s.ph !== 3) return; R.rem[me] = true;
    io.to(R.code).emit('rem', R.rem);
    if (R.rem[0] && R.rem[1]) { newMatch(R); if (R.mode === 'first5') R.s.t = 9999; io.to(R.code).emit('begin', R.stad); } });
  const leave = () => { if (!R) return; const r = R; R = null; sock.leave(r.code);
    if (me === 0 || r.s) close(r, 'El rival ha abandonado la sala.'); else { r.pl.splice(me, 1); sync(r); } };
  sock.on('leave', leave);
  sock.on('disconnect', () => { if (!R) return; const r = R, p = r.pl[me];
    if (!r.s) return leave();
    p.off = Date.now(); p.sid = null; sync(r); });
});

setInterval(() => { // bucle de física 60Hz, difusión 30Hz
  for (const r of rooms.values()) if (r.s) step(r, 1 / 60);
}, 1000 / 60);
let tick = 0;
setInterval(() => {
  tick++;
  for (const r of rooms.values()) if (r.s) { const s = r.s, b = s.ball;
    io.to(r.code).volatile.emit('st', { b: [b.x | 0, b.y | 0], p: s.p.map(p => [p.x | 0, p.y | 0, +p.ch.toFixed(2), Object.keys(p.fx).filter(q => p.fx[q] > 0).map(Number)]), it: s.items.map(i => [i.x | 0, i.y | 0, i.k]), m: s.mod, br: s.br, sc: s.score, t: Math.ceil(s.t), ph: s.ph, fr: +s.fr.toFixed(1), g: s.golden }); }
}, 1000 / 30);
setInterval(() => { const now = Date.now(); // limpieza
  for (const r of rooms.values()) {
    if (r.pl.some(p => p.off && now - p.off > 30000)) close(r, 'Un jugador no pudo reconectar.');
    else if (now - r.born > 4 * 3600e3) close(r, 'Sala caducada.');
  } }, 5000);
srv.listen(process.env.PORT || 3000, () => console.log('Golazo Loco en puerto', process.env.PORT || 3000));
