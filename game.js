/* 合成王子博
 * 玩法、尺寸、物理与合成规则参照 BigNaiWa / 合成大西瓜。
 * 头像使用本地照片的不规则头部轮廓，不依赖第三方游戏代码或网络资源。
 */
(function () {
  'use strict';

  const W = 420;
  const H = 700;
  const WALL = 10;
  const DROP_Y = 74;
  const DANGER_Y = 142;

  const GRAVITY = 2600;
  const SUBSTEPS = 3;
  const ITER = 7;
  const DROP_MS = 360;
  const OVER_LIMIT = 1.5;
  const REST_SPEED = 140;
  const REST_SPEED2 = REST_SPEED * REST_SPEED;

  const RESTITUTION = 0.38;
  const WALL_RESTITUTION = 0.45;
  const REST_THRESHOLD = 55;
  const FRICTION = 0.955;
  const SQUASH_DECAY = 9;
  const SQUASH_MAX = 0.30;
  const MERGE_PAD = 0.8;
  const HEAD_FILL = 0.96;

  const HEADS = [
    {
      name: '伞下',
      file: 'photos/01-first.jpg',
      r: 18,
      color: '#d97745',
      crop: { x: 0, y: 0, w: 1, h: 1 },
      mask: 'front',
      parts: [[0, -0.37, 0.63], [-0.43, -0.03, 0.43], [0.43, -0.03, 0.43], [0, 0.23, 0.56], [-0.19, 0.46, 0.32], [0.19, 0.46, 0.32]]
    },
    {
      name: '窗边',
      file: 'photos/02-window.jpg',
      r: 25,
      color: '#498c7d',
      crop: { x: 0, y: 0, w: 1, h: 1 },
      mask: 'profile',
      parts: [[-0.12, -0.31, 0.65], [0.28, -0.16, 0.58], [-0.33, 0.05, 0.49], [0.24, 0.19, 0.54], [-0.04, 0.42, 0.42]]
    },
    {
      name: '雨窗',
      file: 'photos/03-rain.jpg',
      r: 34,
      color: '#4b78a8',
      crop: { x: 0, y: 0, w: 1, h: 1 },
      mask: 'front',
      parts: [[0, -0.37, 0.64], [-0.44, -0.02, 0.43], [0.44, -0.02, 0.43], [0, 0.24, 0.57], [-0.2, 0.47, 0.32], [0.2, 0.47, 0.32]]
    },
    {
      name: '大笑',
      file: 'photos/04-close.jpg',
      r: 45,
      color: '#e05c54',
      crop: { x: 0, y: 0, w: 1, h: 1 },
      mask: 'front',
      parts: [[0, -0.37, 0.64], [-0.44, -0.02, 0.43], [0.44, -0.02, 0.43], [0, 0.24, 0.57], [-0.2, 0.47, 0.32], [0.2, 0.47, 0.32]]
    },
    {
      name: '日落',
      file: 'photos/05-sunset.jpg',
      r: 58,
      color: '#a56635',
      crop: { x: 0, y: 0, w: 1, h: 1 },
      mask: 'profile',
      parts: [[-0.12, -0.31, 0.65], [0.28, -0.16, 0.58], [-0.33, 0.05, 0.49], [0.24, 0.19, 0.54], [-0.04, 0.42, 0.42]]
    }
  ];

  const MAX_TIER = HEADS.length - 1;
  const MERGE_SCORE = [0, 1, 3, 6, 10];
  const MAX_BONUS = 100;
  const SPAWN_TIERS = [0, 1, 2];
  const SPAWN_WEIGHTS = [0.46, 0.34, 0.20];

  const BEST_KEY = 'wangzibo.suika.best.v1';
  const MUTE_KEY = 'wangzibo.suika.mute.v1';
  const RECORD_KEY = 'wangzibo.suika.records.v1';
  const NAME_KEY = 'wangzibo.suika.name.v1';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');
  const chainCanvas = document.getElementById('chain');
  const chainCtx = chainCanvas.getContext('2d');
  const soundBtn = document.getElementById('soundBtn');
  const resetBtn = document.getElementById('resetBtn');
  const restartBtn = document.getElementById('restartBtn');
  const shareBtn = document.getElementById('shareBtn');
  const shareBtn2 = document.getElementById('shareBtn2');
  const recordBtn = document.getElementById('recordBtn');
  const recordModal = document.getElementById('recordModal');
  const recordClose = document.getElementById('recordClose');
  const recordClear = document.getElementById('recordClear');
  const boardList = document.getElementById('boardList');
  const nickInput = document.getElementById('nickInput');
  const challenge = document.getElementById('challenge');
  const challengeScore = document.getElementById('challengeScore');
  const toast = document.getElementById('toast');

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const AVOID_REPEAT = true;

  function rollSpawnTier() {
    let r = Math.random();
    let acc = 0;
    for (let i = 0; i < SPAWN_TIERS.length; i++) {
      acc += SPAWN_WEIGHTS[i];
      if (r <= acc) return SPAWN_TIERS[i];
    }
    return SPAWN_TIERS[0];
  }

  function pickSpawnTier(avoid) {
    if (!AVOID_REPEAT || avoid === undefined) return rollSpawnTier();
    for (let i = 0; i < 6; i++) {
      const tier = rollSpawnTier();
      if (tier !== avoid) return tier;
    }
    return rollSpawnTier();
  }

  const Sound = {
    ctx: null,
    muted: localStorage.getItem(MUTE_KEY) === '1',

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch (error) {
        this.ctx = null;
      }
      return this.ctx;
    },

    tone(freq, freq2, dur, vol, type) {
      if (this.muted) return;
      const audio = this.ensure();
      if (!audio) return;
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (freq2 && freq2 !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    merge(tier) {
      const base = 235 * Math.pow(1.13, tier * 2);
      this.tone(base, base * 1.72, 0.2, 0.16, 'sine');
      this.tone(base * 2, base * 3, 0.12, 0.06, 'triangle');
    },

    drop() {
      this.tone(180, 120, 0.08, 0.05, 'sine');
    },

    over() {
      this.tone(420, 90, 0.7, 0.16, 'sawtooth');
    },

    bonus() {
      [523, 659, 784, 1047].forEach((freq, index) => {
        setTimeout(() => this.tone(freq, freq, 0.22, 0.12, 'triangle'), index * 90);
      });
    }
  };

  function haptic(ms) {
    if (Sound.muted || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (error) {
      // Some mobile browsers deny vibration without an active user gesture.
    }
  }

  const view = { scale: 1, dpr: 1 };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    view.dpr = dpr;
    view.scale = (rect.width * dpr) / W;
  }

  const state = {
    balls: [],
    particles: [],
    floats: [],
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    pending: 0,
    next: 0,
    ready: true,
    cooldown: 0,
    aimX: W / 2,
    over: false,
    flash: 0,
    danger: false
  };

  const cutouts = new Array(HEADS.length).fill(null);
  let loadedCount = 0;

  function headPath(target, size, mask) {
    const s = size / 512;
    target.beginPath();
    if (mask === 'profile') {
      target.moveTo(241 * s, 70 * s);
      target.bezierCurveTo(348 * s, 18 * s, 509 * s, 55 * s, 585 * s, 150 * s);
      target.bezierCurveTo(636 * s, 212 * s, 653 * s, 286 * s, 634 * s, 352 * s);
      target.bezierCurveTo(619 * s, 405 * s, 584 * s, 443 * s, 556 * s, 489 * s);
      target.bezierCurveTo(537 * s, 521 * s, 548 * s, 564 * s, 513 * s, 595 * s);
      target.bezierCurveTo(481 * s, 623 * s, 416 * s, 613 * s, 371 * s, 578 * s);
      target.bezierCurveTo(320 * s, 539 * s, 284 * s, 473 * s, 280 * s, 399 * s);
      target.bezierCurveTo(196 * s, 384 * s, 166 * s, 292 * s, 195 * s, 207 * s);
      target.bezierCurveTo(207 * s, 167 * s, 217 * s, 113 * s, 241 * s, 70 * s);
    } else {
      target.moveTo(256 * s, 28 * s);
      target.bezierCurveTo(168 * s, 28 * s, 91 * s, 96 * s, 76 * s, 193 * s);
      target.bezierCurveTo(68 * s, 257 * s, 84 * s, 308 * s, 110 * s, 350 * s);
      target.bezierCurveTo(132 * s, 386 * s, 137 * s, 421 * s, 119 * s, 449 * s);
      target.bezierCurveTo(103 * s, 474 * s, 112 * s, 496 * s, 146 * s, 506 * s);
      target.bezierCurveTo(188 * s, 519 * s, 229 * s, 514 * s, 256 * s, 506 * s);
      target.bezierCurveTo(283 * s, 514 * s, 324 * s, 519 * s, 366 * s, 506 * s);
      target.bezierCurveTo(400 * s, 496 * s, 409 * s, 474 * s, 393 * s, 449 * s);
      target.bezierCurveTo(375 * s, 421 * s, 380 * s, 386 * s, 402 * s, 350 * s);
      target.bezierCurveTo(428 * s, 308 * s, 444 * s, 257 * s, 436 * s, 193 * s);
      target.bezierCurveTo(421 * s, 96 * s, 344 * s, 28 * s, 256 * s, 28 * s);
    }
    target.closePath();
  }

  function drawImageCover(target, image, size, crop) {
    const sourceX = image.width * crop.x;
    const sourceY = image.height * crop.y;
    const sourceW = image.width * crop.w;
    const sourceH = image.height * crop.h;
    target.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, size, size);
  }

  function buildCutout(image, tier) {
    const size = 512;
    const head = HEADS[tier];
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const offCtx = offscreen.getContext('2d');

    offCtx.save();
    headPath(offCtx, size, head.mask);
    offCtx.clip();
    drawImageCover(offCtx, image, size, head.crop);
    offCtx.restore();

    offCtx.save();
    headPath(offCtx, size, head.mask);
    offCtx.lineJoin = 'round';
    offCtx.lineCap = 'round';
    offCtx.lineWidth = 11;
    offCtx.strokeStyle = 'rgba(255,255,255,.92)';
    offCtx.stroke();
    offCtx.lineWidth = 5;
    offCtx.strokeStyle = head.color;
    offCtx.stroke();
    offCtx.restore();

    cutouts[tier] = offscreen;
    loadedCount += 1;
    if (loadedCount === HEADS.length) refreshPreviews();
  }

  function loadSprites() {
    HEADS.forEach((head, tier) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (image.decode) {
          image.decode().then(() => buildCutout(image, tier), () => buildCutout(image, tier));
        } else {
          buildCutout(image, tier);
        }
      };
      image.onerror = () => {
        loadedCount += 1;
        if (loadedCount === HEADS.length) refreshPreviews();
      };
      image.src = (window.__ASSET_MAP && window.__ASSET_MAP[head.file]) || head.file;
    });
  }

  function shapeOf(tier) {
    const head = HEADS[tier];
    return {
      rb: 1,
      parts: head.parts
    };
  }

  function syncParts(ball) {
    const cos = Math.cos(ball.angle);
    const sin = Math.sin(ball.angle);
    for (let i = 0; i < ball.parts.length; i++) {
      const part = ball.parts[i];
      const ox = part[0] * ball.r;
      const oy = part[1] * ball.r;
      ball.wx[i] = ball.x + ox * cos - oy * sin;
      ball.wy[i] = ball.y + ox * sin + oy * cos;
      ball.ws[i] = part[2] * ball.r;
    }
  }

  function makeBall(x, y, tier, vx, vy) {
    const radius = HEADS[tier].r;
    const mass = radius * radius;
    const shape = shapeOf(tier);
    const count = shape.parts.length;
    const ball = {
      x,
      y,
      vx: vx || 0,
      vy: vy || 0,
      px: x,
      py: y,
      r: radius,
      tier,
      angle: 0,
      mass,
      invMass: 1 / mass,
      bornAt: performance.now(),
      overTime: 0,
      landed: false,
      dead: false,
      contacts: 0,
      pvx: 0,
      pvy: 0,
      sq: 0,
      sqA: 0,
      parts: shape.parts,
      rb: shape.rb * radius,
      wx: new Float32Array(count),
      wy: new Float32Array(count),
      ws: new Float32Array(count)
    };
    syncParts(ball);
    return ball;
  }

  function squash(ball, nx, ny, speed) {
    const amount = Math.min(SQUASH_MAX, speed / 1500);
    if (amount <= ball.sq) return;
    ball.sq = amount;
    ball.sqA = Math.atan2(ny, nx);
  }

  function processMerges(merges) {
    for (let index = 0; index < merges.length; index++) {
      const a = merges[index][0];
      const b = merges[index][1];
      if (a.dead && b.dead && a.merged) continue;

      a.merged = true;
      b.merged = true;
      const x = (a.x + b.x) * 0.5;
      const y = (a.y + b.y) * 0.5;
      const vx = (a.vx + b.vx) * 0.5;
      const vy = (a.vy + b.vy) * 0.5;
      const tier = a.tier;

      spawnBurst(x, y, tier);
      state.flash = Math.min(1, state.flash + 0.22);

      if (tier < MAX_TIER) {
        const merged = makeBall(x, y, tier + 1, vx * 0.72, Math.min(vy * 0.72, 130));
        merged.landed = true;
        merged.popAt = performance.now();
        state.balls.push(merged);
        addScore(MERGE_SCORE[tier + 1]);
        addFloat(x, y, '+' + MERGE_SCORE[tier + 1]);
        Sound.merge(tier + 1);
        haptic(14);
      } else {
        addScore(MAX_BONUS);
        addFloat(x, y, '+' + MAX_BONUS);
        Sound.bonus();
        haptic([16, 22, 28]);
      }
    }
  }

  function stepPhysics(dt) {
    const balls = state.balls;
    const merges = [];
    const contacts = [];

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      ball.px = ball.x;
      ball.py = ball.y;
      ball.vy += GRAVITY * dt;
      ball.pvx = ball.vx;
      ball.pvy = ball.vy;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.contacts = 0;
      syncParts(ball);
    }

    for (let iteration = 0; iteration < ITER; iteration++) {
      for (let i = 0; i < balls.length; i++) {
        const ball = balls[i];
        if (ball.dead) continue;
        let pushLeft = 0;
        let pushRight = 0;
        let pushFloor = 0;
        let pushCeil = 0;

        for (let k = 0; k < ball.parts.length; k++) {
          const x = ball.wx[k];
          const y = ball.wy[k];
          const radius = ball.ws[k];
          const left = WALL - (x - radius);
          const right = (x + radius) - (W - WALL);
          const down = (y + radius) - (H - WALL);
          const up = -(y - radius);
          if (left > pushLeft) pushLeft = left;
          if (right > pushRight) pushRight = right;
          if (down > pushFloor) pushFloor = down;
          if (up > pushCeil) pushCeil = up;
        }

        if (pushLeft || pushRight || pushFloor || pushCeil) {
          ball.x += pushLeft - pushRight;
          ball.y += pushCeil - pushFloor;
          ball.contacts += 1;
          if (iteration === 0) {
            if (pushLeft) contacts.push({ ball, nx: 1, ny: 0 });
            if (pushRight) contacts.push({ ball, nx: -1, ny: 0 });
            if (pushFloor) contacts.push({ ball, nx: 0, ny: -1 });
            if (pushCeil) contacts.push({ ball, nx: 0, ny: 1 });
          }
          syncParts(ball);
        }
      }

      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.dead) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.dead || a.dead) continue;

          const centerDx = b.x - a.x;
          const centerDy = b.y - a.y;
          const rbSum = a.rb + b.rb;
          if (centerDx * centerDx + centerDy * centerDy >= rbSum * rbSum) continue;

          let minGap = 1e9;
          let normalX = 0;
          let normalY = 0;

          for (let m = 0; m < a.parts.length; m++) {
            const ax = a.wx[m];
            const ay = a.wy[m];
            const ar = a.ws[m];
            const farDx = b.x - ax;
            const farDy = b.y - ay;
            const far = b.rb + ar;
            if (farDx * farDx + farDy * farDy >= far * far) continue;

            for (let k = 0; k < b.parts.length; k++) {
              const bx = b.wx[k];
              const by = b.wy[k];
              const br = b.ws[k];
              const dx = bx - ax;
              const dy = by - ay;
              const sum = ar + br;
              const distance2 = dx * dx + dy * dy;
              if (distance2 >= sum * sum) continue;
              const distance = Math.sqrt(distance2);
              const gap = distance - sum;
              if (gap < minGap) {
                minGap = gap;
                if (distance < 1e-4) {
                  normalX = 1;
                  normalY = 0;
                } else {
                  normalX = dx / distance;
                  normalY = dy / distance;
                }
              }
            }
          }

          if (minGap > MERGE_PAD || minGap === 1e9) continue;

          if (a.tier === b.tier && iteration === 0) {
            a.dead = true;
            b.dead = true;
            merges.push([a, b]);
            continue;
          }

          if (minGap >= 0) continue;
          if (iteration === 0) contacts.push({ a, b, nx: normalX, ny: normalY });
          const correction = Math.min(-minGap - 0.05, 4) * 0.9;
          if (correction <= 0) continue;
          const inverseSum = a.invMass + b.invMass;
          const weightA = a.invMass / inverseSum;
          const weightB = b.invMass / inverseSum;

          a.x -= normalX * correction * weightA;
          a.y -= normalY * correction * weightA;
          b.x += normalX * correction * weightB;
          b.y += normalY * correction * weightB;
          a.contacts += 1;
          b.contacts += 1;
          syncParts(a);
          syncParts(b);
        }
      }
    }

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (ball.dead) continue;
      let pushLeft = 0;
      let pushRight = 0;
      let pushFloor = 0;
      let pushCeil = 0;
      for (let k = 0; k < ball.parts.length; k++) {
        const x = ball.wx[k];
        const y = ball.wy[k];
        const radius = ball.ws[k];
        const left = WALL - (x - radius);
        const right = (x + radius) - (W - WALL);
        const down = (y + radius) - (H - WALL);
        const up = -(y - radius);
        if (left > pushLeft) pushLeft = left;
        if (right > pushRight) pushRight = right;
        if (down > pushFloor) pushFloor = down;
        if (up > pushCeil) pushCeil = up;
      }
      if (pushLeft || pushRight || pushFloor || pushCeil) {
        ball.x += pushLeft - pushRight;
        ball.y += pushCeil - pushFloor;
        ball.contacts += 1;
        syncParts(ball);
      }
    }

    const inverseDt = 1 / dt;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (ball.dead) continue;
      const dx = ball.x - ball.px;
      const dy = ball.y - ball.py;
      let vx = dx * inverseDt;
      let vy = dy * inverseDt;
      if (ball.contacts > 0) vx *= FRICTION;
      if (ball.sq > 0) ball.sq = Math.max(0, ball.sq - ball.sq * SQUASH_DECAY * dt);
      ball.vx = vx;
      ball.vy = vy;
      ball.angle += dx / ball.r * 0.85;
      if (!ball.landed && (ball.contacts > 0 || performance.now() - ball.bornAt > 900)) {
        ball.landed = true;
      }
    }

    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      if (contact.ball) {
        const ball = contact.ball;
        if (ball.dead) continue;
        const velocity = ball.pvx * contact.nx + ball.pvy * contact.ny;
        if (velocity < -REST_THRESHOLD) {
          const current = ball.vx * contact.nx + ball.vy * contact.ny;
          const target = -WALL_RESTITUTION * velocity;
          const impulse = target - current;
          if (impulse > 0) {
            ball.vx += impulse * contact.nx;
            ball.vy += impulse * contact.ny;
            squash(ball, contact.nx, contact.ny, -velocity);
          }
        }
      } else {
        const a = contact.a;
        const b = contact.b;
        if (a.dead || b.dead) continue;
        const nx = contact.nx;
        const ny = contact.ny;
        const velocity = (a.pvx - b.pvx) * nx + (a.pvy - b.pvy) * ny;
        if (velocity > REST_THRESHOLD) {
          const current = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          const target = -RESTITUTION * velocity;
          const impulse = (current - target) / (a.invMass + b.invMass);
          if (impulse > 0) {
            a.vx -= impulse * a.invMass * nx;
            a.vy -= impulse * a.invMass * ny;
            b.vx += impulse * b.invMass * nx;
            b.vy += impulse * b.invMass * ny;
            squash(a, -nx, -ny, velocity);
            squash(b, nx, ny, velocity);
          }
        }
      }
    }

    if (merges.length) processMerges(merges);
  }

  function spawnBurst(x, y, tier) {
    const colors = [HEADS[tier].color, '#ffffff', '#f3b559'];
    for (let i = 0; i < 15; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(70, 250);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        r: rand(2.2, 5.6),
        color: colors[i % colors.length],
        life: rand(0.65, 1.05),
        decay: rand(1.5, 2.5)
      });
    }
  }

  function addFloat(x, y, text) {
    state.floats.push({ x, y, text, life: 1 });
  }

  function addScore(amount) {
    state.score += amount;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
  }

  function aimLimit(tier) {
    const radius = HEADS[tier].r * shapeOf(tier).rb;
    return [WALL + radius + 0.5, W - WALL - radius - 0.5];
  }

  function moveAim(x) {
    const limits = aimLimit(state.pending);
    state.aimX = clamp(x, limits[0], limits[1]);
  }

  function tryDrop() {
    if (state.over || !state.ready) return;
    const tier = state.pending;
    const limits = aimLimit(tier);
    const x = clamp(state.aimX, limits[0], limits[1]);
    state.balls.push(makeBall(x, DROP_Y, tier, 0, 130));
    state.ready = false;
    state.cooldown = DROP_MS / 1000;
    state.pending = state.next;
    state.next = pickSpawnTier(state.pending);
    Sound.drop();
    drawNext();
    if (state.balls.length > 90) {
      state.balls = state.balls.filter((ball) => !ball.dead);
    }
  }

  function checkGameOver(dt) {
    let danger = false;
    for (let i = 0; i < state.balls.length; i++) {
      const ball = state.balls[i];
      if (ball.dead || !ball.landed) continue;
      const top = ball.y - ball.rb;
      if (top < DANGER_Y) {
        danger = true;
        if (ball.vx * ball.vx + ball.vy * ball.vy < REST_SPEED2) {
          ball.overTime += dt;
          if (ball.overTime > OVER_LIMIT) {
            gameOver();
            return;
          }
        } else {
          ball.overTime = Math.max(0, ball.overTime - dt * 2);
        }
      } else {
        ball.overTime = Math.max(0, ball.overTime - dt * 2);
        if (ball.overTime > 0) danger = true;
      }
    }
    state.danger = danger;
  }

  function gameOver() {
    if (state.over) return;
    state.over = true;
    finalScoreEl.textContent = String(state.score);
    finalBestEl.textContent = String(state.best);
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    saveScore(state.score);
    Sound.over();
  }

  function reset() {
    state.balls.length = 0;
    state.particles.length = 0;
    state.floats.length = 0;
    state.score = 0;
    state.over = false;
    state.ready = true;
    state.cooldown = 0;
    state.flash = 0;
    state.danger = false;
    state.aimX = W / 2;
    state.pending = pickSpawnTier();
    state.next = pickSpawnTier(state.pending);
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    scoreEl.textContent = '0';
    bestEl.textContent = String(state.best);
    drawNext();
    Sound.ensure();
  }

  function drawHead(target, x, y, radius, tier, angle, scale, squashShape) {
    const head = HEADS[tier];
    const actualScale = scale === undefined ? 1 : scale;
    const cutout = cutouts[tier];

    target.save();
    target.translate(x, y);
    if (squashShape && squashShape.k > 0.004) {
      target.rotate(squashShape.a);
      target.scale(1 - squashShape.k, 1 + squashShape.k * 0.85);
      target.rotate(-squashShape.a);
    }
    if (actualScale !== 1) target.scale(actualScale, actualScale);
    target.rotate(angle || 0);

    if (cutout) {
      const box = (radius * 2) / HEAD_FILL;
      target.shadowColor = 'rgba(63, 42, 25, .18)';
      target.shadowBlur = Math.max(3, radius * 0.18);
      target.shadowOffsetY = Math.max(2, radius * 0.08);
      target.drawImage(cutout, -box / 2, -box / 2, box, box);
    } else {
      target.shadowColor = 'rgba(63, 42, 25, .14)';
      target.shadowBlur = 8;
      target.shadowOffsetY = 3;
      headPath(target, radius * 2.08, head.mask);
      target.fillStyle = head.color;
      target.fill();
      target.shadowColor = 'transparent';
      target.fillStyle = 'rgba(255,255,255,.92)';
      target.font = '800 ' + Math.round(radius * 0.72) + 'px "Microsoft YaHei", sans-serif';
      target.textAlign = 'center';
      target.textBaseline = 'middle';
      target.fillText('王', 0, radius * 0.06);
    }
    target.restore();
  }

  function drawBoard() {
    const background = ctx.createLinearGradient(0, 0, 0, H);
    background.addColorStop(0, '#fffcf5');
    background.addColorStop(0.56, '#fff3df');
    background.addColorStop(1, '#ffe9ca');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    const top = ctx.createLinearGradient(0, 0, 0, 190);
    top.addColorStop(0, 'rgba(255,255,255,.92)');
    top.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 190);

    ctx.save();
    ctx.strokeStyle = 'rgba(174, 126, 80, .28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WALL, 0);
    ctx.lineTo(WALL, H - WALL);
    ctx.lineTo(W - WALL, H - WALL);
    ctx.lineTo(W - WALL, 0);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.setLineDash([9, 9]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = state.danger
      ? 'rgba(226,70,67,' + (0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 140))) + ')'
      : 'rgba(213, 137, 104, .42)';
    ctx.beginPath();
    ctx.moveTo(WALL, DANGER_Y);
    ctx.lineTo(W - WALL, DANGER_Y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBalls() {
    const now = performance.now();
    const sorted = state.balls.slice().sort((a, b) => a.r - b.r);
    for (let i = 0; i < sorted.length; i++) {
      const ball = sorted[i];
      if (ball.dead) continue;

      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#6e4b29';
      ctx.beginPath();
      ctx.ellipse(ball.x, H - WALL - 1, ball.r * 0.9, Math.max(3, ball.r * 0.18), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      let scale = 1;
      if (ball.popAt) {
        const progress = (now - ball.popAt) / 220;
        if (progress < 1) scale = 1 + 0.28 * (1 - progress);
        else ball.popAt = 0;
      }
      const squashShape = ball.sq > 0.004 ? { a: ball.sqA, k: ball.sq } : null;
      drawHead(ctx, ball.x, ball.y, ball.r, ball.tier, ball.angle, scale, squashShape);
    }
  }

  function drawAim() {
    if (state.over) return;
    const tier = state.pending;
    const radius = HEADS[tier].r;
    const limits = aimLimit(tier);
    const x = clamp(state.aimX, limits[0], limits[1]);
    const bob = Math.sin(performance.now() / 320) * 2.5;
    const ready = state.ready;

    if (ready) {
      ctx.save();
      ctx.setLineDash([5, 8]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(190, 126, 77, .45)';
      ctx.beginPath();
      ctx.moveTo(x, DROP_Y + radius + 5);
      ctx.lineTo(x, H - WALL);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = HEADS[tier].color;
      ctx.beginPath();
      ctx.arc(x, DROP_Y + bob, radius * 0.94, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    if (!ready) ctx.globalAlpha = 0.42;
    drawHead(ctx, x, DROP_Y + bob, radius, tier, 0, 1);
    ctx.restore();
  }

  function drawEffects(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const particle = state.particles[i];
      particle.vy += 1400 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.99;
      particle.life -= particle.decay * dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, particle.life) * 0.9;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r * particle.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = '700 20px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    for (let i = state.floats.length - 1; i >= 0; i--) {
      const float = state.floats[i];
      float.y -= 46 * dt;
      float.life -= dt * 1.05;
      if (float.life <= 0) {
        state.floats.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, float.life * 1.4);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(float.text, float.x, float.y);
      ctx.fillStyle = '#df5148';
      ctx.fillText(float.text, float.x, float.y);
    }
    ctx.globalAlpha = 1;
    drawTopPreview();
  }

  function drawTopPreview() {
    const tier = state.next;
    const radius = 15;
    const x = W - WALL - 30;
    const y = 32;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(126, 94, 67, .86)';
    ctx.fillText('下一个', x - radius - 10, y);
    ctx.restore();
    drawHead(ctx, x, y, radius, tier, 0, 1);
  }

  function drawNext() {
    const width = nextCanvas.width;
    const height = nextCanvas.height;
    nextCtx.setTransform(1, 0, 0, 1, 0, 0);
    nextCtx.clearRect(0, 0, width, height);
    const tier = state.next;
    const radius = HEADS[tier].r;
    const scale = Math.min(width, height) * 0.4 / radius;
    drawHead(nextCtx, width / 2, height / 2, radius * scale, tier, 0, 1);
  }

  function drawChain() {
    const width = chainCanvas.width;
    const height = chainCanvas.height;
    chainCtx.setTransform(1, 0, 0, 1, 0, 0);
    chainCtx.clearRect(0, 0, width, height);
    const slot = width / HEADS.length;
    const radius = slot * 0.42;
    const centerY = height * 0.52;

    for (let tier = 0; tier < HEADS.length; tier++) {
      const x = slot * (tier + 0.5);
      drawHead(chainCtx, x, centerY, radius, tier, 0, 1);
      if (tier < HEADS.length - 1) {
        chainCtx.save();
        chainCtx.globalAlpha = 0.42;
        chainCtx.fillStyle = '#8b6b52';
        chainCtx.font = '600 ' + Math.round(height * 0.2) + 'px system-ui, sans-serif';
        chainCtx.textAlign = 'center';
        chainCtx.textBaseline = 'middle';
        chainCtx.fillText('›', x + slot * 0.5, centerY);
        chainCtx.restore();
      }
    }
  }

  function refreshPreviews() {
    drawNext();
    drawChain();
  }

  let last = performance.now();
  let accumulator = 0;
  const FIXED = 1 / 60;

  function update(dt) {
    if (state.over) return;
    if (!state.ready) {
      state.cooldown -= dt;
      if (state.cooldown <= 0) state.ready = true;
    }
    const sub = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) stepPhysics(sub);
    state.balls = state.balls.filter((ball) => !ball.dead);
    checkGameOver(dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.2);
  }

  function render(dt) {
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBoard();
    drawBalls();
    drawAim();
    drawEffects(dt);
    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 0.28;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    accumulator += dt;
    let guard = 0;
    while (accumulator >= FIXED && guard < 5) {
      update(FIXED);
      accumulator -= FIXED;
      guard += 1;
    }
    if (guard >= 5) accumulator = 0;
    render(dt);
    requestAnimationFrame(frame);
  }

  function pointerToX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (W / rect.width);
  }

  let touchAiming = false;

  stage.addEventListener('pointermove', (event) => {
    if (state.over) return;
    if (event.pointerType === 'touch' && !touchAiming) return;
    moveAim(pointerToX(event.clientX));
  });

  stage.addEventListener('pointerdown', (event) => {
    if (state.over) return;
    Sound.ensure();
    moveAim(pointerToX(event.clientX));
    if (event.pointerType === 'touch') {
      touchAiming = true;
      if (stage.setPointerCapture) {
        try {
          stage.setPointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture is optional.
        }
      }
    } else {
      tryDrop();
    }
  });

  stage.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' || !touchAiming) return;
    touchAiming = false;
    if (state.over) return;
    moveAim(pointerToX(event.clientX));
    tryDrop();
  });

  stage.addEventListener('pointercancel', () => {
    touchAiming = false;
  });

  stage.addEventListener('contextmenu', (event) => event.preventDefault());

  function isTyping(event) {
    const target = event.target;
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable === true;
  }

  window.addEventListener('keydown', (event) => {
    if (isTyping(event)) return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      state.aimX = clamp(state.aimX - 14, WALL, W);
      event.preventDefault();
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      state.aimX = clamp(state.aimX + 14, WALL, W);
      event.preventDefault();
    } else if (event.code === 'Space' || event.code === 'Enter' || event.code === 'ArrowDown') {
      if (!state.over) {
        tryDrop();
        event.preventDefault();
      }
    } else if (event.code === 'KeyR') {
      reset();
      event.preventDefault();
    }
  });

  function paintSoundBtn() {
    const label = soundBtn.querySelector('.lbl');
    if (label) label.textContent = Sound.muted ? '音效关' : '音效开';
    soundBtn.setAttribute('aria-pressed', String(!Sound.muted));
  }

  soundBtn.addEventListener('click', () => {
    Sound.muted = !Sound.muted;
    localStorage.setItem(MUTE_KEY, Sound.muted ? '1' : '0');
    paintSoundBtn();
    if (!Sound.muted) Sound.merge(1);
  });

  function getNickname() {
    return (localStorage.getItem(NAME_KEY) || '玩家').trim() || '玩家';
  }

  function getRecords() {
    try {
      const records = JSON.parse(localStorage.getItem(RECORD_KEY) || '[]');
      return Array.isArray(records) ? records : [];
    } catch (error) {
      return [];
    }
  }

  function saveScore(score) {
    if (!score) return;
    const name = getNickname();
    const records = getRecords();
    const existing = records.find((record) => record.name === name);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.time = Date.now();
    } else {
      records.push({ name, score, time: Date.now() });
    }
    records.sort((a, b) => b.score - a.score || b.time - a.time);
    localStorage.setItem(RECORD_KEY, JSON.stringify(records.slice(0, 12)));
    renderBoard();
  }

  function renderBoard() {
    const records = getRecords().slice(0, 10);
    boardList.textContent = '';
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'board-empty';
      empty.textContent = '还没有成绩。先合成一个日落剪影，再回来看看。';
      boardList.appendChild(empty);
      return;
    }
    records.forEach((record, index) => {
      const row = document.createElement('div');
      row.className = 'board-row' + (index < 3 ? ' r' + (index + 1) : '');
      const rank = document.createElement('span');
      rank.className = 'board-rank';
      rank.textContent = String(index + 1);
      const name = document.createElement('span');
      name.className = 'board-name';
      name.textContent = record.name;
      const score = document.createElement('strong');
      score.className = 'board-score';
      score.textContent = String(record.score);
      row.append(rank, name, score);
      boardList.appendChild(row);
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function cleanedShareUrl(score) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('from', getNickname());
    if (score) url.searchParams.set('score', String(score));
    return url.toString();
  }

  async function shareGame(score) {
    const url = cleanedShareUrl(score);
    const message = score
      ? '我在“合成王子博”拿了 ' + score + ' 分，来挑战我。'
      : '来玩“合成王子博”，相同的大头撞在一起会合成更大的头像。';
    try {
      if (navigator.share) {
        await navigator.share({ title: '合成王子博', text: message, url });
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(message + ' ' + url);
      } else {
        const helper = document.createElement('textarea');
        helper.value = message + ' ' + url;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      showToast('链接已复制，可以发到微信了');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showToast('未能自动分享，请复制浏览器地址栏链接');
    }
  }

  function openRecords() {
    renderBoard();
    nickInput.value = getNickname();
    recordModal.classList.add('show');
    recordModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => nickInput.focus(), 60);
  }

  function closeRecords() {
    recordModal.classList.remove('show');
    recordModal.setAttribute('aria-hidden', 'true');
  }

  function applyChallengeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const score = Number(params.get('score'));
    const from = params.get('from');
    if (Number.isFinite(score) && score > 0) {
      challengeScore.textContent = score + ' 分';
      challenge.hidden = false;
      if (from) {
        challenge.querySelector('span').textContent = from + ' 的挑战';
      }
      showToast('好友最高分 ' + score + '，来超过他');
    }
  }

  resetBtn.addEventListener('click', reset);
  restartBtn.addEventListener('click', reset);
  shareBtn.addEventListener('click', () => shareGame(state.over ? state.score : 0));
  shareBtn2.addEventListener('click', () => shareGame(state.score));
  recordBtn.addEventListener('click', openRecords);
  recordClose.addEventListener('click', closeRecords);
  recordModal.addEventListener('click', (event) => {
    if (event.target === recordModal) closeRecords();
  });
  recordClear.addEventListener('click', () => {
    localStorage.removeItem(RECORD_KEY);
    renderBoard();
    showToast('本机成绩已清空');
  });
  nickInput.addEventListener('change', () => {
    const value = nickInput.value.trim().slice(0, 12) || '玩家';
    nickInput.value = value;
    localStorage.setItem(NAME_KEY, value);
  });

  function registerServiceWorker() {
    if (window.__ASSET_MAP) return;
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline cache is optional; the game still works online without it.
    });
  }

  function boot() {
    resizeCanvas();
    if (window.ResizeObserver) {
      new ResizeObserver(resizeCanvas).observe(stage);
    }
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) last = performance.now();
    });
    paintSoundBtn();
    drawChain();
    reset();
    loadSprites();
    applyChallengeFromUrl();
    registerServiceWorker();
    requestAnimationFrame((time) => {
      last = time;
      requestAnimationFrame(frame);
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.__WZB__ = {
    state,
    reset,
    tryDrop,
    stepPhysics,
    makeBall,
    drawHead,
    render,
    resizeCanvas,
    HEADS
  };
})();
