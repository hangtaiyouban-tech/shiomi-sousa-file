/* 捜査端末。外部通信なし。進行状況はこのブラウザ内にのみ保存。
 * 読み込んだ事件データ（window.CASE_DATA、なければ体験版 window.CASE0）で動く。 */
(function () {
  "use strict";
  const D = applyNames(window.CASE_DATA || window.CASE0);

  /* 名前の差し込み枠 {{NAME_n}} を、確定した名前（window.NAME_VALUES）か仮の名前で置き換える */
  function applyNames(data) {
    const slots = data.nameSlots || {};
    const values = window.NAME_VALUES || {};
    const pick = (k) => values[k] || (slots[k] && slots[k].placeholder) || k;
    const walk = (v) => typeof v === "string" ? v.replace(/\{\{(NAME_\d+)\}\}/g, (_, k) => pick(k))
      : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
    return walk(data);
  }
  const STORE_KEY = "sousa-terminal:" + D.id;

  /* ---------- 保存（使えない環境でも動くよう try/catch） ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  const state = Object.assign({ notes: "", hintsUsed: 0, viewed: [], result: null, attempts: 0 }, load());
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 保存不可でも続行 */ }
  }
  function markViewed(id) {
    if (!state.viewed.includes(id)) { state.viewed.push(id); save(); }
  }

  /* ---------- DOMヘルパー ---------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const name = (id) => (id && D.people[id] ? D.people[id].name : "照合対象外");
  const toMin = (t) => { const [a, b] = t.split(":").map(Number); return a * 60 + b; };

  function table(columns, rows, opts) {
    return h("div", { class: "table-wrap" },
      h("table", opts || {},
        h("thead", {}, h("tr", {}, columns.map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", {}, rows.map((r) => h("tr", {}, r.map((cell, i) => h("td", { class: i === 0 ? "time" : null }, cell)))))));
  }

  /* ---------- 画面 ---------- */
  const wifiRows = D.wifiRecord ? D.records.find((r) => r.id === D.wifiRecord).rows : null;
  const VIEWS = [
    ["brief", "事件概要"],
    ["evidence", "証拠品"],
    D.cameraLog ? ["camera", "防犯カメラ"] : null,
    wifiRows ? ["wifi", "Wi-Fi記録"] : null,
    ["records", "記録照会"],
    ["interviews", "聞き込み"],
    D.chat ? ["chat", "グループチャット"] : null,
    D.sns ? ["sns", "ツブヤキ"] : null,
    ["notes", "捜査メモ"],
    ["hints", "ヒント"],
    ["answer", "解答提出"],
  ].filter(Boolean);

  const render = {
    brief() {
      return [
        h("h1", {}, D.title),
        h("p", { class: "case-date", id: "caseDate" }, "事件発生日：" + dateLabel(D.date) + (D.dateNote ? "　" + D.dateNote : "")),
        h("p", { class: "muted" }, D.subtitle),
        h("div", { class: "card" }, D.briefing.map((p) => h("p", {}, p))),
        h("h2", {}, "関係者"),
        h("div", { class: "grid" }, Object.entries(D.people).map(([id, p]) =>
          h("div", { class: "card", "data-person": id },
            h("div", { class: "person" }, h("strong", {}, `${p.name}（${p.age}）`), h("span", { class: "role" }, p.kana)),
            h("p", { class: "role muted" }, p.role)))),
        h("p", {}, h("button", { class: "btn", onclick: () => go("evidence") }, "捜査を始める")),
        hasProgress() ? resetButton() : null,
      ];
    },

    evidence() {
      return [
        h("h1", {}, "証拠品"),
        h("p", { class: "muted" }, "印刷版にも同じ資料が入っています。"),
        D.evidence.map((e) => {
          markViewed(e.id);
          return h("section", { class: "card", id: "ev-" + e.id },
            h("h2", {}, `${e.id}　${e.title}`),
            e.type === "map" ? mapSvg() : null,
            e.type === "table" ? table(e.columns, e.rows) : null,
            e.body ? h("ul", {}, e.body.map((b) => h("li", {}, b))) : null,
            e.note ? h("p", { class: "muted" }, "※ " + e.note) : null);
        }),
      ];
    },

    camera() {
      const camSel = h("select", { name: "cam", id: "camSel" },
        h("option", { value: "" }, "すべて"),
        D.edges.filter((e) => e.id.startsWith("cam")).map((e) => h("option", { value: e.id }, e.label)));
      const whoSel = h("select", { name: "who", id: "whoSel" },
        h("option", { value: "" }, "すべて"),
        Object.entries(D.people).map(([id, p]) => h("option", { value: id }, p.name)),
        h("option", { value: "none" }, "照合対象外"));
      const from = h("input", { type: "time", name: "from", value: "06:00", id: "timeFrom" });
      const to = h("input", { type: "time", name: "to", value: "23:59", id: "timeTo" });
      const out = h("div", { id: "camResult" });

      function run(ev) {
        if (ev) ev.preventDefault();
        markViewed("camera");
        const f = toMin(from.value || "00:00"), t = toMin(to.value || "23:59");
        const rows = D.cameraLog.filter((c) =>
          (!camSel.value || c.cam === camSel.value) &&
          (!whoSel.value || (whoSel.value === "none" ? c.who === null : c.who === whoSel.value)) &&
          toMin(c.t) >= f && toMin(c.t) <= t);
        const camLabel = (id) => D.edges.find((e) => e.id === id).label;
        const dirLabel = (c) => c.cam === "camB"
          ? (c.dir === "in" ? "表通り→裏通り" : "裏通り→表通り")
          : (c.dir === "in" ? "商店街に入る" : "商店街から出る");
        out.replaceChildren(
          h("p", { class: "muted" }, `${rows.length} 件`),
          rows.length ? table(["時刻", "カメラ", "方向", "照合結果", "備考"],
            rows.map((c) => [c.t, camLabel(c.cam), dirLabel(c), name(c.who), c.note || ""]), { id: "camTable" })
            : h("p", {}, "該当する記録はありません。"),
          h("p", { class: "muted" }, "※ " + D.cameraNote));
      }
      const form = h("form", { class: "search", onsubmit: run },
        h("label", {}, "カメラ", camSel), h("label", {}, "人物", whoSel),
        h("label", {}, "開始", from), h("label", {}, "終了", to),
        h("button", { class: "btn", type: "submit" }, "検索"));
      setTimeout(run, 0);
      return [h("h1", {}, "防犯カメラ記録の検索"),
        h("p", { class: "muted" }, D.cameraCaption || ""), form, out];
    },

    wifi() {
      const devices = [...new Set(wifiRows.map((r) => r[1]))];
      const aps = [...new Set(wifiRows.map((r) => r[2]))];
      const devSel = h("select", { id: "wifiDev" }, h("option", { value: "" }, "すべて"), devices.map((d) => h("option", { value: d }, d)));
      const apSel = h("select", { id: "wifiAp" }, h("option", { value: "" }, "すべて"), aps.map((a) => h("option", { value: a }, a)));
      const from = h("input", { type: "time", value: D.timeline.start, id: "wifiFrom" });
      const to = h("input", { type: "time", value: D.timeline.end, id: "wifiTo" });
      const out = h("div", { id: "wifiResult" });
      const rec = D.records.find((r) => r.id === D.wifiRecord);
      function run(ev) {
        if (ev) ev.preventDefault();
        markViewed(D.wifiRecord);
        const f = toMin(from.value || "00:00"), t = toMin(to.value || "23:59");
        const rows = wifiRows.filter((r) => (!devSel.value || r[1] === devSel.value) && (!apSel.value || r[2] === apSel.value) && toMin(r[0]) >= f && toMin(r[0]) <= t);
        out.replaceChildren(h("p", { class: "muted" }, `${rows.length} 件`),
          rows.length ? table(rec.columns, rows, { id: "wifiTable" }) : h("p", {}, "該当する記録はありません。"),
          rec.note ? h("p", { class: "muted" }, "※ " + rec.note) : null);
      }
      setTimeout(run, 0);
      return [h("h1", {}, "Wi-Fi接続記録の検索"), h("p", { class: "muted" }, rec.title),
        h("form", { class: "search", onsubmit: run },
          h("label", {}, "端末", devSel), h("label", {}, "接続先", apSel),
          h("label", {}, "開始", from), h("label", {}, "終了", to),
          h("button", { class: "btn", type: "submit" }, "検索")), out];
    },

    chat() {
      markViewed("chat");
      return [h("h1", {}, D.chatTitle || "グループチャット"),
        h("p", { class: "muted" }, "住人の同意を得て提出されたトーク履歴です。"),
        h("div", { class: "card", id: "chatLog" }, D.chat.map((m) =>
          h("article", { class: "post" },
            h("div", { class: "meta" }, `${name(m.who)}・${m.t}`),
            h("p", {}, m.text))))];
    },

    records() {
      return [
        h("h1", {}, "記録照会"),
        D.records.map((r) => {
          const box = h("div", { id: "rec-" + r.id });
          const btn = h("button", { class: "btn secondary", onclick: () => {
            markViewed(r.id);
            box.replaceChildren(table(r.columns, r.rows), r.note ? h("p", { class: "muted" }, "※ " + r.note) : "");
            btn.remove();
          } }, "照会する");
          if (state.viewed.includes(r.id)) setTimeout(() => btn.click(), 0);
          return h("section", { class: "card" }, h("h2", {}, `${r.id}　${r.title}`), btn, box);
        }),
      ];
    },

    interviews() {
      return [
        h("h1", {}, "聞き込み"),
        D.suspects.map((id) => {
          markViewed("T-" + id);
          const p = D.people[id];
          return h("section", { class: "card", id: "int-" + id },
            h("div", { class: "person" }, h("h2", {}, `${p.name}（${p.age}）`), h("span", { class: "role" }, p.role)),
            D.testimonies[id].lines.map((l) => h("blockquote", {}, l)));
        }),
      ];
    },

    sns() {
      return [
        h("h1", {}, "ツブヤキ（公開投稿）"),
        h("p", { class: "muted" }, "関係者の公開アカウントの投稿です。投稿時刻はサーバー記録。"),
        h("div", { class: "card" }, D.sns.map((p) =>
          h("article", { class: "post" },
            h("div", { class: "meta" }, `${name(p.who)} ${p.handle}・${p.t}`),
            h("p", {}, p.text),
            p.media ? h("div", { class: "media" }, "画像：" + p.media) : null))),
      ];
    },

    notes() {
      const ta = h("textarea", { id: "notes", "aria-label": "捜査メモ",
        oninput: (e) => { state.notes = e.target.value; save(); } });
      ta.value = state.notes;
      return [h("h1", {}, "捜査メモ"), h("p", { class: "muted" }, "このブラウザ内にだけ保存されます。"), ta];
    },

    hints() {
      const list = h("div", { id: "hintList" });
      const btn = h("button", { class: "btn secondary", id: "hintBtn" }, "");
      function draw() {
        list.replaceChildren(...D.hints.slice(0, state.hintsUsed).map((t, i) =>
          h("div", { class: "card hint" }, h("strong", {}, `ヒント${i + 1}`), h("p", {}, t))));
        const left = D.hints.length - state.hintsUsed;
        btn.textContent = left > 0 ? `ヒント${state.hintsUsed + 1}を見る（残り${left}）` : "ヒントはこれで全部です";
        btn.disabled = left <= 0;
        updateStatus();
      }
      btn.addEventListener("click", () => { state.hintsUsed = Math.min(D.hints.length, state.hintsUsed + 1); save(); draw(); });
      draw();
      return [h("h1", {}, "ヒント"), h("p", { class: "muted" }, "ヒントを使うと評価ランクが下がります。"), list, btn];
    },

    answer() {
      const form = h("form", { id: "answerForm" });
      for (const q of D.questions) {
        form.append(h("fieldset", { id: "fs-" + q.id },
          h("legend", {}, `${q.id}　${q.text}`),
          q.options.map(([v, label]) => h("label", { class: "opt" },
            h("input", { type: q.type === "multi" ? "checkbox" : "radio", name: q.id, value: v, required: q.type === "single" }),
            label))));
      }
      const out = h("div", { id: "answerResult", "aria-live": "polite" });
      form.append(h("button", { class: "btn", type: "submit" }, "この推理で提出する"));
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const ans = Object.fromEntries(D.questions.map((q) => [q.id, q.type === "multi" ? fd.getAll(q.id) : fd.get(q.id)]));
        loadSolution().then((sol) => {
          state.attempts += 1;
          const r = grade(ans, sol, state.hintsUsed);
          if (r.solved) state.result = r;
          save();
          showResult(out, r, sol);
          updateStatus();
        }).catch(() => out.replaceChildren(h("p", {}, "正解データを読み込めませんでした。ページを再読み込みしてください。")));
      });
      return [h("h1", {}, "解答提出"), h("p", { class: "muted" }, "不正解でも何度でも提出できます。"), form, out];
    },
  };

  /* 「2026年10月13日（火）」の形にする（曜日は日付から計算） */
  function dateLabel(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${y}年${m}月${d}日（${w}）`;
  }
  window.__dateLabel = dateLabel;

  /* ---------- やり直し ---------- */
  function hasProgress() {
    return Boolean(state.result || state.hintsUsed || state.notes || state.attempts || state.viewed.length);
  }
  function resetButton() {
    // 誤操作防止のため2回押しで実行（ダイアログは使わない）
    let armed = false;
    const btn = h("button", { class: "btn secondary", id: "resetBtn", type: "button" }, "最初からやり直す");
    btn.addEventListener("click", () => {
      if (!armed) { armed = true; btn.textContent = "もう一度押すと、メモ・ヒント・結果をすべて消してやり直します"; return; }
      state.notes = ""; state.hintsUsed = 0; state.viewed = []; state.result = null; state.attempts = 0;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 保存不可でも続行 */ }
      updateStatus();
      go("brief");
    });
    return h("p", {}, btn);
  }

  /* ---------- 採点 ---------- */
  function grade(ans, sol, hintsUsed) {
    const same = (a, b) => [].concat(a || []).sort().join(",") === [].concat(b).sort().join(",");
    const marks = D.questions.map((q) => ({ id: q.id, short: q.short || q.id, bonus: !!q.bonus, ok: same(ans[q.id], sol.answers[q.id]) }));
    const q1 = marks[0].ok;
    const mainOk = marks.filter((m) => !m.bonus).every((m) => m.ok);
    let rank = null;
    if (mainOk) rank = hintsUsed === 0 ? "S" : hintsUsed === 1 ? "A" : "B";
    else if (q1) rank = "C";
    const bonus = marks.some((m) => m.bonus && m.ok);
    return { solved: q1, marks, rank, bonus, hintsUsed };
  }

  let solutionPromise = null;
  function loadSolution() {
    const key = D.id.toUpperCase() + "_SOLUTION";
    if (window[key]) return Promise.resolve(window[key]);
    if (!solutionPromise) {
      solutionPromise = new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.src = `data/${D.id}-solution.js`;
        sc.onload = () => resolve(window[key]);
        sc.onerror = () => { solutionPromise = null; reject(new Error("load failed")); };
        document.head.append(sc);
      });
    }
    return solutionPromise;
  }

  function showResult(out, r, sol) {
    if (!r.solved) {
      const reveal = h("button", { class: "btn secondary", onclick: () => {
        out.append(h("div", { class: "card" }, h("h2", {}, "解説"), sol.explanation.map((t) => h("p", {}, t))));
        reveal.remove();
      } }, "あきらめて解説を見る");
      out.replaceChildren(h("div", { class: "result ng", id: "verdict" },
        h("p", { class: "rank" }, "不正解"),
        h("p", {}, "その人物には犯行が不可能な理由があります。記録をもう一度照らし合わせてください。"),
        reveal));
      return;
    }
    const mark = (ok) => (ok ? "正解" : "不正解");
    out.replaceChildren(h("div", { class: "result ok", id: "verdict" },
      h("p", { class: "rank" }, `事件解決　ランク ${r.rank}`),
      h("ul", {},
        r.marks.map((m) => h("li", {}, `${m.bonus ? "（追加問題）" : ""}${m.short}：${mark(m.ok)}`)),
        h("li", {}, `使ったヒント：${r.hintsUsed}個`)),
      r.bonus ? h("p", { id: "bonus" }, "追加問題も正解。名探偵です。") : null),
      h("div", { class: "card" }, h("h2", {}, "解説"), sol.explanation.map((t) => h("p", {}, t))),
      D.trial ? h("div", { class: "card" }, h("h2", {}, "体験版はここまでです"),
        h("p", {}, "遊んでいただきありがとうございました。感想をお聞かせいただけると、製品版の制作に役立ちます。"),
        surveyLink(),
        window.SIGNUP_URL ? h("p", {}, h("a", { class: "btn secondary", href: window.SIGNUP_URL, target: "_blank", rel: "noopener", id: "signupLink" }, "製品版の発売のお知らせを受け取る")) : null)
        : h("div", { class: "card" }, h("h2", {}, "捜査完了"), h("p", {}, D.endText || "ご協力ありがとうございました。")));
  }

  function surveyLink() {
    const url = window.SURVEY_URL;
    return url ? h("a", { class: "btn", href: url, target: "_blank", rel: "noopener", id: "surveyLink" }, "アンケートに答える（約2分）")
      : h("p", { class: "muted", id: "surveyPending" }, "（アンケートは準備中です）");
  }

  /* ---------- 見取り図（map.js） ---------- */
  function mapSvg() {
    const svg = window.buildMapSvg(D.id);
    return svg ? h("div", { class: "map" }, svg, h("p", { class: "muted" }, D.mapLegend || "")) : null;
  }

  /* ---------- ナビゲーション ---------- */
  const tabs = document.getElementById("tabs");
  const main = document.getElementById("main");
  let current = null;

  function updateStatus() {
    const solved = state.result ? `解決済み（ランク ${state.result.rank}）` : "捜査中";
    document.getElementById("status").textContent = `${solved}・ヒント ${state.hintsUsed}/${D.hints.length}`;
  }

  function go(view) {
    if (!render[view]) view = "brief";
    current = view;
    for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.view === view));
    main.replaceChildren(...[render[view]()].flat(2));
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  for (const [id, label] of VIEWS) {
    tabs.append(h("button", { role: "tab", "data-view": id, id: "tab-" + id, onclick: () => go(id) }, label));
  }
  document.getElementById("caseTitle").textContent = D.title;
  document.getElementById("disclaimer").textContent = D.disclaimer;
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v !== current) go(v); });
  updateStatus();
  go(location.hash.slice(1) || "brief");

  window.__terminal = { grade, state }; // テスト用
})();
