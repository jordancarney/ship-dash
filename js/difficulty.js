/*
 * Ship Dash — difficulty ratings
 *
 * Nine tiers, each with its own "rating face" (Geometry Dash style).
 * The faces are drawn as inline SVG so they need no image files:
 * the smile flips to a frown as tiers climb, brows get angrier, and the
 * demon tiers grow horns and fangs. The last tier, Extreme Demon, wears a
 * near-black face with a red outline and a crown of flames.
 *
 *   diffFace(tier, size)  -> SVG markup string for the face
 *   DIFFS[tier]           -> { id, name, color, demon }
 */
(function () {
  "use strict";

  const DIFFS = [
    { id: "easy",        name: "Easy",         color: "#5bd75b", demon: false },
    { id: "hard",        name: "Hard",         color: "#ffb84a", demon: false },
    { id: "insane",      name: "Insane",       color: "#ff5d8f", demon: false },
    { id: "ultra",       name: "Ultra",        color: "#b06bff", demon: false },
    { id: "easydemon",   name: "Easy Demon",   color: "#ff7a3c", demon: true },
    { id: "harddemon",   name: "Hard Demon",   color: "#ff3b3b", demon: true },
    { id: "insanedemon", name: "Insane Demon", color: "#c21d5c", demon: true },
    { id: "ultrademon",  name: "Ultra Demon",  color: "#7b2cff", demon: true },
    // `face`/`horn`/`line` override the fill colors so the face can be dark
    // while badges and labels (which use `color`) stay readable.
    { id: "extremedemon", name: "Extreme Demon", color: "#ff1744", face: "#2a0a14", horn: "#5c0f22", line: "#ff1744", demon: true },
  ];

  // Darken a hex color by a factor (0..1) for outlines and shading.
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  function diffFace(tier, size) {
    tier = Math.max(0, Math.min(DIFFS.length - 1, tier | 0));
    size = size || 40;
    const d = DIFFS[tier];
    const col = d.face || d.color, dark = d.horn || shade(col, 0.45), line = d.line || shade(col, 0.28);
    const demon = d.demon;
    const rank = demon ? tier - 4 : tier;   // 0..3 within its group (Extreme Demon is rank 4)
    const parts = [];

    // horns (demons): bigger and more curved with rank
    if (demon) {
      const hh = Math.min(26, 14 + rank * 4);
      parts.push(`<path d="M18 30 C 12 ${30 - hh} 22 ${28 - hh} 30 ${24 - rank}" fill="${dark}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>`);
      parts.push(`<path d="M82 30 C 88 ${30 - hh} 78 ${28 - hh} 70 ${24 - rank}" fill="${dark}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>`);
    }

    // head
    parts.push(`<circle cx="50" cy="52" r="34" fill="${col}" stroke="${line}" stroke-width="3"/>`);
    // subtle highlight
    parts.push(`<ellipse cx="38" cy="36" rx="12" ry="7" fill="#fff" opacity="0.18"/>`);

    // brows: flat for easy, angrier as tiers climb
    const browAngle = demon ? 14 + rank * 4 : rank * 5;          // degrees of inward tilt
    const browY = 40 - (demon ? 2 : 0);
    parts.push(`<line x1="28" y1="${browY - browAngle * 0.3}" x2="42" y2="${browY + browAngle * 0.3}" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`);
    parts.push(`<line x1="72" y1="${browY - browAngle * 0.3}" x2="58" y2="${browY + browAngle * 0.3}" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`);

    // eyes: round for easy, narrow slits for demons
    const eyeR = demon ? 5 : 6 - rank * 0.5;
    const eyeFill = demon ? (rank >= 2 ? "#ff2a2a" : "#ffdd55") : "#0c1430";
    if (demon) {
      parts.push(`<ellipse cx="38" cy="50" rx="${eyeR + 1}" ry="${eyeR - 1.5}" fill="${eyeFill}" stroke="${line}" stroke-width="2"/>`);
      parts.push(`<ellipse cx="62" cy="50" rx="${eyeR + 1}" ry="${eyeR - 1.5}" fill="${eyeFill}" stroke="${line}" stroke-width="2"/>`);
      parts.push(`<circle cx="38" cy="50" r="1.8" fill="#0c1430"/><circle cx="62" cy="50" r="1.8" fill="#0c1430"/>`);
    } else {
      parts.push(`<circle cx="38" cy="50" r="${eyeR}" fill="${eyeFill}"/><circle cx="62" cy="50" r="${eyeR}" fill="${eyeFill}"/>`);
      parts.push(`<circle cx="40" cy="48" r="1.8" fill="#fff"/><circle cx="64" cy="48" r="1.8" fill="#fff"/>`);
    }

    // mouth: smile -> flat -> frown; demons get a toothy grin
    if (!demon) {
      const curve = [14, 4, -8, -14][rank];   // +ve = smile
      parts.push(`<path d="M34 66 Q 50 ${66 + curve} 66 66" fill="none" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`);
    } else {
      parts.push(`<path d="M32 64 Q 50 ${76 + rank * 2} 68 64 Z" fill="#2a0810" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>`);
      // fangs
      parts.push(`<path d="M38 65 L 41 72 L 44 65 Z" fill="#fff"/><path d="M56 65 L 59 72 L 62 65 Z" fill="#fff"/>`);
      if (rank >= 2) parts.push(`<path d="M47 66 L 50 71 L 53 66 Z" fill="#fff"/>`);
    }

    // ultra tiers: little sparkles / flames around the head
    if (rank >= 3) {
      const glow = demon ? "#ff4b4b" : "#e4c8ff";
      parts.push(`<path d="M50 6 L 54 14 L 50 12 L 46 14 Z" fill="${glow}"/>`);
      parts.push(`<path d="M14 62 L 20 60 L 16 66 Z" fill="${glow}"/><path d="M86 62 L 80 60 L 84 66 Z" fill="${glow}"/>`);
    }
    // extreme demon: a crown of flames and a cracked brow
    if (rank === 4) {
      parts.push(`<path d="M30 12 L 37 24 L 27 21 Z" fill="#ff1744"/><path d="M70 12 L 63 24 L 73 21 Z" fill="#ff1744"/>`);
      parts.push(`<path d="M50 0 L 57 12 L 50 8 L 43 12 Z" fill="#ffd166"/>`);
      parts.push(`<path d="M46 26 L 49 32 L 45 36 L 48 41" fill="none" stroke="#ff1744" stroke-width="1.6" stroke-linecap="round"/>`);
    }

    return `<svg class="diff-face diff-${d.id}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="${d.name}">${parts.join("")}</svg>`;
  }

  // Small badge: face + name, for level cards.
  function diffBadge(tier, size) {
    tier = Math.max(0, Math.min(DIFFS.length - 1, tier | 0));
    return `<span class="diff-badge" style="--dc:${DIFFS[tier].color}">${diffFace(tier, size || 26)}<span>${DIFFS[tier].name}</span></span>`;
  }

  window.DIFFS = DIFFS;
  window.diffFace = diffFace;
  window.diffBadge = diffBadge;
})();
