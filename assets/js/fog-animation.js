// ============================================================================
// ТУМАН В HERO (WebGL / three.js + GSAP)
// ----------------------------------------------------------------------------
// Взято из внешнего CodePen-примера и адаптировано под статику проекта:
//   - three.js и gsap подключены ЛОКАЛЬНО (assets/vendor-*), без CDN;
//   - текстура дыма лежит локально, путь задаётся в FOG_CONFIG;
//   - рендерер посажен в отдельный контейнер (.fog-field-container) на всю
//     ширину вьюпорта; контейнер лежит вне hero, чтобы его не резали
//     max-width и overflow-x секции;
//   - декоративный текст «THE FOG» и слайдеры из примера убраны;
//   - все регулировки собраны в объект FOG_CONFIG.
//
// Включение/выключение и параметры тумана задаются ОТДЕЛЬНО для светлой и
// тёмной темы: тема определяется классом .dark-theme на <body> (его ставит
// инлайн-скрипт в index.html). Смена темы применяется на лету: цвет и
// интенсивность обновляются без перезапуска, а при enabled: false сцена
// полностью освобождает GPU-ресурсы.
//
// Два режима движения:
//   - emitter.enabled: true  — пар вылетает из сопла на фото и оседает вниз;
//   - emitter.enabled: false — исходный вариант: пар опускается сверху.
// Режим из сопла включён только на десктопе; на мобильных остаётся исходный.
// ============================================================================

