const prefersReducedMotionGlobal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- text scramble / decode-in effect ----------
const SCRAMBLE_CHARS = '01/<>{}#*+-';
function scrambleInto(el){
  if(prefersReducedMotionGlobal) return;
  const final = el.textContent;
  const len = final.length;
  let frame = 0;
  const totalFrames = 14;
  const interval = setInterval(()=>{
    frame++;
    let out = '';
    for(let i=0;i<len;i++){
      const revealPoint = (i/len) * totalFrames;
      if(frame >= revealPoint + 4){
        out += final[i];
      } else if(final[i] === ' '){
        out += ' ';
      } else {
        out += SCRAMBLE_CHARS[Math.floor(Math.random()*SCRAMBLE_CHARS.length)];
      }
    }
    el.textContent = out;
    if(frame >= totalFrames + 4){
      el.textContent = final;
      clearInterval(interval);
    }
  }, 28);
}

// ---------- reveal on scroll ----------
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      e.target.classList.add('in');
      const scrambleTarget = e.target.matches('.service-item, .work-card')
        ? e.target
        : e.target;
      const numEl = scrambleTarget.querySelector ? scrambleTarget.querySelector('.s-num, .tag') : null;
      if(numEl) scrambleInto(numEl);
      io.unobserve(e.target);
    }
  });
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

// ---------- education timeline: draws in as you scroll through it ----------
const mList = document.querySelector('.m-list');
const mFill = document.getElementById('mFill');
const mItems = document.querySelectorAll('.m-item');
function updateTimeline(){
  if(!mList || !mFill) return;
  const r = mList.getBoundingClientRect();
  const viewportAnchor = window.innerHeight * 0.75; // line grows until item passes 75% up the viewport
  const total = r.height;
  const progressPx = Math.min(total, Math.max(0, viewportAnchor - r.top));
  mFill.style.height = progressPx + 'px';

  mItems.forEach(item=>{
    const dotOffset = item.offsetTop + 4; // matches ::before top offset
    item.classList.toggle('lit', progressPx >= dotOffset);
  });
}
window.addEventListener('scroll', updateTimeline, {passive:true});
window.addEventListener('resize', updateTimeline);
updateTimeline();

