(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const healthEls = { player: $('playerHealth'), cpu: $('cpuHealth') };
  const meterEls = { player: $('playerMeter'), cpu: $('cpuMeter') };
  const keys = new Set();
  const particles = [];
  const projectiles = [];
  const W = 1000, H = 560, floor = 448;
  const colors = { p: { hair:'#27172b', skin:'#f4b39b', top:'#e74668', pants:'#3c244e', accent:'#ffb26d', aura:'#ff6179' }, e: { hair:'#17182c', skin:'#efc1a8', top:'#596cd1', pants:'#282849', accent:'#9bdbff', aura:'#9a8cff' } };
  const player = makeFighter('p', 320);
  const cpu = makeFighter('e', 680);
  let last = 0, elapsed = 0, timeLeft = 99, round = 1, paused = false, gameOver = false;
  let shake = 0, flash = 0, combo = 0, comboTimer = 0, soundOn = true, audio;
  let introTimer = 1.8, toastTimer = 0, toastText = '';

  function makeFighter(side, x) {
    return { side, x, y: floor, vx:0, vy:0, health:100, meter:38, face: side==='p'?1:-1, state:'idle', timer:0, attackTimer:0, attack:'', cooldown:0, crouch:false, jump:false, invuln:0, aiTimer:0, aiAction:0, hitFlash:0, wins:0, block:false, anim:Math.random()*10 };
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr);
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  }
  window.addEventListener('resize', resize); resize();

  function sound(freq=220, duration=.08, type='triangle', volume=.045) {
    if (!soundOn) return;
    try { audio ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audio.createOscillator(), g=audio.createGain(); o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.48),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration); } catch(_){ }
  }
  function showToast(text) { toastText=text; toastTimer=1; const el=$('toast');el.textContent=text;el.classList.add('show'); }
  function addParticle(x,y,color,n=12,power=3) { for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=Math.random()*power+.5;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,life:.35+Math.random()*.5,max:.85,size:1.5+Math.random()*4,color});} }
  function gainMeter(f, amount) { f.meter=Math.min(100,f.meter+amount); }
  function attack(f, kind) {
    if (paused||gameOver||f.attackTimer>0||f.cooldown>0||f.invuln>0) return;
    f.attack=kind; f.attackTimer=kind.startsWith('special')?.48:.29; f.state=kind; f.crouch=false;
    const cfg={punch:{cost:0,damage:6,range:105,reach:68},kick:{cost:0,damage:9,range:125,reach:90},special1:{cost:25,damage:17,range:600,reach:500},special2:{cost:35,damage:22,range:145,reach:105},special3:{cost:45,damage:29,range:185,reach:135}}[kind];
    if(f.meter<cfg.cost){showToast('NOT ENOUGH KI');f.attackTimer=0;f.state='idle';sound(110,.12,'sawtooth');return;}
    f.meter-=cfg.cost; f.attackTimer=kind==='special1'?.45:kind==='special2'?.58:kind==='special3'?.7:kind==='kick'?.34:.27;
    f.cooldown=kind.startsWith('special')?.56:.19; f._attackCfg=cfg; f._hitDone=false; f._attackAge=0;
    if(kind==='special1'){projectiles.push({x:f.x+f.face*48,y:f.y-87,vx:f.face*8.5,owner:f,life:1.35,kind:'comet'});sound(430,.22,'sawtooth');}
    if(kind==='special2'){f.vy=-12;f.jump=true;f.vx=f.face*3.6;addParticle(f.x,f.y-14,'#81ceff',13,2);sound(290,.28,'triangle');}
    if(kind==='special3'){f.invuln=.46;f.vx=f.face*11; addParticle(f.x,f.y-60,'#d7b4ff',18,4);sound(580,.3,'sawtooth');}
    if(kind==='punch')sound(190,.06,'square',.025); if(kind==='kick')sound(145,.1,'triangle',.04);
  }
  function hit(attacker, target, damage, special=false) {
    if(target.invuln>0||target.health<=0)return;
    target.health=Math.max(0,target.health-damage);target.hitFlash=.18;target.vx=attacker.face*(special?5:3.3);target.vy=special?-3:-1.2;
    gainMeter(attacker,special?12:7);gainMeter(target,4);shake=special?10:5;flash=special?.1:.035;
    addParticle(target.x,target.y-83,special?colors[attacker.side].accent:'#ffe1a4',special?24:12,special?5:3);
    combo=comboTimer>0?combo+1:1;comboTimer=1.1;showToast(combo>1?`${combo} HIT COMBO!`:special?'SPECIAL HIT!':'NICE HIT!');sound(special?370:240,.14,special?'sawtooth':'square',.055);
    if(target.health<=0){gameOver=true;attacker.wins++;showToast(attacker.side==='p'?'AKARI WINS!':'YUNA WINS!');$('statusText').innerHTML='MATCH COMPLETE: <b>REMATCH?</b>';}
  }
  function updateFighter(f, dt) {
    f.anim+=dt*8; f.cooldown=Math.max(0,f.cooldown-dt);f.attackTimer=Math.max(0,f.attackTimer-dt);f.invuln=Math.max(0,f.invuln-dt);f.hitFlash=Math.max(0,f.hitFlash-dt);
    if(f.attackTimer<=0 && ['punch','kick','special1','special2','special3','hit'].includes(f.state)) f.state='idle';
    if(f.side==='p'){
      if(!['special2','special3'].includes(f.attack) || f.attackTimer===0){
        let moving=false;
        if(keys.has('left')){f.vx-=25*dt;moving=true} if(keys.has('right')){f.vx+=25*dt;moving=true}
        if(!keys.has('left')&&!keys.has('right'))f.vx*=Math.pow(.001,dt);
        f.crouch=keys.has('down');
        if(keys.has('up')&&f.y>=floor-1){f.vy=-10;f.jump=true;f.crouch=false;sound(300,.09,'triangle',.025);keys.delete('up')}
        if(moving&&f.y>=floor-1&&f.attackTimer<=0&&!f.crouch)f.state='walk';else if(!f.crouch&&f.attackTimer<=0&&f.y>=floor-1)f.state='idle';
      }
    } else if(!gameOver) {
      f.aiTimer-=dt;
      const dx=player.x-f.x, dist=Math.abs(dx);f.face=dx>0?1:-1; f.vx*=Math.pow(.005,dt);
      if(f.attackTimer<=0&&f.cooldown<=0&&f.aiTimer<=0){f.aiTimer=.35+Math.random()*.55;
        if(dist>205)f.vx=Math.sign(dx)* (dist>300?2.2:1.2);
        else if(Math.random()<.54){const r=Math.random();if(f.meter>=45&&r<.12)attack(f,'special3');else if(f.meter>=35&&r<.25)attack(f,'special2');else if(f.meter>=25&&r<.42)attack(f,'special1');else attack(f,Math.random()<.55?'kick':'punch');}
        else if(Math.random()<.4&&f.y>=floor-1)f.vy=-8;
      }
    }
    f.x+=f.vx;f.vy+=30*dt;f.y+=f.vy;
    if(f.y>floor){f.y=floor;f.vy=0;f.jump=false}
    f.x=Math.max(70,Math.min(W-70,f.x));
    if(f.attackTimer>0&&f._attackCfg&&!f._hitDone){f._attackAge=(f._attackAge||0)+dt;const active=f._attackAge>(f.attack==='kick'?.1:f.attack==='punch'?.07:.17);
      if(active){const cfg=f._attackCfg,target=f.side==='p'?cpu:player,dist=Math.abs(target.x-f.x);if(dist<cfg.range&&Math.abs(target.y-f.y)<125){if(f.attack==='special1'){/* projectile handles the hit */}else{f._hitDone=true;hit(f,target,cfg.damage,f.attack.startsWith('special'));}}}
      if(f._attackAge>f.attackTimer+0.12){f._attackCfg=null;f._attackAge=0;}
    }else if(f.attackTimer<=0){f._attackCfg=null;f._attackAge=0;f._hitDone=false;}
  }
  function update(dt){if(paused)return;elapsed+=dt;if(!gameOver){timeLeft-=dt;if(timeLeft<=0){timeLeft=0;gameOver=true;showToast(player.health>=cpu.health?'AKARI WINS!':'YUNA WINS!');}}
    if(introTimer>0){introTimer-=dt;if(introTimer<=0)$('vsStamp').classList.remove('show');}
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
    if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0)combo=0}
    if(!gameOver){updateFighter(player,dt);updateFighter(cpu,dt)}
    // Keep fighters facing one another.
    player.face=player.x<cpu.x?1:-1;cpu.face=-player.face;
    for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.x+=p.vx;p.life-=dt;const target=p.owner===player?cpu:player;if(Math.abs(target.x-p.x)<34&&Math.abs(target.y-p.y)<100){hit(p.owner,target,17,true);addParticle(p.x,p.y,'#ffb85f',28,5);projectiles.splice(i,1);continue}if(p.life<=0||p.x<0||p.x>W)projectiles.splice(i,1);}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=12*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1)}
    shake=Math.max(0,shake-dt*28);flash=Math.max(0,flash-dt);
    healthEls.player.style.width=player.health+'%';healthEls.cpu.style.width=cpu.health+'%';meterEls.player.style.width=player.meter+'%';meterEls.cpu.style.width=cpu.meter+'%';$('timer').textContent=String(Math.ceil(timeLeft)).padStart(2,'0');
    document.querySelectorAll('.move-card').forEach((el,i)=>{const cost=[25,35,45][i];el.disabled=player.meter<cost||gameOver});
  }
  function rounded(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function drawBackground(){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#1a1025');sky.addColorStop(.52,'#572d46');sky.addColorStop(.72,'#b0545d');sky.addColorStop(1,'#21152b');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Moon and distant skyline
    ctx.save();ctx.shadowColor='#ffbfad';ctx.shadowBlur=50;ctx.fillStyle='#ffcbac';ctx.globalAlpha=.74;ctx.beginPath();ctx.arc(754,133,61,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#271a31';for(let i=0;i<18;i++){let x=i*63-12,h=75+(i*37%100);ctx.fillRect(x,300-h,48,h+108);ctx.fillStyle='#e99a7c';for(let j=0;j<4;j++)ctx.fillRect(x+8+j%2*20,310-h+j*23,5,8);ctx.fillStyle='#271a31';}
    // Market lanterns
    for(let i=0;i<8;i++){const x=50+i*130;ctx.strokeStyle='#261522';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,100+(i%3)*20);ctx.stroke();ctx.shadowColor=i%2?'#ff646d':'#ffc667';ctx.shadowBlur=16;rounded(x-15,85+(i%3)*20,30,39,9,i%2?'#d94462':'#e69a4d');ctx.shadowBlur=0;ctx.fillStyle='#ffe2ad';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText(i%2?'祭':'夜',x,109+(i%3)*20)}
    // Ground plane
    const grd=ctx.createLinearGradient(0,floor,0,H);grd.addColorStop(0,'#372439');grd.addColorStop(1,'#130f1b');ctx.fillStyle=grd;ctx.fillRect(0,floor,W,H-floor);
    ctx.strokeStyle='#ff9d8a26';ctx.lineWidth=1;for(let i=0;i<12;i++){let x=i*100-100;ctx.beginPath();ctx.moveTo(500,floor);ctx.lineTo(x,H);ctx.stroke()}for(let y=floor+20;y<H;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    // Neon reflections
    ctx.globalAlpha=.3;for(let i=0;i<7;i++){ctx.fillStyle=i%2?'#ff536d':'#63d5ff';ctx.fillRect(50+i*144,floor+9,4+ i%3*3,40+(i*13)%53)}ctx.globalAlpha=1;
  }
  function drawFighter(f){
    const c=colors[f.side],dir=f.face, speed=Math.min(1,Math.abs(f.vx)/4), bob=f.y>=floor-1?Math.sin(f.anim*2)*2:0;
    ctx.save();ctx.translate(f.x,f.y+bob);ctx.scale(dir,1);
    // floor shadow
    ctx.save();ctx.scale(1,.27);ctx.fillStyle='#09071299';ctx.beginPath();ctx.ellipse(0,3,44,12,0,0,Math.PI*2);ctx.fill();ctx.restore();
    if(f.invuln>0&&Math.floor(elapsed*18)%2===0){ctx.globalAlpha=.5}
    if(f.attack==='special3'&&f.attackTimer>0){ctx.globalAlpha=.45;ctx.shadowColor=c.aura;ctx.shadowBlur=27;}
    const crouch=f.crouch&&f.side==='p';const jump=f.y<floor-1;
    // flowing ponytail and hair
    ctx.fillStyle=c.hair;ctx.beginPath();ctx.moveTo(-8,-119);ctx.quadraticCurveTo(-40,-132,-42,-106);ctx.quadraticCurveTo(-57,-89,-43,-70);ctx.quadraticCurveTo(-34,-88,-17,-91);ctx.fill();
    // legs
    if(!crouch){ctx.fillStyle=c.pants;ctx.beginPath();ctx.moveTo(-11,-54);ctx.lineTo(13,-52);ctx.lineTo(19,-22+speed*4);ctx.lineTo(32,-8);ctx.lineTo(19,-1);ctx.lineTo(2,-13);ctx.lineTo(-1,-39);ctx.lineTo(-12,-16);ctx.lineTo(-7,-3);ctx.lineTo(-22,0);ctx.lineTo(-27,-9);ctx.lineTo(-20,-36);ctx.fill();
      ctx.fillStyle='#181321';ctx.beginPath();ctx.moveTo(13,-6);ctx.lineTo(34,-5);ctx.lineTo(38,0);ctx.lineTo(13,1);ctx.fill();ctx.beginPath();ctx.moveTo(-23,-5);ctx.lineTo(-5,-5);ctx.lineTo(-3,1);ctx.lineTo(-28,1);ctx.fill();
    }else{ctx.fillStyle=c.pants;ctx.beginPath();ctx.moveTo(-11,-52);ctx.lineTo(13,-52);ctx.lineTo(24,-28);ctx.lineTo(38,-13);ctx.lineTo(28,-5);ctx.lineTo(4,-22);ctx.lineTo(-5,-35);ctx.lineTo(-22,-18);ctx.lineTo(-37,-10);ctx.lineTo(-43,-19);ctx.lineTo(-24,-40);ctx.fill()}
    // torso, fitted fighter jacket
    ctx.fillStyle=c.top;ctx.beginPath();if(crouch){ctx.moveTo(-16,-91);ctx.quadraticCurveTo(8,-98,21,-80);ctx.lineTo(12,-51);ctx.lineTo(-15,-50);ctx.lineTo(-24,-70)}else{ctx.moveTo(-17,-98);ctx.quadraticCurveTo(0,-106,17,-96);ctx.lineTo(22,-62);ctx.lineTo(13,-50);ctx.lineTo(-15,-51);ctx.lineTo(-23,-66)}ctx.closePath();ctx.fill();
    ctx.fillStyle=c.accent;ctx.beginPath();ctx.moveTo(-4,-99);ctx.lineTo(3,-96);ctx.lineTo(1,-57);ctx.lineTo(-7,-57);ctx.fill();ctx.fillStyle='#ffe2c4';ctx.fillRect(-6,-94,4,4);
    // arm back
    ctx.strokeStyle=c.skin;ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-12,-91);ctx.lineTo(-24,-77);ctx.lineTo(-28,-65);ctx.stroke();
    // front arm punch pose
    const punching=f.state==='punch'||f.state==='special1';const kicking=f.state==='kick';ctx.strokeStyle=c.skin;ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(13,-91);if(punching){ctx.lineTo(28,-86);ctx.lineTo(48,-84)}else if(kicking){ctx.lineTo(29,-80);ctx.lineTo(36,-68)}else{ctx.lineTo(22,-81);ctx.lineTo(27,-68)}ctx.stroke();
    // wraps and fists
    ctx.fillStyle='#f6d8cf';if(punching){rounded(42,-90,15,12,5,'#fff0d8');ctx.fillStyle=c.accent;ctx.fillRect(43,-81,12,3)}else rounded(20,-73,14,12,5,'#fff0d8');
    // neck & face
    ctx.fillStyle=c.skin;rounded(-5,-111,13,16,5,c.skin);ctx.beginPath();ctx.ellipse(2,-121,17,21,0,0,Math.PI*2);ctx.fill();
    // fringe, side locks
    ctx.fillStyle=c.hair;ctx.beginPath();ctx.moveTo(-15,-125);ctx.quadraticCurveTo(-10,-149,11,-141);ctx.quadraticCurveTo(24,-136,18,-120);ctx.lineTo(8,-124);ctx.lineTo(2,-133);ctx.lineTo(-2,-121);ctx.lineTo(-10,-126);ctx.lineTo(-15,-113);ctx.fill();
    ctx.fillStyle=c.accent;ctx.beginPath();ctx.arc(14,-135,4,0,Math.PI*2);ctx.fill();
    // eye, expression
    ctx.fillStyle='#302033';ctx.fillRect(8,-122,5,2);ctx.strokeStyle='#ad585b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(8,-113);ctx.quadraticCurveTo(12,-111,14,-113);ctx.stroke();
    // waist sash and details
    ctx.fillStyle=c.accent;ctx.beginPath();ctx.moveTo(-17,-61);ctx.lineTo(15,-63);ctx.lineTo(14,-56);ctx.lineTo(-16,-55);ctx.fill();ctx.beginPath();ctx.moveTo(-8,-56);ctx.lineTo(-24,-39);ctx.lineTo(-15,-43);ctx.lineTo(-1,-55);ctx.fill();
    // aura for special
    if(f.attack.startsWith('special')&&f.attackTimer>0){ctx.globalAlpha=.28+Math.random()*.12;ctx.strokeStyle=c.aura;ctx.lineWidth=3;ctx.shadowColor=c.aura;ctx.shadowBlur=20;ctx.beginPath();ctx.ellipse(0,-64,35+Math.random()*7,75+Math.random()*8,0,0,Math.PI*2);ctx.stroke();}
    if(f.hitFlash>0){ctx.globalAlpha=.48;ctx.fillStyle='white';ctx.beginPath();ctx.ellipse(0,-76,27,68,0,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,W,H);ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawBackground();
    // fighter UI name tags
    ctx.font='700 11px sans-serif';ctx.fillStyle='#ffe1c9aa';ctx.fillText('AKARI  ·  THE RED COMET',player.x-65,floor+31);ctx.textAlign='right';ctx.fillStyle='#d9d3ffaa';ctx.fillText('YUNA  ·  THE MOONBLADE',cpu.x+66,floor+31);ctx.textAlign='left';
    // projectiles
    for(const p of projectiles){ctx.save();ctx.shadowColor='#ff9f4e';ctx.shadowBlur=28;const grad=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,23);grad.addColorStop(0,'#fff5bf');grad.addColorStop(.35,'#ffc25d');grad.addColorStop(1,'#ff4e70');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y,20,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffda8b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x-p.vx*1.5,p.y,28,8,0,0,Math.PI*2);ctx.stroke();ctx.restore()}
    // fighters depth
    [player,cpu].sort((a,b)=>a.x-b.x).forEach(drawFighter);
    for(const p of particles){ctx.globalAlpha=Math.min(1,p.life/p.max);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.size*Math.min(1,p.life*2),0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;ctx.shadowBlur=0;
    if(flash>0){ctx.fillStyle=`rgba(255,230,200,${flash*1.3})`;ctx.fillRect(0,0,W,H)}ctx.restore();
    if(paused){ctx.fillStyle='#0b081bbd';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='white';ctx.font='900 48px sans-serif';ctx.fillText('PAUSED',W/2,H/2);ctx.font='600 13px sans-serif';ctx.fillStyle='#d7cce3';ctx.fillText('PRESS SPACE TO CONTINUE',W/2,H/2+29);ctx.textAlign='left'}
  }
  function loop(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(loop)}
  function action(act){if(act==='left'||act==='right'||act==='up'||act==='down'){keys.add(act);return}if(act==='punch'||act==='kick'||act==='special1'||act==='special2'||act==='special3')attack(player,act)}
  function bindButtons(){document.querySelectorAll('[data-action]').forEach(btn=>{const act=btn.dataset.action;btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);btn.classList.add('active');action(act)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(ev,e=>{btn.classList.remove('active');if(['left','right','up','down'].includes(act))keys.delete(act)});});}
  bindButtons();
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();if(k==='a'||k==='arrowleft')keys.add('left');if(k==='d'||k==='arrowright')keys.add('right');if(k==='w'||k==='arrowup')keys.add('up');if(k==='s'||k==='arrowdown')keys.add('down');if(e.repeat)return;if(k==='j')attack(player,'punch');if(k==='k')attack(player,'kick');if(k==='q')attack(player,'special1');if(k==='e')attack(player,'special2');if(k==='r')attack(player,'special3');if(k===' ')paused=!paused;if(k==='enter')rematch();});
  window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(k==='a'||k==='arrowleft')keys.delete('left');if(k==='d'||k==='arrowright')keys.delete('right');if(k==='w'||k==='arrowup')keys.delete('up');if(k==='s'||k==='arrowdown')keys.delete('down')});
  window.addEventListener('blur',()=>keys.clear());
  function rematch(){player.health=cpu.health=100;player.meter=cpu.meter=38;player.x=320;cpu.x=680;player.y=cpu.y=floor;player.vx=cpu.vx=player.vy=cpu.vy=0;player.attackTimer=cpu.attackTimer=player.cooldown=cpu.cooldown=0;player.state=cpu.state='idle';player.invuln=cpu.invuln=0;player._attackCfg=cpu._attackCfg=null;projectiles.length=0;particles.length=0;gameOver=false;paused=false;timeLeft=99;introTimer=1.8;round++;$('roundNumber').textContent=String(round).padStart(2,'0');$('vsStamp').querySelector('span').textContent=`ROUND ${String(round).padStart(2,'0')}`;$('vsStamp').classList.add('show');$('statusText').innerHTML='FIGHTING SPIRIT: <b>UNBREAKABLE</b>';showToast('READY, FIGHT!');}
  $('rematchBtn').addEventListener('click',rematch);
  $('soundToggle').addEventListener('click',()=>{soundOn=!soundOn;$('soundState').textContent=soundOn?'ON':'OFF';$('soundState').style.color=soundOn?'#64f0bb':'#ff8294';if(soundOn)sound(420,.08)});
  $('vsStamp').classList.add('show');
  requestAnimationFrame(loop);
})();
