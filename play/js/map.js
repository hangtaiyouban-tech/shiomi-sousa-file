/* 現場見取り図（SVG）。捜査端末と印刷ページで共用 */
(function () {
  "use strict";
  const svgNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, text) {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (text) el.textContent = text;
    return el;
  }
  window.buildMapSvg = function () {
    const svg = s("svg", { viewBox: "0 0 640 360", role: "img", "aria-labelledby": "mapTitle mapDesc" });
    svg.append(s("title", { id: "mapTitle" }, "現場見取り図"),
      s("desc", { id: "mapDesc" }, "表通りの南側に灯台堂とミナト珈琲が並び、その裏に共用裏庭がある。裏庭の門は裏通りに面し、裏通りは東端の通路（カメラB）だけで表通りとつながる。"));
    const area = (x, y, w, hh, cls, label) => {
      svg.append(s("rect", { x, y, width: w, height: hh, class: cls, rx: 4 }));
      svg.append(s("text", { x: x + w / 2, y: y + hh / 2 + 5, "text-anchor": "middle" }, label));
    };
    area(20, 20, 600, 60, "area alley", "表通り（灯台通り商店街）");
    area(150, 100, 150, 80, "area", "灯台堂");
    area(300, 100, 150, 80, "area", "ミナト珈琲");
    area(150, 190, 300, 80, "area", "");
    svg.append(s("text", { x: 300, y: 248, "text-anchor": "middle" }, "共用裏庭（塀 2.5m）"));
    area(60, 290, 520, 50, "area alley", "裏通り（袋小路）");
    area(540, 80, 40, 210, "area alley", "");
    svg.append(s("text", { x: 560, y: 175, "text-anchor": "middle", transform: "rotate(90 560 175)" }, "通路"));
    const dot = (cx, cy, cls, label, dx = 0, dy = -10) => {
      svg.append(s("circle", { cx, cy, r: 7, class: cls }));
      svg.append(s("text", { x: cx + dx, y: cy + dy, "text-anchor": "middle" }, label));
    };
    dot(30, 50, "cam", "北口 カメラA", 50, -18);
    dot(610, 50, "cam", "南口 カメラC", -50, -18);
    dot(560, 100, "cam", "カメラB", -45, 5);
    dot(225, 100, "door", "", 0, 0);
    dot(375, 100, "door", "", 0, 0);
    dot(225, 190, "door", "灯台堂 裏口（電子錠）", 0, 24);
    dot(375, 190, "door", "カフェ裏口", 0, 24);
    dot(300, 270, "door", "門", 22, 5);
    return svg;
  };
})();
