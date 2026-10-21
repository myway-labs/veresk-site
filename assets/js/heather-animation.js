const canvas = document.getElementById('heatherFieldCanvas');
const ctx = canvas.getContext('2d');

// Высоту полосы задаёт CSS-токен --heather-h (единый источник).
// Важно: getPropertyValue для custom property отдаёт СПЕЦИФИЦИРОВАННОЕ значение
// ("3.75rem"), а не px — rem не резолвится браузером. Поэтому единицу разбираем
// сами и переводим rem в px по текущему корневому font-size (учитывает zoom-тиры).
const HEATHER_H_FALLBACK = 60;
function readHeatherHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--heather-h').trim();
  const num = parseFloat(raw);
  if (!Number.isFinite(num) || num <= 0) return HEATHER_H_FALLBACK;

  if (raw.endsWith('rem')) {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (Number.isFinite(rootPx) && rootPx > 0) return num * rootPx;
  }
  // px (или без единицы) — используем как есть
  return num;
}

let width = canvas.width = window.innerWidth;
let height = canvas.height = readHeatherHeight();

// ==== МАСШТАБ ТРАВЫ (единая система адаптации rem) ====
// Пространственные размеры травы заданы в px «базового корня» (16px) и
// домножаются на scale = корневой font-size / 16. На zoom-тирах корень растёт
// (×1.08 / ×1.3), вместе с ним растёт вся трава — консистентно с текстом.
// Непространственные параметры (количество, прозрачность) не масштабируются.
const BASE_ROOT_PX = 16;
let scale = 1;

function syncScale() {
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  scale = Number.isFinite(rootPx) && rootPx > 0 ? rootPx / BASE_ROOT_PX : 1;
}

// ==== НАСТРОЙКА ГУСТОТЫ ПОЛЯ ВЕРЕСКА (значения для корня 16px) ====
const HEATHER_DENSITY_STEP = 3;   // шаг между кустиками, px (меньше — плотнее)
const BUSH_HEIGHT_MIN = 25;       // мин. высота кустика, px
const BUSH_HEIGHT_SPREAD = 20;    // случайный разброс высоты, px
const MOUSE_RADIUS = 80;          // радиус расступания травы от курсора, px

// ==== ЦВЕТ ПОЛЯ ====
// Цвета берём из CSS-переменных --heather-* (в style.css они ссылаются на
// фирменные --btn-push / --btn-fill / --accent-color), т.е. источник один —
// стили. Ниже в JS — только hex-fallback, если переменная недоступна.
const STEM_FALLBACK = '#0F766E';         // стебли — фирменный тёмный зелёный
const STEM_ALPHA = 0.55;
const GREEN_FALLBACKS = ['#0F766E', '#24AA99', '#0D5C56']; // зелёные оттенки поля
const VIOLET_FALLBACKS = ['#785B9D', '#9B6FD1'];           // фирменный фиолетовый (сам вереск)

const GREENS_PER_BUSH = 6;          // зелёных «листиков» на кустик
const VIOLETS_PER_BUSH = 2;         // фиолетовых цветков на кустик (было 6 — сделали реже)
const GREEN_SIZE_MIN = 1.3;         // размер зелёного листика, px
const GREEN_SIZE_SPREAD = 1.3;      // случайный разброс размера листика, px
const VIOLET_SIZE_MIN = 1.3;        // размер фиолетового цветка, px
const VIOLET_SIZE_SPREAD = 1.0;     // случайный разброс размера цветка, px
const FLOWER_ALPHA_MIN = 0.5;       // минимальная плотность цветка
const FLOWER_ALPHA_SPREAD = 0.35;   // случайная добавка плотности

// Текущая палитра (заполняется из CSS при старте и при смене темы)
let stemColor = STEM_FALLBACK;
let greenColors = GREEN_FALLBACKS.slice();
let violetColors = VIOLET_FALLBACKS.slice();

