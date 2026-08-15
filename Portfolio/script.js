// ---------- reveal on scroll ----------
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
},{threshold:.15});
revealEls.forEach(el=>io.observe(el));

// ---------- scroll spine ----------
const spineFill = document.getElementById('spineFill');
const spineDot = document.getElementById('spineDot');
function updateSpine(){
  const h = document.documentElement.scrollHeight - window.innerHeight;
  const pct = Math.min(1, Math.max(0, window.scrollY / h));
  spineFill.style.height = (pct*60)+'vh';
  spineDot.style.top = (pct*60)+'vh';
}
window.addEventListener('scroll', updateSpine, {passive:true});
updateSpine();

// ---------- work card cursor glow ----------
document.querySelectorAll('.work-card').forEach(card=>{
  card.addEventListener('mousemove', e=>{
    const r = card.getBoundingClientRect();
    card.style.setProperty('--x', (e.clientX - r.left)+'px');
    card.style.setProperty('--y', (e.clientY - r.top)+'px');
  });
});

// ---------- skill bars: fill + count up on reveal ----------
const skillItems = document.querySelectorAll('.skill-item');
const skillIO = new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    const item = entry.target;
    const target = parseInt(item.dataset.percent, 10) || 0;
    const fill = item.querySelector('.skill-fill');
    const pctLabel = item.querySelector('.skill-pct');
    fill.style.width = target + '%';
    let current = 0;
    const duration = 1200;
    const start = performance.now();
    function tick(now){
      const t = Math.min(1, (now - start) / duration);
      current = Math.round(t * target);
      pctLabel.textContent = current + '%';
      if(t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    skillIO.unobserve(item);
  });
},{threshold:.3});
skillItems.forEach(item=>skillIO.observe(item));

// ---------- ember particle canvas ----------
const canvas = document.getElementById('ember-canvas');
const ctx = canvas.getContext('2d');
let W, H, particles;

function resize(){
  W = canvas.width = canvas.offsetWidth;
  H = canvas.height = canvas.offsetHeight;
}
function initParticles(){
  const count = W < 700 ? 34 : 70;
  particles = Array.from({length:count}, ()=>({
    x: Math.random()*W,
    y: Math.random()*H,
    r: Math.random()*1.6+0.4,
    vy: Math.random()*0.35+0.08,
    vx: (Math.random()-0.5)*0.15,
    a: Math.random()*0.6+0.15,
    hue: Math.random()>0.82 ? 'gold' : 'ember'
  }));
}
function draw(){
  ctx.clearRect(0,0,W,H);
  particles.forEach(p=>{
    p.y -= p.vy; p.x += p.vx;
    if(p.y < -10){ p.y = H+10; p.x = Math.random()*W; }
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle = p.hue==='gold' ? `rgba(232,176,75,${p.a})` : `rgba(255,122,41,${p.a})`;
    ctx.fill();
  });
  requestAnimationFrame(draw);
}
window.addEventListener('resize', ()=>{ resize(); initParticles(); });
resize(); initParticles(); draw();

// ---------- custom animated cursor ----------
(function(){
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!isFinePointer || prefersReducedMotion) return;

  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  document.body.classList.add('has-fine-cursor');

  let mouseX = 0, mouseY = 0;      // real pointer position
  let ringX = 0, ringY = 0;        // eased trailing position
  let started = false;

  window.addEventListener('mousemove', e=>{
    mouseX = e.clientX; mouseY = e.clientY;
    if(!started){
      started = true;
      ringX = mouseX; ringY = mouseY;
      dot.classList.add('active');
      ring.classList.add('active');
    }
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%,-50%)`;
  }, {passive:true});

  document.addEventListener('mouseleave', ()=>{
    dot.classList.remove('active');
    ring.classList.remove('active');
  });
  document.addEventListener('mouseenter', ()=>{
    if(started){ dot.classList.add('active'); ring.classList.add('active'); }
  });

  let smokeCounter = 0;
  function spawnSmoke(x, y){
    const wisp = document.createElement('div');
    wisp.className = 'cursor-smoke';
    // tiny random jitter so wisps sit in a small cluster right behind the ring,
    // not stretched out into a long trail
    const jx = x + (Math.random() - 0.5) * 6;
    const jy = y + (Math.random() - 0.5) * 6;
    wisp.style.transform = `translate(${jx}px, ${jy}px) translate(-50%,-50%)`;
    document.body.appendChild(wisp);
    setTimeout(() => wisp.remove(), 600);
  }

  function tick(){
    ringX += (mouseX - ringX) * 0.16;
    ringY += (mouseY - ringY) * 0.16;
    ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%,-50%)`;

    // throttle to every 4th frame so the smoke stays sparse and small, not a dense cloud
    smokeCounter++;
    if(started && smokeCounter % 4 === 0){
      spawnSmoke(ringX, ringY);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const hoverTargets = 'a, button, .work-card, .connect-card, .nav-cta';
  document.querySelectorAll(hoverTargets).forEach(el=>{
    el.addEventListener('mouseenter', ()=>ring.classList.add('hovering'));
    el.addEventListener('mouseleave', ()=>ring.classList.remove('hovering'));
  });
})();
