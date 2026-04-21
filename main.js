const GAME_DURATION = 30;         // segundos
const MAX_SPRITES = 12;            // monstruos simultáneos máximos
const SPAWN_INTERVAL_MS = 1200;   // intervalo de aparición

const SPRITES = [
  { src: 'sprites/slime_sprite.png', name: 'Slime', points: 10 },
  { src: 'sprites/bat_sprite.png',   name: 'Bat',   points: 20 },
  { src: 'sprites/ghost_sprite.png', name: 'Ghost', points: 30 },
];

const FRAME_SIZE   = 256;   // px per frame in the source image
const FRAME_MS     = 250;   // ms per frame
const DISPLAY_SIZE = 96;    // rendered size in px
const COLS         = 4;

const spriteIntervals = new WeakMap();

function stopSpriteAnim(el) {
  const id = spriteIntervals.get(el);
  if (id !== undefined) {
    clearInterval(id);
    spriteIntervals.delete(el);
  }
}


/**
 * El => El sprite
 * frameSeq => Secuencia de frames
 * loop => Si se repite la secuencia
 * onEnd => Función que se ejecuta al finalizar la secuencia
 * classSwap => Clases que se intercambian
 */
function playSpriteAnim(el, frameSeq, loop, onEnd, classSwap) {
  stopSpriteAnim(el);
  let idx = 0;

  function applyFrame(f) {
    const col = f % COLS;
    const row = Math.floor(f / COLS);
    const scale = DISPLAY_SIZE / FRAME_SIZE;
    const bx = -(col * FRAME_SIZE * scale);
    const by = -(row * FRAME_SIZE * scale);
    el.style.backgroundPosition = `${bx}px ${by}px`;
  }

  if (classSwap?.remove) el.classList.remove(classSwap.remove);
  if (classSwap?.add)    el.classList.add(classSwap.add);
  applyFrame(frameSeq[0]);

  const id = setInterval(() => {
    idx++;
    if (idx >= frameSeq.length) {
      if (loop) {
        idx = 0;
      } else {
        clearInterval(id);
        spriteIntervals.delete(el);
        if (onEnd) onEnd();
        return;
      }
    }
    applyFrame(frameSeq[idx]);
  }, FRAME_MS);

  spriteIntervals.set(el, id);
}

const SEQ_SPAWN = [0, 1, 2, 3];
const SEQ_IDLE  = [4, 5, 6, 7, 8, 9, 10, 11];
const SEQ_DEATH = [12, 13, 14, 15];

const PARTICLE_COLORS = ['#a855f7', '#22d3ee', '#fbbf24', '#ef4444', '#34d399'];

// --- Estado del juego ---
let score = 0;
let kills = 0;
let timeLeft = GAME_DURATION;
let timerInterval = null;
let spawnInterval = null;
let gameActive = false;
let gamePaused = false;
let activeSprites = 0;
let elapsedBeforePause = 0;
let timerStartTime = 0;

// --- Elementos DOM ---
const startScreen       = document.getElementById('StartScreen');
const gameScreen        = document.getElementById('GameScreen');
const endScreen         = document.getElementById('EndScreen');
const startButton       = document.getElementById('StartButton');
const restartButton     = document.getElementById('RestartButton');
const timerDisplay      = document.getElementById('TimerDisplay');
const timerBar          = document.getElementById('TimerBar');
const scoreDisplay      = document.getElementById('ScoreDisplay');
const finalScore        = document.getElementById('FinalScore');
const finalMessage      = document.getElementById('FinalMessage');
const totalKills        = document.getElementById('TotalKills');
const gameArena         = document.getElementById('GameArena');
const leaderboardBody   = document.getElementById('LeaderboardBody');
const leaderboardEmpty  = document.getElementById('LeaderboardEmpty');
const leaderboardTable  = document.querySelector('.leaderboard-table');
const clearScoresButton = document.getElementById('ClearScoresButton');
const pauseOverlay      = document.getElementById('PauseOverlay');
const resumeButton      = document.getElementById('ResumeButton');
const quitButton        = document.getElementById('QuitButton');
const clearConfirm      = document.getElementById('ClearConfirm');
const confirmYes        = document.getElementById('ConfirmYes');
const confirmNo         = document.getElementById('ConfirmNo');

const STORAGE_KEY = 'monsterSmashScores';

