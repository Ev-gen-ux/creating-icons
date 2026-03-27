"use strict";
/**
 * Процедурные иконки — единый подход:
 * — Сетка: целые координаты 0…20 (артборд 20×20 px).
 * — Прямоугольники с скруглением: cornerRadius 4, cornerSmoothing 0.6 (только при ширине и высоте ≥ 8).
 * — Обводка: strokeWeight 2, strokeCap ROUND, strokeJoin ROUND.
 * — Дуги: открытый vector path, только команды M/C, по одной кубической Безье на сегмент ≤ 90°.
 */
const VIEW = 20;
const ICON_SIZE = 20;
const ICON_COLOR = '#141414';
const CORNER_RADIUS = 4;
const CORNER_SMOOTHING = 0.6;
const STROKE_WEIGHT = 2;
const STROKE_CAP = 'ROUND';
const STROKE_JOIN = 'ROUND';
function mulberry32(seed) {
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashSeed(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
}
function randFloat(rng, min, max) {
    return min + rng() * (max - min);
}
function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return {
        r: ((n >> 16) & 255) / 255,
        g: ((n >> 8) & 255) / 255,
        b: (n & 255) / 255,
    };
}
function solidPaint() {
    return { type: 'SOLID', color: hexToRgb(ICON_COLOR) };
}
function applyStrokeStyle(node) {
    node.strokes = [solidPaint()];
    node.strokeWeight = STROKE_WEIGHT;
    node.strokeCap = STROKE_CAP;
    node.strokeJoin = STROKE_JOIN;
}
function applyRoundedRectCorners(node) {
    node.cornerRadius = CORNER_RADIUS;
    node.cornerSmoothing = CORNER_SMOOTHING;
}
/** Целочисленная координата на сетке артборда. */
function g(n) {
    return Math.round(Math.max(0, Math.min(VIEW, n)));
}
function randomSeedString() {
    const n = Math.floor(Math.random() * 0xffffffff);
    return n.toString(16).padStart(8, '0');
}
function createIconFrame() {
    const frame = figma.createFrame();
    frame.name = 'Icon';
    frame.resize(ICON_SIZE, ICON_SIZE);
    frame.fills = [];
    frame.clipsContent = false;
    return frame;
}
function appendRoundedRect(parent, x, y, w, h, mode) {
    if (w < 8 || h < 8)
        return;
    const rect = figma.createRectangle();
    rect.x = g(x);
    rect.y = g(y);
    rect.resize(w, h);
    applyRoundedRectCorners(rect);
    if (mode === 'fill') {
        rect.fills = [solidPaint()];
        rect.strokes = [];
    }
    else {
        rect.fills = [];
        applyStrokeStyle(rect);
    }
    parent.appendChild(rect);
}
function appendLine(parent, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5)
        return;
    const line = figma.createLine();
    line.resize(len, 0);
    line.strokeWeight = STROKE_WEIGHT;
    line.strokeCap = STROKE_CAP;
    line.strokes = [solidPaint()];
    line.fills = [];
    line.x = x1;
    line.y = y1;
    line.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
    parent.appendChild(line);
}
function appendCircleStroke(parent, cx, cy, diameter) {
    const d = Math.max(2, g(diameter));
    const e = figma.createEllipse();
    e.resize(d, d);
    e.x = g(cx - d / 2);
    e.y = g(cy - d / 2);
    e.fills = [];
    applyStrokeStyle(e);
    parent.appendChild(e);
}
function appendCircleFill(parent, cx, cy, diameter) {
    const d = Math.max(2, g(diameter));
    const e = figma.createEllipse();
    e.resize(d, d);
    e.x = g(cx - d / 2);
    e.y = g(cy - d / 2);
    e.strokes = [];
    e.fills = [solidPaint()];
    parent.appendChild(e);
}
/**
 * Открытая дуга окружности: кубические Безье (C), по одному сегменту на каждые ≤90°,
 * узлы на целых координатах (округление).
 */