function readBrandColors() {
  const css = getComputedStyle(document.body);
  const val = n => css.getPropertyValue(n).trim();

  const stem = val('--heather-stem');
  if (stem) stemColor = stem;

  const greens = ['--heather-green-1', '--heather-green-2', '--heather-green-3'].map(val).filter(Boolean);
  if (greens.length) greenColors = greens;

  const violets = ['--heather-violet-1', '--heather-violet-2'].map(val).filter(Boolean);
  if (violets.length) violetColors = violets;
}

readBrandColors();

// Тема переключается классом на body — перечитываем палитру и пересаживаем поле,
// иначе уже созданные кустики остаются в цветах прежней темы
new MutationObserver(() => {
  readBrandColors();
  initHeatherField();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// Разделили мышь на реальную (target) и плавную (smoothed) для эффекта задержки
let targetMouseX = -1000;
let smoothedMouseX = -1000;

let scrollWind = 0;
let scrollTimeout;

// Направление скролла и предыдущая позиция нужны, чтобы трава уходила и
// возвращалась с той стороны, куда движется страница.
let lastScrollY = window.scrollY;
let scrollDir = 0;

// Отслеживаем мышку
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  targetMouseX = e.clientX - rect.left;
  
  // Убираем резкий скачок при первом входе мыши на канвас
  if (smoothedMouseX === -1000) smoothedMouseX = targetMouseX;
});

window.addEventListener('mouseleave', () => {
  targetMouseX = -1000;
});

// Отслеживаем скролл (усиливаем ветер при прокрутке)
let scrollSyncQueued = false;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y > lastScrollY + 0.5) scrollDir = 1;
  else if (y < lastScrollY - 0.5) scrollDir = -1;
  lastScrollY = y;

  scrollWind = 2; // Сила наклона при скролле
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    scrollWind = 0;
  }, 150); // Как только скролл затих, ветер уходит

  // Позиция полосы зависит от скролла — пересчитываем не чаще кадра
  if (scrollSyncQueued) return;
  scrollSyncQueued = true;
  requestAnimationFrame(() => {
    scrollSyncQueued = false;
    syncScrollState();
  });
});

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = readHeatherHeight();
  lastScrollY = window.scrollY;
  syncScale();
  readBrandColors();
  initHeatherField();
  syncFieldPosition();
});

const fieldContainer = document.querySelector('.heather-field-container');
const heroSection = document.querySelector('.hero-section');
const heroBottomRow = document.querySelector('.hero-bottom-row');
const footerSection = document.querySelector('.site-footer');

// Полоса травы показывается у нижней границы первого экрана, только если
// свободного места под контентом hero хватает: не меньше высоты самой травы
// и не слишком много (иначе между hero и травой — пустота). Вне диапазона
// трава скрывается целиком (display:none), а hero снимает резерв первого
// экрана (is-grass-hidden) — пустота схлопывается.
const HEATHER_FREE_MIN_MULT = 1;   // мин. свободная полоса = трава × 1
const HEATHER_FREE_MAX_MULT = 3;   // макс. свободная полоса = трава × 3

function syncFieldPosition() {
  if (!fieldContainer || !heroBottomRow) return;

  // Низ контента hero в координатах от верха страницы (без влияния скролла)
  const rowBottom = heroBottomRow.getBoundingClientRect().bottom + window.scrollY;
  // От низа контента hero до низа первого экрана (scrollY = 0)
  const freeSpace = window.innerHeight - rowBottom;
  // Высоту травы берём из токена (height), т.к. у скрытого display:none offsetHeight = 0
  const stripHeight = height || fieldContainer.offsetHeight;

  const fits = freeSpace >= stripHeight * HEATHER_FREE_MIN_MULT
            && freeSpace <= stripHeight * HEATHER_FREE_MAX_MULT;

  fieldContainer.classList.toggle('is-hidden', !fits);
  // Когда трава скрыта, hero не резервирует первый экран (иначе пустота)
  if (heroSection) heroSection.classList.toggle('is-grass-hidden', !fits);
  // У футера трава занимает нижнюю кромку — резервируем под неё полосу
  if (footerSection) footerSection.classList.toggle('is-grass-padded', fits);

  syncScrollState();
}

