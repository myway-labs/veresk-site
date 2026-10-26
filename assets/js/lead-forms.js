/* ==========================================================================
   Лид-формы: единый обработчик отправки
   HTML -> Google Apps Script (Web App) -> Google Sheet -> Telegram
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {

  // URL веб-приложения Apps Script:
  // Расширения -> Apps Script -> Развернуть -> Новое развертывание -> Веб-приложение.
  // Пока пусто — запрос не уходит, в консоли печатается ошибка конфигурации.
  const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz5GKXPTf9vZHka8svYu0FhNNFU2HqyyPngBRczAFgGtKqMq-htH86_nJK-9MxQEMH7/exec';

  // Цели Метрики: успешная заявка, клик по кнопке и ошибка отправки.
  const METRIKA_COUNTER_ID = 113806277;
  const METRIKA_GOALS = {
    lead: 'lead',
    click: 'lead_click',
    fail: 'lead_fail',
  };

  const TXT = {
    loading: 'Отправка...',
    success: 'Заявка принята! ✓',
    error: 'Ошибка отправки ✗'
  };

  const FADE_MS = 250;
  const STATE_MS = { success: 2400, error: 3000 };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* --------------------------------------------------------------------
     Маска телефона (та же схема, что у hero-инпута в index.html)
     -------------------------------------------------------------------- */
  const attachPhoneMask = (input) => {
    let digits = '';

    const render = () => {
      const slot = (digits + '__________').slice(0, 10);
      input.value = '+7 (' + slot.slice(0, 3) + ') ' + slot.slice(3, 6) + '-' + slot.slice(6, 8) + '-' + slot.slice(8, 10);
      const pos = input.value.indexOf('_');
      input.setSelectionRange(pos, pos < 0 ? input.value.length : pos);
      input.classList.toggle('lead-phone-empty', digits.length === 0);
    };

    input.addEventListener('input', () => {
      let d = input.value.replace(/\D/g, '');
      if (d.startsWith('7')) d = d.slice(1);
      digits = d.slice(0, 10);
      render();
    });

    input.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
        e.preventDefault();
        digits = digits.slice(0, -1);
        render();
      }
    });

    render();
  };

  document.querySelectorAll('.lead-phone-input').forEach(attachPhoneMask);

  /* --------------------------------------------------------------------
     Валидация контактных полей (reportValidity показывает подсказку браузера)
     -------------------------------------------------------------------- */
  const validPhone = (input) => {
    if (!input) return false;
    const d = input.value.replace(/\D/g, '');
    const ok = d.length === 10 || (d.length === 11 && d.startsWith('7'));
    input.setCustomValidity(ok ? '' : 'Введите номер телефона полностью');
    return input.reportValidity();
  };

  const validEmail = (input) => {
    if (!input) return false;
    input.setCustomValidity('');
    return input.reportValidity();
  };

  /* --------------------------------------------------------------------
     Сбор данных формы
     -------------------------------------------------------------------- */
  const activeText = (root, selector) => {
    const el = root ? root.querySelector(selector) : null;
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  };

  const checkedOptions = (root) =>
    Array.from(root.querySelectorAll('.v2-check input:checked'))
      .map((cb) => {
        const label = cb.closest('label');
        return label ? label.textContent.replace(/\s+/g, ' ').trim() : '';
      })
      .filter(Boolean);

  const meta = () => {
    const q = new URLSearchParams(window.location.search);
    const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .filter((key) => q.get(key))
      .map((key) => key.replace('utm_', '') + '=' + q.get(key))
      .join('&');
    return { page: window.location.pathname, utm };
  };

  const payload = (data) => Object.assign({ phone: '', email: '', details: '', price: '' }, meta(), data);

  // Телефон в таблицу — только цифры, международный формат: 79119876543
  const phoneDigits = (value) => {
    let d = String(value || '').replace(/\D/g, '');
    if (d.length === 10) d = '7' + d;
    if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
    return d;
  };

  // Цена — при отправке: «7 500 ₽» -> «7500» (на экране остаётся как есть)
  const priceNumber = (text) => String(text || '').replace(/[^\d.,]/g, '').replace(',', '.');

  const buildHero = (form) => payload({
    type: 'Захват лида (Hero)',
    phone: phoneDigits(form.querySelector('.cta-phone-input').value),
    details: 'Акция «-20% заказ на завтра»'
  });

  const buildCalcPhys = (root) => {
    const panel = document.getElementById('v2-phys');
    const lines = [
      'Вредители: ' + activeText(panel, '.v2-seg-btn[data-pest].active'),
      'Тип обработки: ' + activeText(panel, '.v2-seg-btn[data-type].active'),
      'Комнат: ' + activeText(panel, '.v2-seg-btn[data-rooms].active')
    ];
    const options = checkedOptions(panel);
    if (options.length) lines.push(...options);

    const guarantee = document.getElementById('v2-guarantee');
    if (guarantee) lines.push(guarantee.textContent.trim());

    return payload({
      type: 'Калькулятор · жилые помещения',
      phone: phoneDigits(root.querySelector('.lead-phone-input').value),
      details: lines.join('\n'),
      price: priceNumber(document.getElementById('v2-total-price').textContent)
    });
  };

  const buildCalcBiz = (root) => {
    const panel = document.getElementById('v2-biz');
    const area = document.getElementById('v2-biz-area');
    const lines = [
      'Вредители: ' + activeText(panel, '.v2-seg-btn[data-pest].active'),
      'Площадь: ' + (area ? area.value.trim() : '') + ' м²'
    ];
    const options = checkedOptions(panel);
    if (options.length) lines.push(...options);

    const rate = document.getElementById('v2-biz-rate');
    const guarantee = document.getElementById('v2-biz-guarantee');
    if (rate && rate.textContent.trim()) lines.push('Ставка: ' + rate.textContent.trim());
    if (guarantee) lines.push(guarantee.textContent.trim());

    return payload({
      type: 'Калькулятор · коммерция',
      email: root.querySelector('.lead-email-input').value.trim(),
      details: lines.join('\n'),
      price: priceNumber(document.getElementById('v2-total-biz').textContent)
    });
  };

  /* --------------------------------------------------------------------
     Отправка: text/plain вместо application/json — иначе браузер шлёт
     CORS-preflight OPTIONS, который Apps Script не обрабатывает
     -------------------------------------------------------------------- */
  const sendLead = async (data) => {
    if (!GOOGLE_WEB_APP_URL) {
      throw new Error('lead-forms: не задан GOOGLE_WEB_APP_URL');
    }

    const res = await fetch(GOOGLE_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('lead-forms: HTTP ' + res.status);
    return res;
  };

  /* --------------------------------------------------------------------
     Состояния кнопки: текст -> Отправка... -> Заявка принята! ✓
     -------------------------------------------------------------------- */
  const setButtonText = async (btn, html) => {
    btn.style.opacity = '0';
    await sleep(FADE_MS);
    btn.innerHTML = html;
    btn.style.opacity = '';
  };

  const trackGoal = (goal) => {
    if (typeof window.ym !== 'function') return;
    try {
      window.ym(METRIKA_COUNTER_ID, 'reachGoal', goal);
    } catch (err) {
      console.warn('[metrika] reachGoal не отправлен:', goal, err);
    }
  };

  const runLead = async (btn, data) => {
    if (btn.dataset.busy === '1') return false;
    btn.dataset.busy = '1';

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');

    let sent = false;

    try {
      await setButtonText(btn, TXT.loading);
      await sendLead(data);
      sent = true;
      trackGoal(METRIKA_GOALS.lead);

      await setButtonText(btn, TXT.success);
      btn.classList.remove('is-loading');
      btn.classList.add('is-success');
      await sleep(STATE_MS.success);
    } catch (err) {
      console.error(err);
      if (!sent) trackGoal(METRIKA_GOALS.fail);
      await setButtonText(btn, TXT.error);
      btn.classList.remove('is-loading');
      btn.classList.add('is-error');
      await sleep(STATE_MS.error);
    } finally {
      btn.classList.remove('is-success', 'is-error');
      await setButtonText(btn, original);
      btn.disabled = false;
      delete btn.dataset.busy;
    }

    return sent;
  };

  /* --------------------------------------------------------------------
     Обработчики
     -------------------------------------------------------------------- */
  const heroForm = document.querySelector('.cta-form[data-lead]');
  if (heroForm) {
    // Кнопка не должна менять размер при смене текста состояния.
    // Исходная подпись «Зафиксировать цену» — самая широкая, фиксируем по ней;
    // пересчёт после загрузки шрифтов, если вернём Google Fonts.
    const heroBtn = heroForm.querySelector('button[type="submit"]');
    const lockHeroBtnWidth = () => {
      if (!heroBtn) return;
      heroBtn.style.minWidth = '';
      heroBtn.style.minWidth = Math.ceil(heroBtn.getBoundingClientRect().width) + 'px';
    };
    lockHeroBtnWidth();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockHeroBtnWidth);

    heroForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validPhone(heroForm.querySelector('.cta-phone-input'))) return;

      const sent = await runLead(heroForm.querySelector('button[type="submit"]'), buildHero(heroForm));
      if (!sent) return;
    });
  }

  // Клик по любой лид-кнопке — верхняя ступень воронки.
  document.querySelectorAll('.js-lead').forEach((btn) => {
    btn.addEventListener('click', () => trackGoal(METRIKA_GOALS.click));
  });

  const builders = {
    'calc-phys': (btn) => ({ root: btn.closest('.v2-calc'), build: buildCalcPhys, check: (root) => validPhone(root.querySelector('.lead-phone-input')) }),
    'calc-biz': (btn) => ({ root: btn.closest('.v2-calc'), build: buildCalcBiz, check: (root) => validEmail(root.querySelector('.lead-email-input')) })
  };

  document.querySelectorAll('button[data-lead]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.getAttribute('data-lead');
      const setup = builders[kind];
      if (!setup) return;

      const { root, build, check } = setup(btn);
      if (!root || !check(root)) return;

      await runLead(btn, build(root));
    });
  });

});
