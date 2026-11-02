import type { Entity, GameSnapshot, Surface } from "./contracts";
import { projectShadow } from "./runtime";
const C = {
  ink: "#0b1720",
  cream: "#eee9d5",
  brass: "#b89858",
  gold: "#e0bd76",
  mint: "#8de4be",
  coral: "#ff9579",
  stone: "#4e6864",
};
function polygon(
  c: CanvasRenderingContext2D,
  points: number[][],
  fill: string,
  stroke?: string,
) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}
function line(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function circle(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function glow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
/** Keep ordinary traversal framing; high jumps enter a vertical dead zone below the HUD. */
export function followHighJumpCamera(
  currentY: number,
  playerY: number,
  playerHeight: number,
  reducedMotion = false,
): number {
  if (![currentY, playerY, playerHeight].every(Number.isFinite)) return 0;
  const desired = Math.min(0, playerY - 180);
  const eased = currentY + (desired - currentY) * (reducedMotion ? 1 : 0.12);
  // Hard visibility bounds also handle large restored/single-step position changes.
  const lowest = Math.min(0, playerY + playerHeight - 560),
    highest = Math.min(0, playerY - 120);
  return Math.max(lowest, Math.min(highest, eased));
}
export class WorldRenderer {
  private camera = 0;
  private cameraY = 0;
  draw(
    canvas: HTMLCanvasElement,
    world: GameSnapshot,
    time: number,
    reducedMotion = false,
    showHud = true,
  ) {
    const c = canvas.getContext("2d");
    if (!c) return;
    const width = canvas.width,
      height = canvas.height;
    const scale = height / 650,
      view = width / scale;
    const target = Math.max(
      0,
      // Keep the takeoff point visible through an ordinary jump while leaving
      // most of the viewport ahead of the courier.
      Math.min(2500 - view + 60, world.entities[0].x - view * 0.4),
    );
    this.camera += (target - this.camera) * (reducedMotion ? 1 : 0.09);
    if (world.entities[0].x < 220) this.camera = 0;
    this.cameraY = followHighJumpCamera(
      this.cameraY,
      world.entities[0].y,
      world.entities[0].h,
      reducedMotion,
    );
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, width, height);
    c.scale(scale, scale);
    const sky = c.createLinearGradient(0, 0, 0, 650);
    sky.addColorStop(0, "#0c2028");
    sky.addColorStop(0.56, "#203a3e");
    sky.addColorStop(1, "#718176");
    c.fillStyle = sky;
    c.fillRect(0, 0, view, 650);
    this.background(c, view, time, reducedMotion);
    c.save();
    c.translate(-this.camera, -this.cameraY);
    this.machine(c, 770, 158, time, reducedMotion);
    this.city(c, view);
    // The deep cloud sea separates distant architecture from the playable plane.
    const mist = c.createLinearGradient(0, 350, 0, 650);
    mist.addColorStop(0, "transparent");
    mist.addColorStop(0.7, "#84988a19");
    mist.addColorStop(1, "#b0b8a04d");
    c.fillStyle = mist;
    c.fillRect(this.camera, 340, view, 310);
    for (const s of world.surfaces.filter((s) => !s.generated))
      this.platform(c, s);
    this.architecture(c, time, reducedMotion);
    this.counterweightHall(c, world, time, reducedMotion);
    this.guardian(c, world, time, reducedMotion);
    const prop = world.entities[1],
      shadow = projectShadow(prop, world, 480, 10);
    if (shadow) {
      polygon(
        c,
        [
          [prop.x + 20, 448],
          [shadow.x + shadow.w, 448],
          [shadow.x + shadow.w + 8, 459],
          [prop.x + 12, 459],
        ],
        "#080f1e6b",
      );
    }
    for (const s of world.surfaces.filter((s) => s.generated))
      this.generatedSurface(c, s, world.tick);
    for (const e of world.entities) {
      if (e.kind === "lantern") this.lamp(c, e, world.lanternOn, time);
      if (e.kind === "prop") this.prop(c, e);
    }
    this.courier(
      c,
      world.entities[0],
      world.tick,
      time,
      reducedMotion,
      world.emberCarried,
    );
    if (!world.emberCarried) {
      const e = world.entities.find((x) => x.kind === "ember")!;
      glow(c, e.x + 6, e.y + 6, 55, "#ffac6a3d");
      polygon(
        c,
        [
          [e.x + 6, e.y],
          [e.x + 12, e.y + 7],
          [e.x + 6, e.y + 12],
          [e.x, e.y + 7],
        ],
        "#ffc99a",
        "#fff1c6",
      );
    }
    this.hearth(c, 2380, 448, world.completed, time);
    // Sparse wind-borne ash, no flashing or high-frequency bursts.
    if (!reducedMotion)
      for (let i = 0; i < 18; i++) {
        const x =
          this.camera +
          ((noise(i) * view + time * (3 + noise(i + 2) * 4)) % view);
        const y = 100 + noise(i + 30) * 480 + Math.sin(time * 0.25 + i) * 8;
        line(c, x, y, x + 2 + noise(i + 20) * 5, y - 1, "#e1d5ab30");
      }
    c.restore();
    this.vignette(c, view);
    if (showHud) this.hud(c, view, world);
  }
  private background(
    c: CanvasRenderingContext2D,
    view: number,
    time: number,
    reduce: boolean,
  ) {
    glow(c, view * 0.7, 170, 330, "#b8974b18");
    for (let i = 0; i < 35; i++) {
      const x = noise(i + 400) * view,
        y = 30 + noise(i + 500) * 220;
      circle(c, x, y, i % 9 === 0 ? 1.2 : 0.55, "#d9dec55c");
    }
    for (let layer = 0; layer < 3; layer++) {
      const par = this.camera * (0.05 + layer * 0.06);
      for (let i = -1; i < 14; i++) {
        const x = i * 180 - (par % 180),
          y = 290 + noise(i + layer * 40) * 95,
          h = 100 + noise(i + 13) * 170;
        polygon(
          c,
          [
            [x, y + h],
            [x, y],
            [x + 22, y - 25],
            [x + 50, y],
            [x + 50, y + h],
          ],
          layer === 0 ? "#183039" : "#233f43",
        );
        line(c, x + 24, y - 25, x + 24, y + h, "#82918b0e");
        if (i % 3 === 0) {
          c.strokeStyle = "#5c716932";
          c.beginPath();
          c.arc(x + 25, y + 20, 35, Math.PI, 0);
          c.stroke();
        }
      }
    }
    const cloudX = reduce ? 0 : Math.sin(time * 0.02) * 20;
    for (let i = 0; i < 6; i++) {
      const y = 300 + i * 35;
      const g = c.createLinearGradient(0, y, view, y);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.5, "#c4cdb20b");
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.fillRect(cloudX, y, view, 9);
    }
  }
  private machine(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
    reduce: boolean,
  ) {
    c.save();
    c.translate(x - this.camera * 0.12, y);
    const r = 192;
    glow(c, 0, 0, 265, "#d6b87516");
    c.save();
    c.rotate(-0.24);
    c.scale(1, 0.88);
    for (const [radius, width, color] of [
      [r, 13, "#756449"],
      [r - 12, 1, "#d4b979"],
      [r - 27, 5, "#3b4a45"],
      [r - 37, 1, "#a28d5d"],
      [r - 59, 1, "#8e7c4c80"],
    ] as const) {
      c.beginPath();
      c.arc(0, 0, radius, 0, Math.PI * 2);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      c.save();
      c.rotate(a);
      line(
        c,
        r - 7,
        0,
        r + (i % 4 === 0 ? 15 : 6),
        0,
        i % 4 === 0 ? "#c5aa6d" : "#8d7b51",
        i % 4 === 0 ? 3 : 1,
      );
      c.restore();
    }
    const a = reduce ? 0.5 : time * 0.008 + 0.5;
    c.rotate(a);
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i * Math.PI) / 4);
      polygon(
        c,
        [
          [27, -5],
          [r - 30, -3],
          [r - 30, 3],
          [27, 5],
        ],
        "#9d87593d",
      );
      c.restore();
    }
    circle(c, 0, 0, 62, "#10252baa", "#b4985f");
    circle(c, 0, 0, 46, "#183137", "#5f6551");
    polygon(
      c,
      [
        [0, -34],
        [28, 18],
        [0, 32],
        [-28, 18],
      ],
      "#c2a36633",
      "#c8ad71",
    );
    circle(c, 0, 0, 9, "#dcc692");
    c.restore();
    line(c, -90, -175, -165, -300, "#a289562f", 3);
    line(c, 92, -175, 170, -300, "#a289562f", 3);
    c.restore();
  }
  private city(c: CanvasRenderingContext2D, view: number) {
    for (let i = 0; i < 8; i++) {
      const x = 130 + i * 360 - this.camera * 0.09,
        y = 355 + noise(i + 90) * 30;
      polygon(
        c,
        [
          [x, y],
          [x + 35, y - 60],
          [x + 100, y - 60],
          [x + 130, y],
          [x + 110, y + 170],
          [x + 20, y + 140],
        ],
        "#263e3f",
      );
      polygon(
        c,
        [
          [x + 35, y - 60],
          [x + 100, y - 60],
          [x + 85, y - 93],
          [x + 52, y - 93],
        ],
        "#314a47",
      );
      line(c, x + 52, y - 93, x + 85, y - 93, "#9b916b44");
      for (let k = 0; k < 3; k++)
        line(
          c,
          x + 32 + k * 25,
          y - 32,
          x + 32 + k * 25,
          y + 70,
          "#66807227",
          2,
        );
    }
    c.fillStyle = "#1b363b55";
    c.fillRect(this.camera, 590, view, 80);
  }
  private platform(c: CanvasRenderingContext2D, s: Surface) {
    const small = s.w < 100;
    const depth = small ? 22 : 85;
    polygon(
      c,
      [
        [s.x, s.y + 5],
        [s.x + s.w, s.y + 5],
        [s.x + s.w - 12, s.y + depth],
        [s.x + s.w * 0.78, s.y + depth + 18],
        [s.x + s.w * 0.57, s.y + depth - 5],
        [s.x + s.w * 0.21, s.y + depth + 27],
        [s.x + 15, s.y + depth],
      ],
      small ? "#374c4a" : "#283d3d",
    );
    polygon(
      c,
      [
        [s.x, s.y],
        [s.x + s.w, s.y],
        [s.x + s.w + 8, s.y + 10],
        [s.x - 6, s.y + 10],
      ],
      "#778b79",
    );
    c.fillStyle = "#b7b59a";
    c.fillRect(s.x, s.y, s.w, 3);
    c.fillStyle = "#b29965";
    c.fillRect(s.x, s.y + 8, s.w, 4);
    c.fillStyle = "#1b2d31";
    c.fillRect(s.x, s.y + 13, s.w, 6);
    for (let x = s.x + 12; x < s.x + s.w - 12; x += 34) {
      line(c, x, s.y + 19, x - 6, s.y + depth - 4, "#7a86693c");
      line(c, x + 8, s.y + 26, x + 26, s.y + 26, "#b9aa7130");
    }
    for (let x = s.x + 15; x < s.x + s.w; x += 70) {
      polygon(
        c,
        [
          [x, s.y + 20],
          [x + 13, s.y + 20],
          [x + 8, s.y + 49],
          [x - 3, s.y + 43],
        ],
        "#5c6d5949",
      );
    }
    if (!small) {
      for (let i = 0; i < Math.floor(s.w / 47); i++) {
        const x = s.x + i * 47 + noise(i + 5) * 20;
        line(c, x, s.y - 2, x + 4, s.y - 8 - noise(i + 4) * 9, "#8a9972", 1.4);
        line(c, x + 4, s.y - 6, x + 9, s.y - 9, "#8a9972", 1);
      }
    }
    if (small) {
      line(c, s.x + 8, s.y + depth, s.x - 12, s.y + 90, "#a78d5655", 2);
      line(
        c,
        s.x + s.w - 8,
        s.y + depth,
        s.x + s.w + 8,
        s.y + 85,
        "#a78d5655",
        2,
      );
    }
  }
  private architecture(
    c: CanvasRenderingContext2D,
    time: number,
    reduce: boolean,
  ) {
    for (const x of [85, 1140, 1940]) {
      const y = 448;
      line(c, x, y, x, y - 170, "#b39c65", 3);
      line(c, x + 48, y, x + 48, y - 170, "#b39c65", 3);
      c.strokeStyle = "#ac965e";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(x + 24, y - 170, 24, Math.PI, 0);
      c.stroke();
      polygon(
        c,
        [
          [x + 5, y - 167],
          [x + 43, y - 167],
          [x + 43, y - 95],
          [x + 24, y - 81],
          [x + 5, y - 95],
        ],
        "#69756a3b",
      );
      line(c, x + 24, y - 161, x + 24, y - 104, "#c4b57b77");
      circle(c, x + 24, y - 103, 4, "#c2af77");
      if (x > 100) {
        line(c, x + 100, y, x + 100, y - 100, "#6f7761", 4);
        circle(c, x + 100, y - 103, 7, "#b6aa7c");
      }
    }
    for (const x of [10, 980, 1840]) {
      line(c, x, 449, x + 75, 449, "#b5a174", 2);
      for (let k = 0; k < 4; k++)
        line(c, x + k * 25, 448, x + k * 25, 411, "#88947b", 2);
      line(c, x, 411, x + 75, 411, "#88947b", 2);
    }
    const sway = reduce ? 0 : Math.sin(time * 0.7) * 3;
    polygon(
      c,
      [
        [132, 250],
        [161, 250],
        [161 + sway, 327],
        [147 + sway, 317],
        [132 + sway, 327],
      ],
      "#c9a2768a",
    );
    line(c, 132, 250, 132, 442, "#b8a271", 2);
    // Hanging kiln beneath the second island.
    line(c, 1240, 510, 1240, 585, "#a58d5744", 3);
    line(c, 1330, 510, 1330, 585, "#a58d5744", 3);
    polygon(
      c,
      [
        [1220, 579],
        [1350, 579],
        [1337, 623],
        [1236, 623],
      ],
      "#354b47",
      "#8d815652",
    );
    glow(c, 1285, 596, 50, "#edab5922");
  }
  private counterweightHall(
    c: CanvasRenderingContext2D,
    w: GameSnapshot,
    time: number,
    reduce: boolean,
  ) {
    const x = 1260,
      y = 448,
      open = w.encounters.counterweight;
    // An open-air winding house: fluted piers carry a suspended, monumental counterweight.
    for (const side of [-1, 1]) {
      const px = x + side * 92;
      polygon(
        c,
        [
          [px - 11, y],
          [px - 11, 226],
          [px - 19, 214],
          [px + 19, 214],
          [px + 11, 226],
          [px + 11, y],
        ],
        "#3f5550",
        "#9a9068",
      );
      line(c, px - 4, 236, px - 4, y - 8, "#84917b", 2);
      line(c, px + 4, 236, px + 4, y - 8, "#263d3c", 2);
      polygon(
        c,
        [
          [px - 22, y],
          [px + 22, y],
          [px + 18, y - 13],
          [px - 18, y - 13],
        ],
        "#8a8e71",
      );
    }
    polygon(
      c,
      [
        [x - 115, 209],
        [x, 174],
        [x + 115, 209],
        [x + 108, 223],
        [x - 108, 223],
      ],
      "#43584f",
      "#b09b68",
    );
    line(c, x - 103, 214, x + 103, 214, "#ceb27b", 3);
    circle(c, x, 230, 24, "#2c4240", "#bca16b");
    circle(c, x, 230, 15, "#536454", "#978b5d");
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      line(
        c,
        x + Math.cos(a) * 7,
        230 + Math.sin(a) * 7,
        x + Math.cos(a) * 21,
        230 + Math.sin(a) * 21,
        "#baa16b",
        2,
      );
    }
    const wy = open ? 266 : 330;
    for (const side of [-1, 1]) {
      const cx = x + side * 25;
      line(c, cx, 249, cx, wy, "#b2a06f", 3);
      for (let cy = 250; cy < wy; cy += 9) {
        c.strokeStyle = "#d3bb7e66";
        c.strokeRect(cx - 3, cy, 6, 6);
      }
    }
    polygon(
      c,
      [
        [x - 42, wy],
        [x + 42, wy],
        [x + 49, wy + 51],
        [x + 35, wy + 65],
        [x - 35, wy + 65],
        [x - 49, wy + 51],
      ],
      "#68725a",
      "#b3a16c",
    );
    polygon(
      c,
      [
        [x - 28, wy + 9],
        [x + 28, wy + 9],
        [x + 31, wy + 48],
        [x - 31, wy + 48],
      ],
      "#374e47",
      "#8e8a61",
    );
    circle(c, x, wy + 29, 13, "#7b8061", "#c1aa71");
    polygon(
      c,
      [
        [x, wy + 17],
        [x + 8, wy + 29],
        [x, wy + 41],
        [x - 8, wy + 29],
      ],
      "#b6a472",
    );
    // The crank is tangible and sits in the courier's reachable plane.
    line(c, x, y, x, y - 34, "#b7a778", 7);
    circle(c, x, y - 46, 22, "#2a403e", "#d3b780");
    circle(c, x, y - 46, 16, "#5b6c56", "#a68f5c");
    c.save();
    c.translate(x, y - 46);
    c.rotate(open ? -0.8 : 0);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      line(c, 0, 0, 19, 0, "#d6bc82", 3);
    }
    line(c, 16, 0, 29, 0, "#dfc48a", 3);
    circle(c, 29, 0, 4, "#d1ac74");
    c.restore();
    const gateX = 1354;
    if (!open) {
      line(c, gateX, 448, gateX, 365, "#c4a874", 5);
      polygon(
        c,
        [
          [gateX - 7, 366],
          [gateX + 7, 366],
          [gateX + 7, 445],
          [gateX - 7, 445],
        ],
        "#91845b",
      );
      line(c, gateX - 12, 389, gateX + 12, 389, "#dfbd79", 3);
    } else {
      glow(c, x, y - 46, 55, "#8bdab722");
      circle(c, x, y - 46, 5, "#9ceac4");
    }
    if (!open && Math.abs(w.entities[0].x - x) < 180) {
      c.font = "10px Arial, sans-serif";
      c.fillStyle = "#e1d4ac";
      c.textAlign = "center";
      c.fillText("TURN THE GREAT CRANK", x, 193);
      c.textAlign = "left";
    }
    void time;
    void reduce;
  }
  private guardian(
    c: CanvasRenderingContext2D,
    w: GameSnapshot,
    time: number,
    reduce: boolean,
  ) {
    const x = 2170,
      y = 448,
      awake = w.encounters.guardian;
    const breathing = awake && !reduce ? Math.sin(time) * 1.5 : 0;
    // A weathered guardian built from nested brass, stone and ivory shapes.
    polygon(
      c,
      [
        [x - 57, y],
        [x + 59, y],
        [x + 45, y - 17],
        [x - 44, y - 17],
      ],
      "#7e866c",
      "#aa9c6c",
    );
    for (const side of [-1, 1]) {
      const lx = x + side * 19;
      polygon(
        c,
        [
          [lx - 12, y - 17],
          [lx + 12, y - 17],
          [lx + 10, y - 61],
          [lx - 9, y - 66],
        ],
        "#576853",
        "#a19666",
      );
      polygon(
        c,
        [
          [lx - 15, y - 17],
          [lx + 13, y - 17],
          [lx + 9, y - 7],
          [lx - 18, y - 7],
        ],
        "#9c9b72",
      );
      circle(c, lx, y - 60, 9, "#304540", "#b19e68");
    }
    polygon(
      c,
      [
        [x - 34, y - 130 + breathing],
        [x + 34, y - 130 + breathing],
        [x + 39, y - 91],
        [x + 24, y - 63],
        [x - 24, y - 63],
        [x - 39, y - 91],
      ],
      "#7e8262",
      "#c2aa73",
    );
    polygon(
      c,
      [
        [x - 24, y - 124],
        [x + 24, y - 124],
        [x + 27, y - 92],
        [x, y - 73],
        [x - 27, y - 92],
      ],
      "#293f3d",
      "#a18b5e",
    );
    circle(c, x, y - 101, 14, "#6c7356", "#d7bb80");
    circle(c, x, y - 101, 7, awake ? "#afe4bd" : "#4d6254");
    if (awake) glow(c, x, y - 101, 65, "#acdfb426");
    // One arm seals the passage until the courier offers the ember.
    for (const side of [-1, 1]) {
      circle(c, x + side * 39, y - 119, 14, "#53634e", "#b9a16b");
      const handY = awake ? y - 160 : y - 79,
        handX = x + side * (awake ? 58 : 61);
      line(c, x + side * 40, y - 116, handX, handY, "#7d8360", 16);
      line(c, x + side * 40, y - 116, handX, handY, "#c0a66f", 2);
      polygon(
        c,
        [
          [handX - 11, handY - 5],
          [handX + 11, handY - 5],
          [handX + 12, handY + 17],
          [handX - 8, handY + 19],
        ],
        "#aaa176",
        "#d7be85",
      );
    }
    const hy = y - 153 + breathing;
    polygon(
      c,
      [
        [x - 20, hy - 20],
        [x + 20, hy - 20],
        [x + 25, hy + 10],
        [x + 16, hy + 23],
        [x - 16, hy + 23],
        [x - 25, hy + 10],
      ],
      "#c7c1a0",
      "#d7c58f",
    );
    polygon(
      c,
      [
        [x - 21, hy - 2],
        [x + 21, hy - 2],
        [x + 15, hy + 8],
        [x - 15, hy + 8],
      ],
      "#233e3c",
    );
    line(c, x - 12, hy + 2, x - 5, hy + 2, awake ? "#c5f2c7" : "#6d816b", 2);
    line(c, x + 5, hy + 2, x + 12, hy + 2, awake ? "#c5f2c7" : "#6d816b", 2);
    polygon(
      c,
      [
        [x - 24, hy - 19],
        [x, hy - 42],
        [x + 24, hy - 19],
      ],
      "#777e5f",
      "#bea874",
    );
    line(c, x - 76, y - 4, x - 76, y - 67, "#95835a", 3);
    line(
      c,
      x - 76,
      y - 67,
      x + 76,
      y - 67,
      awake ? "#a1d1ad33" : "#c2a56c",
      awake ? 1 : 3,
    );
    line(c, x + 76, y - 4, x + 76, y - 67, "#95835a", 3);
    c.font = "10px Arial, sans-serif";
    c.textAlign = "center";
    c.fillStyle = awake ? "#bce3c2" : "#c8b884";
    c.fillText(
      awake ? "THE WARDEN REMEMBERS" : "THE SLEEPING WARDEN",
      x,
      hy - 58,
    );
    c.textAlign = "left";
  }
  private generatedSurface(
    c: CanvasRenderingContext2D,
    s: Surface,
    tick: number,
  ) {
    if (s.motion) {
      const depth = Math.min(24, Math.max(12, s.w * 0.2)),
        direction =
          Math.sign(s.x - s.motion.previousX) || Math.sign(s.motion.travel),
        trailingEdge = direction > 0 ? s.x : s.x + s.w;
      glow(c, s.x + s.w / 2, s.y + depth / 2, Math.min(100, s.w), "#8de4be20");
      for (let i = 1; i <= 3; i++)
        line(
          c,
          trailingEdge - direction * (8 + i * 6),
          s.y + 3 + i * 4,
          trailingEdge - direction * (23 + i * 6),
          s.y + 3 + i * 4,
          i === 1 ? "#8de4be50" : "#8de4be24",
          2,
        );
      polygon(
        c,
        [
          [s.x, s.y],
          [s.x + s.w, s.y],
          [s.x + s.w - Math.min(12, s.w * 0.12), s.y + depth * 0.35],
          [s.x + s.w * 0.34, s.y + depth],
          [s.x + Math.min(9, s.w * 0.12), s.y + depth * 0.4],
        ],
        s.solid ? "#796541" : "#79654133",
        s.solid ? "#d5b875" : "#d5b87566",
      );
      line(c, s.x, s.y, s.x + s.w, s.y, s.solid ? "#c4f7d8" : "#8de4be66", 3);
      line(c, s.x + 8, s.y + 5, s.x + s.w - 10, s.y + 5, "#8de4be85");
      line(
        c,
        s.x + s.w * 0.34,
        s.y + depth - 3,
        s.x + s.w * 0.64,
        s.y + depth * 0.55,
        "#e4c88488",
      );
      if (s.solid)
        glow(
          c,
          s.x + s.w * 0.4,
          s.y + depth,
          14 + Math.sin(tick / 24) * 2,
          "#8de4be35",
        );
      return;
    }
    if (s.solid) {
      glow(c, s.x + s.w / 2, s.y + 6, Math.min(110, s.w / 2), "#9aebbc15");
      polygon(
        c,
        [
          [s.x, s.y],
          [s.x + s.w, s.y],
          [s.x + s.w, s.y + s.h],
          [s.x, s.y + s.h],
        ],
        "#7de0b731",
      );
      line(c, s.x, s.y, s.x + s.w, s.y, "#b4f1cb", 2);
      for (let x = s.x + 8; x < s.x + s.w; x += 20)
        line(c, x, s.y + 2, x + 8, s.y + s.h, "#b4f1cb55");
      line(c, s.x, s.y + s.h, s.x + s.w, s.y + s.h, "#81c7ac55");
    } else {
      line(c, s.x, s.y, s.x + s.w, s.y, "#ddbd7f66", 1);
    }
    void tick;
  }
  private lamp(
    c: CanvasRenderingContext2D,
    e: Entity,
    on: boolean,
    time: number,
  ) {
    line(c, e.x + 12, 448, e.x + 12, e.y - 8, "#8f8059", 3);
    line(c, e.x - 4, e.y - 7, e.x + 28, e.y - 7, "#cfb67e", 3);
    polygon(
      c,
      [
        [e.x, e.y - 5],
        [e.x + 24, e.y - 5],
        [e.x + 19, e.y + 19],
        [e.x + 5, e.y + 19],
      ],
      on ? "#e8c27a83" : "#435450",
      "#ceb87a",
    );
    if (on) {
      glow(c, e.x + 12, e.y + 6, 85, "#f6ce7c2a");
      circle(c, e.x + 12, e.y + 6, 4, "#ffe3a3");
    }
    line(c, e.x + 1, e.y - 10, e.x + 12, e.y - 21, "#a18c5a", 2);
    line(c, e.x + 12, e.y - 21, e.x + 24, e.y - 10, "#a18c5a", 2);
    void time;
  }
  private prop(c: CanvasRenderingContext2D, e: Entity) {
    const x = e.x,
      y = e.y;
    polygon(
      c,
      [
        [x, y + 5],
        [x + e.w - 7, y],
        [x + e.w + 3, y + 11],
        [x + e.w + 3, y + e.h],
        [x + 5, y + e.h],
        [x, y + e.h - 7],
      ],
      "#333f39",
      "#9c8d5f",
    );
    polygon(
      c,
      [
        [x + 5, y + 7],
        [x + e.w - 6, y + 4],
        [x + e.w - 6, y + e.h - 5],
        [x + 5, y + e.h - 7],
      ],
      "#76836a",
    );
    c.fillStyle = "#bba779";
    c.fillRect(x + 2, y + 12, e.w - 3, 4);
    c.fillRect(x + 2, y + e.h - 13, e.w - 2, 4);
    circle(c, x + e.w / 2, y + e.h / 2, 11, "#424d40", "#c9b17b");
    circle(c, x + e.w / 2, y + e.h / 2, 4, "#9c8e62");
    line(c, x + 10, y + 7, x + 10, y - 3, "#bba779", 3);
    line(c, x + e.w - 12, y + 7, x + e.w - 12, y - 3, "#bba779", 3);
    line(c, x + 10, y - 3, x + e.w - 12, y - 3, "#bba779", 3);
    if (e.cue) {
      const colors = { mint: "#9be3ba", coral: C.coral, brass: C.gold };
      glow(c, x + 20, y + 30, 50, `${colors[e.cue.color]}24`);
      c.strokeStyle = colors[e.cue.color];
      c.lineWidth = 1;
      c.strokeRect(x - 3, y - 3, e.w + 6, e.h + 6);
    }
  }
  private courier(
    c: CanvasRenderingContext2D,
    e: Entity,
    tick: number,
    time: number,
    reduce: boolean,
    carried = true,
  ) {
    const x = e.x,
      y = e.y,
      walk = e.grounded
        ? Math.sin(tick * 0.25) * Math.min(4, Math.abs(e.vx))
        : 2;
    const direction = e.vx < -0.1 ? -1 : 1;
    c.save();
    c.translate(x + e.w / 2, y);
    c.scale((direction * e.w) / e.baseW, e.h / e.baseH);
    if (e.grounded) {
      c.fillStyle = "#0a17265c";
      c.beginPath();
      c.ellipse(0, 50, 20, 4, 0, 0, Math.PI * 2);
      c.fill();
    }
    polygon(
      c,
      [
        [-9, 18],
        [-17, 40],
        [3, 36],
        [8, 18],
      ],
      "#e5e3cd",
    );
    polygon(
      c,
      [
        [-4, 19],
        [-13, 38],
        [-9, 39],
        [2, 21],
      ],
      "#b6c8bd",
    );
    line(c, -3, 35, -5 + walk, 47, "#21302e", 5);
    line(c, 5, 35, 7 - walk, 47, "#21302e", 5);
    line(c, -7 + walk, 47, -1 + walk, 47, "#d7c695", 3);
    line(c, 4 - walk, 47, 11 - walk, 47, "#d7c695", 3);
    polygon(
      c,
      [
        [-7, 17],
        [6, 17],
        [9, 34],
        [-7, 34],
      ],
      "#b77a5e",
    );
    circle(c, 0, 11, 9, "#ede8cc");
    polygon(
      c,
      [
        [-9, 10],
        [7, 8],
        [6, 15],
        [-5, 17],
      ],
      "#1a3034",
    );
    circle(c, 5, 11, 1.2, "#f4dba4");
    polygon(
      c,
      [
        [-8, 19],
        [8, 17],
        [6, 23],
        [-8, 24],
      ],
      C.coral,
    );
    const flutter = reduce ? 0 : Math.sin(time * 3) * 3;
    polygon(
      c,
      [
        [-7, 20],
        [-23, 22 + flutter],
        [-29, 17 + flutter],
        [-18, 18],
      ],
      "#e99474",
    );
    line(c, 7, 25, 15, 30, "#e5d7b1", 3);
    if (carried) {
      glow(c, 18, 25, 48, "#ff9c622a");
      glow(c, 18, 25, 19, "#ff9c6250");
      polygon(
        c,
        [
          [18, 17],
          [23, 25],
          [18, 30],
          [14, 25],
        ],
        "#ffb28a",
      );
      polygon(
        c,
        [
          [18, 20],
          [20, 25],
          [18, 27],
          [16, 25],
        ],
        "#fff0c1",
      );
    }
    c.restore();
  }
  private hearth(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    complete: boolean,
    time: number,
  ) {
    line(c, x - 35, y, x - 35, y - 123, "#a8986a", 5);
    line(c, x + 35, y, x + 35, y - 123, "#a8986a", 5);
    c.beginPath();
    c.arc(x, y - 123, 35, Math.PI, 0);
    c.strokeStyle = "#c7af76";
    c.lineWidth = 5;
    c.stroke();
    circle(c, x, y - 96, 23, "#253c3c", "#9e8e60");
    polygon(
      c,
      [
        [x - 20, y - 53],
        [x + 20, y - 53],
        [x + 12, y - 31],
        [x - 12, y - 31],
      ],
      "#b3a071",
    );
    line(c, x, y - 31, x, y - 2, "#a39262", 8);
    if (complete) {
      glow(c, x, y - 70, 130, "#ffac6e55");
      polygon(
        c,
        [
          [x, y - 100],
          [x + 15, y - 69],
          [x, y - 52],
          [x - 12, y - 71],
        ],
        "#ffbe87",
      );
      circle(c, x, y - 70, 6, "#fff0c0");
    } else {
      glow(c, x, y - 92, 90, "#debb6f18");
      circle(c, x, y - 96, 4, "#c4b37d");
    }
    void time;
  }
  private vignette(c: CanvasRenderingContext2D, view: number) {
    const g = c.createRadialGradient(
      view * 0.5,
      280,
      150,
      view * 0.5,
      300,
      Math.max(650, view * 0.7),
    );
    g.addColorStop(0, "transparent");
    g.addColorStop(1, "#07121d9c");
    c.fillStyle = g;
    c.fillRect(0, 0, view, 650);
    const b = c.createLinearGradient(0, 550, 0, 650);
    b.addColorStop(0, "transparent");
    b.addColorStop(1, "#08141de0");
    c.fillStyle = b;
    c.fillRect(0, 550, view, 100);
  }
  private hud(c: CanvasRenderingContext2D, view: number, w: GameSnapshot) {
    c.textBaseline = "top";
    c.font = "11px 'Arial', sans-serif";
    c.letterSpacing = "2px";
    c.fillStyle = "#c7bc92";
    c.fillText(
      [
        "I · THE BROKEN CROSSING",
        "II · COUNTERWEIGHT HALL",
        "III · THE BEACON GUARDIAN",
      ][w.checkpoint],
      29,
      26,
    );
    c.letterSpacing = "0px";
    c.font = "21px Georgia, serif";
    c.fillStyle = C.cream;
    // One objective sentence; the opening prompt below repeats it, so skip it.
    const objective = w.completed
      ? "The light lives on."
      : "Carry the ember to the Astral Hearth.";
    c.fillText(objective, 28, 47);
    if (w.completed) {
      c.font = "11px Arial, sans-serif";
      c.fillStyle = "#bbcec1";
      c.fillText("The Astral Hearth is alight.", 29, 76);
    }
    const px = view - 114;
    for (let i = 0; i < 3; i++) {
      circle(
        c,
        px + i * 28,
        34,
        4,
        i <= w.checkpoint ? "#d1bc81" : "#4b635c",
        i <= w.checkpoint ? undefined : "#82907a",
      );
      if (i < 2)
        line(c, px + 6 + i * 28, 34, px + 22 + i * 28, 34, "#83907666");
    }
    c.font = "10px Arial, sans-serif";
    c.fillStyle = "#c7c6ac";
    c.fillText(
      w.emberCarried ? "EMBER IN HAND" : "EMBER RELEASED · Q",
      view - 132,
      51,
    );
    c.font = "12px Arial, sans-serif";
    c.fillStyle = "#d8ddcb";
    const text =
      w.interaction.length > 75
        ? w.interaction.slice(0, 72) + "…"
        : w.interaction;
    if (text !== objective) c.fillText(text, 28, 610);
    c.font = "10px Arial, sans-serif";
    c.fillStyle = "#91a99e";
    c.fillText(
      "A D / ← →  move       SPACE  jump       E  interact       Q  ember       R  recover",
      28,
      630,
    );
    if (w.activeHash) {
      c.font = "10px Arial, sans-serif";
      c.fillStyle = C.mint;
      c.textAlign = "right";
      c.fillText("LAW ACTIVE", view - 28, 610);
      c.textAlign = "left";
    }
  }
}