function appendOpenArcBezierPath(parent, cx, cy, r, startRad, sweepRad) {
    const maxSeg = Math.PI / 2 - 1e-6;
    const n = Math.max(1, Math.ceil(Math.abs(sweepRad) / maxSeg));
    const step = sweepRad / n;
    let data = '';
    for (let i = 0; i < n; i++) {
        const a0 = startRad + i * step;
        const a1 = startRad + (i + 1) * step;
        const seg = cubicBezierCircularArc(cx, cy, r, a0, a1);
        if (i === 0)
            data += seg;
        else
            data += seg.replace(/^M\s+[\d.-]+\s+[\d.-]+\s+/, ' ');
    }
    const v = figma.createVector();
    v.vectorPaths = [{ windingRule: 'NONE', data }];
    v.fills = [];
    applyStrokeStyle(v);
    parent.appendChild(v);
}
/** Одна дуга окружности: одна кубическая Безье (минимум узлов для данного угла). */
function cubicBezierCircularArc(cx, cy, r, a0, a1) {
    const x0 = g(cx + r * Math.cos(a0));
    const y0 = g(cy + r * Math.sin(a0));
    const x1 = g(cx + r * Math.cos(a1));
    const y1 = g(cy + r * Math.sin(a1));
    const d = a1 - a0;
    const h = (4 / 3) * Math.tan(Math.abs(d) / 4) * r;
    const t0x = -Math.sin(a0);
    const t0y = Math.cos(a0);
    const t1x = -Math.sin(a1);
    const t1y = Math.cos(a1);
    const c1x = g(x0 + h * t0x);
    const c1y = g(y0 + h * t0y);
    const c2x = g(x1 - h * t1x);
    const c2y = g(y1 - h * t1y);
    return `M ${x0} ${y0} C ${c1x} ${c1y} ${c2x} ${c2y} ${x1} ${y1}`;
}
function appendVectorPathClosedFill(parent, data) {
    const v = figma.createVector();
    v.vectorPaths = [{ windingRule: 'NONZERO', data }];
    v.fills = [solidPaint()];
    v.strokes = [];
    parent.appendChild(v);
}
function archetypeRadiant(parent, rng) {
    const cx = 10;
    const cy = 10;
    const dCore = randInt(rng, 4, 6);
    appendCircleStroke(parent, cx, cy, dCore);
    const n = randInt(rng, 4, 7);
    const rot = randFloat(rng, 0, Math.PI / n);
    const inner = randInt(rng, 3, 5);
    const outer = randInt(rng, 8, 10);
    for (let i = 0; i < n; i++) {
        const a = rot + (i * 2 * Math.PI) / n;
        const x1 = g(cx + inner * Math.cos(a));
        const y1 = g(cy + inner * Math.sin(a));
        const x2 = g(cx + outer * Math.cos(a));
        const y2 = g(cy + outer * Math.sin(a));
        appendLine(parent, x1, y1, x2, y2);
    }
}
function archetypeBlocks(parent, rng) {
    const count = randInt(rng, 2, 3);
    for (let b = 0; b < count; b++) {
        const w = randInt(rng, 8, 12);
        const h = randInt(rng, 8, 12);
        const x = randInt(rng, 0, VIEW - w);
        const y = randInt(rng, 0, VIEW - h);
        const filled = rng() > 0.45;
        appendRoundedRect(parent, x, y, w, h, filled ? 'fill' : 'stroke');
    }
}
function archetypeNodes(parent, rng) {
    const k = randInt(rng, 3, 4);
    const pts = [];
    for (let i = 0; i < k; i++) {
        pts.push({ x: randInt(rng, 5, 15), y: randInt(rng, 5, 15) });
    }
    const edges = Math.min(k + randInt(rng, 0, 2), k * 2);
    const used = new Set();
    for (let e = 0; e < edges; e++) {
        const i = randInt(rng, 0, k - 1);
        let j = randInt(rng, 0, k - 1);
        if (j === i)
            j = (i + 1) % k;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (used.has(key))
            continue;
        used.add(key);
        const a = pts[i];
        const b = pts[j];
        appendLine(parent, a.x, a.y, b.x, b.y);
    }
    for (const p of pts) {
        appendCircleFill(parent, p.x, p.y, 4);
    }
}
function archetypeArcCorner(parent, rng) {
    const corner = randInt(rng, 0, 3);
    let cx = 10;
    let cy = 10;
    if (corner === 0) {
        cx = 4;
        cy = 4;
    }
    else if (corner === 1) {
        cx = 16;
        cy = 4;
    }
    else if (corner === 2) {
        cx = 16;
        cy = 16;
    }
    else {
        cx = 4;
        cy = 16;
    }
    const r = randInt(rng, 8, 10);
    const start = ((corner * 90 + randInt(rng, -8, 8)) * Math.PI) / 180;
    const sweep = randFloat(rng, 55, 110) * (Math.PI / 180);
    appendOpenArcBezierPath(parent, cx, cy, r, start, start + sweep);
    const mid = start + sweep / 2;
    const ir = r * 0.55;
    appendCircleFill(parent, cx + ir * Math.cos(mid), cy + ir * Math.sin(mid), 5);
}
function archetypeSplit(parent, rng) {
    const x1 = randInt(rng, 3, 8);
    const y1 = randInt(rng, 3, 8);
    const x2 = randInt(rng, 12, 18);
    const y2 = randInt(rng, 12, 18);
    appendLine(parent, x1, y1, x2, y2);
    const side = rng() > 0.5 ? 1 : -1;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * side * 5;
    const ny = (dx / len) * side * 5;
    const px = g(mx + nx);
    const py = g(my + ny);
    appendVectorPathClosedFill(parent, `M ${x1} ${y1} L ${x2} ${y2} L ${px} ${py} Z`);
}
function archetypeStack(parent, rng) {
    const ys = [randInt(rng, 5, 7), randInt(rng, 9, 11), randInt(rng, 14, 16)];
    for (let i = 0; i < 3; i++) {
        const y = ys[i];
        const w = randInt(rng, 10, 16);
        const x0 = g((VIEW - w) / 2 + randInt(rng, -1, 1));
        const filled = i === 1 && rng() > 0.35;
        if (filled) {
            appendRoundedRect(parent, x0, y - 4, w, 8, 'fill');
        }
        else {
            appendLine(parent, x0, y, x0 + w, y);
        }
    }
}
function archetypeNested(parent, rng) {
    const pad = randInt(rng, 3, 4);
    const s = VIEW - 2 * pad;
    if (s < 8)
        return;
    appendRoundedRect(parent, pad, pad, s, s, 'stroke');
    const inner = s - randInt(rng, 5, 6);
    if (inner < 8)
        return;
    const off = g((VIEW - inner) / 2 + randInt(rng, -1, 1));
    const rect = figma.createRectangle();
    rect.x = off;
    rect.y = off;
    rect.resize(inner, inner);
    applyRoundedRectCorners(rect);
    rect.fills = [];
    applyStrokeStyle(rect);
    rect.rotation = randInt(rng, -12, 12);
    parent.appendChild(rect);
}
/** Кольцо: открытый путь из кубических Безье. */
function archetypeRing(parent, rng) {
    const cx = 10;
    const cy = 10;
    const R = randInt(rng, 7, 9);
    const startDeg = randFloat(rng, 0, 360);
    const sweepDeg = randFloat(rng, 200, 300);
    const start = (startDeg * Math.PI) / 180;
    const sweep = (sweepDeg * Math.PI) / 180;
    appendOpenArcBezierPath(parent, cx, cy, R, start, sweep);
    appendCircleFill(parent, cx + randInt(rng, -2, 2), cy + randInt(rng, -2, 2), 5);
}
function buildIcon(rng) {
    const frame = createIconFrame();
    const kind = randInt(rng, 0, 7);
    switch (kind) {
        case 0:
            archetypeRadiant(frame, rng);
            break;
        case 1:
            archetypeBlocks(frame, rng);
            break;
        case 2:
            archetypeNodes(frame, rng);
            break;
        case 3:
            archetypeArcCorner(frame, rng);
            break;
        case 4:
            archetypeSplit(frame, rng);
            break;
        case 5:
            archetypeStack(frame, rng);
            break;
        case 6:
            archetypeNested(frame, rng);
            break;
        default:
            archetypeRing(frame, rng);
            break;
    }
    return frame;
}
figma.showUI(__html__, { width: 300, height: 268 });
figma.ui.onmessage = (msg) => {
    if (msg.type === 'randomSeed') {
        figma.ui.postMessage({ type: 'seed', value: randomSeedString() });
        return;
    }
    if (msg.type !== 'generate')
        return;
    const seedStr = msg.seed && msg.seed.length > 0 ? msg.seed : randomSeedString();
    const rng = mulberry32(hashSeed(seedStr));
    let node;
    try {
        node = buildIcon(rng);
    }
    catch (e) {
        figma.notify('Ошибка генерации: ' + String(e));
        return;
    }
    figma.currentPage.appendChild(node);
    node.x = figma.viewport.center.x - node.width / 2;
    node.y = figma.viewport.center.y - node.height / 2;
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    figma.ui.postMessage({ type: 'seed', value: seedStr });
    figma.notify('Иконка: сид «' + seedStr + '»');
};