// --- Pantallas ---
function showScreen(screen) {
  [startScreen, gameScreen, endScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// --- Iniciar juego ---
function startGame() {
  score = 0;
  kills = 0;
  timeLeft = GAME_DURATION;
  activeSprites = 0;
  gameActive = true;
  gamePaused = false;
  elapsedBeforePause = 0;

  scoreDisplay.textContent = '0';
  timerDisplay.textContent = GAME_DURATION;
  timerBar.style.width = '100%';
  timerBar.classList.remove('danger');
  gameArena.innerHTML = '';
  pauseOverlay.classList.remove('active');

  showScreen(gameScreen);
  startTimer();

  spawnSprite();
  spawnInterval = setInterval(() => {
    if (gameActive && !gamePaused && activeSprites < MAX_SPRITES) {
      spawnSprite();
    }
  }, SPAWN_INTERVAL_MS);
}

function startTimer() {
  timerStartTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = elapsedBeforePause + (Date.now() - timerStartTime) / 1000;
    timeLeft = Math.max(0, GAME_DURATION - elapsed);
    const pct = (timeLeft / GAME_DURATION) * 100;

    timerDisplay.textContent = Math.ceil(timeLeft);
    timerBar.style.width = pct + '%';

    if (timeLeft <= 10) {
      timerBar.classList.add('danger');
    }

    if (timeLeft <= 0) {
      endGame();
    }
  }, 100);
}

function pauseGame() {
  if (!gameActive || gamePaused) return;
  gamePaused = true;

  // Acumular el tiempo transcurrido hasta ahora
  elapsedBeforePause += (Date.now() - timerStartTime) / 1000;

  // Detener intervalos
  clearInterval(timerInterval);
  clearInterval(spawnInterval);

  // Mostrar overlay de pausa
  pauseOverlay.classList.add('active');
}

// --- Reanudar juego ---
function resumeGame() {
  if (!gameActive || !gamePaused) return;
  gamePaused = false;

  // Ocultar overlay
  pauseOverlay.classList.remove('active');

  // Reiniciar temporizador desde donde se pausó
  startTimer();

  // Reiniciar spawn
  spawnInterval = setInterval(() => {
    if (gameActive && !gamePaused && activeSprites < MAX_SPRITES) {
      spawnSprite();
    }
  }, SPAWN_INTERVAL_MS);
}

function quitGame() {
  gameActive = false;
  gamePaused = false;
  clearInterval(timerInterval);
  clearInterval(spawnInterval);
  pauseOverlay.classList.remove('active');
  showScreen(startScreen);
}

function endGame() {
  gameActive = false;
  clearInterval(timerInterval);
  clearInterval(spawnInterval);

  finalScore.textContent = score;
  totalKills.textContent = kills;

  // Guardar puntaje en historial
  saveScore(score, kills);

  // Mensaje según puntaje
  if (score >= 200) {
    finalMessage.textContent = '🏆 ¡Increíble! ¡Eres un maestro cazador!';
  } else if (score >= 100) {
    finalMessage.textContent = '🔥 ¡Muy bien! ¡Sigue así!';
  } else if (score >= 50) {
    finalMessage.textContent = '👍 Nada mal, ¡puedes mejorar!';
  } else {
    finalMessage.textContent = '💪 ¡Inténtalo de nuevo!';
  }

  showScreen(endScreen);
}

// --- Spawn de sprite ---
function spawnSprite() {
  if (!gameActive) return;

  const spriteData = SPRITES[Math.floor(Math.random() * SPRITES.length)];

  const spriteEl = document.createElement('div');
  spriteEl.className = 'sprite';

  // Configurar spritesheet como background
  spriteEl.style.backgroundImage = `url('${spriteData.src}')`;
  spriteEl.style.backgroundSize  = `${DISPLAY_SIZE * COLS}px auto`; // 4 columnas
  spriteEl.style.backgroundRepeat = 'no-repeat';

  // Posición aleatoria
  const arenaRect = gameArena.getBoundingClientRect();
  const margin = 100;
  const maxX = arenaRect.width - margin;
  const maxY = arenaRect.height - margin;
  const x = margin / 2 + Math.random() * (maxX - margin / 2);
  const y = margin / 2 + Math.random() * (maxY - margin / 2);

  spriteEl.style.left = x + 'px';
  spriteEl.style.top  = y + 'px';

  spriteEl._points = spriteData.points;

  // Animación de aparición
  playSpriteAnim(spriteEl, SEQ_SPAWN, false, () => {
    playSpriteAnim(spriteEl, SEQ_IDLE, true, null, { add: 'alive' });
  });

  spriteEl.addEventListener('click', () => killSprite(spriteEl));

  gameArena.appendChild(spriteEl);
  activeSprites++;
}

function triggerDeath(spriteEl, scored) {
  playSpriteAnim(spriteEl, SEQ_DEATH, false, () => {
    stopSpriteAnim(spriteEl);
    if (spriteEl.parentNode) {
      spriteEl.remove();
      activeSprites--;
    }
    if (scored && gameActive) {
      spawnSprite();
    }
  }, { remove: 'alive', add: 'dying' });
}

function killSprite(spriteEl) {
  if (!gameActive || spriteEl.classList.contains('dying')) return;

  // Incrementar puntaje
  const pts = spriteEl._points;
  score += pts;
  kills++;
  scoreDisplay.textContent = score;

  // Animación de bump en el puntaje
  scoreDisplay.classList.remove('bump');
  scoreDisplay.classList.add('bump');

  // Popup de puntos
  const rect = spriteEl.getBoundingClientRect(); // obtenemos distancia al tope y de la izquierda, además de ancho y alto
  const arenaRect = gameArena.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = `+${pts}`;
  popup.style.left = (rect.left - arenaRect.left + rect.width / 2 - 25) + 'px';
  popup.style.top = (rect.top - arenaRect.top - 10) + 'px';
  gameArena.appendChild(popup);
  popup.addEventListener('animationend', () => popup.remove());

  // Animación de muerte con spritesheet (fila 4)
  triggerDeath(spriteEl, true);
}

