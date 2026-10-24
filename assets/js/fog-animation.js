// ============================================================================
// ТУМАН В HERO (WebGL / three.js + GSAP)
// ----------------------------------------------------------------------------
// Взято из внешнего CodePen-примера и адаптировано под статику проекта:
//   - three.js и gsap подключены ЛОКАЛЬНО (assets/vendor-*), без CDN;
//   - текстура дыма лежит локально, путь задаётся в FOG_CONFIG;
//   - рендерер посажен в собственный контейнер (.fog-field-container), а не
//     в document.body во весь экран;
//   - декоративный текст «THE FOG» и слайдеры из примера убраны;
//   - все регулировки собраны в объект FOG_CONFIG.
//
// Включение/выключение и параметры тумана задаются ОТДЕЛЬНО для светлой и
// тёмной темы: тема определяется классом .dark-theme на <body> (его ставит
// инлайн-скрипт в index.html). Смена темы применяется на лету: цвет и
// интенсивность обновляются без перезапуска, а при enabled: false сцена
// полностью освобождает GPU-ресурсы.
// ============================================================================

(function () {
  const container = document.querySelector('.fog-field-container');
  let canvas = document.getElementById('fogFieldCanvas');

  if (!container || !canvas || typeof THREE === 'undefined' || typeof gsap === 'undefined') {
    return;
  }

  const DARK_THEME_CLASS = 'dark-theme';
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
        intensity: 0.05,
      },
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
  let initialized = false;
  let loadToken = 0;
  let running = false;
  let visible = true;

  function getThemeName() {
    return document.body.classList.contains(DARK_THEME_CLASS) ? 'dark' : 'light';
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

    sizeRenderer();

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

    for (let index = 0; index < FOG_CONFIG.particleCount; index += 1) {
      const particle = new THREE.Mesh(smokeGeometry, material.clone());
      particle.userData.lifeProgress = { val: 0 };
      resetParticle(particle, true);
      fogGroup.add(particle);
      smokeParticles.push(particle);
      animateParticle(particle);
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

  // Адаптировано: туман опускается сверху на траву (в исходнике поднимался).
  function resetParticle(particle, isInitial) {
    particle.position.set(
      Math.random() * 1600 - 800,
      isInitial ? Math.random() * 1200 - 600 : 1000,
      Math.random() * 500
    );
    particle.rotation.z = Math.random() * Math.PI * 2;
    particle.scale.set(0.6, 0.6, 1);
    particle.userData.lifeProgress.val = 0;
    particle.material.opacity = 0;
  }

  function animateParticle(particle) {
    const duration = 30 + Math.random() * 15;

    // Частица переиспользуется: старый бесконечный твин вращения нужно снять,
    // иначе на каждую жизнь накапливается ещё один конкурирующий твин.
    gsap.killTweensOf(particle.rotation);

    gsap.to(particle.position, {
      y: -800,
      x: particle.position.x + (Math.random() * 200 - 100),
      duration,
      ease: 'none',
      onComplete: () => {
        resetParticle(particle, false);
        animateParticle(particle);
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

    // Нарастание → плато → затухание. Плотность держим дольше, чтобы туман
    // был виден у травы, а не только в середине пути.
    const timeline = gsap.timeline();
    particle.userData.timeline = timeline;
    timeline
      .to(particle.userData.lifeProgress, { val: 1, duration: duration * 0.5, ease: 'sine.inOut' })
      .to(particle.userData.lifeProgress, { val: 1, duration: duration * 0.3, ease: 'none' })
      .to(particle.userData.lifeProgress, { val: 0, duration: duration * 0.2, ease: 'sine.in' });
  }

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    if (!visible || document.hidden || !renderer) return;

    const intensity = activeSettings ? activeSettings.intensity : 0;
    smokeParticles.forEach((particle) => {
      particle.material.opacity = particle.userData.lifeProgress.val * intensity;
    });
    renderer.render(scene, camera);
  }

  function start() {
    if (running || !initialized || !isFogAllowed(getThemeSettings())) return;
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
    start();
  }

  // Тема меняется классом на <body> — следим и перестраиваем туман на лету.
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Рендерим только когда hero-блок в кадре — не тратим GPU впустую.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0 }
    ).observe(container);
  }

  window.addEventListener('resize', sizeRenderer, false);

  reduceMotionMQ.addEventListener('change', sync);

  if (document.hidden) stop();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  sync();
})();
