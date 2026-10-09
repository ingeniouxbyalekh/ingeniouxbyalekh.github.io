// ---------- reveal on scroll ----------
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
},{threshold:.15});
revealEls.forEach(el=>io.observe(el));

// ---------- work card cursor glow ----------
document.querySelectorAll('.work-card').forEach(card=>{
  card.addEventListener('mousemove', e=>{
    const r = card.getBoundingClientRect();
    card.style.setProperty('--x', (e.clientX - r.left)+'px');
    card.style.setProperty('--y', (e.clientY - r.top)+'px');
  });
});

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

    smokeCounter++;
    if(started && smokeCounter % 4 === 0){
      spawnSmoke(ringX, ringY);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const hoverTargets = 'a, button, .work-card, .nav-cta';
  document.querySelectorAll(hoverTargets).forEach(el=>{
    el.addEventListener('mouseenter', ()=>ring.classList.add('hovering'));
    el.addEventListener('mouseleave', ()=>ring.classList.remove('hovering'));
  });
})();
