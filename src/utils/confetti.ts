/**
 * Zero-dependency lightweight celebration particle generator for achievements and milestone completions.
 */
export function triggerCelebrationConfetti() {
  if (typeof window === "undefined" || !document) return;
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#6366f1", "#a855f7", "#ec4899", "#38bdf8", "#34d399", "#fbbf24"];
  const particles = Array.from({ length: 65 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 80,
    y: canvas.height * 0.45 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 18,
    vy: (Math.random() - 0.8) * 16,
    size: Math.random() * 7 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 12,
    opacity: 1,
  }));

  let frame = 0;
  function update() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.38; // gravity
      p.vx *= 0.985; // air drag
      p.rotation += p.rotSpeed;
      p.opacity -= 0.014;

      if (p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        ctx.restore();
      }
    }

    if (alive && frame < 95) {
      requestAnimationFrame(update);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(update);
}
