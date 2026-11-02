// Oddlings playable demo: a tiny top-down game drawn with sprite atlases exported by the Oddlings add-on.
// Each creature is one atlas PNG + its Aseprite-style JSON (frames, frameTags, and the "oddlings" block with the
// pivot and direction angles), loaded exactly as the exporter wrote them.
// Usage: <div data-oddlings-demo></div> <script src="assets/demo.js" data-base="demo/"></script>
(function () {
  'use strict';
  var script = document.currentScript;
  var BASE = (script && script.dataset.base) || 'demo/';
  var W = 320, H = 180;
  var FPS = { idle: 8, walk: 10, run: 14, jump: 11, attack: 14, hurt: 12, death: 10 };
  var SPEED = { walk: 40, run: 78, flee: 70, wander: 22 };
  var BOUNDS = { x0: 12, x1: W - 12, y0: 24, y1: H - 4 };
  var POND = { x: 268, y: 29, rx: 42, ry: 25 };
  var ENEMIES = 3;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function outBack(t) { var s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; }

  // ------------------------------------------------------------------ assets
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = src;
    });
  }
  function loadCreature(entry) {
    return fetch(BASE + entry.json).then(function (r) { return r.json(); }).then(function (json) {
      return loadImage(BASE + json.meta.image).then(function (img) {
        var keys = Object.keys(json.frames);
        var tags = {};
        json.meta.frameTags.forEach(function (t) {
          tags[t.name] = keys.slice(t.from, t.to + 1).map(function (k) { return json.frames[k].frame; });
        });
        var o = json.oddlings;
        return { name: entry.name, img: img, tags: tags, pivot: o.pivot, size: o.frame_width, dirs: o.direction_angles };
      });
    });
  }

  // ------------------------------------------------------------------ helpers on creatures / entities
  function dirFor(c, dx, dy) {
    var ang = Math.atan2(dx, dy) * 180 / Math.PI, best = 'S', bd = 1e9;
    for (var d in c.dirs) {
      var diff = Math.abs(((ang - c.dirs[d] + 540) % 360) - 180);
      if (diff < bd) { bd = diff; best = d; }
    }
    return best;
  }
  function facing(e) {
    var a = e.c.dirs[e.dir] * Math.PI / 180;
    return [Math.sin(a), Math.cos(a)];
  }
  function frames(e, act) { return e.c.tags[act + '_' + e.dir] || e.c.tags[act + '_S']; }
  function onceDur(e) { return frames(e, e.once).length / FPS[e.once]; }
  function frameOf(e) {
    var act = e.once || e.act, fr = frames(e, act);
    var i = Math.floor((e.once ? e.onceT : e.t) * FPS[act]);
    i = e.once ? Math.min(i, fr.length - 1) : i % fr.length;
    return fr[i];
  }
  function start(e, act) { e.once = act; e.onceT = 0; e.hit = false; }
  function makeEnt(c, x, y, player) {
    return { c: c, x: x, y: y, dir: 'S', act: 'idle', t: Math.random() * 3, once: null, onceT: 0, hit: false, hp: 3,
      vx: 0, vy: 0, flash: 0, alpha: 1, spawn: 0.45, player: player, dying: false, dead: 0,
      ai: { mode: 'idle', t: rnd(0.5, 2), tx: x, ty: y } };
  }
  function keepIn(e) {
    e.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, e.x));
    e.y = Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, e.y));
    var dx = (e.x - POND.x) / POND.rx, dy = (e.y - POND.y) / POND.ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) {
      if (d < 1e-3) { dx = -1; dy = 0; d = 1; }
      e.x = POND.x + dx / d * POND.rx;
      e.y = POND.y + dy / d * POND.ry;
    }
  }

  // ------------------------------------------------------------------ the game
  function mount(root) {
    root.classList.add('demo');
    var frame = el('div', 'demo-frame');
    var canvas = el('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Oddlings sprite demo: move with WASD or the arrow keys, Space to attack');
    var hud = el('div', 'demo-hud', '<span class="score">Bonks: 0</span><span class="hatched">Loading oddlings...</span>');
    var startBtn = el('button', 'demo-start', '<div><b>Click to play</b><small>Real sprites exported by Oddlings</small></div>');
    startBtn.type = 'button';
    frame.appendChild(canvas);
    frame.appendChild(hud);
    frame.appendChild(startBtn);
    var bar = el('div', 'demo-bar');
    function button(label, fn, cls) {
      var b = el('button', cls || '', label);
      b.type = 'button';
      b.addEventListener('click', function () { fn(); canvas.focus({ preventScroll: true }); });
      bar.appendChild(b);
      return b;
    }
    var who = el('span', 'who', '');
    root.appendChild(frame);
    root.appendChild(bar);
    root.appendChild(el('p', 'demo-keys',
      '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to walk, <kbd>Shift</kbd> to run, <kbd>Space</kbd> to attack, ' +
      '<kbd>J</kbd> to jump, <kbd>H</kbd> to hatch a new oddling. On touch screens: tap to walk, tap an oddling to bonk it.'));

    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var tint = document.createElement('canvas');
    var tctx = tint.getContext('2d');
    var meadow = null, pool = [], player = null, enemies = [], parts = [];
    var keys = {}, target = null, runToggle = false, score = 0, hatched = 0, visible = true;
    root.oddlingsDemo = {        // a peek at the game from the console; step(dt) advances it by hand
      get player() { return player; }, get enemies() { return enemies; }, get score() { return score; },
      step: function (dt) { if (player) { update(dt); draw(); } }
    };

    button('Hatch a new oddling', function () { hatchPlayer(); }, 'main');
    button('Attack', function () { if (player && !player.once) start(player, 'attack'); });
    button('Jump', function () { if (player && !player.once) start(player, 'jump'); });
    var runBtn = button('Run: off', function () { runToggle = !runToggle; runBtn.textContent = 'Run: ' + (runToggle ? 'on' : 'off'); });
    bar.appendChild(who);

    function setWho() {
      who.innerHTML = 'You are <b>' + player.c.name + '</b>';
      hud.querySelector('.hatched').textContent = 'Hatched: ' + hatched;
    }
    function puff(x, y, n, cols) {
      for (var i = 0; i < n; i++) {
        var a = rnd(0, Math.PI * 2), s = rnd(15, 45);
        parts.push({ x: x, y: y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 10, life: rnd(0.35, 0.7), t: 0,
          col: cols[i % cols.length], star: false });
      }
    }
    function stars(x, y) {
      for (var i = 0; i < 6; i++) {
        var a = rnd(0, Math.PI * 2), s = rnd(30, 70);
        parts.push({ x: x, y: y - 14, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rnd(0.4, 0.7), t: 0,
          col: ['#ffd23f', '#ffffff', '#ff5ca8'][i % 3], star: true, g: 160 });
      }
    }
    function pick(exclude) {
      var choices = pool.filter(function (c) { return exclude.indexOf(c) < 0; });
      if (!choices.length) choices = pool;
      return choices[Math.floor(Math.random() * choices.length)];
    }
    function used() { return [player.c].concat(enemies.map(function (e) { return e.c; })); }
    function hatchPlayer() {
      if (!player || pool.length < 2) return;
      player.c = pick(used());
      player.spawn = 0.45;
      player.once = null;
      hatched++;
      puff(player.x, player.y, 14, ['#ffffff', '#b8f040', '#fff6e5']);
      setWho();
    }
    function spawnEnemy(e) {
      var side = Math.floor(Math.random() * 3);
      var x = side === 0 ? rnd(20, 70) : side === 1 ? rnd(W - 80, W - 20) : rnd(40, W - 40);
      var y = side === 2 ? rnd(H - 40, H - 12) : rnd(70, H - 16);
      var n = makeEnt(pick(used()), x, y, false);
      if (e) enemies[enemies.indexOf(e)] = n; else enemies.push(n);
      keepIn(n);
      hatched += e ? 1 : 0;
      puff(n.x, n.y, 12, ['#ffffff', '#4fe0ff', '#fff6e5']);
      return n;
    }
    function hurt(e, nx, ny) {
      if (e.dying) return;
      e.hp--;
      e.flash = 0.16;
      e.vx = nx * 95;
      e.vy = ny * 95;
      e.dir = dirFor(e.c, -nx, -ny);
      stars(e.x, e.y);
      if (e.hp <= 0) {
        e.dying = true;
        start(e, 'death');
        score++;
        hud.querySelector('.score').textContent = 'Bonks: ' + score;
      } else {
        start(e, 'hurt');
        e.ai = { mode: 'flee', t: 1.3 };
      }
    }
    function doHit(p) {
      var f = facing(p);
      enemies.forEach(function (e) {
        var dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < 34 && ((dx * f[0] + dy * f[1]) / d > 0.15 || d < 12)) hurt(e, dx / d, dy / d);
      });
    }

    // -------------------------------------------------------------- update
    function updatePlayer(p, dt) {
      var mx = 0, my = 0;
      if (keys.ArrowLeft || keys.KeyA) mx -= 1;
      if (keys.ArrowRight || keys.KeyD) mx += 1;
      if (keys.ArrowUp || keys.KeyW) my -= 1;
      if (keys.ArrowDown || keys.KeyS) my += 1;
      if (mx || my) target = null;
      else if (target) {
        var tx = target.ent ? target.ent.x : target.x, ty = target.ent ? target.ent.y : target.y;
        var dx = tx - p.x, dy = ty - p.y, d = Math.sqrt(dx * dx + dy * dy);
        if (target.ent && (target.ent.dying || enemies.indexOf(target.ent) < 0)) target = null;
        else if (target.ent && d < 22) {
          p.dir = dirFor(p.c, dx, dy);
          if (!p.once) start(p, 'attack');
          target = null;
        } else if (d < 2.5) target = null;
        else { mx = dx / d; my = dy / d; }
      }
      var len = Math.sqrt(mx * mx + my * my);
      if (len) { mx /= len; my /= len; }
      var run = keys.ShiftLeft || keys.ShiftRight || runToggle;
      p.t += dt;
      if (p.once) {
        p.onceT += dt;
        if (p.once === 'attack' && !p.hit && p.onceT >= 4 / FPS.attack) { p.hit = true; doHit(p); }
        if (p.once === 'jump' && len) { p.x += mx * SPEED.walk * dt; p.y += my * SPEED.walk * dt; }
        if (p.onceT >= onceDur(p)) p.once = null;
      } else if (len) {
        p.dir = dirFor(p.c, mx, my);
        p.act = run ? 'run' : 'walk';
        var s = run ? SPEED.run : SPEED.walk;
        p.x += mx * s * dt;
        p.y += my * s * dt;
      } else {
        p.act = 'idle';
      }
      keepIn(p);
    }
    function updateEnemy(e, dt) {
      e.t += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      var k = Math.exp(-7 * dt);
      e.vx *= k;
      e.vy *= k;
      if (e.once) {
        e.onceT += dt;
        if (e.dying) {
          if (e.onceT >= onceDur(e)) {
            e.dead += dt;
            if (e.dead > 0.9) e.alpha = Math.max(0, 1 - (e.dead - 0.9) / 0.5);
            if (e.dead > 1.5) spawnEnemy(e);
          }
          keepIn(e);
          return;
        }
        if (e.onceT >= onceDur(e)) e.once = null;
        keepIn(e);
        return;
      }
      var ai = e.ai;
      ai.t -= dt;
      var dx, dy, d;
      if (ai.mode === 'flee') {
        dx = e.x - player.x; dy = e.y - player.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.dir = dirFor(e.c, dx, dy);
        e.act = 'run';
        e.x += dx / d * SPEED.flee * dt;
        e.y += dy / d * SPEED.flee * dt;
        if (ai.t <= 0) e.ai = { mode: 'idle', t: rnd(0.6, 1.6) };
      } else if (ai.mode === 'wander') {
        dx = ai.tx - e.x; dy = ai.ty - e.y; d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2 || ai.t <= 0) e.ai = { mode: 'idle', t: rnd(0.8, 2.6) };
        else {
          e.dir = dirFor(e.c, dx, dy);
          e.act = 'walk';
          e.x += dx / d * SPEED.wander * dt;
          e.y += dy / d * SPEED.wander * dt;
        }
      } else {
        e.act = 'idle';
        if (ai.t <= 0) e.ai = { mode: 'wander', t: 6, tx: rnd(BOUNDS.x0 + 10, BOUNDS.x1 - 10), ty: rnd(BOUNDS.y0 + 30, BOUNDS.y1 - 6) };
      }
      keepIn(e);
    }
    function separate(list) {
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          if (a.dying || b.dying) continue;
          var dx = b.x - a.x, dy = (b.y - a.y) * 1.6, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.01 && d < 16) {
            var push = (16 - d) * 0.5;
            a.x -= dx / d * push; a.y -= dy / d * push / 1.6;
            b.x += dx / d * push; b.y += dy / d * push / 1.6;
          }
        }
      }
    }
    function update(dt) {
      updatePlayer(player, dt);
      enemies.forEach(function (e) { updateEnemy(e, dt); });
      [player].concat(enemies).forEach(function (e) {
        if (e.spawn > 0) e.spawn = Math.max(0, e.spawn - dt);
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      });
      separate([player].concat(enemies));
      parts = parts.filter(function (q) {
        q.t += dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += (q.g || 30) * dt;
        q.vx *= Math.exp(-3 * dt);
        return q.t < q.life;
      });
    }

    // -------------------------------------------------------------- draw
    function drawEnt(e) {
      var c = e.c, f = frameOf(e), s = c.size;
      var sc = e.spawn > 0 ? Math.max(0.05, outBack(1 - e.spawn / 0.45)) : 1;
      var x = Math.round(e.x), y = Math.round(e.y);
      ctx.globalAlpha = 0.28 * e.alpha;
      ctx.fillStyle = '#140c29';
      ctx.beginPath();
      ctx.ellipse(x, y, 9 * sc, 3.2 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      if (e.player) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#b8f040';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, 11, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = e.alpha;
      var w = Math.round(s * sc), h = Math.round(s * sc);
      var dx = Math.round(x - c.pivot[0] * sc), dy = Math.round(y - c.pivot[1] * sc);
      if (e.flash > 0) {
        tint.width = s; tint.height = s;
        tctx.clearRect(0, 0, s, s);
        tctx.globalCompositeOperation = 'source-over';
        tctx.drawImage(c.img, f.x, f.y, f.w, f.h, 0, 0, s, s);
        tctx.globalCompositeOperation = 'source-atop';
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, s, s);
        ctx.drawImage(tint, 0, 0, s, s, dx, dy, w, h);
      } else {
        ctx.drawImage(c.img, f.x, f.y, f.w, f.h, dx, dy, w, h);
      }
      ctx.globalAlpha = 1;
    }
    function draw() {
      ctx.drawImage(meadow, 0, 0);
      var list = [player].concat(enemies).sort(function (a, b) { return a.y - b.y; });
      list.forEach(drawEnt);
      parts.forEach(function (q) {
        var a = 1 - q.t / q.life, x = Math.round(q.x), y = Math.round(q.y);
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = q.col;
        if (q.star) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
        else ctx.fillRect(x - 1, y - 1, 2, 2);
      });
      ctx.globalAlpha = 1;
    }

    // -------------------------------------------------------------- input
    var GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyJ',
      'KeyH', 'ShiftLeft', 'ShiftRight'];
    canvas.addEventListener('keydown', function (ev) {
      if (GAME_KEYS.indexOf(ev.code) < 0 || !player) return;
      ev.preventDefault();
      if (!keys[ev.code]) {
        if (ev.code === 'Space' && !player.once) start(player, 'attack');
        if (ev.code === 'KeyJ' && !player.once) start(player, 'jump');
        if (ev.code === 'KeyH') hatchPlayer();
      }
      keys[ev.code] = true;
    });
    canvas.addEventListener('keyup', function (ev) { keys[ev.code] = false; });
    canvas.addEventListener('blur', function () { keys = {}; });
    canvas.addEventListener('pointerdown', function (ev) {
      if (!player) return;
      canvas.focus({ preventScroll: true });
      var r = canvas.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H;
      var hit = null, best = 16;
      enemies.forEach(function (e) {
        if (e.dying) return;
        var d = Math.sqrt(Math.pow(e.x - x, 2) + Math.pow(e.y - 10 - y, 2));
        if (d < best) { best = d; hit = e; }
      });
      target = hit ? { ent: hit } : { x: x, y: y };
    });
    startBtn.addEventListener('click', function () {
      startBtn.style.display = 'none';
      canvas.focus({ preventScroll: true });
    });

    // -------------------------------------------------------------- loop
    var last = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      if (!visible || !player) { last = now; return; }
      var dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      update(dt);
      draw();
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);
    }

    fetch(BASE + 'creatures.json').then(function (r) { return r.json(); }).then(function (list) {
      // the player and the first enemies first, the rest of the pool in the background
      var first = list.slice(0, ENEMIES + 1);
      return Promise.all([loadImage(BASE + 'meadow.png')].concat(first.map(loadCreature))).then(function (res) {
        meadow = res[0];
        pool = res.slice(1);
        player = makeEnt(pool[0], W * 0.42, H * 0.62, true);
        player.dir = 'SE';
        for (var i = 0; i < ENEMIES; i++) {
          var e = makeEnt(pool[i + 1], [58, 250, 175][i], [76, 134, 100][i], false);
          enemies.push(e);
        }
        hatched = 1 + ENEMIES;
        setWho();
        requestAnimationFrame(loop);
        list.slice(ENEMIES + 1).forEach(function (entry) {
          loadCreature(entry).then(function (c) { pool.push(c); });
        });
      });
    }).catch(function (err) {
      hud.querySelector('.hatched').textContent = 'Could not load the demo';
      if (window.console) console.error(err);
    });
  }

  var roots = document.querySelectorAll('[data-oddlings-demo]');
  for (var i = 0; i < roots.length; i++) mount(roots[i]);
})();