(function () {
  const container = document.querySelector('.fog-field-container');
  const heroSection = document.getElementById('hero');
  let canvas = document.getElementById('fogFieldCanvas');

  if (!container || !canvas || typeof THREE === 'undefined' || typeof gsap === 'undefined') {
    console.warn('[fog] Не инициализировано: отсутствуют container/canvas/THREE/gsap');
    return;
  }

  const DARK_THEME_CLASS = 'dark-theme';
  // 769px — граница мобильной раскладки из style.css
  const DESKTOP_MQ = window.matchMedia('(min-width: 769px)');
  const reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ==== РЕГУЛИРОВКИ ====
  const FOG_CONFIG = {
    // Параметры по темам: enabled — главный выключатель тумана.
    themes: {
      light: {
        enabled: false, // пар на светлой теме пока не доведён
        color: 0xffffff, // цвет дыма
        intensity: 0.05, // максимальная непрозрачность частиц (0..1)
      },
      dark: {
        enabled: true,
        color: 0xffffff,
        intensity: 0.01,
      },
    },

    // Эмиттер из сопла (фото hero-violet.webp). Координаты взяты из фото
    // 1325 × 1825 в нативных пикселях изображения.
    emitter: {
      enabled: true, // false — вернуться к исходному режиму «сверху вниз»
      image: {
        width: 1325,
        height: 1825,
        // Координаты сопла в координатах исходного фото (35х625).
        nozzleX: 35,
        nozzleY: 625,
      },
      // Направление выброса: 10° влево-вверх от горизонтали.
      angleFromHorizontalDeg: 10,
      // Разброс направлений струи, градусы (в обе стороны).
      spreadDeg: 1,
      // Смещение точки старта, чтобы пар не рождался строго за фото (было 6).
      spawnOffsetPx: 10,
      // Дальность выброса и последующего оседания, мировые единицы.
      ejectDistanceMin: 220,
      ejectDistanceMax: 360,
      settleDriftMin: 420,
      settleDriftMax: 700,
      // Точка завершения оседания как доля высоты полотна: 0.92 — почти
      // у нижней кромки, где маска уже плавно гасит туман. Доля, а не
      // мировые единицы, чтобы траектория не зависела от высоты блока.
      settleEndFraction: 0.92,
      // Размер старта/рост частицы.
      scaleStart: 0.08,
      scaleEnd: 3,
      // Время жизни цикла частицы.
      durationMin: 14,
      durationMax: 22,
      // Количество частиц в режиме эмиттера (в режиме «сверху» — 60).
      particleCount: 90,
      // Отклонение старта по Z для глубины.
      zSpread: 200,
      // Включать эмиттер только на десктопе (соответствует вёрстке фото).
      desktopOnly: true,
    },

    // Общие константы сцены.
    particleCount: 60,
    planeSize: 500,
    cameraZ: 1000,
    // Позиция слоя тумана по Z (в исходнике — «Text Depth»).
    groupDepth: -200,
    fov: 75,

    // Текстура дыма. Используется только её альфа-канал: RGB при загрузке
    // перекрашивается в белый, а итоговый цвет задаётся в themes[].color.
    texturePath: 'assets/img/fog/Smoke-Element.png',

    // Полотно тумана продолжается ниже hero — до низа указанного блока.
    // Последние fadePx растворяются маской, а не режутся по границе.
    extend: {
      enabled: true,
      targetSelector: '#catalog',
      desktopOnly: false,
      fadePx: 180,
    },

    // Уважать системную настройку «уменьшить движение»: при true туман
    // полностью отключается, если пользователь включил reduced motion.
    respectReducedMotion: true,
  };

  let camera = null;
  let scene = null;
  let renderer = null;
  let fogGroup = null;
  let smokeGeometry = null;
  let smokeTexture = null;
  let smokeParticles = [];
  let activeSettings = null;
  const emitterOrigin = new THREE.Vector3();
  let emitterReady = false;
  let initialized = false;
  let loadToken = 0;
  let running = false;
  let visible = true;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function getThemeName() {
    return document.body.classList.contains(DARK_THEME_CLASS) ? 'dark' : 'light';
  }

  function isEmitterUsable() {
    if (!FOG_CONFIG.emitter.enabled) return false;
    if (FOG_CONFIG.emitter.desktopOnly && !DESKTOP_MQ.matches) return false;
    if (!document.querySelector('.inline-team-img')) return false;
    if (!document.querySelector('.image-container-block')) return false;
    return true;
  }

  function isEmitterActive() {
    return isEmitterUsable() && emitterReady;
  }

  function getThemeSettings() {
    return FOG_CONFIG.themes[getThemeName()] || FOG_CONFIG.themes.light;
  }

  function isFogAllowed(settings) {
    if (!settings.enabled) return false;
    return !FOG_CONFIG.respectReducedMotion || !reduceMotionMQ.matches;
  }

  function sizeRenderer() {
    if (!renderer || !camera) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // Ставит полотно от верха hero и продлевает до низа целевого блока.
  // Контейнер живёт вне hero: ширина — весь вьюпорт, а верх/высота задаются
  // в координатах документа (иначе hero ограничивал бы его своей шириной).
  function updateFogBounds() {
    if (!heroSection) return;

    const extend = FOG_CONFIG.extend;
    const shouldExtend = extend.enabled && (!extend.desktopOnly || DESKTOP_MQ.matches);
    const target = shouldExtend ? document.querySelector(extend.targetSelector) : null;
    const heroRect = heroSection.getBoundingClientRect();

    container.style.top = `${Math.round(heroRect.top + window.scrollY)}px`;

    if (!target) {
      container.classList.remove('is-extended');
      container.style.height = `${Math.round(heroRect.height)}px`;
      container.style.removeProperty('--fog-fade');
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const height = Math.max(heroRect.height, targetRect.bottom - heroRect.top);

    container.style.height = `${Math.round(height)}px`;
    container.style.setProperty('--fog-fade', `${extend.fadePx}px`);
    container.classList.add('is-extended');
  }

  function layoutFog() {
    updateFogBounds();
    sizeRenderer();
    updateEmitterOrigin();
  }

  // Пересчитывает мировые координаты сопла из координат фото. Возвращает
  // false, если разметка/камера ещё не готовы (тогда используется rain-режим).
  function updateEmitterOrigin() {
    emitterReady = false;

    const imageEl = document.querySelector('.inline-team-img');
    const emitter = FOG_CONFIG.emitter;

    if (!isEmitterUsable() || !imageEl || !camera) return false;

    const containerRect = container.getBoundingClientRect();
    const imgRect = imageEl.getBoundingClientRect();

    if (
      containerRect.width === 0 ||
      containerRect.height === 0 ||
      imgRect.width === 0 ||
      imgRect.height === 0
    ) {
      return false;
    }

    // Фото масштабируется background-size: 100% auto по ширине контейнера,
    // позиция background-position: right top. Переводим координаты фото
    // в координаты экрана относительно изображения.
    const scale = imgRect.width / emitter.image.width;
    const nozzleScreenX = imgRect.left + emitter.image.nozzleX * scale;
    const nozzleScreenY = imgRect.top + emitter.image.nozzleY * scale;

    // Экранные координаты переводим в NDC ОТНОСИТЕЛЬНО canvas (контейнера
    // тумана), а не окна: полотно шире контентной колонки hero.
    const xNdc = ((nozzleScreenX - containerRect.left) / containerRect.width) * 2 - 1;
    const yNdc = -((nozzleScreenY - containerRect.top) / containerRect.height) * 2 + 1;

    // Проекция на плоскость z = 0 (там же, где расположены частицы).
    camera.updateMatrixWorld();
    const vector = new THREE.Vector3(xNdc, yNdc, 0.5).unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;

    if (!Number.isFinite(distance) || distance <= 0) return false;

    const angleRad = Math.PI - THREE.MathUtils.degToRad(emitter.angleFromHorizontalDeg);
    const offsetDir = new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0).normalize();
    const worldPos = camera.position
      .clone()
      .add(dir.multiplyScalar(distance))
      .add(offsetDir.multiplyScalar(emitter.spawnOffsetPx));

    emitterOrigin.copy(worldPos);
    emitterOrigin.z = 0;
    emitterReady = true;
    return true;
  }

  function getParticleCount() {
    return isEmitterUsable() ? FOG_CONFIG.emitter.particleCount : FOG_CONFIG.particleCount;
  }

  function init() {
    if (initialized) return;

    initialized = true;
    const token = ++loadToken;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      FOG_CONFIG.fov,
      window.innerWidth / window.innerHeight,
      1,
      10000
    );
    camera.position.z = FOG_CONFIG.cameraZ;

    fogGroup = new THREE.Group();
    fogGroup.position.z = FOG_CONFIG.groupDepth;
    scene.add(fogGroup);

    layoutFog();

    smokeGeometry = new THREE.PlaneGeometry(FOG_CONFIG.planeSize, FOG_CONFIG.planeSize);

    const loader = new THREE.TextureLoader();
    loader.load(
      FOG_CONFIG.texturePath,
      (texture) => {
        // Пока текстура грузилась, тему могли выключить или сменить — тогда
        // устаревший результат не нужен.
        if (token !== loadToken) {
          texture.dispose();
          return;
        }

        buildParticles(texture);
        if (isFogAllowed(getThemeSettings())) start();
      },
      undefined,
      (error) => {
        if (token !== loadToken) return;
        console.warn('[fog] Не удалось загрузить текстуру:', FOG_CONFIG.texturePath, error);
        destroy();
      }
    );
  }

  function buildParticles(texture) {
    const image = texture.image;
    const whiteCanvas = document.createElement('canvas');
    whiteCanvas.width = image.width;
    whiteCanvas.height = image.height;
    const whiteCtx = whiteCanvas.getContext('2d');
    whiteCtx.drawImage(image, 0, 0);
    whiteCtx.globalCompositeOperation = 'source-in';
    whiteCtx.fillStyle = '#ffffff';
    whiteCtx.fillRect(0, 0, whiteCanvas.width, whiteCanvas.height);
    texture.dispose();

    smokeTexture = new THREE.CanvasTexture(whiteCanvas);
    smokeTexture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: smokeTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    updateEmitterOrigin();

    const count = getParticleCount();
    for (let index = 0; index < count; index += 1) {
      const particle = new THREE.Mesh(smokeGeometry, material.clone());
      particle.userData.lifeProgress = { val: 0 };
      particle.userData.timeline = null;
      resetParticle(particle, true);
      fogGroup.add(particle);
      smokeParticles.push(particle);
      animateParticle(particle, true);
    }

    material.dispose();
    applyTheme(getThemeSettings());
  }

  // Применяет параметры текущей темы к уже созданным частицам.
  function applyTheme(settings) {
    activeSettings = settings;

    if (!smokeParticles.length) return;

    const color = new THREE.Color(settings.color);
    smokeParticles.forEach((particle) => {
      particle.material.color.copy(color);
    });
  }

  // Точка старта и начальный масштаб зависят от выбранного режима.
  function resetParticle(particle, isInitial) {
    if (isEmitterUsable() && updateEmitterOrigin()) {
      resetNozzleParticle(particle);
      return;
    }

    resetRainParticle(particle, isInitial);
  }

  function resetRainParticle(particle, isInitial) {
    // На удлинённом полотне камера становится «уже», и фиксированный
    // разброс ±800 выносит большую часть частиц за кадр. Считаем ширину
    // видимой области и распределяем пар по ней (с запасом 10%).
    const isExtended = container.classList.contains('is-extended');
    const halfWidth = isExtended
      ? 2 *
        Math.tan(THREE.MathUtils.degToRad(FOG_CONFIG.fov / 2)) *
        FOG_CONFIG.cameraZ *
        camera.aspect *
        0.55
      : 800;

    particle.position.set(
      Math.random() * halfWidth * 2 - halfWidth,
      isInitial ? Math.random() * 1200 - 600 : 1000,
      Math.random() * 500
    );
    particle.rotation.z = Math.random() * Math.PI * 2;
    particle.scale.set(0.6, 0.6, 1);
    particle.userData.lifeProgress.val = 0;
    particle.material.opacity = 0;
  }

  function resetNozzleParticle(particle) {
    const emitter = FOG_CONFIG.emitter;
    const angle =
      Math.PI -
      THREE.MathUtils.degToRad(emitter.angleFromHorizontalDeg) +
      THREE.MathUtils.degToRad(randomBetween(-emitter.spreadDeg, emitter.spreadDeg));
    const offset = emitter.spawnOffsetPx * randomBetween(0.5, 1);
    const startScale = emitter.scaleStart * randomBetween(0.8, 1.2);

    particle.position.set(
      emitterOrigin.x + Math.cos(angle) * offset,
      emitterOrigin.y + Math.sin(angle) * offset,
      -FOG_CONFIG.groupDepth + randomBetween(-emitter.zSpread / 2, emitter.zSpread / 2)
    );
    particle.rotation.z = Math.random() * Math.PI * 2;
    particle.scale.set(startScale, startScale, 1);
    particle.userData.lifeProgress.val = 0;
    particle.material.opacity = 0;
  }

  function animateParticle(particle, isInitial) {
    if (isEmitterActive()) {
      animateNozzleParticle(particle, isInitial);
      return;
    }

    animateRainParticle(particle);
  }

  // Исходный режим: туман опускается сверху на траву.
  function animateRainParticle(particle) {
    const duration = 30 + Math.random() * 15;

    gsap.killTweensOf(particle.position);
    gsap.killTweensOf(particle.rotation);
    gsap.killTweensOf(particle.scale);
    gsap.killTweensOf(particle.userData.lifeProgress);
    if (particle.userData.timeline) {
      particle.userData.timeline.kill();
      particle.userData.timeline = null;
    }

    gsap.to(particle.position, {
      y: -800,
      x: particle.position.x + (Math.random() * 200 - 100),
      duration,
      ease: 'none',
      onComplete: () => {
        resetParticle(particle, false);
        animateParticle(particle, false);
      },
    });
    gsap.to(particle.rotation, {
      z: particle.rotation.z + (Math.random() * 0.2 - 0.1),
      duration: duration * 0.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
    gsap.to(particle.scale, { x: 4, y: 4, duration, ease: 'power1.out' });

    const timeline = gsap.timeline();
    particle.userData.timeline = timeline;
    timeline
      .to(particle.userData.lifeProgress, { val: 1, duration: duration * 0.5, ease: 'sine.inOut' })
      .to(particle.userData.lifeProgress, { val: 1, duration: duration * 0.3, ease: 'none' })
      .to(particle.userData.lifeProgress, { val: 0, duration: duration * 0.2, ease: 'sine.in' });
  }

  // Режим сопла: короткий выброс влево-вверх, затем плавное оседание.
  function animateNozzleParticle(particle, isInitial) {
    const emitter = FOG_CONFIG.emitter;
    const duration = randomBetween(emitter.durationMin, emitter.durationMax);
    const angle =
      Math.PI -
      THREE.MathUtils.degToRad(emitter.angleFromHorizontalDeg) +
      THREE.MathUtils.degToRad(randomBetween(-emitter.spreadDeg, emitter.spreadDeg));

    const ejectDistance = randomBetween(emitter.ejectDistanceMin, emitter.ejectDistanceMax);
    const apexX = particle.position.x + Math.cos(angle) * ejectDistance;
    const apexY = particle.position.y + Math.sin(angle) * ejectDistance;
    const endX = apexX - randomBetween(emitter.settleDriftMin, emitter.settleDriftMax);

    // Конец оседания привязан к доле высоты полотна, а не к мировым
    // единицам: при удлинении полотна в каталог туман доходит до зоны маски.
    const worldHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(FOG_CONFIG.fov / 2)) * camera.position.z;
    const endY = (0.5 - emitter.settleEndFraction) * worldHeight;

    gsap.killTweensOf(particle.position);
    gsap.killTweensOf(particle.rotation);
    gsap.killTweensOf(particle.scale);
    gsap.killTweensOf(particle.userData.lifeProgress);
    if (particle.userData.timeline) {
      particle.userData.timeline.kill();
      particle.userData.timeline = null;
    }

    const ejectTime = duration * 0.32;
    const settleTime = duration - ejectTime;
    const timeline = gsap.timeline({
      onComplete: () => {
        resetParticle(particle, false);
        animateParticle(particle, false);
      },
    });
    particle.userData.timeline = timeline;

    timeline
      // Выброс: обе оси с одинаковым easing — струя идёт по прямой.
      .to(particle.position, { x: apexX, duration: ejectTime, ease: 'power2.out' }, 0)
      .to(particle.position, { y: apexY, duration: ejectTime, ease: 'power2.out' }, 0)
      // Оседание: горизонталь замедляется, вертикаль ускоряется вниз.
      .to(particle.position, { x: endX, duration: settleTime, ease: 'sine.inOut' }, ejectTime)
      .to(particle.position, { y: endY, duration: settleTime, ease: 'power2.in' }, ejectTime)
      .to(
        particle.rotation,
        { z: particle.rotation.z + randomBetween(-0.5, 0.5), duration, ease: 'none' },
        0
      )
      .to(
        particle.scale,
        { x: emitter.scaleEnd, y: emitter.scaleEnd, duration, ease: 'power1.out' },
        0
      )
      .to(particle.userData.lifeProgress, { val: 1, duration: duration * 0.3, ease: 'sine.out' }, 0)
      .to(
        particle.userData.lifeProgress,
        { val: 1, duration: duration * 0.4, ease: 'none' },
        duration * 0.3
      )
      .to(
        particle.userData.lifeProgress,
        { val: 0, duration: duration * 0.3, ease: 'sine.in' },
        duration * 0.7
      );

    // Первый цикл начинаем с разной фазы — струя непрерывная, без залпа.
    if (isInitial) timeline.progress(randomBetween(0, 0.9), true);
  }

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    if (!visible || document.hidden || !renderer || !camera) return;

    const intensity = activeSettings ? activeSettings.intensity : 0;
    smokeParticles.forEach((particle) => {
      particle.material.opacity = particle.userData.lifeProgress.val * intensity;
    });
    renderer.render(scene, camera);
  }

  function start() {
    if (running || !initialized || !isFogAllowed(getThemeSettings())) return;
    layoutFog();
    running = true;
    animate();
  }

  function stop() {
    running = false;
  }

  function destroy() {
    loadToken += 1;
    stop();

    smokeParticles.forEach((particle) => {
      gsap.killTweensOf(particle.position);
      gsap.killTweensOf(particle.rotation);
      gsap.killTweensOf(particle.scale);
      gsap.killTweensOf(particle.userData.lifeProgress);
      if (particle.userData.timeline) particle.userData.timeline.kill();
      particle.material.dispose();
    });
    smokeParticles = [];

    if (smokeGeometry) {
      smokeGeometry.dispose();
      smokeGeometry = null;
    }
    if (smokeTexture) {
      smokeTexture.dispose();
      smokeTexture = null;
    }
    if (fogGroup && scene) {
      scene.remove(fogGroup);
      fogGroup = null;
    }
    if (renderer) {
      renderer.clear();
      renderer.dispose();
      renderer = null;

      // Свежий canvas гарантирует чистый WebGL-контекст при повторном
      // включении тумана (после dispose старый контекст переиспользовать нельзя).
      const freshCanvas = canvas.cloneNode(false);
      freshCanvas.removeAttribute('style');
      canvas.replaceWith(freshCanvas);
      canvas = freshCanvas;
    }

    scene = null;
    camera = null;
    activeSettings = null;
    emitterReady = false;
    initialized = false;
  }

  // Единая точка синхронизации состояния: тема, выключатель и reduced motion.
  function sync() {
    const settings = getThemeSettings();

    if (!isFogAllowed(settings)) {
      destroy();
      return;
    }

    if (!initialized) {
      init();
      return;
    }

    applyTheme(settings);
    layoutFog();
    start();
  }

  // Тема меняется классом на <body> — следим и перестраиваем туман на лету.
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Рендерим только когда полотно тумана в кадре — не тратим GPU впустую.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) {
          updateEmitterOrigin();
          start();
        } else {
          stop();
        }
      },
      { threshold: 0 }
    ).observe(container);
  }

  let scrollRaf = null;
  window.addEventListener(
    'scroll',
    () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateEmitterOrigin();
      });
    },
    { passive: true }
  );

  window.addEventListener('resize', layoutFog, false);
  window.addEventListener('load', layoutFog, { once: true });

  // Шрифты меняют высоту каталога после первой отрисовки — пересчитываем
  // границу полотна, чтобы маска не оказалась выше/ниже нужного места.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(layoutFog);
  }

  DESKTOP_MQ.addEventListener('change', sync);
  reduceMotionMQ.addEventListener('change', sync);

  if (document.hidden) stop();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  sync();
})();
