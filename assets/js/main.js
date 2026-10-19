document.addEventListener('DOMContentLoaded', () => {

  // Мобильное меню: на планшетах и телефонах навигация скрыта,
  // её открывает кнопка-бургер рядом с переключателем темы
  const navToggle = document.getElementById('navToggle');
  const premiumNav = document.getElementById('premiumNav');

  if (navToggle && premiumNav) {
    const navIcon = document.getElementById('navToggleIcon');

    const setNavOpen = (open) => {
      premiumNav.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      if (navIcon) navIcon.className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    };

    navToggle.addEventListener('click', () => {
      setNavOpen(!premiumNav.classList.contains('is-open'));
    });

    premiumNav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => setNavOpen(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) setNavOpen(false);
    });
  }
  
  // Логика главных табов (Насекомые / Грызуны)
  const tabButtons = document.querySelectorAll('.tab-nav-btn');
  const priceGrids = document.querySelectorAll('.prices-grid');

  // Сброс мини-табов карточки «Организации» на вариант по умолчанию («Базовый»)
  const resetMiniTabs = (grid) => {
    const card = grid.querySelector('.b2b-combined-card');
    if (!card) return;

    card.querySelectorAll('.mini-tab-btn').forEach(btn => btn.classList.remove('active'));
    card.querySelectorAll('.subtab-content').forEach(content => content.classList.remove('active'));

    const defaultBtn = card.querySelector('.mini-tab-btn[data-default]');
    defaultBtn.classList.add('active');
    document.getElementById(`subtab-${defaultBtn.getAttribute('data-subtab')}`).classList.add('active');
  };

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      tabButtons.forEach(btn => btn.classList.remove('active'));
      priceGrids.forEach(grid => grid.classList.remove('active'));

      button.classList.add('active');
      const grid = document.getElementById(`tab-${targetTab}`);
      grid.classList.add('active');
      resetMiniTabs(grid);
    });
  });

  // Кнопки «Расчитать стоимость» в прайсе ведут в калькулятор.
  // .prices-grid — обе вкладки прайса, .btn-mint — только расчёт, не «КП на email».
  // Карточка «Организации» (data-v2-tab) дополнительно переключает вкладку калькулятора.
  document.querySelectorAll('.prices-grid .card-btn.btn-mint').forEach(btn => {
    btn.addEventListener('click', () => {
      const v2Target = btn.getAttribute('data-v2-tab');
      if (v2Target) {
        const v2Btn = document.querySelector(`.v2-tab-btn[data-v2="${v2Target}"]`);
        if (v2Btn) {
          v2Btn.click();
          equalizeV2Panels();
        }
      }

      const calc = document.getElementById('calculator');
      if (calc) calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Логика внутренних мини-табов (Базовый / Гель) — изолированно внутри своей карточки
  document.querySelectorAll('.mini-tab-btn').forEach(miniBtn => {
    miniBtn.addEventListener('click', () => {
      const card = miniBtn.closest('.price-card');

      card.querySelectorAll('.mini-tab-btn').forEach(btn => btn.classList.remove('active'));
      card.querySelectorAll('.subtab-content').forEach(content => content.classList.remove('active'));

      miniBtn.classList.add('active');
      document.getElementById(`subtab-${miniBtn.getAttribute('data-subtab')}`).classList.add('active');
    });
  });

  // Логика вкладок альтернативного модуля v2 (Физические / Юридические лица)
  const v2Tabs = document.querySelectorAll('.v2-tab-btn');
  const v2Grids = document.querySelectorAll('.v2-grid');

  v2Tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      v2Tabs.forEach(b => b.classList.remove('active'));
      v2Grids.forEach(g => g.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`v2-${btn.getAttribute('data-v2')}`).classList.add('active');
    });
  });

  // Калькулятор для вкладки «Физические лица»
  // Цены из docs/price-new.md: насекомые / грызуны × частичная / полная.
  const v2Prices = {
      insects: { partial: { 1: 6000, 2: 7500, 3: 9000, 4: 10500, 5: 12000 },
                 full:    { 1: 7500, 2: 9000, 3: 10500, 4: 12000, 5: 13500 } },
      rodents: { partial: { 1: 5000, 2: 6000, 3: 7000, 4: 8000, 5: 9000 },
                 full:    { 1: 6000, 2: 7500, 3: 9000, 4: 10500, 5: 12000 } }
  };

  const formatRub = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';

  // Выбор кнопки внутри своего сегмента
  const activateSeg = (btn) => {
      const group = btn.closest('.v2-seg');
      group.querySelectorAll('.v2-seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
  };

  document.querySelectorAll('.v2-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
          activateSeg(btn);
          calcV2Phys();
          calcV2Biz();
      });
  });

  const calcV2Phys = () => {
      const pest = document.querySelector('.v2-seg-btn[data-pest].active').getAttribute('data-pest');
      const type = document.querySelector('.v2-seg-btn[data-type].active').getAttribute('data-type');
      const rooms = parseInt(document.querySelector('.v2-seg-btn[data-rooms].active').getAttribute('data-rooms'), 10);

      const base = v2Prices[pest][type][rooms];
      let total = base;

      document.querySelectorAll('#v2-phys .v2-check input[type="checkbox"]').forEach(cb => {
          if (!cb.checked) return;
          if (cb.dataset.gel) {
              total *= 1.2;
          } else if (cb.dataset.add) {
              total += parseInt(cb.dataset.add, 10);
          }
      });

      // Разовая обработка: −50%, но не менее 3500 (насекомые) / 2500 (грызуны)
      const once = document.querySelector('#v2-phys .v2-check input[data-once="1"]').checked;
      if (once) {
          total = Math.max(Math.round(total * 0.5), pest === 'rodents' ? 2500 : 3500);
      }

      document.getElementById('v2-total-price').textContent = formatRub(total);

      // Гарантия меняется в зависимости от типа обработки
const guarantee = once
          ? 'Гарантийное обслуживание: -'
          : type === 'full'
              ? 'Гарантийное обслуживание: 6 мес'
              : 'Повторный вызов - 50% от стоимости обработки';
      document.getElementById('v2-guarantee').textContent = guarantee;
  };

  const bizRates = [
      [200, 37], [300, 36], [400, 35], [500, 34], [600, 33],
      [700, 32], [800, 31], [900, 30], [1000, 29], [1500, 28],
      [2000, 27], [3000, 26], [4000, 25], [5000, 24], [6000, 23],
      [7000, 22], [8000, 21], [9000, 20], [10000, 19], [Infinity, 18],
  ];

  const calcV2Biz = () => {
      const area = parseFloat(document.getElementById('v2-biz-area').value);
      const totalEl = document.getElementById('v2-total-biz');
      const guaranteeEl = document.getElementById('v2-biz-guarantee');
      const bizPest = document.querySelector('#v2-biz .v2-seg-btn[data-pest].active').getAttribute('data-pest');
      const minOrder = bizPest === 'rodents' ? 5000 : 6000;
      const annual = document.querySelector('#v2-biz input[data-annual="1"]').checked;
      const orderText = annual
          ? 'Гарантийное обслуживание: 12 мес'
          : 'мин. заказ ' + minOrder.toLocaleString('ru-RU') + ' ₽';

      // Опции надбавок: только для насекомых
      const insectOnly = bizPest === 'insects';
      document.querySelectorAll('#v2-biz .v2-insect-only').forEach(label => {
          const cb = label.querySelector('input');
          if (!insectOnly) cb.checked = false;
          label.style.display = insectOnly ? '' : 'none';
      });

      if (Number.isNaN(area) || area < 0) {
          totalEl.textContent = '—';
          guaranteeEl.textContent = orderText;
          return;
      }

      let baseRate = bizRates.find(([max]) => area <= max)[1];
      let flat = 0;
      let surcharges = 0;

      document.querySelectorAll('#v2-biz input[type="checkbox"]').forEach(cb => {
          if (!cb.checked) return;
          if (cb.dataset.gel || cb.dataset.ceil || cb.dataset.complex) surcharges += 1;
          if (cb.dataset.add) flat += parseInt(cb.dataset.add, 10);
      });

      // Сначала базовая стоимость с полом, затем наценки опций всегда поверх
      const base = annual
          ? Math.max(2 * baseRate * area, bizPest === 'rodents' ? 10000 : 12000)
          : Math.max(baseRate * area, minOrder);
      const total = base * Math.pow(1.2, surcharges) + flat;
      let rateText = '₽ / м²';
      if (area > 0) {
          const perM2 = total / area;
          rateText = (perM2 % 1 === 0 ? perM2 : perM2.toFixed(1)) + ' ₽ / м²';
      }
      totalEl.textContent = formatRub(total);
      document.getElementById('v2-biz-rate').textContent = rateText;
      guaranteeEl.textContent = orderText;
  };

  document.querySelectorAll('#v2-phys .v2-check input').forEach(el => el.addEventListener('change', calcV2Phys));

  const v2BizEls = document.querySelectorAll('#v2-biz input');
  v2BizEls.forEach(el => {
      el.addEventListener('change', calcV2Biz);
      if (el.type === 'number') el.addEventListener('input', calcV2Biz);
  });
  calcV2Phys();
  calcV2Biz();

  // Выравнивание высот вкладок v2: обе панели получают общий min-height,
  // чтобы переключение не двигало блок ни на пиксель.
  const equalizeV2Panels = () => {
      const panels = Array.from(document.querySelectorAll('.v2-grid'));
      if (panels.length < 2) return;

      const activeBtn = document.querySelector('.v2-tab-btn.active');
      const activePanel = activeBtn ? document.getElementById('v2-' + activeBtn.getAttribute('data-v2')) : null;

      // Без сброса меряем прошлую зафиксированную высоту, и на ресайзе
      // min-height растёт по нарастающей
      panels.forEach(p => {
          p.style.minHeight = '';
          p.classList.add('active');
      });

      const height = Math.max(...panels.map(p => p.offsetHeight));
      panels.forEach(p => {
          p.style.minHeight = height + 'px';
          p.classList.remove('active');
      });

      if (activePanel) activePanel.classList.add('active');
  };

  equalizeV2Panels();
  window.addEventListener('load', equalizeV2Panels);

  let resizeTimer;
  window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(equalizeV2Panels, 100);
  });

  // Высота бегущей ленты = высота одной карточки объекта справа.
  // Карточки тянутся флексом/гридом, их высота в CSS не выводится —
  // поэтому меряем в JS и отдаём ленте через --b2b-marquee-h.
  const b2bTag = document.querySelector('.b2b-tag');
  const b2bMarquee = document.querySelector('.b2b-marquee');

  if (b2bTag && b2bMarquee) {
      const syncMarqueeHeight = () => {
          const h = b2bTag.getBoundingClientRect().height;
          if (h > 0) {
              b2bMarquee.style.setProperty('--b2b-marquee-h', `${h}px`);
          }
      };

      syncMarqueeHeight();
      // Наблюдаем за сеткой карточек: её высота меняется при ресайзе,
      // смене темы (шрифты/метрики) и переносах текста
      if ('ResizeObserver' in window) {
          const ro = new ResizeObserver(syncMarqueeHeight);
          ro.observe(b2bTag);
      } else {
          window.addEventListener('resize', syncMarqueeHeight);
          window.addEventListener('load', syncMarqueeHeight);
      }
  }

  // Переход по карточке вредителя: скролл к калькулятору и автовыбор
  // вкладки «Тараканы · клопы · блохи» или «Мыши · крысы».
  // Вкладку аудитории не трогаем — сохраняем последнее состояние клиента.
  // Переключаем вредителя в той панели, которая сейчас открыта у клиента.
  document.querySelectorAll('.pest-card[data-pest-target]').forEach(card => {
      card.addEventListener('click', (e) => {
          e.preventDefault();

          const pest = card.getAttribute('data-pest-target');

          // Активная вкладка аудитории: phys или biz
          const activeTab = document.querySelector('.v2-tab-btn.active');
          const audience = activeTab ? activeTab.getAttribute('data-v2') : 'phys';
          const panel = document.getElementById('v2-' + audience);

          const btn = panel
              ? panel.querySelector('.v2-seg-btn[data-pest="' + pest + '"]')
              : null;
          if (!btn) return;

          activateSeg(btn);
          calcV2Phys();
          calcV2Biz();
          equalizeV2Panels();

          const calc = document.getElementById('calculator');
          if (calc) calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
  });

  // Блок 6: FAQ-аккордеон.
  // Класс .is-open и aria-expanded ставит JS, а раскрытие и поворот
  // плюса в крестик анимируются на CSS (grid-template-rows, transform).

  // Равные свёрнутые вопросы: выравниваем по самой высокой кнопке.
  // Меряем .faq-btn, а не .faq-item — ответ у закрываемой карточки ещё
  // анимируется, и его высота ушла бы в max. Кнопка от ответа не зависит.
  const equalizeFaqCollapsed = () => {
      const btns = Array.from(document.querySelectorAll('.faq-btn'));
      if (!btns.length) return;

      // Без сброса мерять нельзя: иначе min-height прошлого цикла
      // участвует в расчёте и высота растёт по нарастающей
      btns.forEach(btn => {
          btn.style.minHeight = '';
      });

      const height = Math.max(...btns.map(btn => btn.offsetHeight));
      btns.forEach(btn => {
          btn.style.minHeight = height + 'px';
      });
  };

  equalizeFaqCollapsed();
  window.addEventListener('load', equalizeFaqCollapsed);

  let faqResizeTimer;
  window.addEventListener('resize', () => {
      clearTimeout(faqResizeTimer);
      faqResizeTimer = setTimeout(equalizeFaqCollapsed, 100);
  });

  document.querySelectorAll('.faq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
          const item = btn.closest('.faq-item');
          if (!item) return;

          const willOpen = !item.classList.contains('is-open');

          // Аккордеон: одновременно открыт только один вопрос
          item.parentElement.querySelectorAll('.faq-item.is-open').forEach(other => {
              if (other === item) return;
              other.classList.remove('is-open');
              const otherBtn = other.querySelector('.faq-btn');
              if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          });

          item.classList.toggle('is-open', willOpen);
          btn.setAttribute('aria-expanded', String(willOpen));

          // Открытая карточка вышла из пула свернутых — пересчитать равные высоты
          equalizeFaqCollapsed();
      });
  });

  // Блок 7: слайдер отзывов.
  // Прокручиваем нативным scrollBy, а не transform: лента остаётся
  // доступной для тача и трекпада, и не нужно пересчитывать сдвиг
  // при ресайзе — шаг всегда меряется по фактической карточке.
  const reviewsTrack = document.querySelector('.reviews-track');
  const reviewsPrev = document.querySelector('[data-reviews-prev]');
  const reviewsNext = document.querySelector('[data-reviews-next]');

  if (reviewsTrack && reviewsPrev && reviewsNext) {
      // Шаг = ширина карточки + зазор. columnGap, а не gap: в горизонтальной
      // оси gap отступ не ставит, и шаг вышел бы на 8px меньше нужного
      const reviewStep = () => {
          const card = reviewsTrack.querySelector('.review-card');
          if (!card) return 0;
          const gap = parseFloat(getComputedStyle(reviewsTrack).columnGap) || 0;
          return card.getBoundingClientRect().width + gap;
      };

      // Кнопки гаснут на краях ленты, чтобы не кликать в пустоту
      const syncReviewsNav = () => {
          const edge = reviewsTrack.scrollWidth - reviewsTrack.clientWidth;
          reviewsPrev.disabled = reviewsTrack.scrollLeft <= 1;
          reviewsNext.disabled = reviewsTrack.scrollLeft >= edge - 1;
      };

      const moveReviews = (direction) => {
          reviewsTrack.scrollBy({ left: direction * reviewStep(), behavior: 'smooth' });
      };

      reviewsPrev.addEventListener('click', () => moveReviews(-1));
      reviewsNext.addEventListener('click', () => moveReviews(1));

      // Скругление по краям окна, а не по краям массива: находим первую
      // карточку, чей правый край ещё внутри окна, и последнюю, чей левый
      // край ещё внутри. На экране четыре карточки из пяти, так что у
      // правого края стоит не последняя, и :last-child не подходит.
      const markReviewEdges = () => {
          const cards = Array.from(reviewsTrack.querySelectorAll('.review-card'));
          if (!cards.length) return;

          const box = reviewsTrack.getBoundingClientRect();
          let start = -1;
          let end = -1;

          cards.forEach((card, i) => {
              const rect = card.getBoundingClientRect();
              // +1px терпимости: карточка ровно встык с краем окна
              if (start === -1 && rect.right > box.left + 1) start = i;
              if (rect.left < box.right - 1) end = i;
          });

          cards.forEach((card, i) => {
              card.classList.toggle('is-edge-start', i === start);
              card.classList.toggle('is-edge-end', i === end);
          });
      };

      // Скролл приходит на каждый кадр, а разметка перечитывает геометрию
      // всех карточек — сворачиваем в один пересчёт на кадр
      let reviewFrameQueued = false;
      const queueReviewSync = () => {
          if (reviewFrameQueued) return;
          reviewFrameQueued = true;
          requestAnimationFrame(() => {
              reviewFrameQueued = false;
              syncReviewsNav();
              markReviewEdges();
          });
      };

      reviewsTrack.addEventListener('scroll', queueReviewSync, { passive: true });
      window.addEventListener('resize', queueReviewSync);

      // Класс снимает запасной вариант со :first-child и :last-child
      reviewsTrack.classList.add('is-ready');
      syncReviewsNav();
      markReviewEdges();
  }

  // Кнопка «наверх»: появляется, когда первый экран (hero) прокручен
  const toTopBtn = document.getElementById('toTopBtn');
  const heroSection = document.getElementById('hero');

  if (toTopBtn && heroSection) {
    let toTopQueued = false;
    // Базовый отступ снизу из CSS (1.5rem) — к нему возвращаемся вне подвала
    const toTopInset = parseFloat(getComputedStyle(toTopBtn).bottom) || 24;
    // Ограничитель: 601–768px футер в столбике, но нижняя строка ещё в ряд
    const toTopLimitMQ = window.matchMedia('(min-width: 601px) and (max-width: 768px)');
    const footerBlock = document.querySelector('.footer-grid');
    const footerRestEdge = document.querySelector('.footer-docs .footer-link:last-child');
    let toTopLastBottom = null;

    const syncToTop = () => {
      toTopQueued = false;
      // Показываем, когда от hero на экране остаётся не более 15% высоты окна
      const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
      const heroRemaining = heroBottom - window.scrollY;
      toTopBtn.classList.toggle('is-visible', heroRemaining <= window.innerHeight * 0.15);

      let bottom = toTopInset;
      // Ограничитель: 601–768px кнопка поднимается над нижней строкой футера
      if (toTopLimitMQ.matches && footerBlock && footerRestEdge) {
        const blockRect = footerBlock.getBoundingClientRect();
        const btnRect = toTopBtn.getBoundingClientRect();
        if (btnRect.right > blockRect.left && btnRect.left < blockRect.right) {
          const rest = window.innerHeight - footerRestEdge.getBoundingClientRect().bottom;
          if (rest > bottom) bottom = rest;
        }
      }
      if (bottom !== toTopLastBottom) {
        toTopLastBottom = bottom;
        toTopBtn.style.bottom = bottom + 'px';
      }
    };

    const queueToTopSync = () => {
      if (toTopQueued) return;
      toTopQueued = true;
      requestAnimationFrame(syncToTop);
    };

    window.addEventListener('scroll', queueToTopSync, { passive: true });
    window.addEventListener('resize', queueToTopSync);

    toTopBtn.addEventListener('click', () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    syncToTop();
  }

});
