// ============================================================================
// ТУМАН В HERO (WebGL / three.js + GSAP)
// ----------------------------------------------------------------------------
// Взято из внешнего CodePen-примера и адаптировано под статику проекта:
//   - three.js и gsap подключены ЛОКАЛЬНО (assets/vendor-*), без CDN;
//   - текстура дыма лежит локально (assets/img/fog/Smoke-Element.png);
//   - рендерер посажен в собственный контейнер (.fog-field-container), а не
//     в document.body во весь экран;
//   - декоративный текст «THE FOG» и слайдеры из примера убраны;
//   - все регулировки собраны в объект FOG_CONFIG (п.3 ТЗ).
//
// Этап 1: только интеграция. Физика движения (resetParticle/animateParticle)
// перенесена БЕЗ правок — дым ведёт себя как в исходнике (поднимается вверх).
// Направление/слои/точку старта правим отдельным этапом.
// ============================================================================

(function () {
  const container = document.querySelector('.fog-field-container');
  const canvas = document.getElementById('fogFieldCanvas');

  if (!container || !canvas || typeof THREE === 'undefined' || typeof gsap === 'undefined') {
    return;
  }

  // ==== РЕГУЛИРОВКИ (соответствуют слайдерам исходного примера) ====
  const FOG_CONFIG = {
    // Atmosphere (было hueSlider 0..360). Цвет текстуры дыма.
    color: 0x00dddd,
    // Intensity (было intensitySlider 0..1). Максимальная плотность частиц.
    intensity: 0.1,
    // Text Depth (было depthSlider) — в примере двигал слой текста, у нас
    // группа без текста; оставлено как позиция слоя по Z.
    groupDepth: -200,
    // Прочие константы исходника.
    particleCount: 60,
    planeSize: 500,
    cameraZ: 1000,
    fov: 75,
    texturePath: 'assets/img/fog/Smoke-Element.png',
  };

  let camera, scene, renderer;
  const smokeParticles = [];
  const baseColor = new THREE.Color(FOG_CONFIG.color);
  const intensityObj = { value: FOG_CONFIG.intensity };
  const fogGroup = new THREE.Group();
  let running = false;
  let visible = true;

  function sizeRenderer() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function init() {
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const light = new THREE.DirectionalLight(0xffffff, 0.7);
    light.position.set(-1, 0, 1);
    scene.add(light);

    fogGroup.position.z = FOG_CONFIG.groupDepth;
    scene.add(fogGroup);

    sizeRenderer();

    const loader = new THREE.TextureLoader();
    const smokeGeo = new THREE.PlaneGeometry(FOG_CONFIG.planeSize, FOG_CONFIG.planeSize);

    loader.load(FOG_CONFIG.texturePath, (texture) => {
      const smokeMaterial = new THREE.MeshLambertMaterial({
        color: baseColor,
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // В исходнике THREE.ScreenBlending не существует в three.js, поэтому
        // материал фактически работал с обычным смешиванием. Оставляем его.
        blending: THREE.NormalBlending,
      });

      for (let p = 0; p < FOG_CONFIG.particleCount; p++) {
        const particle = new THREE.Mesh(smokeGeo, smokeMaterial.clone());
        particle.userData.lifeProgress = { val: 0 };
        resetParticle(particle, true);
        fogGroup.add(particle);
        smokeParticles.push(particle);
        animateParticle(particle);
      }
    });

    window.addEventListener('resize', sizeRenderer, false);
  }

  // ПЕРЕНЕСЕНО БЕЗ ПРАВОК из исходника.
  function resetParticle(p, isInitial) {
    p.position.set(
      Math.random() * 1600 - 800,
      isInitial ? (Math.random() * 1200 - 600) : -800,
      Math.random() * 500
    );
    p.rotation.z = Math.random() * Math.PI * 2;
    p.scale.set(0.6, 0.6, 1);
    p.userData.lifeProgress.val = 0;
    p.material.opacity = 0;
  }

  // ПЕРЕНЕСЕНО БЕЗ ПРАВОК из исходника.
  function animateParticle(p) {
    const duration = 30 + Math.random() * 15;
    gsap.to(p.position, {
      y: 1000,
      x: p.position.x + (Math.random() * 200 - 100),
      duration: duration,
      ease: 'none',
      onComplete: () => {
        resetParticle(p, false);
        animateParticle(p);
      },
    });
    gsap.to(p.rotation, {
      z: p.rotation.z + (Math.random() * 0.2 - 0.1),
      duration: duration * 0.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
    gsap.to(p.scale, { x: 4, y: 4, duration: duration, ease: 'power1.out' });

    const tl = gsap.timeline({
      onUpdate: () => {
        p.material.opacity = p.userData.lifeProgress.val * intensityObj.value;
      },
    });
    tl.to(p.userData.lifeProgress, { val: 1, duration: duration * 0.4, ease: 'sine.inOut' })
      .to(p.userData.lifeProgress, { val: 0, duration: duration * 0.6, ease: 'sine.in' });
  }

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    if (!visible || document.hidden) return;

    smokeParticles.forEach((p) => {
      p.material.opacity = p.userData.lifeProgress.val * intensityObj.value;
    });
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    animate();
  }

  function stop() {
    running = false;
  }

  // Рендерим только когда hero-блок в кадре — не тратим GPU впустую.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
      },
      { threshold: 0 }
    ).observe(container);
  } else {
    visible = true;
    start();
  }

  init();
  start();

  if (document.hidden) stop();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
})();
