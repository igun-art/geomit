/* geomit 3D sahne (Three.js). main.js, sayfa yüklendikten sonra ve hareket açıksa bunu yükler.
   Klasik betik + dinamik import: index.html'e çift tıklanınca (file://) da çalışsın diye
   (tarayıcı file:// altında yerel ES modül dosyasını engeller, CDN'den dinamik import'u engellemez).
   Hikâye: logodaki açık halka (yapay zeka cevabı) + turuncu küp (kaynak işareti = işletme) etrafında ince
   yörüngeler döner, hero'da bir ışık izi (soru) halkanın merkezinden geçer. Kaydırdıkça küp ayrılır, halka
   parçacık bulutuna ve küreye dönüşür, iletişim bölümünde logo yeniden birleşir. */
(async function () {
  "use strict";
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");

  const root = document.documentElement;
  const small = window.matchMedia("(max-width: 760px)");

  const canvas = document.createElement("canvas");
  canvas.className = "scene";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  // Beyaz bölge katmanı (Hizmetler → SSS): tuvalin arkasında durur, logo beyazın önünde çizilir (bkz. style.css)
  const veil = document.createElement("div");
  veil.className = "veil-layer";
  veil.setAttribute("aria-hidden", "true");
  document.body.prepend(veil);
  const zoneTopEl = document.getElementById("hizmetler"), zoneEndEl = document.getElementById("sss");
  // Ay-yıldız anında ekranda çapraz büyük yazı (süs: aria-hidden, 3D yoksa hiç görünmez)
  const ayKatman = document.createElement("div");
  ayKatman.className = "ay-katman";
  ayKatman.setAttribute("aria-hidden", "true");
  ayKatman.innerHTML = "<span class=\"ay-yazi\">Türkiye'de 1 Numarayız</span>";
  document.body.appendChild(ayKatman);
  const ayYazi = ayKatman.firstChild;
  // 29 Ekim'e özel alt satır: ziyaretçinin kendi takvimine göre yalnızca 29 Ekim günü görünür (30 Ekim'de kendiliğinden yok)
  const bugun = new Date();
  let ayAlt = null;
  if (bugun.getMonth() === 9 && bugun.getDate() === 29) {
    ayAlt = document.createElement("span");
    ayAlt.className = "ay-alt";
    ayAlt.textContent = "29 Ekim Kutlu Olsun";
    ayYazi.appendChild(ayAlt);
  }
  const seoGeoEl = document.getElementById("seo-geo");
  let zoneTop = 0, zoneBottom = 0;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const warm = new THREE.PointLight(0xed8b00, 6, 12);
  warm.position.set(2, 2, 3);
  scene.add(warm);

  function dotTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const dot = dotTexture();

  /* ---------- Kod karakterleri: 4x4 hücrelik doku. İlk 10 hücre ikili (0/1), kalanı kod işaretleri ---------- */
  const GLYPHS = ["0", "1", "0", "1", "0", "1", "0", "1", "0", "1", "{", "}", "<", ">", "/", "="];
  const GLYPH_FONT = '600 46px "Geist Mono", ui-monospace, Consolas, monospace';
  function glyphAtlas() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = GLYPH_FONT;
    GLYPHS.forEach((ch, i) => g.fillText(ch, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34));
    const t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false; // hücreler birbirine karışmasın
    t.minFilter = THREE.LinearFilter;
    return t;
  }
  function glyphTexture(ch) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = GLYPH_FONT;
    g.fillText(ch, 32, 34);
    return new THREE.CanvasTexture(c);
  }
  const atlas = glyphAtlas();
  // Parça gölgelendiricide: i numaralı hücrenin içindeki noktanın doku koordinatı
  const GLYPH_UV = "vec2 glyphUv(float i){ float cx = mod(i, 4.0), cy = floor(i / 4.0);"
    + " return vec2((cx + gl_PointCoord.x) / 4.0, 1.0 - (cy + gl_PointCoord.y) / 4.0); }";
  // Nokta boyutunu dünya biriminden piksele çeviren katsayı (resize'da güncellenir)
  const uProj = { value: 1 };

  /* ---------- Logo: açık halka + kaynak küpü (favicon.svg ile aynı oranlar) ---------- */
  const R = 1, TUBE = 0.21;
  const ARC = THREE.MathUtils.degToRad(290);
  const ARC_START = THREE.MathUtils.degToRad(80); // boşluk sağ üstte (45°) kalsın

  const group = new THREE.Group();
  scene.add(group);
  const mark = new THREE.Group();
  group.add(mark);

  const ringMat = new THREE.MeshPhysicalMaterial({
    color: 0xece4d0, metalness: 0.65, roughness: 0.26,
    clearcoat: 1, clearcoatRoughness: 0.18, transparent: true,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, TUBE, 40, 200, ARC), ringMat);
  ring.rotation.z = ARC_START;
  mark.add(ring);

  const cubeMat = new THREE.MeshPhysicalMaterial({
    color: 0xed8b00, metalness: 0.35, roughness: 0.28,
    clearcoat: 1, emissive: 0xed8b00, emissiveIntensity: 0.2,
  });
  const cube = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.62, 0.62, 4, 0.06), cubeMat);
  const DOCK = new THREE.Vector3(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0).multiplyScalar(1.45);
  const CENTER = new THREE.Vector3(0, 0, 0);
  mark.add(cube);

  // Küpün arkasındaki turuncu parıltı
  const glowMat = new THREE.SpriteMaterial({ map: dot, color: 0xed8b00, transparent: true, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  mark.add(glow);

  /* ---------- Ay-yıldız: hero ile SEO/GEO sınırında halka ay'a, küp yıldıza dönüşür (Feyzullah'ın isteği) ----------
     Oranlar Türk Bayrağı Kanunu'ndaki ölçülerden: dış daire r=1, iç daire r=0.8 ve merkezi 0.25 kayık,
     yıldızın çevrel dairesi r=0.5, merkezi dış dairenin merkezinden 1.683 uzakta; bir ucu aya bakar.
     Ay'ın açık tarafı logodaki C'nin boşluğu gibi sağ üste (45°) döner, yıldız küpün yerine gelir. */
  const flagMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.2, roughness: 0.3, clearcoat: 1, transparent: true, opacity: 0,
    emissive: 0xffffff, emissiveIntensity: 0.15,
  });
  const crescentShape = new THREE.Shape();
  {
    const d = 0.25, r2 = 0.8, ix = (d * d + 1 - r2 * r2) / (2 * d), iy = Math.sqrt(1 - ix * ix);
    const outerA = Math.atan2(iy, ix), innerA = Math.atan2(iy, ix - d);
    crescentShape.absarc(0, 0, 1, outerA, Math.PI * 2 - outerA, false);
    crescentShape.absarc(d, 0, r2, -innerA, innerA, true);
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i * Math.PI) / 5; // ilk uç aya (sola) bakar
    const rr = i % 2 ? 0.5 * 0.382 : 0.5;
    const px = 1.683 + Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) starShape.moveTo(px, py); else starShape.lineTo(px, py);
  }
  const flagGeo = new THREE.ExtrudeGeometry([crescentShape, starShape], { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3, curveSegments: 64 });
  flagGeo.translate(0, 0, -0.08);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.rotation.z = Math.PI / 4;
  flag.visible = false;
  mark.add(flag);

  /* ---------- Yörüngeler: logonun etrafında ince, eğik çemberler + üzerinde gezen noktalar ---------- */
  const orbits = new THREE.Group();
  group.add(orbits);
  const orbitMat = new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0, depthWrite: false });
  // Yörüngelerdeki "gezegenler" 1 ve 0 rakamları
  const satMats = ["1", "0", "1"].map((ch) => new THREE.SpriteMaterial({
    map: glyphTexture(ch), color: 0xed8b00, transparent: true, depthWrite: false,
  }));
  const ORBITS = [
    { r: 1.75, tiltX: 1.15, tiltY: 0.25, speed: 0.22 },
    { r: 2.35, tiltX: 1.32, tiltY: -0.4, speed: -0.15 },
    { r: 3.05, tiltX: 1.05, tiltY: 0.6, speed: 0.1 },
  ].map((o, n) => {
    const pts = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * o.r, Math.sin(a) * o.r, 0));
    }
    const pivot = new THREE.Group();
    pivot.rotation.set(o.tiltX, o.tiltY, 0);
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat);
    const sat = new THREE.Sprite(satMats[n]);
    sat.scale.setScalar(0.26);
    pivot.add(line, sat);
    orbits.add(pivot);
    return Object.assign(o, { sat });
  });

  /* ---------- Işık izi: hero'da ekranın sol altından halkanın merkezinden geçen soru ---------- */
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uDark: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: [
      "varying vec2 vUv; uniform float uTime; uniform float uAlpha; uniform float uDark;",
      "void main(){",
      "  float y = vUv.y - 0.5;",
      "  float core = exp(-y * y * 140.0);",
      "  float halo = exp(-y * y * 18.0) * 0.35;",
      "  float along = smoothstep(0.0, 0.55, vUv.x) * smoothstep(1.0, 0.76, vUv.x);",
      "  float flow = 0.65 + 0.35 * sin(vUv.x * 26.0 - uTime * 2.4);",
      // prizma: üst kenar mavi, orta turuncu, alt kenar pembe
      "  vec3 blue = vec3(0.45, 0.62, 1.0), gold = vec3(1.0, 0.62, 0.12), rose = vec3(1.0, 0.55, 0.65);",
      "  vec3 col = mix(gold, y > 0.0 ? blue : rose, clamp(abs(y) * 7.0, 0.0, 1.0));",
      "  col = mix(vec3(0.93, 0.55, 0.0) * (0.7 + 0.3 * col), col, uDark); // açık temada turuncu",
      "  gl_FragColor = vec4(col, (core + halo) * along * flow * uAlpha);",
      "}",
    ].join("\n"),
  });
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trailMat);
  const TRAIL_PAST = 1.4; // iz, halka merkezine olan mesafenin 1,4 katı uzar: merkez boyunun ~%70'inde kalır
  scene.add(trail);

  /* ---------- Kod yağmuru: Matrix'teki gibi sütun sütun 0/1 ve kod işaretleri ----------
     Karakterler ekranı kaplayan ızgarada sabit durur; aşağı akan şey parlaklıktır (sütunun başı en parlak,
     kuyruğu söner). Karakterler ara ara değişir, bazı sütunlar turuncu. Kaydırınca akış hızlanır. */
  const RAIN_COLS = 72, RAIN_ROWS = 34, CELL = 0.36, RAIN_Z = -6;
  const RAIN_COUNT = RAIN_COLS * RAIN_ROWS;
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  const rainData = new Float32Array(RAIN_COUNT * 4); // satır, hız (satır/sn), faz, kuyruk boyu
  const rainHot = new Float32Array(RAIN_COUNT);
  for (let c = 0; c < RAIN_COLS; c++) {
    const speed = 2.5 + Math.random() * 5, phase = Math.random(), tail = 6 + Math.random() * 12;
    const hot = Math.random() < 0.15 ? 1 : 0;
    for (let r = 0; r < RAIN_ROWS; r++) {
      const i = c * RAIN_ROWS + r;
      rainPos[i * 3] = (c - (RAIN_COLS - 1) / 2) * CELL;
      rainPos[i * 3 + 1] = ((RAIN_ROWS - 1) / 2 - r) * CELL;
      rainPos[i * 3 + 2] = RAIN_Z;
      rainData.set([r, speed, phase, tail], i * 4);
      rainHot[i] = hot;
    }
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  rainGeo.setAttribute("aData", new THREE.BufferAttribute(rainData, 4));
  rainGeo.setAttribute("aHot", new THREE.BufferAttribute(rainHot, 1));
  const rainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uAtlas: { value: atlas }, uProj, uTime: { value: 0 }, uFlow: { value: 0 }, uAlpha: { value: 0.5 },
      uRows: { value: RAIN_ROWS }, uSize: { value: CELL * 0.8 },
      uColor: { value: new THREE.Color(0xa9c8ff) }, uHead: { value: new THREE.Color(0xffffff) },
      uHotColor: { value: new THREE.Color(0xed8b00) },
    },
    vertexShader: [
      "attribute vec4 aData; attribute float aHot;",
      "uniform float uTime; uniform float uFlow; uniform float uProj; uniform float uRows; uniform float uSize;",
      "varying float vB; varying float vHead; varying float vHot; varying float vG;",
      "void main(){",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  gl_PointSize = uSize * uProj / -mv.z;",
      "  float span = uRows + aData.w + 8.0;",
      "  float d = mod(aData.z * span + uFlow * aData.y, span) - aData.x;", // başın bu satıra uzaklığı
      "  vB = (d >= 0.0 && d <= aData.w) ? pow(1.0 - d / aData.w, 1.6) : 0.0;",
      "  vHead = step(0.0, d) * step(d, 1.0);",
      "  float seed = fract(sin(dot(position.xy, vec2(12.9898, 78.233)) + floor(uTime * (0.4 + aData.y * 0.15))) * 43758.5453);",
      "  vG = floor(seed * 16.0);",
      "  vHot = aHot;",
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D uAtlas; uniform vec3 uColor; uniform vec3 uHead; uniform vec3 uHotColor; uniform float uAlpha;",
      "varying float vB; varying float vHead; varying float vHot; varying float vG;",
      GLYPH_UV,
      "void main(){",
      "  if (vB < 0.01) discard;",
      "  float a = texture2D(uAtlas, glyphUv(vG)).a;",
      "  vec3 col = mix(mix(uColor, uHotColor, vHot), uHead, vHead);",
      "  gl_FragColor = vec4(col, a * vB * uAlpha);",
      "}",
    ].join("\n"),
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  /* ---------- Parçacıklar: halka kabuğu, bulut, küre ---------- */
  const COUNT = 1800; // her cihazda aynı; 0/1 karakterleri noktadan iri olduğu için daha az
  function shellShape() {
    const a = new Float32Array(COUNT * 3);
    const r = TUBE + 0.06;
    for (let i = 0; i < COUNT; i++) {
      const u = ARC_START + Math.random() * ARC;
      const v = Math.random() * Math.PI * 2;
      a[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
      a[i * 3 + 1] = (R + r * Math.cos(v)) * Math.sin(u);
      a[i * 3 + 2] = r * Math.sin(v);
    }
    return a;
  }
  function cloudShape() {
    const a = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const d = new THREE.Vector3().randomDirection().multiplyScalar(0.6 + Math.cbrt(Math.random()) * 2.8);
      a[i * 3] = d.x * 1.35; a[i * 3 + 1] = d.y; a[i * 3 + 2] = d.z;
    }
    return a;
  }
  function globeShape() {
    const a = new Float32Array(COUNT * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      a[i * 3] = Math.cos(th) * rad * 1.55;
      a[i * 3 + 1] = y * 1.55;
      a[i * 3 + 2] = Math.sin(th) * rad * 1.55;
    }
    return a;
  }
  const SHAPES = [shellShape(), cloudShape(), globeShape()];

  const ptsGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(SHAPES[0]);
  ptsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const ptsSeed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) ptsSeed[i] = Math.random();
  ptsGeo.setAttribute("aSeed", new THREE.BufferAttribute(ptsSeed, 1));
  // Parçacıklar nokta değil 0/1: bulut ve küre ikili veriden oluşur, rakamlar yavaşça değişir
  const ptsMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uAtlas: { value: atlas }, uProj, uTime: { value: 0 }, uSize: { value: 0.09 }, uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(0xed8b00) },
    },
    vertexShader: [
      "attribute float aSeed; uniform float uTime; uniform float uProj; uniform float uSize; varying float vG;",
      "void main(){",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  gl_PointSize = uSize * uProj / -mv.z;",
      "  vG = mod(floor(aSeed * 10.0 + uTime * (0.3 + aSeed)), 10.0);", // sadece ilk 10 hücre: 0/1
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D uAtlas; uniform vec3 uColor; uniform float uOpacity; varying float vG;",
      GLYPH_UV,
      "void main(){",
      "  float a = texture2D(uAtlas, glyphUv(vG)).a;",
      "  if (a < 0.02) discard;",
      "  gl_FragColor = vec4(uColor, a * uOpacity);",
      "}",
    ].join("\n"),
  });
  const points = new THREE.Points(ptsGeo, ptsMat);
  group.add(points);

  /* ---------- Bölüm başına durumlar (sayfadaki bölüm sırasıyla) ----------
     x, y: ekranın yarı genişliği/yüksekliği cinsinden konum; s: ölçek;
     shape: 0 halka kabuğu, 1 bulut, 2 küre; mesh: halkanın görünürlüğü;
     pts: parçacık yoğunluğu; dock: küp logodaki yerinde (1) ya da merkezde (0);
     orb: yörüngelerin görünürlüğü; trail: ışık izinin görünürlüğü */
  const STATES = [
    { x: 0.8, y: 0.48, s: 0.55, shape: 0, mesh: 1, pts: 0, dock: 1, orb: 1, trail: 1 },        // hero: kartın sağ üst köşesinde
    { x: -0.64, y: 0.05, s: 0.6, shape: 0, mesh: 1, pts: 0.2, dock: 1, orb: 0.6, trail: 0 },  // SEO / GEO
    // Hizmetler → SSS beyaz bölgede: halka (mavi) her yerde görünür, metnin arkasında kaldığı için yarı saydam
    { x: 0, y: 0, s: 1.2, shape: 1, mesh: 0.4, pts: 0.85, dock: 0, orb: 0.25, trail: 0 },     // hizmetler
    { x: 0.58, y: 0, s: 1.0, shape: 2, mesh: 0.4, pts: 1, dock: 0, orb: 0.55, trail: 0 },     // süreç
    { x: -0.6, y: 0.05, s: 0.9, shape: 2, mesh: 0.4, pts: 0.8, dock: 0, orb: 0.3, trail: 0 }, // ilkeler
    { x: 0.62, y: 0, s: 0.85, shape: 1, mesh: 0.4, pts: 0.55, dock: 0, orb: 0.2, trail: 0 },  // SSS
    { x: 0.79, y: 0.14, s: 0.5, shape: 0, mesh: 1, pts: 0.12, dock: 1, orb: 0.9, trail: 0 },  // iletişim
  ];
  const KEYS = Object.keys(STATES[0]);
  const sections = Array.from(document.querySelectorAll("main > section"));
  let anchors = [];

  function measure() {
    const vh = window.innerHeight;
    anchors = sections.map((el, i) => {
      if (i === 0) return 0;
      const r = el.getBoundingClientRect();
      return Math.max(0, r.top + window.scrollY + r.height / 2 - vh / 2);
    });
    if (zoneTopEl && zoneEndEl) {
      const top = zoneTopEl.getBoundingClientRect().top + window.scrollY;
      const bottom = zoneEndEl.getBoundingClientRect().bottom + window.scrollY;
      veil.style.top = top + "px";
      veil.style.height = bottom - top + "px";
      // Logonun renk değiştireceği sınırlar: beyazın tamamlandığı yer (üst) ve alt geçişin ortası
      zoneTop = top + parseFloat(getComputedStyle(zoneTopEl).paddingTop) - 14;
      zoneBottom = bottom - parseFloat(getComputedStyle(zoneEndEl).paddingBottom) / 2;
    }
  }
  const smooth = (t) => t * t * (3 - 2 * t);

  function targetState() {
    const y = window.scrollY;
    const n = Math.min(anchors.length, STATES.length);
    let i = 0;
    while (i < n - 1 && y >= anchors[i + 1]) i++;
    const a = STATES[i], b = STATES[Math.min(i + 1, n - 1)];
    const span = (anchors[i + 1] ?? anchors[i]) - anchors[i];
    const t = span > 0 ? smooth(Math.min(1, Math.max(0, (y - anchors[i]) / span))) : 0;
    const out = {};
    KEYS.forEach((k) => { out[k] = a[k] + (b[k] - a[k]) * t; });
    if (small.matches) {
      out.x = out.x * 0.6 + 0.2; // sağa yaslı: dar ekranda başlığın üstüne binmesin
      out.y = out.y * 0.4 + 0.5;
      out.s *= 0.5;
    }
    return out;
  }
  function scrollProgress() {
    const max = root.scrollHeight - window.innerHeight;
    return max > 0 ? window.scrollY / max : 0;
  }

  let cur = null;
  let lastShape = -1;

  function updateParticles(shape) {
    if (Math.abs(shape - lastShape) < 0.0005) return;
    lastShape = shape;
    const i0 = Math.floor(shape), i1 = Math.min(i0 + 1, SHAPES.length - 1);
    const f = smooth(shape - i0);
    const A = SHAPES[i0], B = SHAPES[i1];
    for (let i = 0; i < positions.length; i++) positions[i] = A[i] + (B[i] - A[i]) * f;
    ptsGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- Tema renkleri CSS değişkenlerinden ---------- */
  let isDark = true;
  let veilOn = false, veilMode = false;
  const inkBase = new THREE.Color(), inkVeil = new THREE.Color(), orbitBase = new THREE.Color(), orbitVeil = new THREE.Color("#2c4a9a");
  function applyTheme() {
    const cs = getComputedStyle(root);
    isDark = cs.getPropertyValue("--3d-dark").trim() === "1";
    inkBase.set(cs.getPropertyValue("--3d-ink").trim() || "#ece4d0");
    ringMat.color.copy(inkBase);
    veilOn = cs.getPropertyValue("--3d-veil").trim() === "1";
    inkVeil.set(cs.getPropertyValue("--3d-veil-ink").trim() || "#1d4fd8");
    veilMode = false;
    ringMat.metalness = isDark ? 0.65 : 0.15;
    ringMat.roughness = isDark ? 0.26 : 0.4;
    ptsMat.uniforms.uColor.value.set(cs.getPropertyValue("--3d-particle").trim() || "#ed8b00");
    orbitBase.set(cs.getPropertyValue("--3d-orbit").trim() || "#9fb4ff");
    orbitMat.color.copy(orbitBase);
    const blend = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    [ptsMat, glowMat, ...satMats, trailMat, rainMat].forEach((m) => { m.blending = blend; m.needsUpdate = true; });
    // Kod yağmuru: koyuda buz mavisi + beyaz baş, açıkta lacivert; metnin arkasında kaldığı için soluk
    rainMat.uniforms.uColor.value.set(isDark ? "#a9c8ff" : "#2c4a9a");
    rainMat.uniforms.uHead.value.set(isDark ? "#ffffff" : "#0d1a45");
    rainMat.uniforms.uHotColor.value.set(isDark ? "#ed8b00" : "#c46f00");
    rainMat.uniforms.uAlpha.value = isDark ? 0.5 : 0.32;
    trailMat.uniforms.uDark.value = isDark ? 1 : 0;
    renderer.toneMappingExposure = isDark ? 1.0 : 0.9;
  }
  window.addEventListener("gm-theme", applyTheme);
  applyTheme();

  function resize() {
    const w = root.clientWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uProj.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    measure();
  }
  window.addEventListener("resize", resize);
  // SSS açılıp kapanınca sayfa uzar/kısalır: beyaz katman ve bölüm noktaları yeniden ölçülür
  if ("ResizeObserver" in window) new ResizeObserver(() => measure()).observe(document.querySelector("main"));
  // Yazı tipleri ve görseller yüklenince bölüm konumları değişebilir
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  resize();

  /* ---------- Döngü ---------- */
  const timer = new THREE.Timer();
  const tmp = new THREE.Vector3();
  let spin = 0;
  function frame(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();
    const target = targetState();
    if (!cur) cur = Object.assign({}, target);
    const k = 1 - Math.exp(-dt * 3.5);
    KEYS.forEach((key) => { cur[key] += (target[key] - cur[key]) * k; });

    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    group.position.set(cur.x * halfW, cur.y * halfH, 0);
    group.scale.setScalar(cur.s);

    // Logo kameraya dönük kalır, hafifçe salınır
    mark.rotation.set(0.18 + Math.sin(time * 0.5) * 0.08, Math.sin(time * 0.4) * 0.35 - 0.2, 0);

    // Beyaz bölge: logo oraya girince beyazdan maviye döner; ekranın ortası bölgedeyken toplamalı (additive) karışım
    // beyazda görünmez olacağı için parçacıklar, parıltı ve rakamlar normal karışıma geçer. Kod yağmuru toplamalı kalır (beyazda kaybolur).
    const vh = window.innerHeight, zt = zoneTop - window.scrollY, zb = zoneBottom - window.scrollY;
    const inZone = (y) => (veilOn ? smooth(Math.min(1, Math.max(0, (y - zt) / 80))) * (1 - smooth(Math.min(1, Math.max(0, (y - zb + 80) / 80)))) : 0);
    const fRing = inZone(vh / 2 - (cur.y * vh) / 2);
    const fView = inZone(vh / 2);
    ringMat.color.copy(inkBase).lerp(inkVeil, fRing);
    ringMat.metalness = (isDark ? 0.65 : 0.15) - 0.3 * fRing;
    orbitMat.color.copy(orbitBase).lerp(orbitVeil, fRing);
    if (isDark && (fView > 0.5) !== veilMode) {
      veilMode = fView > 0.5;
      const blend = veilMode ? THREE.NormalBlending : THREE.AdditiveBlending;
      [ptsMat, glowMat, ...satMats, trailMat].forEach((m) => { m.blending = blend; m.needsUpdate = true; });
    }

    // Ay-yıldız anı: SEO/GEO bölümünün üst kenarı ekranın ~%45'indeyken tam, ±%22 ekran boyu içinde yumuşak geçiş
    let ay = 0;
    if (seoGeoEl) {
      const r = seoGeoEl.getBoundingClientRect().top / vh;
      ay = 1 - smooth(Math.min(1, Math.abs(r - 0.45) / 0.22));
    }
    flag.visible = ay > 0.01;
    flagMat.opacity = ay;
    flagMat.color.set(isDark ? 0xffffff : 0xe30a17);
    flagMat.emissive.set(isDark ? 0xffffff : 0xe30a17);
    flag.scale.setScalar(0.6 + 0.4 * ay);
    flag.rotation.z = Math.PI / 4 + (1 - ay) * 0.8;
    ayKatman.style.opacity = (ay * 0.85).toFixed(3); // sayfanın yumuşak diline uysun: hiçbir anda tam parlak değil
    ayKatman.style.setProperty("--ay", ay.toFixed(3));
    if (ay > 0.01) {
      // Yazı logoyla üst üste binmesin: yıldızın sağına, onun hizasından yukarı doğru; sağda yer yoksa (telefon) logonun üstüne
      const vw = root.clientWidth, R = (vh / (2 * halfH)) * cur.s; // logonun 1 birimi kaç piksel
      const lx = vw / 2 + (cur.x * vw) / 2, ly = vh / 2 - (cur.y * vh) / 2;
      const tw = ayYazi.offsetWidth, th = ayYazi.offsetHeight;
      let left = lx + 2.0 * R, bottom = ly + 0.2 * R + (ayAlt ? ayAlt.offsetHeight : 0); // alt satır varsa ilk satır yerinde kalsın
      if (left + tw > vw - 16) { left = Math.max(16, Math.min(lx - tw / 2, vw - 16 - tw)); bottom = ly - 2.3 * R; }
      bottom = Math.max(bottom, 80 + th + tw * 0.18); // döndürülmüş yazının sağ ucu menünün altında kalsın
      ayYazi.style.left = left.toFixed(1) + "px";
      ayYazi.style.top = bottom.toFixed(1) + "px";
    }

    ringMat.opacity = cur.mesh * (1 - ay);
    ring.visible = cur.mesh * (1 - ay) > 0.02;
    ring.scale.setScalar((0.85 + 0.15 * cur.mesh) * (1 - 0.3 * ay));

    // Küp: yerindeyken halkanın boşluğunda hafifçe süzülür ve nabız gibi parlar, ayrılınca merkezde döner
    cube.position.lerpVectors(CENTER, DOCK, cur.dock);
    cube.position.y += Math.sin(time * 1.6) * 0.04 * cur.dock;
    cube.rotation.set(time * 0.3 * (1 - cur.dock) + 0.2, time * 0.5, 0);
    cube.scale.setScalar((0.8 + 0.2 * cur.dock) * (1 - ay));
    cube.visible = ay < 0.99;
    const blink = Math.pow(0.5 + 0.5 * Math.sin(time * 2.4), 4);
    cubeMat.emissiveIntensity = 0.15 + blink * 0.4 * cur.dock;
    glow.position.set(cube.position.x, cube.position.y, -0.2);
    glow.scale.setScalar(0.9 + blink * 0.35);
    glowMat.opacity = (isDark ? 0.55 : 0.3) * (0.6 + 0.4 * blink) * cur.dock * (1 - ay);

    // Yörüngeler: noktalar döner, kaydırdıkça düzlemler eğilir
    const sp = scrollProgress();
    orbits.visible = cur.orb > 0.02;
    orbitMat.opacity = cur.orb * (isDark ? 0.32 : 0.28);
    satMats.forEach((m) => { m.opacity = cur.orb * 0.95; });
    orbits.rotation.set(sp * 0.9, time * 0.04 + sp * 1.4, 0);
    ORBITS.forEach((o) => {
      const a = time * o.speed + o.r;
      o.sat.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r, 0);
    });

    // Işık izi: ekranın sol altından halkanın tam merkezinden geçer ve ötesinde söner.
    // Halkayla aynı derinlikte (z=0) çizilir; tüpün önündeki kısımlar izi örter, iz halkanın içinden geçiyormuş gibi görünür.
    trail.visible = cur.trail > 0.02;
    if (trail.visible) {
      ring.getWorldPosition(tmp);
      const sx = -halfW * 1.1, sy = -halfH * 1.05; // metnin altından geçsin
      const dx = (tmp.x - sx) * TRAIL_PAST, dy = (tmp.y - sy) * TRAIL_PAST;
      trail.position.set(sx + dx / 2, sy + dy / 2, tmp.z);
      trail.rotation.z = Math.atan2(dy, dx);
      trail.scale.set(Math.hypot(dx, dy), small.matches ? 0.5 : 0.8, 1);
      trailMat.uniforms.uTime.value = time;
      // telefonda iz metnin üstünden geçer; görünür ama okumayı bozmayacak kadar soluk
      trailMat.uniforms.uAlpha.value = cur.trail * (isDark ? 0.9 : 0.55) * (small.matches ? 0.5 : 1);
    }

    // Kod yağmuru: zamanla akar, kaydırınca öne atılır
    rainMat.uniforms.uTime.value = time;
    rainMat.uniforms.uFlow.value = time + sp * 12;

    updateParticles(cur.shape);
    ptsMat.uniforms.uTime.value = time;
    spin += dt * 0.15;
    const shapeMix = Math.min(cur.shape, 1);
    points.rotation.set(mark.rotation.x, mark.rotation.y + spin * shapeMix, mark.rotation.z);
    ptsMat.uniforms.uOpacity.value = cur.pts * 0.5 * (1 - 0.7 * fView); // metnin arkasında kaldığı için soluk; beyazda (metnin hemen arkasında) çok daha soluk
    points.visible = cur.pts > 0.01;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  root.classList.add("has-3d");
})().catch(function (err) {
  // 3D yüklenemezse sabit logo görünmeye devam eder
  console.warn("3D sahne yüklenemedi:", err && err.message);
});