// ==== СДВИГ ПОЛОСЫ ПРИ СКРОЛЛЕ ====
// Полоса ходит «по кругу» относительно направления скролла:
// вниз — уходит и приходит слева, вверх — уходит и приходит справа.
// Сверху скролл «на паузе»: сначала жестом убираем траву, и только потом
// страница начинает скроллиться. Снизу (у футера) — наоборот: жест выдвигает
// траву обратно, а скролл вверх сначала убирает её.
const GRASS_SLIDE_RATIO = 0.6; // полный сдвиг за 60% высоты экрана
const GRASS_EASE = 0.12;       // сглаживание transform (меньше — плавнее)

// -1 — полоса за левым краем, 0 — на месте, +1 — за правым краем
let grassShift = 0;   // цель
let grassShown = 0;   // сглаженное значение для transform
let fieldVisible = true;
let lastFieldTransform = '';

const reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

// Одна и та же дистанция для уборки сверху, выдвижения и уборки снизу
function slideDistance() {
  return Math.max(1, window.innerHeight * GRASS_SLIDE_RATIO);
}

function maxScrollY() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function isAtTop() {
  return window.scrollY <= 0.5;
}

function isAtBottom() {
  return window.scrollY >= maxScrollY() - 1;
}

function canMoveGrass() {
  return !!fieldContainer && !fieldContainer.classList.contains('is-hidden');
}

// Убрать траву за указанный край. Сменить сторону можно только когда полоса
// уже полностью скрыта — тогда подмена незаметна.
function hideGrass(side) {
  if (grassShift === 0) {
    grassShift = side;
    return;
  }
  if (Math.sign(grassShift) === side) return;

  // Полностью скрытую с другой стороны полосу можно перенести незаметно,
  // иначе (редкий случай: жест оборвался на полпути) доводим до нужного края.
  if (Math.abs(grassShift) >= 1 && Math.abs(grassShown) >= 0.999) {
    grassShown = side;
  }
  grassShift = side;
}

// Вернуть траву в кадр с указанного края (или доиграть текущий возврат)
function revealGrass(side) {
  if (Math.abs(grassShown) >= 0.999
      && Math.sign(grassShown) !== 0
      && Math.sign(grassShown) !== side) {
    grassShown = side;
    grassShift = side;
  }
  grassShift = 0;
}

// Фолбэк без перехвата (клавиатура, скроллбар, якоря, «наверх»):
// наверху трава возвращается с той стороны, куда шёл скролл; в середине —
// убрана; у футера цель не трогаем.
function syncScrollState() {
  if (isAtTop()) {
    revealGrass(scrollDir < 0 ? 1 : -1);
  } else if (isAtBottom()) {
    if (Math.abs(grassShift) >= 1) hideGrass(scrollDir < 0 ? 1 : -1);
  } else {
    hideGrass(scrollDir < 0 ? 1 : -1);
  }

  setGrassInterception(isAtTop() || isAtBottom());
}

// Применяем сдвиг в общем rAF-цикле и сообщаем, видна ли полоса хоть частично
function syncFieldTransform() {
  if (!fieldContainer) return;

  // Пока полоса полностью скрыта, сторону можно поменять без рывка
  if (Math.abs(grassShown) >= 0.999
      && Math.abs(grassShift) >= 0.999
      && Math.sign(grassShown) !== Math.sign(grassShift)) {
    grassShown = grassShift;
  }

  const ease = reduceMotionMQ.matches ? 1 : GRASS_EASE;
  grassShown += (grassShift - grassShown) * ease;
  if (Math.abs(grassShift - grassShown) < 0.001) grassShown = grassShift;

  fieldVisible = Math.abs(grassShown) < 0.999;

  const transform = `translate3d(${(grassShown * 100).toFixed(2)}%, 0, 0)`;
  if (transform !== lastFieldTransform) {
    lastFieldTransform = transform;
    fieldContainer.style.transform = transform;
  }
}

