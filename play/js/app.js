/* 捜査端末 — 体験版。外部通信なし。進行状況はこのブラウザ内にのみ保存。 */
(function () {
  "use strict";
  const D = window.CASE0;
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
  const VIEWS = [
    ["brief", "事件概要"],
    ["evidence", "証拠品"],
    ["camera", "防犯カメラ"],
    ["records", "記録照会"],
    ["interviews", "聞き込み"],
    ["sns", "ツブヤキ"],
    ["notes", "捜査メモ"],
    ["hints", "ヒント"],
    ["answer", "解答提出"],
  ];

  const render = {
    brief() {
      return [
        h("h1", {}, D.title),
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
        h("p", { class: "muted" }, "10月13日 6:00〜23:59 の通過記録（顔照合済み）"), form, out];
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
        const ans = { Q1: fd.get("Q1"), Q2: fd.get("Q2"), Q3: fd.getAll("Q3") };
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
    const q1 = ans.Q1 === sol.answers.Q1;
    const q2 = ans.Q2 === sol.answers.Q2;
    const want = [...sol.answers.Q3].sort().join(",");
    const q3 = [...ans.Q3].sort().join(",") === want;
    let rank = null;
    if (q1 && q2 && q3) rank = hintsUsed === 0 ? "S" : hintsUsed === 1 ? "A" : "B";
    else if (q1) rank = "C";
    return { solved: q1, q1, q2, q3, rank, hintsUsed };
  }

  let solutionPromise = null;
  function loadSolution() {
    if (window.CASE0_SOLUTION) return Promise.resolve(window.CASE0_SOLUTION);
    if (!solutionPromise) {
      solutionPromise = new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.src = "data/case0-solution.js";
        sc.onload = () => resolve(window.CASE0_SOLUTION);
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
        h("li", {}, `犯人：${mark(r.q1)}`),
        h("li", {}, `侵入経路：${mark(r.q2)}`),
        h("li", {}, `ウソを示す記録：${mark(r.q3)}`),
        h("li", {}, `使ったヒント：${r.hintsUsed}個`))),
      h("div", { class: "card" }, h("h2", {}, "解説"), sol.explanation.map((t) => h("p", {}, t))),
      h("div", { class: "card" }, h("h2", {}, "体験版はここまでです"),
        h("p", {}, "遊んでいただきありがとうございました。感想をお聞かせいただけると、製品版の制作に役立ちます。"),
        surveyLink()));
  }

  function surveyLink() {
    const url = window.SURVEY_URL;
    return url ? h("a", { class: "btn", href: url, target: "_blank", rel: "noopener", id: "surveyLink" }, "アンケートに答える（約2分）")
      : h("p", { class: "muted", id: "surveyPending" }, "（アンケートは準備中です）");
  }

  /* ---------- 見取り図（map.js） ---------- */
  function mapSvg() {
    return h("div", { class: "map" }, window.buildMapSvg(),
      h("p", { class: "muted" }, "●黄＝防犯カメラ　●青＝出入口（表通り側はシャッター／前扉）"));
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