// localStorage
function getScores() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveScore(scoreVal, killsVal) {
  const scores = getScores();
  scores.push({
    score: scoreVal,
    kills: killsVal,
    date: new Date().toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  });
  // Ordenar por puntaje descendente y quedarse con los top 5
  scores.sort((a, b) => b.score - a.score);
  const top5 = scores.slice(0, 5);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(top5));
}

function renderLeaderboard() {
  const scores = getScores();
  leaderboardBody.innerHTML = '';

  if (scores.length === 0) {
    leaderboardTable.classList.add('hidden');
    leaderboardEmpty.classList.remove('hidden');
    return;
  }

  leaderboardTable.classList.remove('hidden');
  leaderboardEmpty.classList.add('hidden');

  const rankClasses = ['gold', 'silver', 'bronze'];
  const rankMedals = ['🥇', '🥈', '🥉'];

  scores.forEach((entry, index) => {
    const tr = document.createElement('tr');

    // Rank
    const tdRank = document.createElement('td');
    tdRank.className = 'rank-cell';
    if (index < 3) {
      tdRank.classList.add(rankClasses[index]);
      tdRank.textContent = rankMedals[index];
    } else {
      tdRank.textContent = index + 1;
    }

    // Score
    const tdScore = document.createElement('td');
    tdScore.className = 'score-cell';
    tdScore.textContent = entry.score;

    // Kills
    const tdKills = document.createElement('td');
    tdKills.className = 'kills-cell';
    tdKills.textContent = entry.kills + ' 💀';

    // Date
    const tdDate = document.createElement('td');
    tdDate.className = 'date-cell';
    tdDate.textContent = entry.date;

    tr.append(tdRank, tdScore, tdKills, tdDate);
    leaderboardBody.appendChild(tr);
  });
}

function clearScores() {
  clearConfirm.classList.toggle('hidden');
}

function confirmClearScores() {
  localStorage.removeItem(STORAGE_KEY);
  clearConfirm.classList.add('hidden');
  renderLeaderboard();
}

function cancelClearScores() {
  clearConfirm.classList.add('hidden');
}

const originalShowScreen = showScreen;
showScreen = function (screen) {
  originalShowScreen(screen);
  if (screen === startScreen) {
    renderLeaderboard();
  }
};

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
clearScoresButton.addEventListener('click', clearScores);
confirmYes.addEventListener('click', confirmClearScores);
confirmNo.addEventListener('click', cancelClearScores);
resumeButton.addEventListener('click', resumeGame);
quitButton.addEventListener('click', quitGame);

// --- Tecla ESC para pausar/reanudar ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (gameActive && !gamePaused) {
      pauseGame();
    } else if (gameActive && gamePaused) {
      resumeGame();
    }
  }
});

// --- Renderizar leaderboard al cargar ---
renderLeaderboard();

// --- Animar sprites flotantes de la pantalla de inicio ---
(function initFloatingSprites() {
  const container = document.getElementById('FloatingSprites');
  const COUNT = 9;

  // Posiciones distribuidas para cubrir la pantalla sin amontonarse
  const positions = [
    { top: '8%',  left: '5%'  },
    { top: '12%', right: '8%' },
    { top: '45%', left: '3%'  },
    { top: '42%', right: '5%' },
    { top: '78%', left: '8%'  },
    { top: '75%', right: '10%'},
    { top: '25%', left: '45%' },
    { top: '60%', left: '30%' },
    { top: '65%', right: '28%'},
  ];

  const floatDurations = [6, 7, 5, 8, 6.5, 7.5, 5.5, 8.5, 6];

  for (let i = 0; i < COUNT; i++) {
    const spriteData = SPRITES[i % SPRITES.length];
    const el = document.createElement('div');
    el.className = 'float-sprite';

    // Posición
    const pos = positions[i];
    Object.entries(pos).forEach(([prop, val]) => el.style.setProperty(prop, val));

    // Duración de flotación y delay escalonado
    el.style.animationDuration = floatDurations[i] + 's';
    el.style.animationDelay   = (i * 0.7) + 's';

    // Spritesheet
    el.style.backgroundImage  = `url('${spriteData.src}')`;
    el.style.backgroundSize   = `${DISPLAY_SIZE * COLS}px auto`;
    el.style.backgroundRepeat = 'no-repeat';

    container.appendChild(el);

    // Animar idle con offset de frame distinto por sprite
    const offsetSeq = SEQ_IDLE.slice(i % SEQ_IDLE.length)
                               .concat(SEQ_IDLE.slice(0, i % SEQ_IDLE.length));
    playSpriteAnim(el, offsetSeq, true);
  }
}());
