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

// ==== НАСТРОЙКА ГУСТОТЫ ПОЛЯ ВЕРЕСКА ====
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
window.addEventListener('scroll', () => {
  scrollWind = 2; // Сила наклона при скролле
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    scrollWind = 0;
  }, 150); // Как только скролл затих, ветер уходит
});

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = readHeatherHeight();
  readBrandColors();
  initHeatherField();
  syncFieldPosition();
});

const fieldContainer = document.querySelector('.heather-field-container');
const heroBottomRow = document.querySelector('.hero-bottom-row');

// Универсальная адаптация полосы
function syncFieldPosition() {
  if (!fieldContainer || !heroBottomRow) return;
  const stripHeight = fieldContainer.offsetHeight || height;
  const rowBottom = heroBottomRow.getBoundingClientRect().bottom + window.scrollY;
  const overlap = rowBottom > window.innerHeight - stripHeight;
  fieldContainer.classList.toggle('is-inflow', overlap);
}

window.addEventListener('load', syncFieldPosition);

class HeatherBush {
  constructor(x) {
    this.x = x;
    this.height = BUSH_HEIGHT_MIN + Math.random() * BUSH_HEIGHT_SPREAD; // Высота из настроек выше
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
        offsetX: (Math.random() - 0.5) * 3,
        offsetY: (Math.random() - 0.5) * 2,
        size: isViolet ? VIOLET_SIZE_MIN + Math.random() * VIOLET_SIZE_SPREAD
                       : GREEN_SIZE_MIN + Math.random() * GREEN_SIZE_SPREAD,
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
    const distToMouse = Math.abs(this.x - smoothedMouseX);
    if (distToMouse < MOUSE_RADIUS) {
      const force = (MOUSE_RADIUS - distToMouse) / MOUSE_RADIUS;
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
    ctx.lineWidth = 1.5;
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
  // Кустики каждые HEATHER_DENSITY_STEP пикселей — плотность поля
  for (let x = 0; x < width; x += HEATHER_DENSITY_STEP) {
    bushes.push(new HeatherBush(x));
  }
}

let animTime = 0;
function renderField() {
  ctx.clearRect(0, 0, width, height);
  animTime++;
  
  // Математика задержки (Линейная интерполяция / LERP)
  // smoothedMouseX плавно догоняет targetMouseX на 7% расстояния за кадр
  if (targetMouseX === -1000) {
    smoothedMouseX += (-1000 - smoothedMouseX) * 0.07;
  } else {
    smoothedMouseX += (targetMouseX - smoothedMouseX) * 0.07;
  }
  
  bushes.forEach(bush => bush.draw(animTime * 0.5));
  requestAnimationFrame(renderField);
}

syncFieldPosition();
initHeatherField();
renderField();
