/* Ship Dash — vector fleet. Shared by gameplay, shop, races and Echo.
 * All silhouettes face +x, in the original ~30-unit cosmetic footprint.
 * Cached paths, restrained outlines and time-based motion stay crisp at any scale.
 */
(function () {
  "use strict";
  const TAU = Math.PI * 2, INK = "#17243b", paths = new Map();
  const ENGINES = new Set(["dart", "saucer", "rocket", "stealth", "neon", "robot", "rainbow", "alien", "gold"]);
  function path(c, d, fill, stroke = INK, width = 1) {
    let p = paths.get(d);
    if (!p) { p = new Path2D(d); paths.set(d, p); }
    if (fill) { c.fillStyle = fill; c.fill(p); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(p); }
  }
  function oval(c, x, y, rx, ry, fill, stroke, rot = 0) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.85; c.stroke(); }
  }
  function shade(c, top, mid, bottom, y0 = -12, y1 = 12) {
    const g = c.createLinearGradient(-5, y0, 5, y1);
    g.addColorStop(0, top); g.addColorStop(0.48, mid); g.addColorStop(1, bottom); return g;
  }
  function eye(c, x, y, r = 1.8) {
    oval(c, x, y, r, r * 1.12, INK);
    oval(c, x + r * 0.22, y - r * 0.33, r * 0.34, r * 0.34, "#fff");
  }
  function glint(c, x, y, r, t) {
    c.save(); c.translate(x, y); c.scale(r, r); c.globalAlpha *= 0.5 + 0.5 * Math.sin(t * 3) ** 2;
    path(c, "M0 -1 Q.15 -.15 1 0 Q.15 .15 0 1 Q-.15 .15 -1 0 Q-.15 -.15 0 -1", "#fff", null); c.restore();
  }
  function glass(c, x, y, rx, ry) {
    oval(c, x, y, rx + 0.8, ry + 0.8, "#e9f9ff", INK);
    oval(c, x, y, rx, ry, shade(c, "#b4ffff", "#37bddd", "#154773", y - ry, y + ry));
    oval(c, x - rx * 0.25, y - ry * 0.3, rx * 0.45, ry * 0.2, "#e7ffff", null, -0.4);
  }
  function paint(c, skin, thrusting, t = 0) {
    c.save(); c.lineJoin = "round"; c.lineCap = "round"; c.shadowBlur = 0;
    const wave = Math.sin(t * 5), flutter = Math.sin(t * 14);
    if (thrusting && ENGINES.has(skin.id)) {
      const len = 12 + 3 * Math.sin(t * 37) + 2 * Math.sin(t * 61);
      c.save(); c.translate(-11, 0); c.scale(len / 14, 1);
      path(c, "M2 -3 Q-6 -6 -17 0 Q-6 6 2 3Z", shade(c, skin.trail, skin.flame, skin.trail, -4, 4), null);
      path(c, "M1 -1.5 Q-4 -2 -11 0 Q-4 2 1 1.5Z", "#f3ffff", null); c.restore();
    }
    switch (skin.id) {
      case "dart":
        path(c, "M-6 -3 L-15 -11 -11 -1 -15 11 -6 3Z", "#16869f");
        path(c, "M18 0 L-12 -8 -6 0 -12 8Z", shade(c, "#d3ffff", "#43daeb", "#167697"));
        path(c, "M-6 0 L18 0 -12 8Z", "#2088ad", null);
        path(c, "M-9 -6 L11 -1", null, "#ddffff", 0.9);
        glass(c, 1, -1, 3.8, 2.2); break;
      case "saucer":
        oval(c, -1, 4, 16, 6, shade(c, "#e0ffe3", "#7bba8b", "#285567"), INK);
        path(c, "M-10 1 C-10 -15 8 -15 9 1Z", shade(c, "#edffff", "#86e6de", "#34828d"));
        path(c, "M-7 -3 Q-6 -9 0 -9", null, "#fff", 1.3);
        oval(c, -1, 2, 16, 3, "#9fedaa", INK);
        for (let i = 0; i < 5; i++) oval(c, -12 + i * 5.5, 3.5, 1.2, 0.9, Math.sin(t * 5 + i) > 0 ? "#fffbc1" : "#409580");
        path(c, "M-10 7 Q0 10 10 7", null, "#c2ffd6", 0.8); break;
      case "rocket":
        path(c, "M-7 -5 Q-12 -13 -17 -11 L-14 -2 M-7 5 Q-12 13 -17 11 L-14 2", "#ed546c");
        path(c, "M-13 -5 L-13 5 -8 6 -8 -6Z", "#53657b");
        path(c, "M-10 -7 Q8 -10 18 0 Q8 10 -10 7Z", shade(c, "#fff", "#edf2f9", "#8cacca"));
        path(c, "M9 -6 Q15 -4 18 0 Q15 4 9 6 Q12 0 9 -6Z", "#ff6373");
        path(c, "M-8 -5 L5 -5", null, "#fff", 1.1); glass(c, 1, 0, 3.5, 3.5);
        path(c, "M-9 1 L-3 1 -10 10Z", "#f34e67"); break;
      case "stealth":
        path(c, "M18 0 L-14 -13 -9 -2 -14 0 -9 2 -14 13Z", shade(c, "#8a81bd", "#423c69", "#202c49"), "#b6a7ef");
        path(c, "M18 0 L-9 2 -14 13Z", "#32264d", null);
        path(c, "M-12 -10 L-2 -3 13 0 M-12 10 L-2 3", null, "#a77bfc", 0.8);
        path(c, "M1 -2 L10 0 1 2 -2 0Z", "#c0e9ff", null); break;
      case "star": {
        const d = "M0 -15 L4.5 -5 15 -4 7 3 9 14 0 8 -9 14 -7 3 -15 -4 -4.5 -5Z";
        path(c, d, shade(c, "#fff9cb", "#ffd45a", "#ed942e"), "#8c521e");
        path(c, "M0 -12 L2 -5 -2 -3 -10 -4 -4 -6Z", "#fff4ac", null);
        eye(c, -3.5, 0, 1.4); eye(c, 3.5, 0, 1.4);
        path(c, "M-2 4 Q0 6 2 4", null, "#965127", 0.9); glint(c, 9, -8, 2, t); break;
      }
      case "ghost":
        c.save(); c.scale(1, 1 + wave * 0.025);
        path(c, "M-12 11 L-12 -1 C-12 -17 12 -17 12 -1 L13 10 Q8 7 6 12 Q1 9 -2 12 Q-7 8 -12 11Z", shade(c, "#fff", "#daedff", "#859fe9"), "#9dc2ee");
        path(c, "M-8 -3 Q-8 -9 -3 -10", null, "#fff", 1.4);
        eye(c, 1, -2, 2); eye(c, 8, -2, 2); oval(c, 5, 4, 1.6, 2, "#697daf");
        oval(c, -2, 3, 2, 1, "#f1b7df"); c.restore(); break;
      case "neon":
        path(c, "M17 0 L-13 -11 -7 0 -13 11Z", "#261a45", "#fb66e0", 2);
        path(c, "M11 0 L-8 -7 -4 0 -8 7Z", null, "#ffc8f3", 0.65);
        path(c, "M-4 0 L8 0", null, "#77f5ff", 1.5);
        oval(c, -10, 0, 1.3, 1.3, "#eaffff"); break;
      case "bee":
        c.save(); c.translate(-3, -6); c.rotate(-0.3 + flutter * 0.25);
        oval(c, -1, -4, 5, 7, "#d8f7ff", "#8cbdd2"); oval(c, 4, -3, 4, 6, "#effcff", "#8cbdd2"); c.restore();
        path(c, "M-12 -2 L-18 0 -12 2Z", INK);
        oval(c, -1, 1, 12, 8, shade(c, "#fff3a0", "#ffd04a", "#d99129"), INK);
        c.save(); c.beginPath(); c.ellipse(-1, 1, 12, 8, 0, 0, TAU); c.clip();
        path(c, "M-8 -8 Q-4 0 -8 10 M-1 -8 Q3 0 -1 10", null, "#443b42", 3.4); c.restore();
        oval(c, 9, 0, 5, 5.8, "#ffdb61", INK); eye(c, 11, -1, 1.5);
        path(c, "M8 -5 Q6 -11 10 -10", null, INK, 0.9); oval(c, 10, -10, 1.1, 1.1, INK);
        oval(c, 12, 2, 1.3, 0.8, "#f28e74"); break;
      case "crystal":
        path(c, "M-15 0 L-5 -11 7 -9 16 0 6 10 -6 10Z", "#66dfee", "#d1ffff");
        path(c, "M-15 0 L-5 -11 -2 -2Z", "#b8ffff", null);
        path(c, "M-5 -11 L7 -9 -2 -2Z", "#efffff", null);
        path(c, "M7 -9 L16 0 4 3 -2 -2Z", "#76cbff", null);
        path(c, "M-15 0 L-6 10 -2 -2Z", "#3fb7bc", null);
        path(c, "M-2 -2 L4 3 6 10 -6 10Z", "#387eae", null);
        path(c, "M16 0 L6 10 4 3Z", "#a3f7ee", null);
        path(c, "M-5 -11 L-2 -2 4 3 16 0 M-2 -2 L-6 10", null, "#d4ffff", 0.7); glint(c, 7, -8, 2.5, t); break;
      case "phoenix":
        path(c, "M-3 -2 Q-15 -10 -20 -4 L-13 0 -21 5 Q-10 9 1 4Z", shade(c, "#ffce54", "#f87635", "#d53750"));
        c.save(); c.rotate(wave * 0.07);
        path(c, "M0 3 Q-12 -3 -13 -16 Q-7 -10 -2 -11 L-3 -7 3 -8 Q10 -1 4 5Z", "#ef6935");
        path(c, "M-10 -12 Q-6 -1 3 3 M-5 -9 Q-2 -2 4 1", null, "#ffd56a", 1.3); c.restore();
        path(c, "M-8 3 Q0 -4 7 -6 Q13 -8 13 -1 L18 1 12 3 Q4 12 -8 3Z", shade(c, "#fff09a", "#ffbd40", "#ec6f27"));
        path(c, "M6 -6 L4 -11 10 -7", "#f47337"); eye(c, 10, -2, 1.35);
        path(c, "M13 0 L18 1 13 2", "#633646", null); break;
      case "kitty":
        path(c, "M-8 5 Q-20 8 -17 -3 Q-15 -7 -13 -3", null, "#be739e", 3.2);
        path(c, "M-10 -3 L-11 -14 -3 -9 Q1 -11 5 -8 L12 -13 12 -2 Q17 12 2 12 Q-13 12 -10 -3Z", shade(c, "#ffe9f4", "#f5b6d2", "#be739e"));
        path(c, "M-8 -5 L-9 -10 -4 -7 M7 -6 L10 -10 10 -4", "#e685b2", null);
        path(c, "M-3 -8 L-2 -5 M1 -9 L2 -6", null, "#bc759e", 1.1);
        eye(c, 0, 0, 1.8); eye(c, 8, 0, 1.8);
        path(c, "M3 3 L6 3 4.5 4.5Z", "#995077", null);
        path(c, "M4.5 4.5 Q2 7 1 5 M4.5 4.5 Q7 7 8 5 M-2 3 L-9 2 M-2 5 L-8 6 M10 3 L16 2 M10 5 L16 6", null, "#76445f", 0.7); break;
      case "heart":
        c.save(); c.rotate(wave * 0.06);
        path(c, "M-5 3 Q-17 -1 -17 -12 L-12 -8 -12 -13 Q-5 -10 -3 -4 M5 3 Q17 -1 17 -12 L12 -8 12 -13 Q5 -10 3 -4", "#f1f6ff", "#a2b5d6"); c.restore();
        path(c, "M0 12 C-25 -3 -7 -17 0 -7 C7 -17 25 -3 0 12Z", shade(c, "#ffd1e0", "#fa699e", "#c83067"), "#8d335b");
        path(c, "M-9 -3 Q-9 -8 -5 -7", null, "#fff0f6", 1.6); glint(c, 6, 0, 1.7, t); break;
      case "robot":
        path(c, "M-1 -10 L-3 -16", null, "#9caed0", 1.5); oval(c, -3, -16, 2, 2, "#ffce67", INK);
        path(c, "M-12 -5 L-15 -5 -15 5 -12 5 M12 -5 L15 -5 15 5 12 5", "#678bab");
        path(c, "M-7 -11 H7 Q12 -11 12 -6 V7 Q12 11 7 11 H-7 Q-12 11 -12 7 V-6 Q-12 -11 -7 -11Z", shade(c, "#e5f8ff", "#98bed8", "#526d9b"));
        path(c, "M-6 -6 H7 Q9 -6 9 -3 V2 Q9 5 6 5 H-6 Q-9 5 -9 2 V-3 Q-9 -6 -6 -6Z", "#163147", "#ceeaff", 0.65);
        oval(c, -3, -1, 1.5, 2.5, "#7fffee"); oval(c, 5, -1, 1.5, 2.5, "#7fffee");
        path(c, "M-3 8 H4", null, "#e5f8ff", 1); oval(c, -8, 8, 0.8, 0.8, "#ffcc67"); break;
      case "dino":
        path(c, "M-7 -5 L-12 -10 -12 -3 -17 -6 -15 2 -19 5 -8 9Z", "#419861");
        path(c, "M-9 8 Q-12 -2 -4 -8 Q6 -13 14 -6 L15 1 7 2 13 5 Q10 10 -1 10Z", shade(c, "#d0f59d", "#80cc68", "#449b65"));
        path(c, "M-1 5 Q3 9 10 6", null, "#cae99b", 2.8);
        path(c, "M7 2 L8 5 10 2 M11 2 L12 4 14 1", "#fff7dd", null);
        eye(c, 5, -4, 2); oval(c, 12, -3, 0.8, 0.8, "#377250");
        oval(c, -6, 0, 1.4, 1, "#519f62"); oval(c, -3, 3, 1, 0.8, "#519f62"); break;
      case "shark":
        path(c, "M-10 0 L-20 -10 -17 0 -19 7Z M-5 -5 L-2 -16 5 -6Z", "#57778f");
        path(c, "M-14 0 Q-3 -11 9 -6 L18 0 Q8 12 -5 6Z", shade(c, "#b6ceda", "#7398ad", "#456880"));
        path(c, "M-9 2 Q6 5 18 0 Q8 12 -5 6Z", "#e0eaf0", null);
        path(c, "M5 2 L16 1 Q11 8 5 2Z", "#27364c", null);
        path(c, "M7 2 L8 4 9 2 M11 2 L12 4 13 1.5", "#fff", null);
        path(c, "M-1 4 L-5 11 4 6Z", "#527d96");
        path(c, "M-3 -2 L-4 2 M0 -2 L-1 2 M3 -2 L2 1", null, "#345067", 0.8);
        eye(c, 9, -2.5, 1.25); path(c, "M7 -5 L11 -3.5", null, "#345067", 1); break;
      case "dragon":
        path(c, "M-6 5 Q-19 11 -18 2", null, "#37957f", 3);
        c.save(); c.rotate(wave * 0.07);
        path(c, "M-3 4 L-16 -13 -13 -1 -17 -3 -11 7 -8 2Z", "#367b78");
        path(c, "M-4 3 L-13 -8 -10 1 -13 0 -10 5Z", "#91d49c", null); c.restore();
        path(c, "M-6 -6 Q4 -10 9 -5 L15 -3 15 2 8 3 Q10 9 3 9 Q-7 9 -6 -6Z", shade(c, "#acf0b5", "#53c098", "#2c817d"));
        path(c, "M-3 -7 L-2 -14 2 -8 M3 -7 L6 -12 6 -6", "#ffe2a7");
        path(c, "M2 5 Q4 7 7 5", null, "#d5e8a8", 2.3); eye(c, 6, -3, 1.6); oval(c, 13, -1, 0.8, 0.8, "#26615b");
        path(c, "M10 3 L11 5 12 3", "#fff4d0", null); break;
      case "rainbow": {
        const g = c.createLinearGradient(-10, -10, 10, 10);
        ["#ff749c", "#ffd96d", "#92ecc5", "#7bc8ff", "#bc86f5"].forEach((col, i) => g.addColorStop(i / 4, col));
        path(c, "M18 0 L-4 -11 -15 -8 -9 0 -15 8 -4 11Z", g, "#f1eaff");
        path(c, "M-4 -11 L2 -2 18 0 M-15 -8 L2 -2 -9 0 -4 11 M2 -2 L3 5 18 0", null, "#fff9", 0.8);
        path(c, "M-9 0 L3 5 -4 11Z", "#684baa66", null); glint(c, 6, -3, 2.3, t); break;
      }
      case "alien":
        path(c, "M-5 5 L-10 14 11 14 5 5Z", shade(c, "#b8ff6a66", "#b8ff6a22", "#b8ff6a00", 5, 14), null);
        oval(c, 0, 3, 16, 6, shade(c, "#e8d9ff", "#9586c0", "#4c467b"), INK);
        path(c, "M-10 0 C-10 -17 10 -17 10 0Z", "#93dce94d", "#b4f6ee", 0.8);
        oval(c, 1, -4, 5, 6, shade(c, "#e5ffa9", "#a2df67", "#54a175"), INK);
        oval(c, -1, -4, 1.5, 2.4, "#253847", null, -0.4); oval(c, 4, -4, 1.5, 2.4, "#253847", null, 0.4);
        path(c, "M0 0 Q1 1 2 0 M-7 -5 Q-7 -9 -3 -10", null, "#d8ffff", 0.8);
        oval(c, 0, 3, 15, 2, "#b6a0d7", INK);
        for (const x of [-10, -5, 1, 7, 12]) oval(c, x, 4, 1, 0.8, "#d8ff96"); break;
      case "gold":
        path(c, "M18 0 L-6 -6 -14 -12 -10 -2 -15 0 -10 2 -14 12 -6 6Z", shade(c, "#fff5ba", "#f2c453", "#a86423"), "#ebd59e");
        path(c, "M18 0 L-10 2 -14 12 -6 6Z", "#bf812f", null);
        path(c, "M-10 -8 L-4 -4 14 0 M-10 8 L-4 4", null, "#fff1ae", 0.9);
        glass(c, 3, -0.5, 3.8, 1.8); glint(c, -5, -5, 2, t); glint(c, 10, 2, 1.8, t + 1); break;
      case "unicorn":
        path(c, "M-3 -8 Q-14 -12 -15 -3 L-11 -5 Q-17 4 -13 11 L-8 7 -8 12 1 7Z", "#b895ea");
        path(c, "M-3 -7 Q-11 -9 -12 -3 M-3 -3 Q-10 -4 -11 3 M-2 1 Q-7 3 -8 8", null, "#fa9dcc", 2.7);
        path(c, "M-7 10 Q-9 0 -2 -7 L-4 -13 2 -9 Q8 -10 9 -4 L15 1 Q17 7 10 7 L5 4 3 11Z", shade(c, "#fff", "#f1e9ff", "#c0b9e1"));
        path(c, "M5 -8 L10 -17 9 -5Z", "#ffdd83", "#a77455", 0.7);
        path(c, "M6 -9 L9 -8 M7 -11 L9 -10", null, "#b88866", 0.6);
        eye(c, 6, -2, 1.5); oval(c, 13, 3, 0.7, 0.7, "#b388ad"); oval(c, 6, 2, 2, 1, "#f4b8d7"); glint(c, -12, -11, 2, t); break;
      case "duck":
        path(c, "M-14 0 L-19 -5 Q-18 4 -12 7Z", "#e8ac35");
        path(c, "M-14 0 Q-4 -4 0 -1 Q-3 -13 7 -13 Q16 -12 13 -3 L11 5 Q7 12 -5 11 Q-17 10 -14 0Z", shade(c, "#fff7b0", "#ffda58", "#e7a135"), "#95622b");
        path(c, "M12 -6 Q16 -6 20 -3 Q17 0 12 -1Z", "#f59142", "#ad6635", 0.8);
        path(c, "M13 -3 L18 -3", null, "#c47132", 0.7);
        path(c, "M-10 2 Q-3 -2 3 3 Q-1 9 -8 6Z", "#f4c343", "#d3a037", 0.8);
        path(c, "M-10 0 Q-6 -2 -3 -1", null, "#fff4a1", 1); eye(c, 9, -7, 1.5); break;
      case "skull":
        path(c, "M-8 5 C-18 -12 -5 -17 4 -13 C17 -12 16 2 9 5 L8 12 -7 12Z", shade(c, "#fffff3", "#e0e5df", "#96a7b9"));
        path(c, "M-7 -3 Q-2 -6 -1 1 Q-7 5 -7 -3 M3 -2 Q9 -7 9 0 Q3 5 3 -2", "#293249", null);
        oval(c, -4, 0, 1.1, 1.3, "#ff8a82"); oval(c, 6, 0, 1.1, 1.3, "#ff8a82");
        path(c, "M1 3 L-1 6 3 6Z", "#536174", null);
        path(c, "M-5 8 H7 M-4 8 V11 M0 8 V11 M4 8 V11 M-3 -12 L-1 -9 -3 -7", null, "#637185", 0.8); break;
      case "bolt":
        path(c, "M5 -15 L-12 2 -2 3 -7 14 15 -4 4 -3Z", "#b47633", "#fff0a0", 0.8);
        c.save(); c.translate(0, -1);
        path(c, "M5 -15 L-12 2 -2 3 -7 14 15 -4 4 -3Z", shade(c, "#ffffc2", "#ffdf49", "#f5a52e"), "#8f6228");
        path(c, "M2 -10 L-8 0 -1 1", null, "#fffbd6", 1.2); c.restore();
        glint(c, -13, -7, 1.4, t); glint(c, 12, 8, 1.8, t + 1); break;
      case "sub":
        path(c, "M-4 -10 V-16 H1", null, "#caa054", 2.5);
        path(c, "M-8 -5 V-11 H3 V-5Z", "#e6af40");
        path(c, "M-12 -3 L-17 -7 -17 7 -12 3Z", "#668594");
        oval(c, -18, 0, 1.3, 1 + 5 * Math.abs(Math.cos(t * 18)), "#c5d9df", INK);
        path(c, "M-7 -7 H7 C19 -7 19 8 7 8 H-7 C-18 8 -18 -7 -7 -7Z", shade(c, "#fff2a0", "#eec451", "#b78035"));
        path(c, "M-11 4 H11", null, "#946b38", 0.7); glass(c, 6, 0, 3.5, 3.5); glass(c, -5, 0, 2, 2);
        oval(c, -3, -10, 0.8, 0.8, "#f9eeae"); break;
      case "pirate":
        path(c, "M-15 2 L17 1 11 11 -9 11Z", shade(c, "#dfb175", "#af7447", "#69442f", 0, 12));
        path(c, "M-12 5 L14 4 M-10 8 L12 7", null, "#e0a36a", 0.7);
        path(c, "M-2 2 V-16 M-12 1 L-2 -12 12 1", null, "#aa926d", 0.8);
        path(c, "M-1 -13 Q12 -12 11 -2 Q4 -4 -1 -1Z", shade(c, "#fff9dd", "#eee4bc", "#b9aa85"));
        path(c, "M1 -11 Q6 -10 8 -5", null, "#fffbe4", 0.8);
        path(c, "M-2 -16 Q-8 -18 -12 -14 L-11 -9 Q-7 -12 -2 -11Z", "#354051");
        oval(c, -7, -13.5, 1.5, 1.3, "#fff4dc"); path(c, "M-9 -11 L-5 -12 M-9 -12 L-5 -11", null, "#fff4dc", 0.55);
        for (const x of [-6, 0, 6]) oval(c, x, 6, 1.2, 1.2, "#29394a", "#ffd081");
        path(c, "M15 2 L19 -2", null, "#dcb270", 1.5); break;
      case "dolphin":
        // Broad curved flukes, a low swept dorsal fin, rounded melon and separate rostrum.
        c.save(); c.translate(-12, 1); c.rotate(wave * 0.12);
        path(c, "M2 0 Q-4 -8 -11 -5 Q-7 -1 -5 1 Q-9 3 -10 6 Q-3 7 2 0Z", shade(c, "#8fe2ea", "#51b2cb", "#387d9f")); c.restore();
        path(c, "M-5 -5 Q-5 -12 1 -12 Q-1 -8 5 -6Z", "#4ba6c3");
        path(c, "M-14 1 C-8 -4 -5 -7 2 -7 C8 -11 14 -7 13 -2 Q17 -2 20 0 Q22 3 17 3 L11 3 C6 11 -4 7 -14 1Z", shade(c, "#a7edf2", "#6ac6dd", "#3e90b4"), "#285a7b");
        path(c, "M-11 2 Q0 5 7 3 Q11 2 18 2 Q12 4 10 5 Q2 11 -11 2Z", "#d5f7f4", null);
        path(c, "M2 3 Q0 10 -6 10 Q-3 6 -3 3Z", "#489cba", "#397792", 0.7);
        path(c, "M9 1 Q12 3 19 1.5", null, "#326884", 0.8);
        eye(c, 10, -3, 1.7); oval(c, 8, 0.5, 1.6, 0.7, "#a4e4e8");
        path(c, "M-2 -5 Q3 -8 7 -7", null, "#d5ffff", 0.9); break;
      case "platypus":
        c.save(); c.translate(-12, 2); c.rotate(wave * 0.08);
        path(c, "M3 -3 Q-11 -8 -11 0 Q-10 8 3 3Z", "#8d6248", "#493e36");
        path(c, "M-8 -3 L-1 4 M-10 0 L-5 5 M-8 3 L-2 -3 M-5 5 L1 -1", null, "#b18b66", 0.65); c.restore();
        path(c, "M-9 5 L-13 9 -10 9 -9 11 -4 8 M2 5 L0 10 3 9 5 11 8 7", "#cd9a61", "#6d533d", 0.8);
        path(c, "M-13 0 Q-12 -8 -2 -8 Q6 -11 11 -5 Q15 2 8 6 Q-4 12 -13 0Z", shade(c, "#c3a178", "#957657", "#65503f"), "#423a35");
        path(c, "M-7 3 Q-2 7 4 4", null, "#c5ad86", 2.5);
        path(c, "M9 -2 Q18 -4 21 -1 Q24 4 16 5 L8 3Z", shade(c, "#e2c28b", "#bb9c6f", "#98794f", -3, 5), "#68563e", 0.8);
        path(c, "M10 2 Q16 4 21 1", null, "#8d734f", 0.65); oval(c, 18, -0.5, 0.65, 0.5, "#796143");
        eye(c, 7, -4, 1.65); path(c, "M-7 -5 L-5 -6 -3 -5 -1 -6", null, "#d0b58a", 0.7); break;
    }
    c.restore();
  }
  window.SHIPS = { paint };
})();