// Дельта колеса к пикселям: мышь (пиксели), трекпад, построчный/постраничный режим
function wheelDeltaPx(e) {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
  return e.deltaY;
}

// Общий жест на границах. Вниз: сверху убираем влево, снизу выдвигаем слева.
// Вверх: снизу убираем вправо, сверху возвращаем справа.
// Пока трава реально двигается, событие гасим; как только ход закончился —
// отпускаем странице.
function applyGrassGesture(delta) {
  const atTop = isAtTop();
  const atBottom = isAtBottom();
  if (!atTop && !atBottom) return false;

  const down = delta > 0;
  const side = down ? -1 : 1;
  const target = atTop
    ? (down ? -1 : 0)
    : (down ? 0 : 1);

  // Полоса уже за кадром с другой стороны — меняем сторону незаметно,
  // чтобы движение совпало с направлением скролла
  if (Math.abs(grassShown) >= 0.999 && Math.sign(grassShown) !== side) {
    grassShown = side;
    grassShift = side;
  }

  const diff = target - grassShift;
  if (!diff) return false;

  const step = Math.abs(delta) / slideDistance();
  grassShift += Math.sign(diff) * Math.min(step, Math.abs(diff));
  return true;
}

function onGrassWheel(e) {
  if (e.ctrlKey || !canMoveGrass()) return;

  const delta = wheelDeltaPx(e);
  if (!delta) return;

  if (applyGrassGesture(delta)) e.preventDefault();
}

let touchLastY = null;

function onGrassTouchStart(e) {
  touchLastY = e.touches.length === 1 ? e.touches[0].clientY : null;
}

function onGrassTouchMove(e) {
  if (touchLastY === null || e.touches.length !== 1) return;

  const y = e.touches[0].clientY;
  const delta = touchLastY - y; // палец вверх (скролл вниз) даёт плюс
  touchLastY = y;

  if (!delta || !canMoveGrass()) return;

  if (applyGrassGesture(delta)) e.preventDefault();
}

function onGrassTouchEnd() {
  touchLastY = null;
}

// Перехват живёт только у границ (верх/дно): вне их жесты не слушаем вовсе
let interceptionOn = null;

function setGrassInterception(active) {
  const want = active && canMoveGrass();
  if (want === interceptionOn) return;
  interceptionOn = want;

  const method = want ? 'addEventListener' : 'removeEventListener';
  window[method]('wheel', onGrassWheel, { passive: false });
  window[method]('touchstart', onGrassTouchStart, { passive: true });
  window[method]('touchmove', onGrassTouchMove, { passive: false });
  window[method]('touchend', onGrassTouchEnd, { passive: true });
}

window.addEventListener('load', syncFieldPosition);

class HeatherBush {
  constructor(x) {
    this.x = x;
    this.height = (BUSH_HEIGHT_MIN + Math.random() * BUSH_HEIGHT_SPREAD) * scale;
    this.speed = 0.01 + Math.random() * 0.01; 
    this.offset = Math.random() * Math.PI * 2;
    
    // Цвета берём из палитры выше (значения приходят из CSS-переменных)
    this.stemColor = stemColor;

    // Цветки: зелёные «листики» по стеблю + редкие фиолетовые на самых кончиках.
    // Цвет у каждого свой; прозрачность — отдельным числом (без склейки rgba)
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const flowerPalette = [
      ...Array.from({ length: GREENS_PER_BUSH }, () => pick(greenColors)),
      ...Array.from({ length: VIOLETS_PER_BUSH }, () => pick(violetColors))
    ];

    this.flowers = [];
    flowerPalette.forEach((color, i) => {
      const isViolet = i >= GREENS_PER_BUSH;
      const greenIndex = GREENS_PER_BUSH > 1 ? i / (GREENS_PER_BUSH - 1) : 0.5;
      this.flowers.push({
        // зелёные — вдоль стебля, фиолетовые — ближе к верхушке
        t: isViolet ? 0.78 + (i - GREENS_PER_BUSH) * 0.12 : 0.3 + greenIndex * 0.42,
        offsetX: (Math.random() - 0.5) * 3 * scale,
        offsetY: (Math.random() - 0.5) * 2 * scale,
        size: (isViolet ? VIOLET_SIZE_MIN + Math.random() * VIOLET_SIZE_SPREAD
                        : GREEN_SIZE_MIN + Math.random() * GREEN_SIZE_SPREAD) * scale,
        color,
        alpha: FLOWER_ALPHA_MIN + Math.random() * FLOWER_ALPHA_SPREAD
      });
    });
  }