// ---------- work card cursor glow + 3D magnetic tilt ----------
const isFinePointerGlobal = window.matchMedia('(pointer: fine)').matches;
document.querySelectorAll('.work-card').forEach(card=>{
  card.addEventListener('mousemove', e=>{
    const r = card.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    card.style.setProperty('--x', x+'px');
    card.style.setProperty('--y', y+'px');

    if(!isFinePointerGlobal || prefersReducedMotionGlobal) return;
    const px = (x / r.width) - 0.5;   // -0.5 .. 0.5
    const py = (y / r.height) - 0.5;
    const maxTilt = 7; // degrees
    const rotY = px * maxTilt * 2;
    const rotX = -py * maxTilt * 2;
    card.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px) scale(1.015)`;
  });
  card.addEventListener('mouseleave', ()=>{
    card.style.transform = '';
  });
});

// ---------- magnetic pull on buttons ----------
if(isFinePointerGlobal && !prefersReducedMotionGlobal){
  document.querySelectorAll('.hero-btn, .contact-cta, .cv-btn, .nav-cta').forEach(btn=>{
    btn.classList.add('magnetic');
    btn.addEventListener('mousemove', e=>{
      const r = btn.getBoundingClientRect();
      const relX = e.clientX - (r.left + r.width/2);
      const relY = e.clientY - (r.top + r.height/2);
      const strength = 0.28;
      btn.style.transform = `translate(${relX*strength}px, ${relY*strength}px)`;
    });
    btn.addEventListener('mouseleave', ()=>{
      btn.style.transform = 'translate(0,0)';
    });
  });
}

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

// ---------- chess: looping animated Scholar's Mate (hero decoration) ----------
(function(){
  const boardEl = document.getElementById('chessBoard');
  const moveListEl = document.getElementById('chessMoveList');
  const statusEl = document.getElementById('chessStatus');
  if(!boardEl || !moveListEl || !statusEl) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const files = ['a','b','c','d','e','f','g','h'];
  const GLYPH = {
    w:{K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'},
    b:{K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'}
  };

  function squareToRC(sq){
    return { col: files.indexOf(sq[0]), row: 8 - parseInt(sq[1], 10) };
  }

  function initialPieces(){
    const list = [];
    const backRank = ['R','N','B','Q','K','B','N','R'];
    files.forEach((f, i)=>{
      list.push({ id:'w'+backRank[i]+f+'1', type:backRank[i], color:'w', square:f+'1' });
      list.push({ id:'wP'+f+'2', type:'P', color:'w', square:f+'2' });
      list.push({ id:'b'+backRank[i]+f+'8', type:backRank[i], color:'b', square:f+'8' });
      list.push({ id:'bP'+f+'7', type:'P', color:'b', square:f+'7' });
    });
    return list;
  }

  const moves = [
    { from:'e2', to:'e4', san:'e4' },
    { from:'e7', to:'e5', san:'e5' },
    { from:'f1', to:'c4', san:'Bc4' },
    { from:'b8', to:'c6', san:'Nc6' },
    { from:'d1', to:'h5', san:'Qh5' },
    { from:'g8', to:'f6', san:'Nf6??' },
    { from:'h5', to:'f7', san:'Qxf7#', capture:true, checkmate:true }
  ];

  // ---- build the static squares once ----
  const squareEls = {};
  files.forEach((f, col)=>{
    for(let rank=1; rank<=8; rank++){
      const row = 8 - rank;
      const sq = document.createElement('div');
      const isLight = (row + col) % 2 !== 0;
      sq.className = 'chess-sq ' + (isLight ? 'light' : 'dark');
      sq.dataset.square = f + rank;
      sq.style.gridColumn = (col + 1);
      sq.style.gridRow = (row + 1);
      boardEl.appendChild(sq);
      squareEls[f + rank] = sq;
    }
  });
  const piecesLayer = document.createElement('div');
  piecesLayer.className = 'chess-pieces';
  boardEl.appendChild(piecesLayer);

  let pieces = [];
  let pieceEls = {};

  function renderInitial(){
    piecesLayer.innerHTML = '';
    pieceEls = {};
    pieces = initialPieces();
    pieces.forEach(p=>{
      const el = document.createElement('div');
      el.className = 'chess-piece ' + (p.color === 'w' ? 'white' : 'black');
      el.textContent = GLYPH[p.color][p.type];
      positionPiece(el, p.square, true);
      piecesLayer.appendChild(el);
      pieceEls[p.id] = el;
    });
  }

  function positionPiece(el, square, instant){
    const { col, row } = squareToRC(square);
    if(instant){
      const prevTransition = el.style.transition;
      el.style.transition = 'none';
      el.style.left = (col * 12.5) + '%';
      el.style.top = (row * 12.5) + '%';
      void el.offsetWidth; // force reflow so the next transition re-applies
      el.style.transition = prevTransition || '';
    } else {
      el.style.left = (col * 12.5) + '%';
      el.style.top = (row * 12.5) + '%';
    }
  }

  function clearHighlights(){
    Object.values(squareEls).forEach(sq=>sq.classList.remove('highlight'));
  }

  function findPieceAt(square){
    return pieces.find(p=>p.square === square);
  }

  function addMoveRow(pairIndex){
    let row = moveListEl.querySelector('.chess-move-row[data-pair="'+pairIndex+'"]');
    if(!row){
      row = document.createElement('div');
      row.className = 'chess-move-row';
      row.dataset.pair = pairIndex;
      row.innerHTML = '<span class="mv-num">'+(pairIndex+1)+'.</span><span class="mv-w"></span><span class="mv-b"></span>';
      moveListEl.appendChild(row);
    }
    return row;
  }

  function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

  async function playMove(move, halfIndex){
    clearHighlights();
    const mover = findPieceAt(move.from);
    if(!mover) return;

    squareEls[move.from].classList.add('highlight');
    squareEls[move.to].classList.add('highlight');

    if(move.capture){
      const captured = findPieceAt(move.to);
      if(captured){
        const capEl = pieceEls[captured.id];
        if(capEl) capEl.classList.add('captured');
        pieces = pieces.filter(p=>p.id !== captured.id);
      }
    }

    mover.square = move.to;
    positionPiece(pieceEls[mover.id], move.to, false);

    const pairIndex = Math.floor(halfIndex / 2);
    const row = addMoveRow(pairIndex);
    moveListEl.querySelectorAll('.chess-move-row').forEach(r=>r.classList.remove('current'));
    row.classList.add('current');
    const target = halfIndex % 2 === 0 ? row.querySelector('.mv-w') : row.querySelector('.mv-b');
    target.textContent = move.san;
    moveListEl.scrollTop = moveListEl.scrollHeight;

    if(move.checkmate){
      const king = pieces.find(p=>p.type==='K' && p.color==='b');
      if(king && pieceEls[king.id]) pieceEls[king.id].classList.add('in-check');
      statusEl.textContent = 'checkmate — white wins';
    } else {
      statusEl.textContent = (halfIndex % 2 === 0 ? 'black' : 'white') + ' to move';
    }
  }

  async function runLoop(){
    while(true){
      renderInitial();
      clearHighlights();
      moveListEl.innerHTML = '';
      statusEl.textContent = 'white to move';
      await sleep(reduceMotion ? 400 : 1100);

      for(let i=0;i<moves.length;i++){
        await playMove(moves[i], i);
        await sleep(reduceMotion ? 250 : (i === moves.length-1 ? 2600 : 1300));
      }
      await sleep(reduceMotion ? 300 : 1400);
    }
  }

  runLoop();
})();
