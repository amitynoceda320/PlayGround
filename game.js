(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540, FLOOR = 432;
  const ui = { start: document.getElementById('startScreen'), result: document.getElementById('resultScreen'), startButton: document.getElementById('startButton'), rematch: document.getElementById('rematchButton'), resultTitle: document.getElementById('resultTitle'), resultMessage: document.getElementById('resultMessage'), announce: document.getElementById('announce'), toast: document.getElementById('comboToast'), pHealth: document.getElementById('playerHealth'), rHealth: document.getElementById('rivalHealth'), timer: document.getElementById('timer'), round: document.getElementById('roundNumber'), pPips: document.getElementById('playerPips'), rPips: document.getElementById('rivalPips'), sound: document.getElementById('soundToggle') };
  let game, last = 0, audioCtx = null, soundOn = true;
  const held = new Set(), projectiles = [], particles = [];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  function newFighter(x, facing, player) { return { x, y: FLOOR, vx: 0, vy: 0, facing, player, hp: 100, wins: 0, action: 'idle', actionT: 0, hitDone: false, invuln: 0, stun: 0, cooldown: 0, jump: 0, walk: 0, energy: 0, combo: 0, lastHit: 0 }; }
  function resetMatch() { game = { mode: 'fight', p: newFighter(305, 1, true), e: newFighter(655, -1, false), round: 1, timer: 60, modeT: 0, shake: 0, flash: 0, aiT: .8, totalTime: 0 }; projectiles.length = 0; particles.length = 0; held.clear(); updateHud(); }
  function startMatch() { resetMatch(); ui.start.classList.add('hidden'); ui.result.classList.add('hidden'); announce('FIGHT!'); sound('start'); }
  function announce(text) { ui.announce.textContent = text; ui.announce.classList.remove('show'); void ui.announce.offsetWidth; ui.announce.classList.add('show'); }
  function toast(text) { ui.toast.textContent = text; ui.toast.classList.remove('show'); void ui.toast.offsetWidth; ui.toast.classList.add('show'); }
  function updateHud() { if (!game) return; ui.pHealth.style.width = `${Math.max(0, game.p.hp)}%`; ui.rHealth.style.width = `${Math.max(0, game.e.hp)}%`; ui.timer.textContent = String(Math.ceil(game.timer)).padStart(2, '0'); ui.round.textContent = String(game.round).padStart(2, '0'); [...ui.pPips.children].forEach((el, i) => el.classList.toggle('won', i < game.p.wins)); [...ui.rPips.children].forEach((el, i) => el.classList.toggle('won', i < game.e.wins)); }
  function startAction(f, type) {
    if (game.mode !== 'fight' || f.stun > 0 || f.action === 'ko') return;
    const special = type.startsWith('special');
    if (f.actionT > 0 && !['idle', 'walk', 'jump', 'guard'].includes(f.action)) return;
    if (special && f.energy < (type === 'special3' ? 45 : 30)) { toast('BUILD YOUR SPIRIT ✦'); return; }
    if (special) f.energy -= type === 'special3' ? 45 : 30;
    f.action = type; f.actionT = type === 'punch' ? .34 : type === 'kick' ? .48 : type === 'special1' ? .62 : type === 'special2' ? .54 : .72; f.hitDone = false;
    if (type === 'special2') { f.vx = f.facing * 470; f.invuln = .34; }
    if (type === 'special3') { game.flash = .16; game.shake = 8; }
    sound(type === 'special1' || type === 'special3' ? 'magic' : 'swing');
  }
  function actionInput(type) { if (game?.mode === 'fight') startAction(game.p, type); }
  function sound(kind) {
    if (!soundOn) return;
    try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), now = audioCtx.currentTime; osc.connect(gain); gain.connect(audioCtx.destination); const base = kind === 'magic' ? 540 : kind === 'hit' ? 115 : kind === 'start' ? 440 : 220; osc.type = kind === 'magic' ? 'sine' : 'triangle'; osc.frequency.setValueAtTime(base, now); osc.frequency.exponentialRampToValueAtTime(base * (kind === 'hit' ? .55 : 1.5), now + .11); gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(kind === 'hit' ? .09 : .035, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + .16); osc.start(now); osc.stop(now + .17); } catch (_) { /* Audio is optional. */ }
  }
  function spawnBurst(x, y, color, count = 12) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, speed = rand(40, 260); particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(.25, .65), max: .65, color, size: rand(2, 5), rot: rand(0, 6) }); } }
  function hurt(target, damage, source, type) {
    if (target.invuln > 0 || target.action === 'ko') return;
    target.hp = Math.max(0, target.hp - damage); target.stun = type === 'special3' ? .42 : .22; target.action = 'hurt'; target.actionT = target.stun; target.vx = source.facing * (type === 'special3' ? 210 : 120); target.vy = type === 'special3' ? -95 : -20;
    source.energy = Math.min(100, source.energy + 16); source.combo = game.totalTime - source.lastHit < 1.4 ? source.combo + 1 : 1; source.lastHit = game.totalTime;
    game.shake = type === 'special3' ? 12 : 5; spawnBurst(target.x, target.y - 78, type?.startsWith('special') ? '#ffe58c' : '#ff82bf', type === 'special3' ? 26 : 13); sound('hit'); updateHud();
    if (source.combo >= 2) toast(`${source.combo} HIT COMBO!`); if (target.hp <= 0) finishRound(source.player ? 'player' : 'rival');
  }
  function finishRound(winner) {
    if (game.mode !== 'fight') return; game.mode = 'roundEnd'; game.modeT = 2.2; const fighter = winner === 'player' ? game.p : game.e; fighter.wins++;
    announce(winner === 'player' ? (game.p.wins === 2 ? 'PERFECT BLOOM!' : 'AKARI WINS!') : (game.e.wins === 2 ? 'MOONLIGHT WINS!' : 'VESPER WINS!'));
    if (fighter.wins >= 2) { game.mode = 'matchEnd'; ui.resultTitle.textContent = winner === 'player' ? 'AKARI WINS!' : 'VESPER WINS!'; ui.resultMessage.textContent = winner === 'player' ? 'The rooftop belongs to you. Beautifully fought.' : 'The moon has its moment. Ready for a rematch?'; ui.result.classList.remove('hidden'); }
  }
  function hitbox(source, target, type) { const dx = (target.x - source.x) * source.facing; const range = type === 'punch' ? 88 : type === 'kick' ? 112 : type === 'special2' ? 125 : type === 'special3' ? 154 : 0; if (dx > 0 && dx < range && Math.abs(target.y - source.y) < (type === 'special3' ? 170 : 115)) { hurt(target, type === 'punch' ? 7 : type === 'kick' ? 11 : type === 'special2' ? 19 : 23, source, type); return true; } return false; }
  function launchProjectile(f) { projectiles.push({ x: f.x + f.facing * 48, y: f.y - 94, vx: f.facing * 420, life: 1.7, player: f.player, color: f.player ? '#ff80bd' : '#7beaff', spin: 0 }); spawnBurst(f.x + f.facing * 52, f.y - 94, f.player ? '#ff98ce' : '#8df4ff', 9); }
  function updateFighter(f, dt) {
    f.cooldown = Math.max(0, f.cooldown - dt); f.invuln = Math.max(0, f.invuln - dt); f.stun = Math.max(0, f.stun - dt); f.actionT = Math.max(0, f.actionT - dt);
    if (f.actionT <= 0 && ['punch', 'kick', 'special1', 'special2', 'special3', 'hurt', 'guard'].includes(f.action)) f.action = 'idle';
    if (f.player && game.mode === 'fight' && f.stun <= 0) { const move = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0); if (held.has('jump') && f.y >= FLOOR - 1 && f.actionT <= 0) { f.vy = -480; f.action = 'jump'; } if (move && f.actionT <= 0) { f.vx = move * 230; f.action = 'walk'; } else if (f.action === 'walk') f.action = 'idle'; }
    f.vy += 1120 * dt; f.y += f.vy * dt; if (f.y > FLOOR) { f.y = FLOOR; f.vy = 0; if (f.action === 'jump') f.action = 'idle'; }
    f.x += f.vx * dt; f.vx *= Math.pow(f.stun > 0 || f.action === 'special2' ? .91 : .76, dt * 60); f.x = clamp(f.x, 70, 890); f.walk += Math.abs(f.vx) * dt * .018;
  }
  function attackUpdate(f, opponent) {
    const type = f.action; if (!['punch', 'kick', 'special1', 'special2', 'special3'].includes(type) || f.hitDone) return;
    const duration = type === 'punch' ? .34 : type === 'kick' ? .48 : type === 'special1' ? .62 : type === 'special2' ? .54 : .72; const progress = 1 - f.actionT / duration;
    if (type === 'special1' && progress > .39 && !f.hitDone) { f.hitDone = true; launchProjectile(f); return; }
    const activeAt = type === 'punch' ? .35 : type === 'kick' ? .43 : type === 'special2' ? .34 : type === 'special3' ? .3 : 1;
    if (progress >= activeAt) { f.hitDone = true; if (type !== 'special1') hitbox(f, opponent, type); }
  }
  function cpuUpdate(dt) {
    const e = game.e, p = game.p; if (game.mode !== 'fight' || e.stun > 0) return; const distance = Math.abs(p.x - e.x), toward = p.x < e.x ? -1 : 1; e.facing = toward; p.facing = p.x < e.x ? 1 : -1; game.aiT -= dt;
    if (e.actionT <= 0) { e.vx = distance > 125 ? toward * 105 : distance < 75 ? -toward * 60 : 0; e.action = Math.abs(e.vx) > 5 ? 'walk' : 'idle'; if (game.aiT <= 0) { game.aiT = rand(.55, 1.25); if (distance < 135) startAction(e, Math.random() < .58 ? 'kick' : 'punch'); else if (distance < 360 && e.energy >= 30 && Math.random() < .35) startAction(e, 'special1'); else if (distance < 210 && e.energy >= 45 && Math.random() < .15) startAction(e, 'special3'); else if (distance < 185 && Math.random() < .2) { e.action = 'guard'; e.actionT = .45; } } }
  }
  function update(dt) {
    if (!game) return; game.totalTime += dt; game.shake = Math.max(0, game.shake - 26 * dt); game.flash = Math.max(0, game.flash - dt);
    if (game.mode === 'fight') {
      game.timer -= dt; if (game.timer <= 0) finishRound(game.p.hp >= game.e.hp ? 'player' : 'rival'); cpuUpdate(dt);
      const dx = game.e.x - game.p.x, face = dx >= 0 ? 1 : -1; if (game.p.actionT <= 0 || game.p.action === 'idle' || game.p.action === 'walk') game.p.facing = face; if (game.e.actionT <= 0 || game.e.action === 'idle' || game.e.action === 'walk') game.e.facing = -face;
      updateFighter(game.p, dt); updateFighter(game.e, dt); attackUpdate(game.p, game.e); attackUpdate(game.e, game.p);
      if (game.p.x > game.e.x - 42) { const mid = (game.p.x + game.e.x) / 2; game.p.x = mid - 21; game.e.x = mid + 21; }
    } else if (game.mode === 'roundEnd') {
      game.modeT -= dt; if (game.modeT <= 0) { game.round++; game.timer = 60; game.p.hp = 100; game.e.hp = 100; game.p.x = 305; game.e.x = 655; game.p.y = game.e.y = FLOOR; game.p.vx = game.e.vx = game.p.vy = game.e.vy = 0; game.p.action = game.e.action = 'idle'; game.p.actionT = game.e.actionT = 0; game.p.energy = Math.max(20, game.p.energy); game.e.energy = Math.max(20, game.e.energy); game.mode = 'fight'; announce(`ROUND ${game.round}`); }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) { const b = projectiles[i]; b.x += b.vx * dt; b.life -= dt; b.spin += dt * 8; const target = b.player ? game.e : game.p; if (Math.abs(b.x - target.x) < 33 && Math.abs(b.y - (target.y - 85)) < 62) { hurt(target, 14, b.player ? game.p : game.e, 'special1'); projectiles.splice(i, 1); continue; } if (b.life <= 0 || b.x < 0 || b.x > W) projectiles.splice(i, 1); }
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy += 130 * dt; if (p.life <= 0) particles.splice(i, 1); } updateHud();
  }
  function roundedRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#171332'); sky.addColorStop(.47, '#713b78'); sky.addColorStop(.76, '#f4819a'); sky.addColorStop(1, '#281e43'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(690, 180, 10, 690, 180, 220); halo.addColorStop(0, '#ffc3c880'); halo.addColorStop(1, '#ffb2d000'); ctx.fillStyle = halo; ctx.fillRect(430, 0, 520, 400);
    ctx.fillStyle = '#ffe4d1'; ctx.beginPath(); ctx.arc(694, 155, 43, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d57fa7'; ctx.beginPath(); ctx.arc(712, 143, 39, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 44; i++) { const x = (i * 197 + 41) % W, y = (i * 83 + 28) % 230; ctx.globalAlpha = .25 + .65 * ((Math.sin(game.totalTime * 2 + i) + 1) / 2); ctx.fillStyle = '#fff1ec'; ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1); } ctx.globalAlpha = 1;
    const buildings = [[0,270,65,167],[56,230,92,205],[132,282,60,153],[190,246,95,190],[272,294,57,142],[322,223,105,213],[421,276,66,160],[476,245,80,190],[555,287,69,150],[611,231,96,206],[704,265,80,172],[781,217,96,220],[871,271,89,166]];
    buildings.forEach(([x,y,w,h], i) => { ctx.fillStyle = i % 2 ? '#352747' : '#2c2342'; ctx.fillRect(x,y,w,h); ctx.fillStyle = '#bd719a'; ctx.fillRect(x + w * .17,y + 4,2,h - 4); for (let wx = x + 12; wx < x + w - 8; wx += 17) for (let wy = y + 14; wy < 410; wy += 21) { ctx.fillStyle = ((wx * 3 + wy * 7 + i) % 5 < 2) ? '#ffd48e88' : '#89c2df44'; ctx.fillRect(wx,wy,5,7); } });
    const glow = ctx.createLinearGradient(0, 352, 0, 455); glow.addColorStop(0,'#ffb0ac00'); glow.addColorStop(1,'#ff8baf48'); ctx.fillStyle = glow; ctx.fillRect(0,345,W,110); ctx.fillStyle = '#201a38'; ctx.fillRect(0,386,W,8); ctx.fillRect(0,414,W,5); ctx.fillRect(24,383,7,43); ctx.fillRect(929,383,7,43);
    const floor = ctx.createLinearGradient(0, 425, 0, H); floor.addColorStop(0,'#392549'); floor.addColorStop(.22,'#251d39'); floor.addColorStop(1,'#17152a'); ctx.fillStyle = floor; ctx.fillRect(0,426,W,114);
    ctx.strokeStyle = '#f6a0bc25'; ctx.lineWidth = 1; for (let x = -120; x < 1100; x += 90) { ctx.beginPath(); ctx.moveTo(480,428); ctx.lineTo(x,540); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(0,480); ctx.lineTo(W,480); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,510); ctx.lineTo(W,510); ctx.stroke();
    for (let i = 0; i < 12; i++) { const x = ((i * 103 + game.totalTime * (18 + i % 4 * 5)) % (W + 80)) - 40, y = 290 + Math.sin(game.totalTime * .7 + i * 2) * 55 + i * 8; ctx.save(); ctx.translate(x,y); ctx.rotate(game.totalTime + i); ctx.fillStyle = i % 2 ? '#ffb4cf6e' : '#ffd4aa6b'; ctx.beginPath(); ctx.ellipse(0,0,4,2,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    drawBranch(15, 402, 1); drawBranch(942, 400, -1);
  }
  function drawBranch(x, y, flip) { ctx.save(); ctx.translate(x,y); ctx.scale(flip,1); ctx.strokeStyle = '#30413f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0,65); ctx.quadraticCurveTo(22,16,3,-12); ctx.stroke(); for (let i=0;i<6;i++) { const bx=4 + Math.sin(i*1.1)*12, by=50-i*12; ctx.fillStyle=i%2?'#50736c':'#6d8b72'; ctx.beginPath(); ctx.ellipse(bx+8,by,12,4,.5,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#ff9ab9'; ctx.beginPath(); ctx.arc(bx+14,by-4,2.4,0,Math.PI*2); ctx.fill(); } ctx.restore(); }
  function path(c, points, fill, stroke, width=1) { c.beginPath(); c.moveTo(points[0][0],points[0][1]); for(let i=1;i<points.length;i++) c.lineTo(points[i][0],points[i][1]); c.closePath(); if(fill){c.fillStyle=fill;c.fill()} if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()} }
  function drawFighter(f) {
    const c=ctx,isP=f.player,colors=isP?{hair:'#421c54',hair2:'#78396f',skin:'#f6c6b7',outfit:'#f35b9e',light:'#ffc6df',trim:'#ffdc8c',boot:'#673268',sash:'#ffb34e'}:{hair:'#172f5b',hair2:'#38589a',skin:'#eab9b6',outfit:'#496ce3',light:'#a8d7ff',trim:'#91f7ef',boot:'#263a76',sash:'#70eddf'};
    const bob=f.y<FLOOR?0:(f.action==='walk'?Math.sin(f.walk*5)*3:Math.sin(game.totalTime*3+(isP?0:1))*1.5),action=f.action,t=action==='punch'||action==='kick'||action.startsWith('special')?clamp(1-f.actionT/(action==='punch'?.34:action==='kick'?.48:action==='special1'?.62:action==='special2'?.54:.72),0,1):0;
    c.save(); c.globalAlpha=f.invuln>0&&Math.floor(game.totalTime*18)%2===0?.55:1; c.fillStyle='#090a1b66'; c.beginPath(); c.ellipse(f.x,FLOOR+4,f.y<FLOOR?35:43,8,0,0,Math.PI*2); c.fill(); c.translate(f.x,f.y+bob);c.scale(f.facing,1);
    if(action==='special3'){const aura=c.createRadialGradient(0,-62,8,0,-62,105);aura.addColorStop(0,isP?'#ff8abc5e':'#64fff45e');aura.addColorStop(1,'#ffffff00');c.fillStyle=aura;c.beginPath();c.arc(0,-62,105,0,Math.PI*2);c.fill();}
    c.fillStyle=colors.hair;c.beginPath();c.moveTo(-8,-132);c.quadraticCurveTo(-43,-125,-50,-76);c.quadraticCurveTo(-36,-89,-28,-73);c.quadraticCurveTo(-20,-111,3,-107);c.closePath();c.fill(); if(isP){c.fillStyle=colors.hair2;c.beginPath();c.moveTo(-25,-109);c.quadraticCurveTo(-51,-79,-39,-53);c.quadraticCurveTo(-21,-74,-19,-102);c.fill();}
    const stride=action==='walk'?Math.sin(f.walk*5)*9:0,kickOut=action==='kick'&&t>.28&&t<.8?Math.sin(((t-.28)/.52)*Math.PI)*48:action==='special2'?Math.sin(t*Math.PI)*29:0; c.lineCap='round';c.lineJoin='round';
    c.strokeStyle=colors.skin;c.lineWidth=15;c.beginPath();c.moveTo(-7,-44);c.lineTo(-15+stride,-21);c.lineTo(-17+stride,-5);c.stroke();c.strokeStyle=colors.boot;c.lineWidth=18;c.beginPath();c.moveTo(-17+stride,-8);c.lineTo(-26+stride,0);c.stroke();c.strokeStyle=colors.skin;c.lineWidth=15;c.beginPath();c.moveTo(7,-44);c.lineTo(13+kickOut,-21);c.lineTo(26+kickOut,-10);c.stroke();c.strokeStyle=colors.boot;c.lineWidth=18;c.beginPath();c.moveTo(24+kickOut,-12);c.lineTo(36+kickOut,-12);c.stroke();c.strokeStyle=colors.trim;c.lineWidth=3;c.beginPath();c.moveTo(-21+stride,-12);c.lineTo(-11+stride,-9);c.moveTo(18+kickOut,-17);c.lineTo(29+kickOut,-14);c.stroke();
    c.fillStyle=colors.outfit;c.beginPath();c.moveTo(-17,-105);c.quadraticCurveTo(0,-115,18,-104);c.lineTo(15,-63);c.lineTo(9,-42);c.quadraticCurveTo(-1,-36,-14,-44);c.lineTo(-19,-67);c.closePath();c.fill();path(c,[[-16,-100],[2,-93],[16,-104],[9,-81],[-9,-77]],colors.light);c.strokeStyle=colors.trim;c.lineWidth=3;c.beginPath();c.moveTo(-17,-66);c.quadraticCurveTo(0,-60,16,-66);c.stroke();c.fillStyle=colors.trim;roundedRect(c,-15,-67,30,6,2);c.fill();c.fillStyle=colors.sash;c.beginPath();c.moveTo(2,-64);c.lineTo(28,-52);c.lineTo(7,-57);c.lineTo(-6,-63);c.fill();
    c.strokeStyle=colors.skin;c.lineWidth=12;c.beginPath();c.moveTo(-13,-101);c.lineTo(-29,-84);c.lineTo(-24,-71);c.stroke();c.fillStyle=colors.boot;c.beginPath();c.arc(-23,-69,8,0,Math.PI*2);c.fill();
    let ax=18,ay=-91,ex=29,ey=-78;if(action==='punch'&&t>.18&&t<.78){const ext=Math.sin(((t-.18)/.6)*Math.PI)*33;ex=34+ext;ey=-82;ax=20+ext*.55;}else if(action.startsWith('special')&&t>.2&&t<.8){ex=47;ey=-78;ax=31;ay=-93;}else if(action==='guard'){ex=12;ey=-111;ax=6;ay=-97;}
    c.strokeStyle=colors.skin;c.lineWidth=13;c.beginPath();c.moveTo(12,-101);c.lineTo(ax,ay);c.lineTo(ex,ey);c.stroke();c.fillStyle=colors.boot;c.beginPath();c.arc(ex,ey,9,0,Math.PI*2);c.fill();c.strokeStyle=colors.trim;c.lineWidth=2;c.beginPath();c.arc(ex,ey,6,0,Math.PI*2);c.stroke();
    c.fillStyle=colors.skin;roundedRect(c,-6,-119,12,16,4);c.fill();c.fillStyle=colors.skin;c.beginPath();c.ellipse(0,-132,16,20,0,0,Math.PI*2);c.fill();c.fillStyle=colors.skin;c.beginPath();c.arc(14,-131,4,0,Math.PI*2);c.fill();c.fillStyle='#f58d9d';c.globalAlpha*=.5;c.beginPath();c.ellipse(8,-126,4,2,0,0,Math.PI*2);c.fill();c.globalAlpha=f.invuln>0&&Math.floor(game.totalTime*18)%2===0?.55:1;
    c.strokeStyle='#49304a';c.lineWidth=1.5;c.beginPath();c.moveTo(4,-135);c.lineTo(9,-135);c.stroke();c.fillStyle='#3e2d4a';c.beginPath();c.arc(7,-135,1.3,0,Math.PI*2);c.fill();c.strokeStyle='#a95d76';c.lineWidth=1;c.beginPath();c.moveTo(5,-121);c.quadraticCurveTo(9,-119,11,-122);c.stroke();
    c.fillStyle=colors.hair;c.beginPath();c.moveTo(-16,-139);c.quadraticCurveTo(-18,-161,2,-157);c.quadraticCurveTo(20,-154,17,-135);c.lineTo(11,-139);c.lineTo(7,-148);c.quadraticCurveTo(0,-136,-7,-137);c.lineTo(-12,-130);c.closePath();c.fill();c.fillStyle=colors.hair2;c.beginPath();c.moveTo(-13,-141);c.quadraticCurveTo(-2,-155,12,-148);c.strokeStyle=colors.hair2;c.lineWidth=3;c.stroke();c.beginPath();c.arc(-12,-152,8,0,Math.PI*2);c.fill();c.fillStyle=colors.trim;c.beginPath();c.arc(-13,-153,3,0,Math.PI*2);c.fill();if(isP){c.fillStyle='#ff8db9';for(let i=0;i<5;i++){let a=i*Math.PI*2/5;c.beginPath();c.ellipse(-13+Math.cos(a)*4,-153+Math.sin(a)*4,2.4,1.7,a,0,Math.PI*2);c.fill();}}c.fillStyle=colors.trim;c.beginPath();c.arc(15,-124,2,0,Math.PI*2);c.fill();
    if(action==='special3'){c.globalAlpha=.7;c.strokeStyle=colors.trim;c.lineWidth=3;c.beginPath();c.arc(0,-84,53,game.totalTime*8,game.totalTime*8+Math.PI*1.45);c.stroke();}c.restore();
  }
  function drawProjectile(b) {
    ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.spin); ctx.globalCompositeOperation='lighter';
    const glow=ctx.createRadialGradient(0,0,1,0,0,25);glow.addColorStop(0,'#fff');glow.addColorStop(.25,b.color);glow.addColorStop(1,'#ff83c900');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=b.color;ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?7:16;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.restore();
  }
  function draw() {
    const dpr=Math.min(window.devicePixelRatio||1,2);
    if(canvas.width!==Math.round(canvas.clientWidth*dpr)||canvas.height!==Math.round(canvas.clientHeight*dpr)){canvas.width=Math.round(canvas.clientWidth*dpr);canvas.height=Math.round(canvas.clientHeight*dpr)}
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.save();if(game?.shake>0)ctx.translate(rand(-game.shake,game.shake),rand(-game.shake/2,game.shake/2));drawBackground();
    if(game){[game.p,game.e].forEach(f=>{ctx.fillStyle='#121025aa';roundedRect(ctx,f.x-31,FLOOR+15,62,4,2);ctx.fill();ctx.fillStyle=f.player?'#ff79b7':'#6cece9';roundedRect(ctx,f.x-30,FLOOR+16,60*f.energy/100,2,1);ctx.fill()});drawFighter(game.p);drawFighter(game.e);projectiles.forEach(drawProjectile);particles.forEach(p=>{ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore()});ctx.globalAlpha=1;if(game.flash>0){ctx.globalAlpha=game.flash*1.7;ctx.fillStyle='#fff5d5';ctx.fillRect(0,0,W,H);ctx.globalAlpha=1}}
    ctx.restore();
  }
  function frame(now){const dt=Math.min(.034,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(frame)}
  const keyMap={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'jump',w:'jump',W:'jump',j:'punch',J:'punch',k:'kick',K:'kick','1':'special1','2':'special2','3':'special3'};
  window.addEventListener('keydown',e=>{const control=keyMap[e.key];if(!control)return;e.preventDefault();if(['left','right','jump'].includes(control))held.add(control);else if(!e.repeat)actionInput(control)});
  window.addEventListener('keyup',e=>{const control=keyMap[e.key];if(control)held.delete(control)});window.addEventListener('blur',()=>held.clear());
  document.querySelectorAll('[data-control]').forEach(button=>{const control=button.dataset.control;button.addEventListener('pointerdown',e=>{e.preventDefault();button.classList.add('pressed');if(['left','right','jump'].includes(control))held.add(control);else actionInput(control);try{button.setPointerCapture(e.pointerId)}catch(_){}});const release=()=>{button.classList.remove('pressed');held.delete(control)};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release)});
  ui.startButton.addEventListener('click',startMatch);ui.rematch.addEventListener('click',startMatch);
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.classList.toggle('off',!soundOn);ui.sound.innerHTML=soundOn?'♫ <span>SOUND ON</span>':'♫ <span>SOUND OFF</span>';if(soundOn)sound('start')});
  resetMatch();game.mode='menu';requestAnimationFrame(frame);
})();