  draw(time) {
    // Базовый очень медленный фоновый ветер
    let wind = Math.sin(time * this.speed + this.offset) * 2;
    
    // Эффект от скролла (наклоняет всё поле)
    wind += scrollWind * Math.sin(time * 0.05 + this.offset * 0.1);

    // Эффект от мышки теперь рассчитывается от СГЛАЖЕННОЙ координаты (smoothedMouseX)
    const mouseRadius = MOUSE_RADIUS * scale;
    const distToMouse = Math.abs(this.x - smoothedMouseX);
    if (distToMouse < mouseRadius) {
      const force = (mouseRadius - distToMouse) / mouseRadius;
      const direction = this.x > smoothedMouseX ? 1 : -1;
      wind += direction * force * 10; // Сила отталкивания от мыши
    }
    
    // Отрисовка стебля
    ctx.beginPath();
    ctx.moveTo(this.x, height);
    const cpX = this.x + wind * 0.4;
    const cpY = height - this.height * 0.4;
    const endX = this.x + wind;
    const endY = height - this.height;
    
    ctx.quadraticCurveTo(cpX, cpY, endX, endY);
    ctx.globalAlpha = STEM_ALPHA;
    ctx.strokeStyle = this.stemColor;
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // Отрисовка статичных (не мерцающих) цветов
    this.flowers.forEach(f => {
      const fx = (1 - f.t) * (1 - f.t) * this.x + 2 * (1 - f.t) * f.t * cpX + f.t * f.t * endX + f.offsetX;
      const fy = (1 - f.t) * (1 - f.t) * height + 2 * (1 - f.t) * f.t * cpY + f.t * f.t * endY + f.offsetY;
      
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(fx, fy, f.size, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

let bushes = [];
function initHeatherField() {
  bushes = [];
  // Кустики каждые HEATHER_DENSITY_STEP пикселей (с учётом масштаба) — плотность поля
  for (let x = 0; x < width; x += HEATHER_DENSITY_STEP * scale) {
    bushes.push(new HeatherBush(x));
  }
}

let animTime = 0;
function renderField() {
  syncFieldTransform();

  // Математика задержки (Линейная интерполяция / LERP)
  // smoothedMouseX плавно догоняет targetMouseX на 7% расстояния за кадр
  if (targetMouseX === -1000) {
    smoothedMouseX += (-1000 - smoothedMouseX) * 0.07;
  } else {
    smoothedMouseX += (targetMouseX - smoothedMouseX) * 0.07;
  }

  // Не тратим кадры на отрисовку, когда полоса полностью за кадром,
  // вкладка скрыта или трава выключена гейтом
  const drawField = fieldVisible
    && !document.hidden
    && fieldContainer
    && !fieldContainer.classList.contains('is-hidden');

  if (drawField) {
    ctx.clearRect(0, 0, width, height);
    animTime++;
    bushes.forEach(bush => bush.draw(animTime * 0.5));
  }

  requestAnimationFrame(renderField);
}

syncScale();
syncFieldPosition();
initHeatherField();
renderField();
