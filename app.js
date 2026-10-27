/* Мухасаба — standalone PWA (mirrors canvas Page) */
(function () {
  "use strict";

  const STORAGE_KEY = "muhasaba-v1";
  const STEPS = ["gratitude", "good", "misses", "family", "worship", "tomorrow"];
  const PRAYERS = [
    { key: "fajr", label: "Фаджр" },
    { key: "zuhr", label: "Зухр" },
    { key: "asr", label: "Аср" },
    { key: "maghrib", label: "Магриб" },
    { key: "isha", label: "Иша" },
  ];
  const STATUS = { onTime: "Вовремя", late: "Поздно", missed: "Пропущен" };
  const PRIORITIES = ["Работа", "Семья", "Поклонение", "Внутреннее спокойствие"];
  const CHIPS = {
    gratitude: ["Семья", "Здоровье", "Работа", "Друзья", "Еда и кров", "Спокойствие", "Возможности"],
    good: ["Помог близким", "Выполнил задачу", "Проявил терпение", "Сдержал слово", "Сделал доброе дело"],
    misses: ["Отложил дело", "Был резким", "Потерял время", "Отвлёкся", "Всё нормально"],
    family: ["Всё хорошо", "Проявил заботу", "Было напряжение", "Нужно извиниться", "Держал обиду"],
  };

  const VERIFIED_LIBRARY = [
    {
      id: "quran-94-5-6-kuliev",
      kind: "ayah",
      textRu:
        "Воистину, за каждой тягостью наступает облегчение. За каждой тягостью наступает облегчение.",
      reference: "Коран 94:5–6, перевод Э. Кулиева",
      sourceUrl: "https://qoran.kz/surah/94.html",
    },
    {
      id: "quran-2-152-kuliev",
      kind: "ayah",
      textRu: "Поминайте Меня, и Я буду помнить о вас. Благодарите Меня и не будьте неблагодарны Мне.",
      reference: "Коран 2:152, перевод Э. Кулиева",
      sourceUrl: "https://qoran.kz/surah/2/152.html",
    },
    {
      id: "quran-39-53-kuliev",
      kind: "ayah",
      textRu:
        "Скажи Моим рабам, которые излишествовали во вред самим себе: «Не отчаивайтесь в милости Аллаха. Воистину, Аллах прощает грехи полностью, ибо Он — Прощающий, Милосердный».",
      reference: "Коран 39:53, перевод Э. Кулиева",
      sourceUrl: "https://qoran.kz/surah/39.html",
    },
    {
      id: "dua-istighfar-short",
      kind: "dua",
      textRu: "Астагфирул-лах («Прошу прощения у Аллаха»).",
      reference: "Формула истигфара (зикр/дуа; не цитата хадиса с номером) — Umma.ru",
      sourceUrl: "https://umma.ru/termini/istigfar",
    },
  ];
  const CLOSING_IDS = ["dua-istighfar-short", "quran-39-53-kuliev"];

  function libraryById(id) {
    return VERIFIED_LIBRARY.find((x) => x.id === id);
  }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function formatRuDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  function emptyEntry(date) {
    return {
      date,
      gratitude: [],
      goodDeeds: [],
      misses: [],
      family: "",
      prayers: { fajr: "", zuhr: "", asr: "", maghrib: "", isha: "" },
      tahajjud: false,
      quran: false,
      dhikr: false,
      priorities: [],
      customPriority: "",
      plan: "",
      savedAt: "",
    };
  }
  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
  function toggle(list, item) {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }
  function addText(list, text) {
    const t = text.trim();
    if (!t || list.includes(t)) return list;
    return [...list, t];
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const state = {
    screen: "home",
    store: {},
    entry: emptyEntry(todayKey()),
    draft: "",
    viewDate: "",
    ready: false,
  };

  function persist(next) {
    const withTime = { ...next, savedAt: new Date().toISOString() };
    state.store = { ...state.store, [withTime.date]: withTime };
    saveAll(state.store);
    state.entry = withTime;
  }

  function streakCount() {
    let count = 0;
    const keyOf = (dt) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const cursor = new Date();
    if (!state.store[keyOf(cursor)]) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      if (state.store[keyOf(cursor)]) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return count;
  }

  function fajrStats() {
    let onTime = 0;
    let missed = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const dt = new Date(d);
      dt.setDate(d.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const e = state.store[key];
      if (!e) continue;
      if (e.prayers.fajr === "onTime") onTime += 1;
      if (e.prayers.fajr === "missed") missed += 1;
    }
    return { onTime, missed };
  }

  function chipsHtml(options, selected, dataAction) {
    return `<div class="chips">${options
      .map((opt) => {
        const on = selected.includes(opt);
        return `<button type="button" class="chip${on ? " on" : ""}" data-action="${dataAction}" data-value="${esc(opt)}">${esc(opt)}</button>`;
      })
      .join("")}</div>`;
  }

  function summaryHtml(entry, closing) {
    const block = (heading, body) =>
      body
        ? `<div><div class="block-h">${esc(heading)}</div><div class="block-b">${esc(body)}</div></div>`
        : "";
    const prayers = PRAYERS.map(({ key, label }) => {
      const st = entry.prayers[key];
      return st ? `${label}: ${STATUS[st]}` : null;
    }).filter(Boolean);
    const extras = [
      entry.tahajjud ? "Тахаджуд" : null,
      entry.quran ? "Коран" : null,
      entry.dhikr ? "Зикр" : null,
    ].filter(Boolean);
    const priorities = [...entry.priorities, entry.customPriority.trim() || null].filter(Boolean);
    let closingHtml = "";
    if (closing) {
      const quotes = CLOSING_IDS.map((id) => {
        const item = libraryById(id);
        if (!item) return "";
        return `<div style="margin-bottom:12px">
          <p class="quote-text">${esc(item.textRu)}</p>
          <p class="quote-ref">${esc(item.reference)}${item.sourceUrl ? " · " + esc(item.sourceUrl) : ""}</p>
        </div>`;
      }).join("");
      closingHtml = `<div class="card quote-card">${quotes}
        <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:var(--text-secondary)">
          Совет (не фетва): ошибка → признание → истигфар → одно исправление → дальше. Мухасаба закончена. Спокойной ночи.
        </p>
        <p style="margin:10px 0 0;font-size:11px;line-height:1.4;color:var(--text-tertiary)">
          Религиозные цитаты только из проверенной библиотеки приложения, с указанием источника. Фетвы и фикх — у учёного.
        </p>
      </div>`;
    }
    return `<div>
      <h1 class="title">Итоги дня</h1>
      <p class="sub capitalize" style="margin-bottom:16px">${esc(formatRuDate(entry.date))}</p>
      <div class="card">
        ${block("Благодарность", entry.gratitude.join(" · "))}
        ${block("Добрые дела", entry.goodDeeds.join(" · "))}
        ${block("Упущения", entry.misses.join(" · "))}
        ${block("Семья и отношения", entry.family)}
        ${block("Поклонение", [...prayers, extras.length ? `Доп.: ${extras.join(", ")}` : null].filter(Boolean).join(" · "))}
        ${block("Приоритеты", priorities.join(" · "))}
        ${block("План на завтра", entry.plan)}
      </div>
      ${closingHtml}
    </div>`;
  }

  function render() {
    const root = document.getElementById("app");
    if (!state.ready) {
      root.innerHTML = `<div class="shell"><p class="sub">Загрузка…</p></div>`;
      return;
    }
    const { screen, entry, store, draft } = state;

    if (screen === "home") {
      const today = todayKey();
      const streak = streakCount();
      const fajr = fajrStats();
      const historyDates = Object.keys(store).sort((a, b) => (a < b ? 1 : -1));
      root.innerHTML = `<div class="shell">
        <div style="text-align:center;margin-bottom:24px">
          <img class="logo" src="icons/icon-192.png" alt="Мухасаба" width="96" height="96" />
          <h1 class="title" style="font-size:26px">Мухасаба</h1>
          <p class="sub">Спокойный вечерний самоотчёт перед Аллахом. 5–7 минут, без самобичевания.</p>
        </div>
        <div class="card" style="margin-bottom:14px">
          <p style="margin:0 0 4px;color:var(--text-tertiary);font-size:13px">Сегодня</p>
          <p class="capitalize" style="margin:0 0 16px;font-size:16px">${esc(formatRuDate(today))}</p>
          <button type="button" class="btn primary block" data-action="start-today">${store[today] ? "Продолжить сегодня" : "Начать мухасабу"}</button>
        </div>
        <div class="stat-row">
          <div class="card">
            <div class="stat-label">Серия дней</div>
            <div class="stat-value gold">${streak}</div>
          </div>
          <div class="card">
            <div class="stat-label">Фаджр вовремя (7 дн.)</div>
            <div class="stat-value green">${fajr.onTime}</div>
          </div>
        </div>
        ${
          fajr.missed >= 3
            ? `<div class="card soft-warn"><p style="margin:0;font-size:14px;line-height:1.5">Мягкий совет: Фаджр часто ускользает. Попробуйте лечь раньше и поставить второй будильник так, чтобы пришлось встать с кровати. Без вины — просто система.</p></div>`
            : ""
        }
        <button type="button" class="btn block" data-action="goto-history">История (${historyDates.length})</button>
        <p class="footer-note">Данные хранятся только на этом устройстве. Без аккаунта и сети. Аяты и хадисы — только из встроенной проверенной библиотеки с ссылками на источник.</p>
      </div>`;
      return;
    }

    if (screen === "history") {
      const historyDates = Object.keys(store).sort((a, b) => (a < b ? 1 : -1));
      root.innerHTML = `<div class="shell">
        <button type="button" class="link-btn" data-action="goto-home">← На главную</button>
        <h1 class="title">История</h1>
        <p class="sub" style="margin-bottom:16px">Откройте любой день, чтобы перечитать итоги.</p>
        ${
          historyDates.length === 0
            ? `<div class="card"><p style="margin:0;color:var(--text-secondary)">Пока нет записей. Начните сегодняшнюю мухасабу.</p></div>`
            : `<div style="display:flex;flex-direction:column;gap:10px">${historyDates
                .map((date) => {
                  const e = store[date];
                  const preview = e.gratitude.slice(0, 2).join(", ") || e.plan || "Запись сохранена";
                  return `<button type="button" class="card history-item" data-action="open-detail" data-date="${esc(date)}">
                    <div class="date">${esc(formatRuDate(date))}</div>
                    <div class="preview">${esc(preview)}</div>
                  </button>`;
                })
                .join("")}</div>`
        }
      </div>`;
      return;
    }

    if (screen === "detail") {
      const e = store[state.viewDate] || emptyEntry(state.viewDate);
      root.innerHTML = `<div class="shell">
        <button type="button" class="link-btn" data-action="goto-history">← К истории</button>
        ${summaryHtml(e, false)}
        ${
          state.viewDate === todayKey()
            ? `<div style="margin-top:14px"><button type="button" class="btn block" data-action="edit-today">Изменить сегодня</button></div>`
            : ""
        }
      </div>`;
      return;
    }

    if (screen === "summary") {
      root.innerHTML = `<div class="shell">
        ${summaryHtml(entry, true)}
        <div style="margin-top:16px"><button type="button" class="btn primary block" data-action="goto-home">На главную</button></div>
      </div>`;
      return;
    }

    const stepIndex = STEPS.indexOf(screen);
    const stepNum = stepIndex + 1;
    const pct = Math.round((stepNum / STEPS.length) * 100);
    const progress = `<div style="margin-bottom:16px">
      <div class="progress-meta"><span>Шаг ${stepNum} из ${STEPS.length}</span><span>${pct}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;

    const stepMeta = {
      gratitude: {
        heading: "Благодарность",
        hint: "За что сегодня благодарен Аллаху? Выберите или напишите своё.",
        next: "good",
        back: "home",
        listKey: "gratitude",
        chipKey: "gratitude",
      },
      good: {
        heading: "Добрые дела",
        hint: "Что хорошего вы сделали сегодня? Даже мелочи важны.",
        next: "misses",
        back: "gratitude",
        listKey: "goodDeeds",
        chipKey: "good",
      },
      misses: {
        heading: "Упущения",
        hint: "Где могли поступить лучше? Без самокритики — просто заметить.",
        next: "family",
        back: "good",
        listKey: "misses",
        chipKey: "misses",
      },
    };

    if (stepMeta[screen]) {
      const meta = stepMeta[screen];
      const list = entry[meta.listKey];
      const customTags = list
        .filter((x) => !CHIPS[meta.chipKey].includes(x))
        .map(
          (item) =>
            `<button type="button" class="chip tag" data-action="toggle-list" data-key="${meta.listKey}" data-value="${esc(item)}">${esc(item)} ×</button>`
        )
        .join("");
      root.innerHTML = `<div class="shell">${progress}
        <div class="card">
          <h2 class="title">${meta.heading}</h2>
          <p class="sub">${meta.hint}</p>
          ${chipsHtml(CHIPS[meta.chipKey], list, "toggle-list")}
          <div class="chips" data-key="${meta.listKey}">${customTags}</div>
          <textarea class="field" id="draft" rows="3" placeholder="Своими словами…">${esc(draft)}</textarea>
          <button type="button" class="link-btn" style="margin-top:8px;margin-bottom:0" data-action="add-draft" data-key="${meta.listKey}">+ Добавить</button>
          <div class="btn-row">
            <button type="button" class="btn" data-action="step-back" data-to="${meta.back}">Назад</button>
            <button type="button" class="btn primary" data-action="step-next" data-key="${meta.listKey}" data-to="${meta.next}">Далее</button>
          </div>
        </div>
      </div>`;
      // bind list key on chips for toggle
      root.querySelectorAll('[data-action="toggle-list"]').forEach((el) => {
        if (!el.dataset.key) el.dataset.key = meta.listKey;
      });
      return;
    }

    if (screen === "family") {
      const familySelected = entry.family ? [entry.family] : [];
      const fieldVal = CHIPS.family.includes(entry.family) ? draft : entry.family || draft;
      root.innerHTML = `<div class="shell">${progress}
        <div class="card">
          <h2 class="title">Семья и отношения</h2>
          <p class="sub">Как прошли отношения с близкими? Были ли обиды — и как с ними справились?</p>
          ${chipsHtml(CHIPS.family, familySelected, "toggle-family")}
          <textarea class="field" id="draft" rows="3" placeholder="Или опишите своими словами…">${esc(fieldVal)}</textarea>
          <div class="btn-row">
            <button type="button" class="btn" data-action="goto" data-to="misses">Назад</button>
            <button type="button" class="btn primary" data-action="family-next">Далее</button>
          </div>
        </div>
      </div>`;
      return;
    }

    if (screen === "worship") {
      const prayerBlocks = PRAYERS.map(({ key, label }) => {
        const buttons = Object.keys(STATUS)
          .map((st) => {
            const on = entry.prayers[key] === st;
            return `<button type="button" class="chip${on ? " on" : ""}" data-action="set-prayer" data-key="${key}" data-value="${st}">${STATUS[st]}</button>`;
          })
          .join("");
        return `<div><div class="prayer-label">${label}</div><div class="prayer-row">${buttons}</div></div>`;
      }).join("");
      const extras = [
        ["tahajjud", "Тахаджуд"],
        ["quran", "Коран"],
        ["dhikr", "Зикр"],
      ]
        .map(([field, label]) => {
          const on = entry[field];
          return `<button type="button" class="toggle-extra${on ? " on" : ""}" data-action="toggle-extra" data-field="${field}">${on ? "✓ " : "○ "}${label}</button>`;
        })
        .join("");
      root.innerHTML = `<div class="shell">${progress}
        <div class="card">
          <h2 class="title">Поклонение</h2>
          <p class="sub">Отметьте пять намазов. Без осуждения — просто факт.</p>
          <div style="margin-top:12px">${prayerBlocks}</div>
          <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border-subtle)">
            <p style="margin:0 0 10px;color:var(--text-secondary);font-size:14px">Дополнительно (по желанию)</p>
            ${extras}
          </div>
          <div class="btn-row">
            <button type="button" class="btn" data-action="goto" data-to="family">Назад</button>
            <button type="button" class="btn primary" data-action="goto" data-to="tomorrow">Далее</button>
          </div>
        </div>
      </div>`;
      return;
    }

    if (screen === "tomorrow") {
      root.innerHTML = `<div class="shell">${progress}
        <div class="card">
          <h2 class="title">Приоритеты на завтра</h2>
          <p class="sub">Выберите одно или несколько направлений и короткий план.</p>
          ${chipsHtml(PRIORITIES, entry.priorities, "toggle-priority")}
          <input class="field" id="customPriority" placeholder="Своё направление…" value="${esc(entry.customPriority)}" />
          <textarea class="field" id="plan" rows="3" placeholder="Одно конкретное действие на завтра…">${esc(entry.plan)}</textarea>
          <div class="btn-row">
            <button type="button" class="btn" data-action="goto" data-to="worship">Назад</button>
            <button type="button" class="btn primary" data-action="save-finish">Сохранить и итоги</button>
          </div>
        </div>
      </div>`;
      return;
    }
  }

  function readDraft() {
    const el = document.getElementById("draft");
    return el ? el.value : state.draft;
  }

  function onClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;

    if (action === "start-today") {
      const today = todayKey();
      state.entry = state.store[today] ? { ...state.store[today] } : emptyEntry(today);
      state.draft = "";
      state.screen = "gratitude";
      render();
      return;
    }
    if (action === "goto-home") {
      state.screen = "home";
      render();
      return;
    }
    if (action === "goto-history") {
      state.screen = "history";
      render();
      return;
    }
    if (action === "open-detail") {
      state.viewDate = t.dataset.date;
      state.screen = "detail";
      render();
      return;
    }
    if (action === "edit-today") {
      const e = state.store[state.viewDate] || emptyEntry(state.viewDate);
      state.entry = { ...e };
      state.screen = "gratitude";
      render();
      return;
    }
    if (action === "goto") {
      state.draft = "";
      state.screen = t.dataset.to;
      render();
      return;
    }
    if (action === "toggle-list") {
      const key = t.dataset.key;
      const value = t.dataset.value;
      state.entry = { ...state.entry, [key]: toggle(state.entry[key], value) };
      render();
      return;
    }
    if (action === "add-draft") {
      const key = t.dataset.key;
      const draft = readDraft();
      state.entry = { ...state.entry, [key]: addText(state.entry[key], draft) };
      state.draft = "";
      render();
      return;
    }
    if (action === "step-back") {
      state.draft = "";
      state.screen = t.dataset.to;
      render();
      return;
    }
    if (action === "step-next") {
      const key = t.dataset.key;
      const draft = readDraft();
      state.entry = { ...state.entry, [key]: addText(state.entry[key], draft) };
      state.draft = "";
      state.screen = t.dataset.to;
      render();
      return;
    }
    if (action === "toggle-family") {
      const v = t.dataset.value;
      state.entry = { ...state.entry, family: state.entry.family === v ? "" : v };
      state.draft = "";
      render();
      return;
    }
    if (action === "family-next") {
      const draft = readDraft();
      if (draft.trim() && !CHIPS.family.includes(draft.trim())) {
        state.entry = { ...state.entry, family: draft.trim() };
      }
      state.draft = "";
      state.screen = "worship";
      render();
      return;
    }
    if (action === "set-prayer") {
      const key = t.dataset.key;
      const value = t.dataset.value;
      const cur = state.entry.prayers[key];
      state.entry = {
        ...state.entry,
        prayers: { ...state.entry.prayers, [key]: cur === value ? "" : value },
      };
      render();
      return;
    }
    if (action === "toggle-extra") {
      const field = t.dataset.field;
      state.entry = { ...state.entry, [field]: !state.entry[field] };
      render();
      return;
    }
    if (action === "toggle-priority") {
      const v = t.dataset.value;
      state.entry = { ...state.entry, priorities: toggle(state.entry.priorities, v) };
      render();
      return;
    }
    if (action === "save-finish") {
      const custom = document.getElementById("customPriority");
      const plan = document.getElementById("plan");
      state.entry = {
        ...state.entry,
        customPriority: custom ? custom.value : state.entry.customPriority,
        plan: plan ? plan.value : state.entry.plan,
      };
      persist(state.entry);
      state.screen = "summary";
      render();
      return;
    }
  }

  function init() {
    state.store = loadAll();
    const today = todayKey();
    state.entry = state.store[today] ? { ...state.store[today] } : emptyEntry(today);
    state.ready = true;
    document.getElementById("app").addEventListener("click", onClick);
    // live draft for family textarea
    document.getElementById("app").addEventListener("input", (e) => {
      if (e.target.id === "draft" && state.screen === "family") {
        state.draft = e.target.value;
        if (!CHIPS.family.includes(e.target.value)) {
          state.entry = { ...state.entry, family: e.target.value };
        }
      }
    });
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
