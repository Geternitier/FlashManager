/* ==========================================================================
   FlashManager · Sugar Star redesign proposal
   Interactive prototype + document interactions
   ========================================================================== */

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const pad2 = (n) => String(n).padStart(2, "0");

  const clockTime = (date = new Date()) =>
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

  const shortTime = (date = new Date()) =>
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  const timeAgo = (ts) => {
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 5) return "刚刚";
    if (secs < 60) return `${secs} 秒前`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    return `${hours} 小时前`;
  };

  const formatUptime = (secs, compact = false) => {
    if (!secs || secs <= 0) return compact ? "—" : "00:00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (compact) {
      if (h > 0) return `${h}h ${pad2(m)}m`;
      if (m > 0) return `${m}m ${pad2(s)}s`;
      return `${s}s`;
    }
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  };

  const weekdayCN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  const todayLabel = () => {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日 · ${weekdayCN[d.getDay()]}`;
  };

  const greetingFor = (hour = new Date().getHours()) => {
    if (hour < 5) return { main: "夜深了", side: "夜深啦", line: "小闪把灯调暗了一点。" };
    if (hour < 11) return { main: "早上好", side: "早上好呀", line: "今天也从一杯热茶开始吧。" };
    if (hour < 13) return { main: "中午好", side: "中午好呀", line: "记得吃饭，服务交给小闪。" };
    if (hour < 18) return { main: "下午好", side: "下午好呀", line: "下午也一起加油吧。" };
    return { main: "晚上好", side: "晚上好呀", line: "今天也辛苦啦～" };
  };

  const greetingLines = [
    "都交给我吧～",
    "今天也很稳呢！",
    "我在这里看着呢。",
    "有异常我会吐个泡泡提醒你。",
    "要不要先喝口水？",
  ];

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const highlight = (text, query) => {
    const safe = esc(text);
    if (!query) return safe;
    try {
      return safe.replace(new RegExp(`(${escapeRegExp(esc(query))})`, "gi"), "<mark>$1</mark>");
    } catch {
      return safe;
    }
  };

  /* ------------------------------------------------------------------------
     Mascot
     ------------------------------------------------------------------------ */

  const MASCOT_LABEL = "小闪，蓝鲸女仆";

  function mascotMarkup(mood = "idle", variant = "head") {
    return `<span class="mascot-photo" data-mood="${mood}" data-variant="${variant}" role="img" aria-label="${MASCOT_LABEL}">
      <span class="mascot-img" aria-hidden="true"></span>
    </span>`;
  }

  function hydrateMascots(root = document) {
    $$(".mascot-slot[data-mascot]", root).forEach((slot) => {
      if (slot.dataset.hydrated === "1") return;
      const size = Number(slot.dataset.size || 80);
      slot.style.setProperty("--mascot-size", `${size}px`);
      const variant = slot.dataset.avatar === "full" ? "full" : "head";
      slot.innerHTML = mascotMarkup(slot.dataset.mascot || "idle", variant);
      slot.dataset.hydrated = "1";
    });
  }

  function setMascotMood(slot, mood) {
    if (!slot) return;
    const photo = slot.querySelector(".mascot-photo");
    if (photo) photo.dataset.mood = mood;
    slot.dataset.mascot = mood;
  }

  /* ------------------------------------------------------------------------
     Demo data
     ------------------------------------------------------------------------ */

  const TYPE_META = {
    exe: { mono: "EXE", label: "EXE 程序", cls: "t-exe" },
    python: { mono: "PY", label: "Python", cls: "t-python" },
    node: { mono: "JS", label: "Node.js", cls: "t-node" },
    nginx: { mono: "NG", label: "Nginx", cls: "t-nginx" },
    script: { mono: ">_", label: "BAT / PS1", cls: "t-script" },
  };

  const GROUP_COLORS = {
    "AI 推理": "#8e6fe8",
    "AI Agent 项目": "#2fa98f",
    "折枝": "#e85d8f",
    "网关与中间件": "#3d8fd6",
    "开发工具": "#d99a2b",
  };

  const t = (offsetSeconds = 0) => {
    const d = new Date(Date.now() + offsetSeconds * 1000);
    return clockTime(d);
  };

  const log = (level, text, offsetSeconds = 0) => ({
    t: t(offsetSeconds),
    level,
    text,
  });

  const BASE_SERVICES = [
    {
      id: "svc-ollama",
      name: "Ollama 推理引擎",
      group: "AI 推理",
      serviceType: "exe",
      status: "running",
      port: 11434,
      portActive: true,
      frontendUrl: "",
      cpu: 8.2,
      mem: 212,
      uptime: 8040,
      pid: 4821,
      autoRestart: false,
      encoding: "utf-8",
      cwd: "C:/Users/Geternitier/AppData/Local/Programs/Ollama",
      executable: "C:/Users/Geternitier/AppData/Local/Programs/Ollama/ollama.exe",
      scriptPath: "",
      args: ["serve"],
      cmd: "ollama.exe serve",
      lastUsed: Date.now() - 2 * 60 * 1000,
      lastError: "",
      logs: [
        log("SYS", "服务由 FlashManager 启动，进程树已绑定 JobObject", -8100),
        log("OUT", "time=2026-10-19T17:05:12 level=INFO msg=\"starting ollama server\"", -8045),
        log("OUT", "llama runner started in 1.24 seconds", -8032),
        log("OUT", "listening on 127.0.0.1:11434 (version 0.4.7)", -8030),
        log("OUT", "POST /api/generate 200 2.41s model=qwen2.5:7b", -420),
        log("OUT", "POST /api/chat 200 18ms model=qwen2.5:7b", -180),
        log("SYS", "keep-alive：模型常驻显存 4.8 GB", -60),
      ],
      events: [
        { text: "服务启动成功", time: "2 小时前", type: "success" },
        { text: "模型 qwen2.5:7b 加载完成", time: "2 小时前", type: "success" },
        { text: "自动重启保持关闭", time: "昨天 22:10", type: "neutral" },
      ],
    },
    {
      id: "svc-rag",
      name: "DeepSeek RAG 助手",
      group: "AI Agent 项目",
      serviceType: "python",
      status: "running",
      port: 8787,
      portActive: true,
      frontendUrl: "http://127.0.0.1:8787",
      cpu: 2.4,
      mem: 86,
      uptime: 3720,
      pid: 5130,
      autoRestart: true,
      encoding: "utf-8",
      cwd: "D:/Develop/Deepseek/rag",
      executable: "python",
      scriptPath: "server.py",
      args: ["--port", "8787"],
      cmd: "python server.py --port 8787",
      lastUsed: Date.now() - 28 * 1000,
      lastError: "",
      logs: [
        log("SYS", "使用项目内 .venv 解释器启动", -3900),
        log("OUT", "INFO:     Started server process [5130]", -3890),
        log("OUT", "INFO:     Waiting for application startup.", -3888),
        log("OUT", "INFO:     vector store loaded: 12,480 chunks", -3860),
        log("OUT", "INFO:     Uvicorn running on http://127.0.0.1:8787", -3858),
        log("OUT", "INFO:     127.0.0.1:51922 - \"POST /v1/chat HTTP/1.1\" 200 OK", -240),
        log("OUT", "INFO:     retrieval 8 docs · rerank 42ms · total 318ms", -236),
        log("OUT", "INFO:     127.0.0.1:51940 - \"GET /health HTTP/1.1\" 200 OK", -90),
      ],
      events: [
        { text: "服务启动成功", time: "1 小时前", type: "success" },
        { text: "配置修改：args 增加 --port 8787", time: "今天 17:31", type: "neutral" },
        { text: "异常退出后自动重启 0 次", time: "今天", type: "success" },
      ],
    },
    {
      id: "svc-zhezhi-web",
      name: "折枝 · 页面",
      group: "折枝",
      serviceType: "node",
      status: "running",
      port: 18473,
      portActive: true,
      frontendUrl: "http://127.0.0.1:18473",
      cpu: 1.1,
      mem: 64,
      uptime: 19860,
      pid: 6244,
      autoRestart: true,
      encoding: "utf-8",
      cwd: "D:/Develop/Grok/Generator",
      executable: "D:/Software/Node/node.exe",
      scriptPath: "web-server.mjs",
      args: [],
      cmd: "node web-server.mjs",
      lastUsed: Date.now() - 5 * 60 * 1000,
      lastError: "",
      logs: [
        log("SYS", "热加载配置：frontendUrl = http://127.0.0.1:18473", -19900),
        log("OUT", "[web] assets mounted at /public (42 files)", -19890),
        log("OUT", "[web] ready on http://127.0.0.1:18473", -19880),
        log("OUT", "GET /api/gallery 200 12ms", -300),
        log("OUT", "GET /api/tree?depth=2 200 7ms", -260),
        log("OUT", "[cache] hit zhezhi:gallery:v4", -255),
        log("OUT", "GET /assets/main.css 304 2ms", -120),
      ],
      events: [
        { text: "服务启动成功", time: "5 小时前", type: "success" },
        { text: "前端地址已更新", time: "昨天 21:08", type: "neutral" },
        { text: "自动重启已开启", time: "昨天 21:08", type: "success" },
      ],
    },
    {
      id: "svc-zhezhi-api",
      name: "折枝 · 后端",
      group: "折枝",
      serviceType: "node",
      status: "error",
      port: 8741,
      portActive: false,
      frontendUrl: "",
      cpu: 0,
      mem: 0,
      uptime: 0,
      pid: null,
      autoRestart: true,
      encoding: "utf-8",
      cwd: "D:/Develop/Grok/Generator",
      executable: "D:/Software/Node/node.exe",
      scriptPath: "index.js",
      args: [],
      cmd: "node index.js",
      lastUsed: Date.now() - 4 * 60 * 1000,
      lastError: "端口 8741 仍被占用（EADDRINUSE）",
      logs: [
        log("SYS", "自动重启第 2 次，等待 1.5 秒", -260),
        log("OUT", "[api] booting zhezhi backend ...", -255),
        log("ERR", "Error: listen EADDRINUSE: address already in use :::8741", -250),
        log("ERR", "    at Server.setupListenHandle [as _listen2] (node:net:1908:16)", -249),
        log("ERR", "    at listenInCluster (node:net:1965:12)", -248),
        log("SYS", "进程退出 code=1 · 端口探测失败（120ms timeout）", -240),
        log("ERR", "端口 8741 仍被占用（EADDRINUSE）", -238),
      ],
      events: [
        { text: "启动失败：EADDRINUSE", time: "4 分钟前", type: "error" },
        { text: "自动重启尝试 2 次", time: "4 分钟前", type: "error" },
        { text: "端口探测 8741 无响应", time: "3 分钟前", type: "error" },
      ],
    },
    {
      id: "svc-nginx",
      name: "Nginx 网关",
      group: "网关与中间件",
      serviceType: "nginx",
      status: "running",
      port: 80,
      portActive: true,
      frontendUrl: "",
      cpu: 0.3,
      mem: 12,
      uptime: 43680,
      pid: 1880,
      autoRestart: false,
      encoding: "utf-8",
      cwd: "D:/Develop/Windows/Nginx",
      executable: "D:/Develop/Windows/Nginx/nginx.exe",
      scriptPath: "",
      args: ["-c", "conf/nginx.conf"],
      cmd: "nginx -c conf/nginx.conf",
      lastUsed: Date.now() - 12 * 60 * 1000,
      lastError: "",
      logs: [
        log("SYS", "nginx -p D:/Develop/Windows/Nginx -c conf/nginx.conf", -43700),
        log("OUT", "nginx: configuration file conf/nginx.conf test is successful", -43690),
        log("OUT", "signal process started", -43680),
        log("OUT", "127.0.0.1 - - \"GET / HTTP/1.1\" 200 1024", -320),
        log("OUT", "127.0.0.1 - - \"GET /api/health HTTP/1.1\" 200 64", -180),
      ],
      events: [
        { text: "配置测试通过并启动", time: "12 小时前", type: "success" },
        { text: "未开启自动重启", time: "昨天", type: "neutral" },
      ],
    },
    {
      id: "svc-clean",
      name: "数据清洗脚本",
      group: "开发工具",
      serviceType: "script",
      status: "stopped",
      port: null,
      portActive: false,
      frontendUrl: "",
      cpu: 0,
      mem: 0,
      uptime: 0,
      pid: null,
      autoRestart: false,
      encoding: "gbk",
      cwd: "D:/Develop/Tools/clean",
      executable: "powershell.exe",
      scriptPath: "clean.ps1",
      args: [],
      cmd: "powershell -File clean.ps1",
      lastUsed: Date.now() - 3 * 60 * 60 * 1000,
      lastError: "",
      logs: [
        log("SYS", "上次运行：昨天 23:10 · 退出 code=0", -43200),
        log("OUT", "正在读取 data/*.csv ...", -43320),
        log("OUT", "已清洗 128 行，丢弃 4 行空记录", -43310),
        log("SYS", "服务已停止，进程树已回收", -43300),
      ],
      events: [
        { text: "上次运行完成：128 行", time: "昨天 23:10", type: "success" },
        { text: "手动停止", time: "昨天 23:10", type: "neutral" },
      ],
    },
    {
      id: "svc-bff",
      name: "Mock BFF 服务",
      group: "开发工具",
      serviceType: "node",
      status: "stopped",
      port: 3001,
      portActive: false,
      frontendUrl: "http://127.0.0.1:3001",
      cpu: 0,
      mem: 0,
      uptime: 0,
      pid: null,
      autoRestart: true,
      encoding: "utf-8",
      cwd: "D:/Develop/Playground/mock-bff",
      executable: "node",
      scriptPath: "bff.mjs",
      args: [],
      cmd: "node bff.mjs",
      lastUsed: Date.now() - 26 * 60 * 60 * 1000,
      lastError: "",
      logs: [
        log("SYS", "服务已停止，进程树已回收", -93600),
        log("OUT", "[bff] shutting down gracefully ...", -93610),
        log("OUT", "[bff] server closed", -93608),
      ],
      events: [
        { text: "手动停止", time: "昨天 17:20", type: "neutral" },
        { text: "自动重启已开启", time: "昨天 17:20", type: "success" },
      ],
    },
  ];

  const LOG_TEMPLATES = {
    "svc-ollama": [
      ["OUT", "POST /api/generate 200 1.82s model=qwen2.5:7b"],
      ["OUT", "GET /api/tags 200 3ms"],
      ["OUT", "POST /api/chat 200 26ms model=qwen2.5:7b"],
      ["SYS", "keep-alive：模型常驻显存 4.8 GB"],
    ],
    "svc-rag": [
      ["OUT", "INFO:     127.0.0.1 - \"POST /v1/chat HTTP/1.1\" 200 OK"],
      ["OUT", "INFO:     retrieval 6 docs · rerank 38ms · total 284ms"],
      ["OUT", "INFO:     127.0.0.1 - \"GET /health HTTP/1.1\" 200 OK"],
      ["SYS", "日志游标 +1，已增量同步到界面"],
    ],
    "svc-zhezhi-web": [
      ["OUT", "GET /api/gallery 200 11ms"],
      ["OUT", "GET /api/tree?depth=2 200 6ms"],
      ["OUT", "[cache] hit zhezhi:gallery:v4"],
      ["OUT", "GET /assets/main.css 304 2ms"],
    ],
    "svc-nginx": [
      ["OUT", "127.0.0.1 - - \"GET /api/health HTTP/1.1\" 200 64"],
      ["OUT", "127.0.0.1 - - \"GET /assets/app.js HTTP/1.1\" 304 0"],
      ["OUT", "127.0.0.1 - - \"GET / HTTP/1.1\" 200 1024"],
    ],
    "svc-bff": [
      ["OUT", "[bff] GET /mock/user 200 4ms"],
      ["OUT", "[bff] GET /mock/orders 200 9ms"],
    ],
    "svc-clean": [
      ["OUT", "正在清洗 data/export-2026-10-19.csv ..."],
      ["OUT", "已处理 64 行，丢弃 1 行空记录"],
    ],
  };

  const DB = {
    services: BASE_SERVICES.map((service) => ({
      ...service,
      logs: service.logs.slice(),
      events: service.events.slice(),
    })),
  };

  const state = {
    filter: "all",
    group: "all",
    type: "all",
    query: "",
    sort: "status",
    view: "grid",
    demo: "normal",
    selectedId: "",
    drawerOpen: false,
    drawerTab: "overview",
    logLevel: "all",
    logQuery: "",
    logFollow: true,
    logWrap: true,
    theme: "day",
    moe: "1",
    reduceMotion: false,
    annotations: false,
    paletteOpen: false,
    paletteQuery: "",
    paletteIndex: 0,
    busy: new Map(),
    recovered: new Set(),
    lastUpdated: Date.now(),
    refreshMs: 3000,
  };

  const SORT_OPTIONS = [
    { key: "status", label: "按状态" },
    { key: "name", label: "按名称" },
    { key: "cpu", label: "按占用" },
    { key: "recent", label: "按最近" },
  ];

  const STATUS_META = {
    running: { cls: "is-running", label: "运行中", icon: "i-play" },
    stopped: { cls: "is-stopped", label: "已停止", icon: "i-pause" },
    error: { cls: "is-error", label: "需要关心", icon: "i-alert" },
  };

  function baseService(id) {
    return DB.services.find((service) => service.id === id) || null;
  }

  function getServices() {
    if (state.demo === "empty") return [];
    if (state.demo === "loading") return null;

    const list = DB.services.map((service) => ({
      ...service,
      logs: service.logs,
      events: service.events,
    }));

    if (state.demo === "error") {
      const script = list.find((service) => service.id === "svc-clean");
      if (script && !state.recovered.has(script.id)) {
        script.status = "error";
        script.port = 9100;
        script.portActive = false;
        script.pid = null;
        script.cpu = 0;
        script.mem = 0;
        script.uptime = 0;
        script.lastError = "脚本退出码 1（权限不足）";
        script.cmd = "powershell -File clean.ps1";
      }
    }

    return list;
  }

  function getVisibleServices() {
    const all = getServices();
    if (!all) return null;
    const query = state.query.trim().toLowerCase();

    const filtered = all.filter((service) => {
      if (state.filter === "running" && service.status !== "running") return false;
      if (state.filter === "error" && service.status !== "error") return false;
      if (state.filter === "stopped" && service.status !== "stopped") return false;
      if (state.group !== "all" && service.group !== state.group) return false;
      if (state.type !== "all" && service.serviceType !== state.type) return false;
      if (!query) return true;
      const haystack = [
        service.name,
        service.group,
        service.serviceType,
        service.cmd,
        service.cwd,
        service.scriptPath,
        String(service.port || ""),
        String(service.pid || ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const rank = { error: 0, running: 1, stopped: 2 };
    filtered.sort((a, b) => {
      if (state.sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (state.sort === "cpu") return b.cpu - a.cpu;
      if (state.sort === "recent") return b.lastUsed - a.lastUsed;
      const diff = rank[a.status] - rank[b.status];
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "zh-CN");
    });

    return filtered;
  }

  function counts() {
    const all = getServices() || [];
    return {
      total: all.length,
      running: all.filter((service) => service.status === "running").length,
      error: all.filter((service) => service.status === "error").length,
      stopped: all.filter((service) => service.status === "stopped").length,
    };
  }

  function currentService() {
    const all = getServices() || [];
    return all.find((service) => service.id === state.selectedId) || null;
  }

  const app = $("#fmApp");
  const grid = $("#serviceGrid");
  const drawer = $("#drawer");
  const drawerHead = $("#drawerHead");
  const drawerTabs = $("#drawerTabs");
  const drawerBody = $("#drawerBody");
  const modalRoot = $("#modalRoot");
  const paletteRoot = $("#paletteRoot");
  const toastsRoot = $("#toasts");
  const annotationsRoot = $("#annotations");
  const mainScroll = $("#mainScroll");

  /* ------------------------------------------------------------------------
     Small render helpers
     ------------------------------------------------------------------------ */

  function typeIcon(service, extraClass = "") {
    const meta = TYPE_META[service.serviceType] || TYPE_META.exe;
    return `<span class="fm-type-icon ${meta.cls} ${extraClass}" aria-hidden="true">${meta.mono}</span>`;
  }

  function statusPill(status, extra = "") {
    const meta = STATUS_META[status] || STATUS_META.stopped;
    return `<span class="fm-status ${meta.cls} ${extra}"><i></i>${meta.label}</span>`;
  }

  function statusButtonLabel(service) {
    if (service.status === "running") return "停止";
    if (service.status === "error") return "重试";
    return "启动";
  }

  function busyFor(id) {
    return state.busy.get(id) || "";
  }

  function cardBusyLabel(action) {
    if (action === "start") return "启动中";
    if (action === "stop") return "停止中";
    if (action === "restart") return "重启中";
    if (action === "diagnose") return "诊断中";
    return "处理中";
  }

  function sparkline(seed, color) {
    const base = [11, 13, 10, 12, 9, 12, 8, 10, 7, 9, 8, 6];
    const points = base.map((value, index) => {
      const jitter = ((seed * (index + 3)) % 5) - 2;
      return `${(index / (base.length - 1)) * 62},${clamp(value + jitter, 3, 22)}`;
    });
    return `<svg class="fm-sparkline" viewBox="0 0 62 24" aria-hidden="true" style="--stat-color:${color}">
      <polyline points="0,24 ${points.join(" ")} 62,24" class="fill" />
      <polyline points="${points.join(" ")}" />
    </svg>`;
  }

  /* ------------------------------------------------------------------------
     Render: top / sidebar / hero / stats / toolbar / cards
     ------------------------------------------------------------------------ */

  function renderAll() {
    app.dataset.theme = state.theme;
    app.dataset.moe = state.moe;
    app.dataset.demo = state.demo;
    app.classList.toggle("reduce-motion", state.reduceMotion);

    const all = getServices();
    const visible = getVisibleServices();
    const stat = counts();
    const loading = state.demo === "loading";
    const empty = state.demo === "empty" || (all && all.length === 0);
    const errors = stat.error;
    const greet = greetingFor();

    renderSidebar(stat, all, loading);
    renderHero(stat, errors, loading, empty);
    renderStats(stat, loading);
    renderFilters(stat, loading);
    renderGrid(visible, loading, empty);
    renderListFoot(stat, loading);
    if (state.drawerOpen) {
      const service = currentService();
      if (service) renderDrawer();
      else closeDrawer();
    }
    if (state.annotations) positionAnnotations();
    hydrateMascots(app);
  }

  function renderSidebar(stat, all, loading) {
    $$("[data-nav-count]").forEach((node) => {
      const key = node.dataset.navCount;
      node.textContent = loading ? "–" : String(stat[key] || 0);
    });

    $$(".fm-nav button[data-nav]").forEach((button) => {
      button.classList.toggle(
        "is-active",
        state.group === "all" && button.dataset.nav === state.filter
      );
    });

    const groups = all
      ? Array.from(new Set(all.map((service) => service.group)))
      : [];
    const groupNav = $("#groupNav");
    if (!groups.length) {
      groupNav.innerHTML = `<span class="fm-nav-title">分组</span><p class="fm-side-hint">${loading ? "正在读取分组…" : "还没有分组"}</p>`;
    } else {
      groupNav.innerHTML = `<span class="fm-nav-title">分组</span>${groups
        .map((group) => {
          const list = all.filter((service) => service.group === group);
          const running = list.filter((service) => service.status === "running").length;
          const active = state.group === group;
          return `<button class="fm-group-btn ${active ? "is-active" : ""}" data-group="${esc(group)}" style="--group-color:${GROUP_COLORS[group] || "#8e6fe8"}" title="运行中 ${running} / 共 ${list.length}">
            <span class="fm-group-dot"></span>
            <span>${esc(group)}</span>
            <small><i class="run">${running}</i>/${list.length}</small>
          </button>`;
        })
        .join("")}`;
    }

    const typeNav = $("#typeNav");
    const typeOrder = ["exe", "python", "node", "nginx", "script"];
    typeNav.innerHTML = `<button class="${state.type === "all" ? "is-active" : ""}" data-type="all">
        <span class="fm-mono-icon" style="background:var(--fm-line);color:var(--fm-muted)">·</span>
        <span>全部类型</span><small>${all ? all.length : 0}</small>
      </button>${typeOrder
        .map((type) => {
          const meta = TYPE_META[type];
          const count = all ? all.filter((service) => service.serviceType === type).length : 0;
          return `<button class="${state.type === type ? "is-active" : ""}" data-type="${type}">
            <span class="fm-mono-icon ${meta.cls}" style="background:var(--fm-surface-2);color:var(--fm-ink-2)">${meta.mono}</span>
            <span>${meta.label}</span><small>${count}</small>
          </button>`;
        })
        .join("")}`;
    $("#typeTotal").textContent = all ? all.length : 0;

    const sideSummary = $("#sideSummary");
    if (loading) {
      sideSummary.innerHTML = `<i></i><b>正在连接</b>本地守护进程…`;
    } else if (!all || all.length === 0) {
      sideSummary.innerHTML = `<i style="background:var(--fm-faint)"></i><b>小屋空空的</b>等你请进第一个服务`;
    } else {
      sideSummary.innerHTML = `<i></i><b>${stat.running}</b> 个在运行 · <b>${stat.error}</b> 个需关注`;
    }
  }

  function renderHero(stat, errors, loading, empty) {
    const greet = greetingFor();
    $("#todayLine").textContent = todayLabel();
    $("#greetingBig").textContent = greet.main;
    $("#sideGreeting").textContent = greet.side;
    $("#sideGreetingSub").textContent = greet.line;

    let sub = "";
    if (loading) sub = "正在连接本地守护进程，稍等一下下…";
    else if (empty) sub = "小屋还空着。把第一个服务请进来，或者把文件夹交给小闪。";
    else if (errors > 0)
      sub = `${stat.running} 个小伙伴在认真工作，${errors} 个需要你摸摸。`;
    else sub = `${stat.running} 个小伙伴都在乖乖运行，今天很稳。`;
    $("#heroSub").textContent = sub;

    const heroMood = loading ? "idle" : empty ? "sleep" : errors > 0 ? "worry" : "happy";
    setMascotMood($(".fm-hero-mascot .mascot-slot"), heroMood);
    setMascotMood($(".fm-greet-mascot .mascot-slot"), heroMood === "worry" ? "worry" : heroMood === "sleep" ? "sleep" : "happy");

    const banner = $("#attentionBanner");
    if (!loading && !empty && errors > 0) {
      banner.hidden = false;
      $("#attentionCount").textContent = String(errors);
      const firstError = (getServices() || []).find((service) => service.status === "error");
      $("#attentionText").textContent = firstError
        ? `${firstError.name}：${firstError.lastError || "服务没有正常响应"}`
        : "有一个服务没有正常响应";
    } else {
      banner.hidden = true;
    }
  }

  function renderStats(stat, loading) {
    const root = $("#stats");
    if (loading) {
      root.innerHTML = Array.from({ length: 4 })
        .map(
          () => `<div class="fm-stat is-skeleton" aria-hidden="true">
            <span class="fm-skel-line w40"></span>
            <span class="fm-skel-line w60 tall"></span>
            <span class="fm-skel-line w80"></span>
          </div>`
        )
        .join("");
      return;
    }

    const all = getServices() || [];
    const totalCpu = all.reduce((sum, service) => sum + (service.cpu || 0), 0);
    const totalMem = all.reduce((sum, service) => sum + (service.mem || 0), 0);
    const activePorts = all
      .filter((service) => service.port && (service.status === "running" || service.portActive))
      .map((service) => service.port);
    const ratio = stat.total ? Math.round((stat.running / stat.total) * 100) : 0;

    root.innerHTML = `
      <button class="fm-stat" data-action="stat" data-filter="running" style="--stat-color:var(--fm-mint);--stat-wash:var(--fm-mint-soft)" aria-label="查看运行中的服务">
        <span class="fm-stat-top">
          <span class="fm-stat-icon"><svg class="i"><use href="#i-play"/></svg></span>
          运行中
        </span>
        <span class="fm-stat-value"><b>${stat.running}</b><small>/ ${stat.total}</small></span>
        <span class="fm-stat-sub"><span class="up">${ratio}%</span> 健康在线</span>
        <span class="fm-stat-bar"><span style="width:${ratio}%"></span></span>
      </button>
      <button class="fm-stat" data-action="stat" data-filter="all" style="--stat-color:var(--fm-sky);--stat-wash:var(--fm-sky-soft)" aria-label="查看 CPU 总览">
        <span class="fm-stat-top">
          <span class="fm-stat-icon"><svg class="i"><use href="#i-cpu"/></svg></span>
          托管 CPU
        </span>
        <span class="fm-stat-value"><b>${totalCpu.toFixed(1)}</b><small>%</small></span>
        <span class="fm-stat-sub">${stat.running} 个进程正在计入</span>
        ${sparkline(Math.round(totalCpu * 10) + 3, "var(--fm-sky)")}
      </button>
      <button class="fm-stat" data-action="stat" data-filter="all" style="--stat-color:var(--fm-lilac);--stat-wash:var(--fm-lilac-soft)" aria-label="查看内存总览">
        <span class="fm-stat-top">
          <span class="fm-stat-icon"><svg class="i"><use href="#i-memory"/></svg></span>
          托管内存
        </span>
        <span class="fm-stat-value"><b>${Math.round(totalMem)}</b><small>MB</small></span>
        <span class="fm-stat-sub">平均 ${stat.running ? Math.round(totalMem / stat.running) : 0} MB / 服务</span>
        <span class="fm-stat-bar"><span style="width:${clamp(Math.round(totalMem / 10), 3, 100)}%;background:var(--fm-lilac)"></span></span>
      </button>
      <button class="fm-stat" data-action="stat" data-filter="running" style="--stat-color:var(--fm-butter);--stat-wash:var(--fm-butter-soft)" aria-label="查看活跃端口">
        <span class="fm-stat-top">
          <span class="fm-stat-icon"><svg class="i"><use href="#i-globe"/></svg></span>
          活跃端口
        </span>
        <span class="fm-stat-value"><b>${activePorts.length}</b><small>个</small></span>
        <span class="fm-stat-ports">
          ${activePorts.slice(0, 3).map((port) => `<span>:${port}</span>`).join("")}
          ${activePorts.length > 3 ? `<span class="more">+${activePorts.length - 3}</span>` : ""}
          ${activePorts.length === 0 ? `<span class="more">暂无</span>` : ""}
        </span>
      </button>`;
  }

  function renderFilters(stat, loading) {
    const root = $("#filterChips");
    const options = [
      { key: "all", label: "全部", count: stat.total },
      { key: "running", label: "运行中", count: stat.running },
      { key: "error", label: "需关注", count: stat.error },
      { key: "stopped", label: "已停止", count: stat.stopped },
    ];
    root.innerHTML = options
      .map(
        (option) => `<button class="fm-chip ${state.filter === option.key ? "is-active" : ""}" data-filter="${option.key}" aria-pressed="${state.filter === option.key}">
          ${option.label}<b>${loading ? "–" : option.count}</b>
        </button>`
      )
      .join("");
  }

  function renderGrid(visible, loading, empty) {
    if (loading) {
      grid.className = "fm-grid";
      grid.innerHTML = Array.from({ length: 4 })
        .map(
          () => `<div class="fm-skeleton" aria-hidden="true">
            <span class="sk-top"></span><span class="sk-sub"></span><span class="sk-cmd"></span><span class="sk-bottom"></span>
          </div>`
        )
        .join("");
      return;
    }

    if (!visible || visible.length === 0) {
      grid.className = "fm-grid";
      if (empty) {
        grid.innerHTML = `<div class="fm-empty">
          <span class="fm-empty-mascot"><span class="mascot-slot" data-mascot="sleep" data-size="108"></span></span>
          <h3>小屋里还空空的…</h3>
          <p>把第一个本地服务请进来吧。你可以手动填写，也可以直接把项目文件夹交给小闪，让它自己识别。</p>
          <div class="fm-empty-actions">
            <button class="fm-btn fm-btn-primary" data-action="open-add"><svg class="i"><use href="#i-plus"/></svg>添加第一个服务</button>
            <button class="fm-btn fm-btn-soft" data-action="open-detect"><svg class="i"><use href="#i-folder"/></svg>从文件夹自动识别</button>
          </div>
          <div class="fm-empty-steps"><span><b>1</b> 添加服务</span><span><b>2</b> 确认启动命令</span><span><b>3</b> 安心托管</span></div>
        </div>`;
      } else {
        grid.innerHTML = `<div class="fm-empty is-search">
          <span class="fm-empty-mascot"><span class="mascot-slot" data-mascot="idle" data-size="84"></span></span>
          <h3>没有找到符合条件的小伙伴</h3>
          <p>试试换一个关键词，或者清掉状态、分组和类型筛选。小闪也可以帮你直接搜索整个小屋。</p>
          <div class="fm-empty-actions">
            <button class="fm-btn fm-btn-primary" data-action="clear-filters">清除筛选</button>
            <button class="fm-btn fm-btn-soft" data-action="open-palette"><svg class="i"><use href="#i-search"/></svg>打开命令面板</button>
          </div>
        </div>`;
      }
      return;
    }

    grid.className = `fm-grid ${state.view === "list" ? "is-list" : ""}`;
    grid.innerHTML = visible
      .map((service, index) => serviceCard(service, index))
      .join("");
  }

  function serviceCard(service, index) {
    const busy = busyFor(service.id);
    const running = service.status === "running";
    const error = service.status === "error";
    const portText = service.port ? `:${service.port}` : "无端口";
    const primaryClass = busy
      ? "start is-busy"
      : running
      ? "stop"
      : error
      ? "retry"
      : "start";
    const primaryIcon = busy ? "i-restart" : running ? "i-stop" : error ? "i-restart" : "i-play";
    const primaryLabel = busy ? cardBusyLabel(busy) : statusButtonLabel(service);
    const primaryAction = busy
      ? "noop"
      : running
      ? "stop-service"
      : "start-service";
    const delay = Math.min(index * 24, 120);

    return `<article class="fm-card ${error ? "is-error" : ""} ${state.selectedId === service.id ? "is-selected" : ""} ${busy ? "is-busy" : ""}" data-id="${esc(service.id)}" role="listitem" tabindex="0" aria-label="${esc(service.name)}，${STATUS_META[service.status].label}，按回车查看详情" style="animation-delay:${delay}ms">
      <div class="fm-card-top">
        ${typeIcon(service)}
        <div class="fm-card-title">
          <div class="fm-card-name"><span class="fm-name-text">${esc(service.name)}</span></div>
          <div class="fm-card-meta">
            <span>${esc(service.group)}</span>
            ${service.stale ? `<span class="fm-stale-tag">待重启</span>` : ""}
          </div>
        </div>
        <div class="fm-card-top-right">
          ${statusPill(service.status)}
          <button class="fm-kebab" data-action="card-menu" data-id="${esc(service.id)}" aria-label="${esc(service.name)} 的更多操作"><svg class="i"><use href="#i-more"/></svg></button>
        </div>
      </div>
      ${
        error && service.lastError
          ? `<div class="fm-card-error"><svg class="i"><use href="#i-alert"/></svg><span>${esc(service.lastError)}</span><b data-action="diagnose-service" data-id="${esc(service.id)}">去诊断</b></div>`
          : `<div class="fm-card-cmd">${esc(service.cmd)}</div>`
      }
      <div class="fm-card-bottom">
        <div class="fm-card-stats">
          <span class="port ${service.portActive ? "" : "is-off"}"><svg class="i"><use href="#i-globe"/></svg>${service.port ? `:${service.port}` : "—"}</span>
          <span><svg class="i"><use href="#i-clock"/></svg><span class="fm-uptime">${running && service.uptime <= 0 ? "刚刚" : formatUptime(service.uptime, true)}</span></span>
          <span><svg class="i"><use href="#i-cpu"/></svg><span class="fm-cpu">${running ? service.cpu.toFixed(1) : "0.0"}%</span></span>
          <span><svg class="i"><use href="#i-memory"/></svg><span class="fm-mem">${running ? Math.round(service.mem) : 0}M</span></span>
        </div>
        <div class="fm-card-actions">
          ${service.frontendUrl ? `<button class="fm-mini-btn open-frontend" data-action="open-frontend" data-id="${esc(service.id)}" title="打开前端" aria-label="打开前端"><svg class="i"><use href="#i-external"/></svg></button>` : ""}
          <button class="fm-mini-btn" data-action="open-logs" data-id="${esc(service.id)}" title="查看日志" aria-label="查看日志"><svg class="i"><use href="#i-terminal"/></svg></button>
          <button class="fm-card-primary ${primaryClass}" data-action="${primaryAction}" data-id="${esc(service.id)}">
            <svg class="i"><use href="#${primaryIcon}"/></svg>${primaryLabel}
          </button>
        </div>
      </div>
    </article>`;
  }

  function renderListFoot(stat, loading) {
    const foot = $("#listFoot");
    if (loading) {
      foot.innerHTML = `<span class="fm-sync"><svg class="i"><use href="#i-restart"/></svg>正在连接本地守护进程…</span><span>日志将通过游标增量同步</span>`;
      return;
    }
    foot.innerHTML = `<span>共 <b>${stat.total}</b> 个服务 · <b>${stat.running}</b> 个运行中</span>
      <span class="fm-sync is-live"><svg class="i"><use href="#i-restart"/></svg>最后更新 ${timeAgo(state.lastUpdated)}</span>`;
  }

  function updateSortLabel() {
    const option = SORT_OPTIONS.find((item) => item.key === state.sort) || SORT_OPTIONS[0];
    $("#sortLabel").textContent = option.label;
  }

  function updateViewButtons() {
    $$(".fm-viewtoggle button").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateThemeButton() {
    /* CSS swaps the sun/moon icons from data-theme. */
  }

  function updateMoeLabel() {
    const labels = { "0": "克制", "1": "标准", "2": "满开" };
    $("#moeLabel").textContent = labels[state.moe] || "标准";
  }

  function updateSearchValue() {
    const input = $("#fmSearch");
    if (input && input.value !== state.query) input.value = state.query;
  }

  /* ------------------------------------------------------------------------
     Drawer
     ------------------------------------------------------------------------ */

  const DRAWER_TABS = [
    { key: "overview", label: "概览" },
    { key: "logs", label: "实时日志" },
    { key: "config", label: "配置" },
    { key: "diagnose", label: "诊断" },
  ];

  function drawerPrimary(service) {
    const busy = busyFor(service.id);
    if (busy) {
      return `<button class="fm-btn fm-drawer-main start is-busy" data-action="noop"><svg class="i"><use href="#i-restart"/></svg>${cardBusyLabel(busy)}…</button>`;
    }
    if (service.status === "running") {
      return `<button class="fm-btn fm-drawer-main stop" data-action="drawer-toggle"><svg class="i"><use href="#i-stop"/></svg>停止服务</button>`;
    }
    if (service.status === "error") {
      return `<button class="fm-btn fm-drawer-main retry" data-action="drawer-toggle"><svg class="i"><use href="#i-restart"/></svg>重试启动</button>`;
    }
    return `<button class="fm-btn fm-drawer-main start" data-action="drawer-toggle"><svg class="i"><use href="#i-play"/></svg>启动服务</button>`;
  }

  function renderDrawer() {
    const service = currentService();
    if (!service) {
      closeDrawer();
      return;
    }

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");

    const busy = busyFor(service.id);
    const port = service.port ? `127.0.0.1:${service.port}` : "无监控端口";
    drawerHead.innerHTML = `
      <div class="fm-drawer-titlebar">
        ${typeIcon(service)}
        <div class="fm-drawer-title">
          <h2>${esc(service.name)}${busy ? `<span class="fm-status is-pending"><i></i>${cardBusyLabel(busy)}</span>` : ""}</h2>
          <p>${esc(service.group)} · ${esc(port)} · ${service.pid ? `PID ${service.pid}` : "无进程"}</p>
        </div>
        <button class="fm-drawer-close" data-action="close-drawer" aria-label="关闭详情"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <div class="fm-drawer-statusline">
        ${statusPill(service.status)}
        <span class="fm-status neutral">${service.autoRestart ? "自动重启 · 开" : "自动重启 · 关"}</span>
        <span class="fm-status neutral">${TYPE_META[service.serviceType].label}</span>
      </div>
      <div class="fm-drawer-actions">
        ${drawerPrimary(service)}
        <button class="fm-drawer-iconbtn" data-action="restart-service" data-id="${esc(service.id)}" title="重启服务" aria-label="重启服务"><svg class="i"><use href="#i-restart"/></svg></button>
        ${service.frontendUrl ? `<button class="fm-drawer-iconbtn" data-action="open-frontend" data-id="${esc(service.id)}" title="打开前端" aria-label="打开前端"><svg class="i"><use href="#i-external"/></svg></button>` : ""}
        <button class="fm-drawer-iconbtn" data-action="drawer-tab" data-tab="diagnose" title="健康诊断" aria-label="健康诊断"><svg class="i"><use href="#i-activity"/></svg></button>
        <button class="fm-drawer-iconbtn" data-action="card-menu" data-id="${esc(service.id)}" title="更多操作" aria-label="更多操作"><svg class="i"><use href="#i-more"/></svg></button>
      </div>`;

    drawerTabs.innerHTML = DRAWER_TABS.map(
      (tab) => `<button role="tab" aria-selected="${state.drawerTab === tab.key}" class="${state.drawerTab === tab.key ? "is-active" : ""}" data-action="drawer-tab" data-tab="${tab.key}">${tab.label}</button>`
    ).join("");

    if (state.drawerTab === "logs") {
      drawerBody.innerHTML = logTabHTML(service);
      hydrateMascots(drawerBody);
      bindConsoleScroll();
      if (state.logFollow) {
        requestAnimationFrame(() => {
          const lines = $(".fm-console-lines", drawerBody);
          if (lines) lines.scrollTop = lines.scrollHeight;
        });
      }
    } else if (state.drawerTab === "config") {
      drawerBody.innerHTML = configTabHTML(service);
      hydrateMascots(drawerBody);
    } else if (state.drawerTab === "diagnose") {
      drawerBody.innerHTML = diagnoseTabHTML(service);
      hydrateMascots(drawerBody);
    } else {
      drawerBody.innerHTML = overviewTabHTML(service);
      hydrateMascots(drawerBody);
    }
  }

  function overviewTabHTML(service) {
    const running = service.status === "running";
    const error = service.status === "error";
    const mood = running ? "happy" : error ? "worry" : "sleep";
    const title = running
      ? "正在乖乖运行"
      : error
      ? "遇到一点小问题"
      : "在休息，随时可以叫醒";
    const sub = running
      ? `${formatUptime(service.uptime, true)} · ${service.cpu.toFixed(1)}% CPU · ${Math.round(service.mem)} MB`
      : error
      ? service.lastError || "进程没有正常响应，看看诊断里的下一步。"
      : "停止状态不会占用 CPU 与内存，需要时再启动。";

    const processState = running ? "运行中" : error ? "异常退出" : "未运行";
    const portState = !service.port
      ? "未配置"
      : service.portActive
      ? "监听中"
      : "无响应";
    const autoState = service.autoRestart ? "已开启" : "已关闭";

    return `
      <div class="fm-overview-hero ${error ? "is-error" : ""}">
        <span class="mascot-slot" data-mascot="${mood}" data-size="58"></span>
        <div><b>${esc(title)}</b><small>${esc(sub)}</small></div>
      </div>

      <div class="fm-overview-grid">
        <div class="fm-metric-tile"><small><svg class="i"><use href="#i-cpu"/></svg>PID</small><b>${service.pid || "—"}</b></div>
        <div class="fm-metric-tile"><small><svg class="i"><use href="#i-globe"/></svg>端口</small><b>${service.port || "—"}</b></div>
        <div class="fm-metric-tile"><small><svg class="i"><use href="#i-clock"/></svg>运行时长</small><b>${formatUptime(service.uptime)}</b></div>
        <div class="fm-metric-tile"><small><svg class="i"><use href="#i-shield"/></svg>进程树</small><b>${running ? "已托管" : "—"}</b></div>
      </div>

      <div class="fm-detail-section">
        <h4><svg class="i"><use href="#i-activity"/></svg>健康检查</h4>
        <div class="fm-health-list">
          <div class="fm-health-row ${error ? "is-warn" : ""}"><span class="fm-health-icon">${error ? "!" : "✓"}</span><span>进程状态</span><small>${processState}</small></div>
          <div class="fm-health-row ${service.port && !service.portActive ? "is-warn" : ""}"><span class="fm-health-icon">${service.port && !service.portActive ? "!" : "✓"}</span><span>端口监听</span><small>${portState}</small></div>
          <div class="fm-health-row"><span class="fm-health-icon">✓</span><span>配置可读</span><small>已加载</small></div>
          <div class="fm-health-row"><span class="fm-health-icon">✓</span><span>自动重启</span><small>${autoState}</small></div>
        </div>
      </div>

      <div class="fm-detail-section">
        <h4><svg class="i"><use href="#i-code"/></svg>服务档案</h4>
        <div class="fm-kv">
          <div class="fm-kv-row"><span>启动命令</span><b title="${esc(service.cmd)}">${esc(service.cmd)}</b></div>
          <div class="fm-kv-row"><span>工作目录</span><b title="${esc(service.cwd)}">${esc(service.cwd)}</b></div>
          <div class="fm-kv-row"><span>控制台编码</span><b>${esc(service.encoding.toUpperCase())}</b></div>
          <div class="fm-kv-row"><span>前端地址</span><b>${service.frontendUrl ? esc(service.frontendUrl) : "未配置"}</b></div>
        </div>
      </div>

      <div class="fm-detail-section">
        <h4><svg class="i"><use href="#i-clock"/></svg>最近事件</h4>
        <div class="fm-timeline">
          ${(service.events || [])
            .slice(0, 4)
            .map(
              (event) => `<div class="fm-timeline-item ${event.type === "error" ? "is-error" : ""}">
                <span class="fm-timeline-dot">${event.type === "error" ? "!" : "✦"}</span>
                <div class="fm-timeline-copy"><b>${esc(event.text)}</b><small>${esc(event.time)}</small></div>
              </div>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function logTabHTML(service) {
    const logs = visibleLogs(service);
    const follow = state.logFollow;
    return `<div class="fm-log-wrap">
      <div class="fm-log-toolbar">
        ${[
          { key: "all", label: "全部" },
          { key: "OUT", label: "输出" },
          { key: "ERR", label: "错误" },
          { key: "SYS", label: "系统" },
        ]
          .map(
            (item) => `<button class="fm-log-filter ${state.logLevel === item.key ? "is-active" : ""}" data-action="log-level" data-level="${item.key}">${item.label}</button>`
          )
          .join("")}
        <label class="fm-log-search"><svg class="i"><use href="#i-search"/></svg><input id="logSearch" type="search" placeholder="过滤日志…" value="${esc(state.logQuery)}" autocomplete="off" /></label>
        <button class="fm-log-tool ${follow ? "is-active" : ""}" data-action="log-follow" title="${follow ? "暂停跟随" : "继续跟随"}" aria-label="${follow ? "暂停跟随" : "继续跟随"}">
          <svg class="i"><use href="#${follow ? "i-pause" : "i-play"}"/></svg>
        </button>
        <button class="fm-log-tool" data-action="log-wrap" title="${state.logWrap ? "关闭自动换行" : "开启自动换行"}" aria-label="切换自动换行"><svg class="i"><use href="#i-list"/></svg></button>
        <button class="fm-log-tool" data-action="log-clear" title="清空日志" aria-label="清空日志"><svg class="i"><use href="#i-trash"/></svg></button>
        <button class="fm-log-tool" data-action="log-copy" title="复制可见日志" aria-label="复制可见日志"><svg class="i"><use href="#i-copy"/></svg></button>
      </div>

      <div class="fm-console">
        <div class="fm-console-bar">
          <i></i><span>${esc(service.name)} · stdout / stderr</span>
          <span class="${follow ? "fm-console-live" : "fm-console-paused"}">${follow ? "● 实时跟随" : "Ⅱ 已暂停"}</span>
        </div>
        <div class="fm-console-lines ${state.logWrap ? "" : "is-nowrap"}">${logLinesHTML(logs, state.logQuery)}</div>
        <div class="fm-log-footer">
          <span class="fm-log-count">${logs.length} 行 · 游标 #${1200 + service.logs.length}</span>
          <button class="fm-log-jump" data-action="log-jump" ${follow ? "hidden" : ""}>跳到底部 ↓</button>
        </div>
      </div>
    </div>`;
  }

  function visibleLogs(service) {
    const query = state.logQuery.trim().toLowerCase();
    return service.logs.filter((line) => {
      if (state.logLevel !== "all" && line.level !== state.logLevel) return false;
      if (query && !line.text.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function logLinesHTML(logs, query) {
    if (!logs.length) {
      return `<div class="fm-log-empty">
        <span class="mascot-slot" data-mascot="sleep" data-size="58"></span>
        <b>这里暂时很安静</b>
        <span>${query || state.logLevel !== "all" ? "没有匹配的日志，试试换个关键词。" : "服务启动后，stdout / stderr 会出现在这里。"}</span>
      </div>`;
    }
    return logs
      .map(
        (line) => `<div class="fm-log-line ${line.level === "ERR" ? "is-err" : ""}">
          <span class="lt">${esc(line.t)}</span>
          <span class="fm-log-level ${line.level === "ERR" ? "err" : line.level === "SYS" ? "sys" : "out"}">${esc(line.level)}</span>
          <span class="lx">${highlight(line.text, query)}</span>
        </div>`
      )
      .join("");
  }

  function bindConsoleScroll() {
    const box = $(".fm-console-lines", drawerBody);
    if (!box) return;
    box.onscroll = () => {
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 12;
      if (atBottom !== state.logFollow) {
        state.logFollow = atBottom;
        updateLogFollowUI();
      }
    };
  }

  function updateLogFollowUI() {
    const bar = $(".fm-console-bar", drawerBody);
    const jump = $(".fm-log-jump", drawerBody);
    const footer = $(".fm-log-footer .fm-log-count", drawerBody);
    if (bar) {
      const status = bar.querySelector(".fm-console-live, .fm-console-paused");
      if (status) {
        status.className = state.logFollow ? "fm-console-live" : "fm-console-paused";
        status.textContent = state.logFollow ? "● 实时跟随" : "Ⅱ 已暂停";
      }
    }
    if (jump) jump.hidden = state.logFollow;
    if (footer) footer.textContent = `${visibleLogs(currentService() || { logs: [] }).length} 行 · 游标 #${1200 + (currentService()?.logs.length || 0)}`;
    const followBtn = $('[data-action="log-follow"]', drawerBody);
    if (followBtn) {
      followBtn.classList.toggle("is-active", state.logFollow);
      followBtn.title = state.logFollow ? "暂停跟随" : "继续跟随";
      followBtn.setAttribute("aria-label", followBtn.title);
      followBtn.innerHTML = `<svg class="i"><use href="#${state.logFollow ? "i-pause" : "i-play"}"/></svg>`;
    }
  }

  function refreshLogLines({ keepScroll = true } = {}) {
    if (state.drawerTab !== "logs") return;
    const service = currentService();
    const box = $(".fm-console-lines", drawerBody);
    if (!service || !box) return;
    const previous = box.scrollTop;
    const logs = visibleLogs(service);
    box.innerHTML = logLinesHTML(logs, state.logQuery);
    hydrateMascots(box);
    if (state.logFollow) {
      box.scrollTop = box.scrollHeight;
    } else if (keepScroll) {
      box.scrollTop = previous;
    }
    const count = $(".fm-log-count", drawerBody);
    if (count) count.textContent = `${logs.length} 行 · 游标 #${1200 + service.logs.length}`;
    const bar = $(".fm-console-bar", drawerBody);
    if (bar) {
      const status = bar.querySelector(".fm-console-live, .fm-console-paused");
      if (status) {
        status.className = state.logFollow ? "fm-console-live" : "fm-console-paused";
        status.textContent = state.logFollow ? "● 实时跟随" : "Ⅱ 已暂停";
      }
    }
  }

  function configTabHTML(service) {
    const args = service.args && service.args.length ? service.args.join(" ") : "—";
    const env = service.env || {};
    return `
      ${service.status === "running" ? `<div class="fm-config-warning"><svg class="i"><use href="#i-alert"/></svg><span>服务正在运行。修改配置后需要重启才会生效，界面会提示你是否立即重启。</span></div>` : ""}
      <div class="fm-kv">
        <div class="fm-kv-row"><span>运行器</span><b>${esc(TYPE_META[service.serviceType].label)}</b></div>
        <div class="fm-kv-row"><span>启动程序</span><b title="${esc(service.executable)}">${esc(service.executable)}</b></div>
        ${service.scriptPath ? `<div class="fm-kv-row"><span>脚本路径</span><b title="${esc(service.scriptPath)}">${esc(service.scriptPath)}</b></div>` : ""}
        <div class="fm-kv-row"><span>启动参数</span><b>${esc(args)}</b></div>
        <div class="fm-kv-row"><span>工作目录</span><b title="${esc(service.cwd)}">${esc(service.cwd)}</b></div>
        <div class="fm-kv-row"><span>监控端口</span><b>${service.port || "未设置"}</b></div>
        <div class="fm-kv-row"><span>前端地址</span><b>${service.frontendUrl ? esc(service.frontendUrl) : "未设置"}</b></div>
        <div class="fm-kv-row"><span>控制台编码</span><b>${esc(service.encoding.toUpperCase())}</b></div>
        <div class="fm-kv-row"><span>自动重启</span><b class="${service.autoRestart ? "ok" : "warn"}">${service.autoRestart ? "已开启" : "已关闭"}</b></div>
      </div>

      <div class="fm-detail-section">
        <h4><svg class="i"><use href="#i-code"/></svg>环境变量</h4>
        <div class="fm-env-chips">
          ${Object.keys(env).length ? Object.entries(env).map(([key, value]) => `<span>${esc(key)}=${esc(value)}</span>`).join("") : `<span>未设置自定义环境变量</span>`}
        </div>
      </div>

      <div class="fm-config-actions">
        <button class="fm-btn fm-btn-primary" data-action="edit-service" data-id="${esc(service.id)}"><svg class="i"><use href="#i-pencil"/></svg>编辑配置</button>
        <button class="fm-btn fm-btn-soft" data-action="copy-command" data-id="${esc(service.id)}"><svg class="i"><use href="#i-copy"/></svg>复制启动命令</button>
      </div>`;
  }

  function diagnoseTabHTML(service) {
    const running = service.status === "running";
    const error = service.status === "error";
    const healthy = running && (!service.port || service.portActive);
    const title = healthy
      ? "一切正常，可以放心"
      : error
      ? "发现 1 个需要处理的问题"
      : running
      ? "进程在跑，但端口还没就绪"
      : "服务当前没有运行";
    const sub = healthy
      ? "进程存活，端口监听正常，配置已加载。"
      : error
      ? service.lastError || "端口没有响应，先看看最近错误与端口占用。"
      : "这不是故障。启动服务后可以再做一次完整诊断。";
    const mood = healthy ? "happy" : error ? "worry" : "sleep";
    const errorLogs = service.logs.filter((line) => line.level === "ERR").slice(-3);
    const code = errorLogs.length
      ? errorLogs.map((line) => `[${line.t}] ${line.text}`).join("\n")
      : "未发现新的错误输出。";

    const checks = [
      {
        label: "进程存活",
        state: running ? "正常" : error ? "失败" : "未运行",
        warn: !running && error,
      },
      {
        label: "端口监听",
        state: !service.port ? "未配置" : service.portActive ? "监听中" : "无响应",
        warn: Boolean(service.port && !service.portActive),
      },
      {
        label: "配置读取",
        state: "通过",
        warn: false,
      },
      {
        label: "进程树托管",
        state: running ? "JobObject 已绑定" : "—",
        warn: false,
      },
    ];

    return `
      <div class="fm-diag-hero ${error ? "is-error" : ""}">
        <span class="mascot-slot" data-mascot="${mood}" data-size="54"></span>
        <div><b>${esc(title)}</b><small>${esc(sub)}</small></div>
      </div>

      <div class="fm-detail-section">
        <h4><svg class="i"><use href="#i-shield"/></svg>检查项</h4>
        <div class="fm-health-list">
          ${checks
            .map(
              (check) => `<div class="fm-health-row ${check.warn ? "is-warn" : ""}">
                <span class="fm-health-icon">${check.warn ? "!" : "✓"}</span>
                <span>${esc(check.label)}</span><small>${esc(check.state)}</small>
              </div>`
            )
            .join("")}
        </div>
      </div>

      <div class="fm-detail-section">
        <h4><svg class="i"><use href="#i-terminal"/></svg>最近错误输出</h4>
        <div class="fm-diag-code">${esc(code)}</div>
      </div>

      <div class="fm-diag-actions">
        <button class="fm-btn fm-btn-primary" data-action="run-diagnose" data-id="${esc(service.id)}"><svg class="i"><use href="#i-activity"/></svg>重新诊断</button>
        <button class="fm-btn fm-btn-soft" data-action="restart-service" data-id="${esc(service.id)}"><svg class="i"><use href="#i-restart"/></svg>重启并再测</button>
      </div>`;
  }

  function openDrawer(id, tab = "overview") {
    const service = (getServices() || []).find((item) => item.id === id);
    if (!service) return;
    state.selectedId = id;
    state.drawerOpen = true;
    state.drawerTab = tab;
    state.logLevel = "all";
    state.logQuery = "";
    renderGrid(getVisibleServices(), false, false);
    renderDrawer();
    requestAnimationFrame(() => {
      const close = $(".fm-drawer-close", drawer);
      if (close) close.focus({ preventScroll: true });
    });
  }

  function closeDrawer() {
    if (!state.drawerOpen && !drawer.classList.contains("is-open")) return;
    const previousId = state.selectedId;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    state.drawerOpen = false;
    state.selectedId = "";
    $$(".fm-card").forEach((card) => card.classList.remove("is-selected"));
    if (previousId) {
      const card = $(`.fm-card[data-id="${previousId}"]`);
      if (card) requestAnimationFrame(() => card.focus({ preventScroll: true }));
    }
  }

  function setDrawerTab(tab) {
    if (!DRAWER_TABS.some((item) => item.key === tab)) return;
    state.drawerTab = tab;
    renderDrawer();
  }

  /* ------------------------------------------------------------------------
     Toasts
     ------------------------------------------------------------------------ */

  const TOAST_ICONS = {
    success: "i-check",
    error: "i-alert",
    info: "i-sparkles",
  };

  function toast({ type = "success", title = "", message = "", action = null, duration = 0 }) {
    if (!toastsRoot) return;
    while (toastsRoot.children.length >= 3) {
      toastsRoot.firstElementChild?.remove();
    }

    const node = document.createElement("div");
    node.className = `fm-toast ${type}`;
    node.innerHTML = `
      <span class="fm-toast-icon"><svg class="i"><use href="#${TOAST_ICONS[type] || TOAST_ICONS.info}"/></svg></span>
      <div class="fm-toast-copy">${title ? `<b>${esc(title)}</b>` : ""}${title && message ? " " : ""}${esc(message)}</div>
      ${action ? `<button class="fm-toast-action" data-toast-action>${esc(action.label)}</button>` : ""}
      <button class="fm-toast-close" data-toast-close aria-label="关闭提示"><svg class="i"><use href="#i-x"/></svg></button>`;
    toastsRoot.appendChild(node);

    let timer = null;
    const remove = () => {
      if (!node.isConnected) return;
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 220);
      if (timer) window.clearTimeout(timer);
    };
    const life = duration || (action ? 8000 : type === "error" ? 7000 : 3800);
    timer = window.setTimeout(remove, life);

    node.querySelector("[data-toast-close]")?.addEventListener("click", remove);
    node.querySelector("[data-toast-action]")?.addEventListener("click", () => {
      action.onClick?.();
      remove();
    });
    node.addEventListener("mouseenter", () => {
      if (timer) window.clearTimeout(timer);
    });
    node.addEventListener("mouseleave", () => {
      timer = window.setTimeout(remove, 2200);
    });

    return node;
  }

  /* ------------------------------------------------------------------------
     Popover menus
     ------------------------------------------------------------------------ */

  let activeMenu = null;
  let menuOpenedAt = 0;

  function closeMenu() {
    if (!activeMenu) return;
    if (window.__FM_MENU_DEBUG) {
      (window.__FM_MENU_LOG ||= []).push(String(new Error().stack || "").split("\n").slice(1, 4).join(" | "));
    }
    const { node, anchor } = activeMenu;
    node.remove();
    activeMenu = null;
    document.removeEventListener("click", onDocumentMenuClick, true);
    window.removeEventListener("resize", closeMenu);
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function onDocumentMenuClick(event) {
    if (!activeMenu) return;
    if (Date.now() - menuOpenedAt < 90) return;
    if (!event.target.closest(".fm-menu") && !event.target.closest("[data-menu-keep]")) {
      closeMenu();
    }
  }

  function onMenuScroll(event) {
    if (activeMenu && !activeMenu.node.contains(event.target)) closeMenu();
  }

  function openMenu(anchor, config) {
    closeMenu();
    if (!anchor || !anchor.isConnected) return;
    menuOpenedAt = Date.now();

    const appRect = app.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "fm-menu";
    menu.setAttribute("role", "menu");
    if (config.width) menu.style.width = `${config.width}px`;

    const items = config.items || [];
    menu.innerHTML = `
      ${config.header ? `<div class="fm-menu-head">${esc(config.header)}</div>` : ""}
      ${items
        .map((item, index) => {
          if (item.divider) return `<div class="fm-menu-divider"></div>`;
          if (item.html) return item.html;
          return `<button class="fm-menu-item ${item.danger ? "is-danger" : ""} ${item.checked ? "is-checked" : ""}" role="menuitem" data-menu-index="${index}" ${item.disabled ? "disabled" : ""}>
            ${item.icon ? `<svg class="i"><use href="#${item.icon}"/></svg>` : ""}
            <span>${esc(item.label)}</span>
            ${item.note ? `<small>${esc(item.note)}</small>` : ""}
          </button>`;
        })
        .join("")}
      ${config.note ? `<div class="fm-menu-note">${esc(config.note)}</div>` : ""}`;

    app.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    let left = anchorRect.left - appRect.left;
    let top = anchorRect.bottom - appRect.top + 5;
    if (left + rect.width > appRect.width - 8) left = appRect.width - rect.width - 8;
    left = Math.max(8, left);
    if (top + rect.height > appRect.height - 8 && anchorRect.top - appRect.top > rect.height + 8) {
      top = anchorRect.top - appRect.top - rect.height - 5;
    }
    top = Math.max(8, Math.min(top, appRect.height - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-menu-index]");
      if (!button) return;
      const item = items[Number(button.dataset.menuIndex)];
      if (!item || item.disabled) return;
      event.stopPropagation();
      closeMenu();
      item.onClick?.();
    });

    menu.addEventListener("keydown", (event) => {
      const buttons = $$(".fm-menu-item:not(:disabled)", menu);
      const current = buttons.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          event.key === "ArrowDown"
            ? (current + 1) % buttons.length
            : (current - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    });

    activeMenu = { node: menu, anchor, items };
    if (window.__FM_MENU_DEBUG) {
      (window.__FM_MENU_LOG ||= []).push("OPEN");
    }
    const first = $(".fm-menu-item:not(:disabled)", menu);
    if (first) first.focus({ preventScroll: true });

    window.setTimeout(() => {
      document.addEventListener("click", onDocumentMenuClick, true);
      window.addEventListener("resize", () => {
        if (!window.__FM_PROTO__?.freezeMenus) closeMenu();
      });
    }, 0);
  }

  /* ------------------------------------------------------------------------
     Modal platform
     ------------------------------------------------------------------------ */

  let lastModalFocus = null;

  function openModal(innerHTML, options = {}) {
    const { className = "", onMount = null, label = "对话框" } = options;
    if (modalRoot.classList.contains("is-open")) {
      closeModal(false);
    }
    lastModalFocus = document.activeElement;
    modalRoot.classList.add("is-open");
    modalRoot.innerHTML = `<div class="fm-modal-backdrop" data-modal-backdrop>
      <div class="fm-modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">
        ${innerHTML}
      </div>
    </div>`;
    const dialog = $(".fm-modal", modalRoot);
    const autofocus = $("[data-autofocus]", dialog) || $("input:not([type=hidden]), button:not([disabled])", dialog);
    if (autofocus) requestAnimationFrame(() => autofocus.focus({ preventScroll: true }));
    onMount?.(dialog);
    modalRoot.querySelectorAll("[data-modal-close]").forEach((button) => {
      button.addEventListener("click", () => closeModal());
    });
    $("[data-modal-backdrop]", modalRoot)?.addEventListener("mousedown", (event) => {
      if (event.target.dataset.modalBackdrop !== undefined) closeModal();
    });
    return dialog;
  }

  function closeModal(restoreFocus = true) {
    if (!modalRoot.classList.contains("is-open")) return;
    modalRoot.classList.remove("is-open");
    modalRoot.innerHTML = "";
    if (restoreFocus && lastModalFocus && lastModalFocus.isConnected) {
      lastModalFocus.focus({ preventScroll: true });
    }
    lastModalFocus = null;
  }

  function confirmAction({
    title,
    body,
    list = [],
    note = "",
    confirmLabel = "确认",
    cancelLabel = "取消",
    danger = true,
    mascot = "worry",
    onConfirm,
  }) {
    const html = `
      <div class="fm-modal-head">
        <span class="fm-modal-mascot"><span class="mascot-slot" data-mascot="${mascot}" data-size="40"></span></span>
        <div class="fm-modal-head-copy"><h2>请确认这一步</h2><p>这个动作会立即生效，影响范围如下。</p></div>
        <button class="fm-modal-close" data-modal-close aria-label="关闭"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <div class="fm-modal-body">
        <div class="fm-confirm-body">
          <span class="mascot-slot" data-mascot="${mascot}" data-size="92"></span>
          <h3>${esc(title)}</h3>
          <p>${esc(body)}</p>
          ${
            list.length
              ? `<div class="fm-confirm-list">${list
                  .map(
                    (item) => `<div><i style="background:${item.color || "var(--fm-mint)"}"></i><span>${esc(item.name)}</span><small>${esc(item.note || "")}</small></div>`
                  )
                  .join("")}</div>`
              : ""
          }
          ${note ? `<div class="fm-danger-note"><svg class="i"><use href="#i-alert"/></svg><span>${esc(note)}</span></div>` : ""}
        </div>
      </div>
      <div class="fm-modal-foot">
        <button class="fm-btn fm-btn-soft" data-confirm-cancel>${esc(cancelLabel)}</button>
        <button class="fm-btn ${danger ? "fm-btn-danger" : "fm-btn-primary"}" data-confirm-ok>${esc(confirmLabel)}</button>
      </div>`;

    const dialog = openModal(html, { className: "is-small", label: title });
    hydrateMascots(dialog);
    const cancel = $("[data-confirm-cancel]", dialog);
    const ok = $("[data-confirm-ok]", dialog);
    requestAnimationFrame(() => cancel?.focus({ preventScroll: true }));
    cancel?.addEventListener("click", () => closeModal());
    ok?.addEventListener("click", () => {
      closeModal();
      onConfirm?.();
    });
  }

  /* ------------------------------------------------------------------------
     Service lifecycle
     ------------------------------------------------------------------------ */

  function randomPid() {
    return 4100 + Math.floor(Math.random() * 3200);
  }

  function addLog(id, level, text) {
    const service = baseService(id);
    if (!service) return;
    service.logs.push({ t: clockTime(), level, text });
    if (service.logs.length > 300) service.logs.splice(0, service.logs.length - 300);
  }

  function addEvent(id, text, type = "success") {
    const service = baseService(id);
    if (!service) return;
    service.events.unshift({ text, time: "刚刚", type });
    if (service.events.length > 8) service.events.length = 8;
  }

  function markRecovered(id) {
    state.recovered.add(id);
  }

  async function startService(id, { quiet = false } = {}) {
    const service = baseService(id);
    if (!service || state.busy.get(id)) return false;

    state.busy.set(id, "start");
    renderAll();
    await new Promise((resolve) => window.setTimeout(resolve, 760));

    service.status = "running";
    service.pid = randomPid();
    service.uptime = 0;
    service.cpu = Number((0.6 + Math.random() * 2.8).toFixed(1));
    service.mem = Math.round(32 + Math.random() * 78);
    service.portActive = Boolean(service.port);
    service.lastError = "";
    service.lastUsed = Date.now();
    service.stale = false;
    markRecovered(id);
    addLog(id, "SYS", "启动请求已提交，进程树已绑定 JobObject");
    addLog(id, "OUT", `${service.port ? `listening on 127.0.0.1:${service.port}` : "process started"} · pid=${service.pid}`);
    addEvent(id, "服务启动成功", "success");
    state.busy.delete(id);
    state.lastUpdated = Date.now();
    renderAll();

    if (!quiet) {
      toast({
        type: "success",
        title: "已启动",
        message: `「${service.name}」正在运行`,
        action: { label: "撤销", onClick: () => stopService(id) },
        duration: 5000,
      });
    }
    return true;
  }

  async function stopService(id, { quiet = false } = {}) {
    const service = baseService(id);
    if (!service || state.busy.get(id)) return false;

    state.busy.set(id, "stop");
    renderAll();
    await new Promise((resolve) => window.setTimeout(resolve, 620));

    service.status = "stopped";
    service.pid = null;
    service.uptime = 0;
    service.cpu = 0;
    service.mem = 0;
    service.portActive = false;
    service.lastUsed = Date.now();
    addLog(id, "SYS", "停止请求已确认，进程树已由 JobObject 回收");
    addEvent(id, "服务已停止", "neutral");
    state.busy.delete(id);
    state.lastUpdated = Date.now();
    renderAll();

    if (!quiet) {
      toast({
        type: "info",
        title: "已停止",
        message: `「${service.name}」已安全停下`,
        action: { label: "重新启动", onClick: () => startService(id) },
        duration: 6000,
      });
    }
    return true;
  }

  async function restartService(id, { quiet = false } = {}) {
    const service = baseService(id);
    if (!service || state.busy.get(id)) return false;

    state.busy.set(id, "restart");
    renderAll();
    await new Promise((resolve) => window.setTimeout(resolve, 850));

    service.status = "running";
    service.pid = randomPid();
    service.uptime = 0;
    service.cpu = Number((0.4 + Math.random() * 2.2).toFixed(1));
    service.mem = Math.round(34 + Math.random() * 70);
    service.portActive = Boolean(service.port);
    service.lastError = "";
    service.lastUsed = Date.now();
    service.stale = false;
    markRecovered(id);
    addLog(id, "SYS", "收到重启请求：先回收旧进程树，再启动新进程");
    addLog(id, "OUT", `${service.port ? `listening on 127.0.0.1:${service.port}` : "process started"} · pid=${service.pid}`);
    addEvent(id, "服务已重启", "success");
    state.busy.delete(id);
    state.lastUpdated = Date.now();
    renderAll();

    if (!quiet) {
      toast({ type: "success", title: "已重启", message: `「${service.name}」已重新跑起来` });
    }
    return true;
  }

  function scopeServices(scope) {
    return (getServices() || []).filter((service) => !scope || service.group === scope);
  }

  async function batchStart(scope = null) {
    const candidates = scopeServices(scope).filter((service) => service.status !== "running");
    if (!candidates.length) {
      toast({ type: "info", title: "都在运行", message: "当前范围内没有需要启动的服务。" });
      return;
    }
    candidates.forEach((service) => state.busy.set(service.id, "start"));
    renderAll();
    await new Promise((resolve) => window.setTimeout(resolve, 880));
    candidates.forEach((view) => {
      const service = baseService(view.id);
      if (!service) return;
      service.status = "running";
      service.pid = randomPid();
      service.uptime = 0;
      service.cpu = Number((0.5 + Math.random() * 3).toFixed(1));
      service.mem = Math.round(30 + Math.random() * 80);
      service.portActive = Boolean(service.port);
      service.lastError = "";
      service.lastUsed = Date.now();
      markRecovered(service.id);
      addLog(service.id, "SYS", "批量启动：进程已托管");
      addEvent(service.id, "批量启动成功", "success");
      state.busy.delete(service.id);
    });
    state.lastUpdated = Date.now();
    renderAll();
    toast({
      type: "success",
      title: "批量启动完成",
      message: `${candidates.length} 个服务已开始运行`,
      action: { label: "全部停止", onClick: () => confirmBatchStop(scope) },
      duration: 7000,
    });
  }

  function confirmBatchStop(scope = null) {
    const running = scopeServices(scope).filter((service) => service.status === "running");
    if (!running.length) {
      toast({ type: "info", title: "没有需要停止的服务", message: "当前范围内都是停止状态。" });
      return;
    }
    const scopeLabel = scope || "全部服务";
    confirmAction({
      title: `要让 ${running.length} 个服务先休息吗？`,
      body: `即将停止「${scopeLabel}」中正在运行的服务。正在写入文件的进程可能会被中断，请确认没有关键任务在跑。`,
      list: running.map((service) => ({
        name: service.name,
        note: service.port ? `:${service.port}` : "无端口",
        color: "var(--fm-mint)",
      })),
      note: "停止后会有 8 秒撤销入口；JobObject 会同时回收整棵子进程树。",
      confirmLabel: `停止 ${running.length} 个服务`,
      danger: true,
      mascot: "worry",
      onConfirm: () => batchStop(running),
    });
  }

  async function batchStop(running) {
    running.forEach((service) => state.busy.set(service.id, "stop"));
    renderAll();
    await new Promise((resolve) => window.setTimeout(resolve, 840));
    running.forEach((view) => {
      const service = baseService(view.id);
      if (!service) return;
      service.status = "stopped";
      service.pid = null;
      service.uptime = 0;
      service.cpu = 0;
      service.mem = 0;
      service.portActive = false;
      addLog(service.id, "SYS", "批量停止：进程树已回收");
      addEvent(service.id, "批量停止", "neutral");
      state.busy.delete(service.id);
    });
    state.lastUpdated = Date.now();
    renderAll();
    toast({
      type: "info",
      title: "批量停止完成",
      message: `${running.length} 个服务已休息`,
      action: {
        label: "撤销",
        onClick: async () => {
          for (const item of running) {
            await startService(item.id, { quiet: true });
          }
          toast({ type: "success", title: "已恢复", message: "先前的运行状态已恢复" });
        },
      },
      duration: 8000,
    });
  }

  async function restartErrors(scope = null) {
    const errors = scopeServices(scope).filter((service) => service.status === "error");
    if (!errors.length) {
      toast({ type: "info", title: "没有异常服务", message: "当前范围内一切正常。" });
      return;
    }
    for (const item of errors) {
      await restartService(item.id, { quiet: true });
    }
    toast({
      type: "success",
      title: "异常已处理",
      message: `${errors.length} 个服务已重新启动`,
    });
  }

  function openFrontend(id) {
    const service = baseService(id);
    if (!service) return;
    if (!service.frontendUrl) {
      toast({ type: "info", title: "还没有前端地址", message: "可以在配置里添加一个 Web 地址。" });
      return;
    }
    const suffix = service.status === "running" ? "" : "（服务当前未运行）";
    toast({
      type: "info",
      title: "已交给系统浏览器",
      message: `${service.frontendUrl}${suffix}`,
      duration: 4500,
    });
    service.lastUsed = Date.now();
  }

  function deleteService(id) {
    const service = baseService(id);
    if (!service) return;
    confirmAction({
      title: `要和「${service.name}」说再见吗？`,
      body: "会从小屋里移除这条配置。本地文件、日志与程序本身都不会被删除，之后仍可以重新添加。",
      note: "移除后 8 秒内可以撤销；正在运行的服务请先停止。",
      confirmLabel: "移除配置",
      danger: true,
      mascot: "worry",
      onConfirm: () => {
        const index = DB.services.findIndex((item) => item.id === id);
        if (index < 0) return;
        const [removed] = DB.services.splice(index, 1);
        state.recovered.delete(id);
        if (state.selectedId === id) closeDrawer();
        renderAll();
        toast({
          type: "info",
          title: "已移除",
          message: `「${removed.name}」的配置已移出小屋`,
          action: {
            label: "撤销",
            onClick: () => {
              DB.services.splice(index, 0, removed);
              renderAll();
              toast({ type: "success", title: "已撤销", message: `「${removed.name}」回来了` });
            },
          },
          duration: 8000,
        });
      },
    });
  }

  function copyText(text, message = "已复制") {
    const done = () => toast({ type: "success", title: message, message: "" });
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      done();
    } catch {
      toast({ type: "error", title: "复制失败", message: "当前环境不允许访问剪贴板。" });
    }
  }

  function setTheme(theme) {
    state.theme = theme === "night" ? "night" : "day";
    app.dataset.theme = state.theme;
    try {
      localStorage.setItem("fm-proto-theme", state.theme);
    } catch {
      /* ignore */
    }
    $$("[data-set-theme]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.setTheme === state.theme);
    });
  }

  function setMoe(level) {
    state.moe = ["0", "1", "2"].includes(String(level)) ? String(level) : "1";
    app.dataset.moe = state.moe;
    updateMoeLabel();
    try {
      localStorage.setItem("fm-proto-moe", state.moe);
    } catch {
      /* ignore */
    }
    $$("[data-set-moe]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.setMoe === state.moe);
    });
    const labels = { "0": "克制", "1": "标准", "2": "满开" };
    toast({ type: "info", title: "萌度已调整", message: `现在是「${labels[state.moe]}」模式`, duration: 2600 });
  }

  function setDemo(mode) {
    state.demo = mode;
    state.filter = "all";
    state.group = "all";
    state.type = "all";
    state.query = "";
    state.recovered.clear();
    closeDrawer();
    closeMenu();
    if (toastsRoot) toastsRoot.innerHTML = "";
    renderAll();
    updateSearchValue();
    const select = $("#demoState");
    if (select) select.value = mode;
    const labels = { normal: "正常运行", empty: "空小屋", error: "有异常", loading: "载入中" };
    if (mode !== "normal") {
      toast({ type: "info", title: `演示状态：${labels[mode]}`, message: "随时可以在右上角切回正常运行。", duration: 3600 });
    }
  }

  function resetDemo() {
    DB.services = BASE_SERVICES.map((service) => ({
      ...service,
      logs: service.logs.slice(),
      events: service.events.slice(),
    }));
    state.recovered.clear();
    state.busy.clear();
    state.demo = "normal";
    state.filter = "all";
    state.group = "all";
    state.type = "all";
    state.query = "";
    state.selectedId = "";
    closeModal(false);
    closeDrawer();
    renderAll();
    updateSearchValue();
    const select = $("#demoState");
    if (select) select.value = "normal";
    toast({ type: "success", title: "演示数据已重置", message: "小屋里又恢复了最初的七个服务" });
  }

  /* ------------------------------------------------------------------------
     Popover content
     ------------------------------------------------------------------------ */

  function openMoeMenu(anchor) {
    openMenu(anchor, {
      header: "萌度 / Sweetness",
      items: [
        { label: "克制", note: "零装饰", icon: "i-eye", checked: state.moe === "0", onClick: () => setMoe("0") },
        { label: "标准", note: "推荐", icon: "i-sparkles", checked: state.moe === "1", onClick: () => setMoe("1") },
        { label: "满开", note: "多一点闪光", icon: "i-star", checked: state.moe === "2", onClick: () => setMoe("2") },
      ],
      note: "萌度只改变装饰与动效，不改变任何信息与操作。",
      width: 208,
    });
  }

  function openBatchMenu(anchor) {
    const scopeLabel = state.group === "all" ? "全部服务" : state.group;
    const scoped = scopeServices(state.group === "all" ? null : state.group);
    const running = scoped.filter((service) => service.status === "running").length;
    const errors = scoped.filter((service) => service.status === "error").length;
    const stopped = scoped.filter((service) => service.status !== "running").length;
    openMenu(anchor, {
      header: "批量操作",
      items: [
        {
          label: "启动范围内服务",
          note: `${stopped} 个`,
          icon: "i-play",
          disabled: stopped === 0,
          onClick: () => batchStart(state.group === "all" ? null : state.group),
        },
        {
          label: "停止范围内服务",
          note: `${running} 个`,
          icon: "i-stop",
          danger: true,
          disabled: running === 0,
          onClick: () => confirmBatchStop(state.group === "all" ? null : state.group),
        },
        {
          label: "重启异常服务",
          note: `${errors} 个`,
          icon: "i-restart",
          disabled: errors === 0,
          onClick: () => restartErrors(state.group === "all" ? null : state.group),
        },
        { divider: true },
        { label: "从文件夹自动识别", icon: "i-folder", onClick: () => openDetectModal() },
      ],
      note: `范围：${scopeLabel} · 危险操作会先确认，完成后可撤销。`,
      width: 228,
    });
  }

  function openUserMenu(anchor) {
    openMenu(anchor, {
      header: "小屋设置",
      items: [
        { label: "偏好设置", icon: "i-sliders", onClick: () => openSettingsModal() },
        { label: "快捷键", icon: "i-keyboard", note: "?", onClick: () => openShortcutsModal() },
        { divider: true },
        {
          label: "休眠到系统托盘",
          icon: "i-moon",
          onClick: () => showSleepOverlay(),
        },
        {
          label: "关于 FlashManager",
          icon: "i-info",
          onClick: () =>
            toast({
              type: "info",
              title: "FlashManager v0.1.0",
              message: "Tauri v2 + React 18 · 本页面是 Sugar Star 改版提案原型",
              duration: 5000,
            }),
        },
      ],
      width: 218,
    });
  }

  function openNotificationsMenu(anchor) {
    const errors = (getServices() || []).filter((service) => service.status === "error");
    const items = errors.map((service) => ({
      label: `${service.name}：${service.lastError || "异常"}`,
      icon: "i-alert",
      danger: true,
      onClick: () => {
        openDrawer(service.id, "diagnose");
        const badge = $(".fm-bell .fm-badge");
        if (badge) badge.remove();
      },
    }));
    if (!items.length) {
      items.push({ label: "没有新的通知", icon: "i-check", disabled: true });
    }
    items.push({ divider: true });
    items.push({
      label: "全部标记为已读",
      icon: "i-check",
      onClick: () => {
        const badge = $(".fm-bell .fm-badge");
        if (badge) badge.remove();
        toast({ type: "success", title: "通知已读完", message: "有异常时小闪还会再提醒你。" });
      },
    });
    openMenu(anchor, {
      header: errors.length ? `通知 · ${errors.length}` : "通知",
      items,
      width: 284,
    });
  }

  function openCardMenu(anchor, id) {
    const service = baseService(id);
    if (!service) return;
    openMenu(anchor, {
      header: service.name,
      items: [
        { label: "查看详情", icon: "i-eye", onClick: () => openDrawer(id, "overview") },
        service.frontendUrl
          ? { label: "打开前端", icon: "i-external", onClick: () => openFrontend(id) }
          : null,
        { label: "查看实时日志", icon: "i-terminal", onClick: () => openDrawer(id, "logs") },
        { divider: true },
        { label: "重启服务", icon: "i-restart", onClick: () => restartService(id) },
        { label: "运行健康诊断", icon: "i-activity", onClick: () => runDiagnose(id, true) },
        { label: "编辑配置", icon: "i-pencil", onClick: () => openServiceModal(service) },
        { label: "复制启动命令", icon: "i-copy", onClick: () => copyText(service.cmd, "启动命令已复制") },
        { divider: true },
        {
          label: "移除服务配置",
          icon: "i-trash",
          danger: true,
          onClick: () => deleteService(id),
        },
      ].filter(Boolean),
      note: "移除只删除配置，不会动本地文件。",
      width: 218,
    });
  }

  async function runDiagnose(id, openTab = false) {
    if (state.busy.get(id)) return;
    state.busy.set(id, "diagnose");
    renderAll();
    if (openTab) {
      state.drawerOpen = true;
      state.selectedId = id;
      state.drawerTab = "diagnose";
      renderDrawer();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 820));
    state.busy.delete(id);
    addEvent(id, "完成一次健康诊断", "success");
    state.lastUpdated = Date.now();
    renderAll();
    const service = baseService(id);
    toast({
      type: service?.status === "error" ? "error" : "success",
      title: "诊断完成",
      message:
        service?.status === "error"
          ? service.lastError || "发现异常，请查看诊断页的下一步。"
          : "进程、端口与配置检查均已通过。",
      action: service?.status === "error" ? { label: "查看诊断", onClick: () => openDrawer(id, "diagnose") } : null,
    });
  }

  /* ------------------------------------------------------------------------
     Service form modal
     ------------------------------------------------------------------------ */

  const TYPE_DEFAULTS = {
    python: { executable: "python", encoding: "utf-8" },
    node: { executable: "node", encoding: "utf-8" },
    nginx: { executable: "D:/Develop/Windows/Nginx/nginx.exe", encoding: "utf-8" },
    exe: { executable: "D:/Tools/app.exe", encoding: "utf-8" },
    script: { executable: "powershell.exe", encoding: "gbk" },
  };

  function fileBase(path) {
    if (!path) return "";
    const parts = String(path).split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  function buildCommand(payload) {
    const args = (payload.args || []).join(" ");
    if (payload.serviceType === "python") {
      return `python ${fileBase(payload.scriptPath)}${args ? ` ${args}` : ""}`.trim();
    }
    if (payload.serviceType === "node") {
      return `node ${fileBase(payload.scriptPath)}${args ? ` ${args}` : ""}`.trim();
    }
    if (payload.serviceType === "nginx") {
      return `nginx${args ? ` ${args}` : ""}`.trim();
    }
    if (payload.serviceType === "script") {
      return `powershell -File ${fileBase(payload.scriptPath)}${args ? ` ${args}` : ""}`.trim();
    }
    return `${fileBase(payload.executable)}${args ? ` ${args}` : ""}`.trim();
  }

  function normalizeUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `http://${value}`;
  }

  function openServiceModal(service = null) {
    const editing = Boolean(service);
    const type = service?.serviceType || "python";
    const groups = Array.from(new Set(DB.services.map((item) => item.group)));
    if (!groups.includes("默认分组")) groups.push("默认分组");

    const html = `
      <form id="serviceForm" class="fm-modal-form" novalidate>
        <div class="fm-modal-head">
          <span class="fm-modal-mascot"><span class="mascot-slot" data-mascot="${editing ? "idle" : "happy"}" data-size="40"></span></span>
          <div class="fm-modal-head-copy">
            <h2>${editing ? `调整「${esc(service.name)}」` : "把新伙伴请进小屋"}</h2>
            <p>${editing ? "修改配置。正在运行的服务需要重启后才会生效。" : "只需要填最少的信息；高级项默认收起来，之后再改也来得及。"}</p>
          </div>
          <button type="button" class="fm-modal-close" data-modal-close aria-label="关闭"><svg class="i"><use href="#i-x"/></svg></button>
        </div>
        <div class="fm-modal-body">
          <div class="fm-type-grid" role="radiogroup" aria-label="运行器类型">
            ${["python", "node", "nginx", "exe", "script"]
              .map(
                (key) => `<button type="button" class="fm-type-choice ${key === type ? "is-active" : ""}" data-type-choice="${key}" role="radio" aria-checked="${key === type}">
                  ${typeIcon({ serviceType: key })}
                  <b>${TYPE_META[key].label}</b>
                  <small>${key === "python" ? ".py / .venv" : key === "node" ? ".js / .mjs" : key === "nginx" ? "网关" : key === "script" ? ".bat / .ps1" : ".exe"}</small>
                </button>`
              )
              .join("")}
          </div>

          <div class="fm-form-grid">
            <div class="fm-field" data-field="name">
              <label for="svcName">显示名称 <span class="req">*</span></label>
              <input class="fm-input" id="svcName" name="name" placeholder="例如：DeepSeek RAG 助手" value="${esc(service?.name || "")}" data-autofocus autocomplete="off" />
              <span class="fm-field-error">给服务起一个你认得出的名字。</span>
            </div>
            <div class="fm-field">
              <label for="svcGroup">所属分组</label>
              <input class="fm-input" id="svcGroup" name="group" list="groupOptions" placeholder="例如：AI Agent 项目" value="${esc(service?.group || (state.group !== "all" ? state.group : "默认分组"))}" autocomplete="off" />
              <datalist id="groupOptions">${groups.map((group) => `<option value="${esc(group)}"></option>`).join("")}</datalist>
            </div>

            <div class="fm-field span-2" data-field="executable">
              <label for="svcExecutable" id="execLabel">启动程序 <span class="req">*</span></label>
              <div class="fm-input-row">
                <input class="fm-input" id="svcExecutable" name="executable" placeholder="python / node / D:/Tools/app.exe" value="${esc(service?.executable || TYPE_DEFAULTS[type].executable)}" autocomplete="off" />
                <button type="button" class="fm-btn fm-btn-soft" data-browse="executable"><svg class="i"><use href="#i-folder"/></svg>浏览</button>
              </div>
              <span class="fm-field-hint" id="execHint">可以直接写 <code>python</code> / <code>node</code>，也可以填绝对路径。</span>
              <span class="fm-field-error">请填写启动程序或解释器。</span>
            </div>

            <div class="fm-field span-2 ${["python", "node", "script"].includes(type) ? "" : "is-hidden"}" data-field="scriptPath" id="scriptField">
              <label for="svcScript" id="scriptLabel">脚本文件路径 <span class="req">*</span></label>
              <div class="fm-input-row">
                <input class="fm-input" id="svcScript" name="scriptPath" placeholder="${type === "python" ? "D:/Develop/my-service/server.py" : type === "node" ? "D:/Develop/my-service/index.mjs" : "D:/Develop/Tools/clean.ps1"}" value="${esc(service?.scriptPath || "")}" autocomplete="off" />
                <button type="button" class="fm-btn fm-btn-soft" data-browse="scriptPath"><svg class="i"><use href="#i-folder"/></svg>浏览</button>
              </div>
              <span class="fm-field-hint">相对路径会按工作目录解析；探测到项目里的 .venv 时会优先使用它。</span>
              <span class="fm-field-error">这个运行器需要脚本文件路径。</span>
            </div>

            <div class="fm-field">
              <label for="svcPort">监控端口 <small>选填</small></label>
              <input class="fm-input" id="svcPort" name="port" type="number" min="1" max="65535" placeholder="如 8787" value="${service?.port || ""}" autocomplete="off" />
              <span class="fm-field-hint">用于检测服务是否真的在监听。</span>
              <span class="fm-field-error">端口需要在 1–65535 之间。</span>
            </div>
            <div class="fm-field">
              <label for="svcFrontend">Web 前端地址 <small>选填</small></label>
              <div class="fm-input-row">
                <input class="fm-input" id="svcFrontend" name="frontendUrl" placeholder="http://127.0.0.1:8787" value="${esc(service?.frontendUrl || "")}" autocomplete="off" />
                <button type="button" class="fm-btn fm-btn-soft" data-use-port>用端口</button>
              </div>
              <span class="fm-field-hint">填写后卡片上会出现「打开」按钮。</span>
            </div>

            <div class="fm-field span-2">
              <label for="svcArgs">启动参数 <small>空格分隔</small></label>
              <input class="fm-input" id="svcArgs" name="args" placeholder="例如：--port 8787 --env dev" value="${esc((service?.args || []).join(" "))}" autocomplete="off" />
            </div>
          </div>

          <details class="fm-advanced" ${editing ? "" : ""}>
            <summary><svg class="i"><use href="#i-chevron"/></svg>高级设置 · 工作目录 / 编码 / 自动重启</summary>
            <div class="fm-advanced-body">
              <div class="fm-form-grid">
                <div class="fm-field span-2">
                  <label for="svcCwd">工作目录</label>
                  <input class="fm-input" id="svcCwd" name="cwd" placeholder="留空则取程序或脚本所在目录" value="${esc(service?.cwd || "")}" autocomplete="off" />
                </div>
                <div class="fm-field">
                  <label for="svcEncoding">控制台编码</label>
                  <select class="fm-select" id="svcEncoding" name="encoding">
                    <option value="utf-8" ${service?.encoding !== "gbk" ? "selected" : ""}>UTF-8（推荐）</option>
                    <option value="gbk" ${service?.encoding === "gbk" ? "selected" : ""}>GBK / CP936（中文批处理）</option>
                  </select>
                </div>
                <div class="fm-field">
                  <label>进程策略</label>
                  <label class="fm-checkline"><input type="checkbox" id="svcAutoRestart" ${service?.autoRestart !== false ? "checked" : ""} />异常退出时自动重启</label>
                  <span class="fm-field-hint">自动重启会等待 1.5 秒并确认不是手动停止。</span>
                </div>
              </div>
              <p class="fm-field-hint" style="margin-top:6px">环境变量沿用现有配置，不在这个原型里编辑；正式版会提供键值对编辑器。</p>
            </div>
          </details>
        </div>
        <div class="fm-modal-foot">
          <span class="fm-modal-foot-note">${editing ? "保存后可在详情里重启生效" : "保存后随时可以在详情里启动"}</span>
          <button type="button" class="fm-btn fm-btn-soft" data-modal-close>取消</button>
          <button type="button" class="fm-btn fm-btn-soft" data-save="0">仅保存</button>
          <button type="button" class="fm-btn fm-btn-primary" data-save="1">${editing ? "保存配置" : "保存并启动"}</button>
        </div>
      </form>`;

    const dialog = openModal(html, { className: "is-wide", label: editing ? "编辑服务" : "添加服务" });
    hydrateMascots(dialog);
    const form = $("#serviceForm", dialog);
    let currentType = type;

    const scriptField = $("#scriptField", dialog);
    const execInput = $("#svcExecutable", dialog);
    const execLabel = $("#execLabel", dialog);
    const execHint = $("#execHint", dialog);
    const scriptLabel = $("#scriptLabel", dialog);
    const scriptInput = $("#svcScript", dialog);

    const applyType = (nextType, useDefaults) => {
      currentType = nextType;
      $$("[data-type-choice]", dialog).forEach((button) => {
        const active = button.dataset.typeChoice === nextType;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-checked", String(active));
      });
      const needsScript = ["python", "node", "script"].includes(nextType);
      scriptField.classList.toggle("is-hidden", !needsScript);
      execLabel.innerHTML =
        nextType === "python"
          ? 'Python 解释器 <span class="req">*</span>'
          : nextType === "node"
          ? 'Node.js 运行时 <span class="req">*</span>'
          : '启动程序 <span class="req">*</span>';
      execHint.textContent =
        nextType === "python"
          ? "可以直接写 python，也可以填 venv / conda 的绝对路径。"
          : nextType === "node"
          ? "可以填 node，也可以填 node.exe 的绝对路径。"
          : "可以直接写命令名，也可以填绝对路径。";
      scriptLabel.innerHTML =
        nextType === "python" ? 'Python 脚本路径 <span class="req">*</span>' : nextType === "node" ? 'Node.js 脚本路径 <span class="req">*</span>' : '脚本文件路径 <span class="req">*</span>';
      scriptInput.placeholder =
        nextType === "python" ? "D:/Develop/my-service/server.py" : nextType === "node" ? "D:/Develop/my-service/index.mjs" : "D:/Develop/Tools/clean.ps1";
      if (useDefaults) {
        execInput.value = TYPE_DEFAULTS[nextType].executable;
        $("#svcEncoding", dialog).value = TYPE_DEFAULTS[nextType].encoding;
        if (!needsScript) scriptInput.value = "";
      }
    };

    $$("[data-type-choice]", dialog).forEach((button) => {
      button.addEventListener("click", () => applyType(button.dataset.typeChoice, true));
    });

    const fillBrowse = (target, value) => {
      if (!target) return;
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      toast({ type: "info", title: "已填入示例路径", message: "正式版会调用系统文件选择器。", duration: 2600 });
    };

    $$("[data-browse]", dialog).forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.browse;
        if (key === "executable") {
          fillBrowse(execInput, TYPE_DEFAULTS[currentType].executable);
        } else {
          const samples = {
            python: "D:/Develop/Deepseek/my-service/server.py",
            node: "D:/Develop/Deepseek/my-service/index.mjs",
            script: "D:/Develop/Tools/clean/clean.ps1",
          };
          fillBrowse(scriptInput, samples[currentType] || "D:/Develop/my-service/server.py");
        }
      });
    });

    $("[data-use-port]", dialog)?.addEventListener("click", () => {
      const port = Number($("#svcPort", dialog).value);
      if (!port) {
        toast({ type: "error", title: "先填端口", message: "监控端口为空，暂时无法生成前端地址。" });
        return;
      }
      $("#svcFrontend", dialog).value = `http://127.0.0.1:${port}`;
    });

    const setError = (field, message) => {
      const wrapper = $(`[data-field="${field}"]`, dialog);
      if (!wrapper) return;
      wrapper.classList.add("has-error");
      const input = $(".fm-input", wrapper);
      if (input) input.classList.add("is-invalid");
      const error = $(".fm-field-error", wrapper);
      if (error && message) error.textContent = message;
    };

    const clearErrors = () => {
      $$(".fm-field", dialog).forEach((field) => field.classList.remove("has-error"));
      $$(".fm-input", dialog).forEach((input) => input.classList.remove("is-invalid"));
    };

    const validate = () => {
      clearErrors();
      const name = $("#svcName", dialog).value.trim();
      const executable = execInput.value.trim();
      const scriptPath = scriptInput.value.trim();
      const portRaw = $("#svcPort", dialog).value.trim();
      const needsScript = ["python", "node", "script"].includes(currentType);
      let firstInvalid = null;

      if (!name) {
        setError("name", "给服务起一个名字，方便在列表里找到它。");
        firstInvalid = firstInvalid || $("#svcName", dialog);
      }
      if (!executable) {
        setError("executable", "请填写启动程序或解释器。");
        firstInvalid = firstInvalid || execInput;
      }
      if (needsScript && !scriptPath) {
        setError("scriptPath", "这个运行器需要指定要执行的脚本。");
        firstInvalid = firstInvalid || scriptInput;
      }
      if (portRaw && (Number(portRaw) < 1 || Number(portRaw) > 65535)) {
        setError("port", "端口需要在 1–65535 之间。");
        firstInvalid = firstInvalid || $("#svcPort", dialog);
      }
      if (firstInvalid) {
        firstInvalid.focus({ preventScroll: false });
        return null;
      }
      return { name, executable, scriptPath, portRaw, needsScript };
    };

    const save = async (startAfter) => {
      const values = validate();
      if (!values) return;

      const port = values.portRaw ? Number(values.portRaw) : null;
      const args = $("#svcArgs", dialog).value.trim().split(/\s+/).filter(Boolean);
      const payload = {
        name: values.name,
        group: $("#svcGroup", dialog).value.trim() || "默认分组",
        serviceType: currentType,
        executable: values.executable,
        scriptPath: values.needsScript ? values.scriptPath : "",
        args,
        cwd: $("#svcCwd", dialog).value.trim() || values.scriptPath.replace(/[\\/][^\\/]+$/, "") || "",
        encoding: $("#svcEncoding", dialog).value,
        autoRestart: $("#svcAutoRestart", dialog).checked,
        port,
        frontendUrl: normalizeUrl($("#svcFrontend", dialog).value),
      };
      payload.cmd = buildCommand(payload);

      if (editing) {
        const base = baseService(service.id);
        if (!base) return;
        const wasRunning = base.status === "running";
        Object.assign(base, payload);
        base.lastUsed = Date.now();
        base.stale = wasRunning;
        addEvent(base.id, "配置已更新", "neutral");
        closeModal();
        state.demo = "normal";
        renderAll();
        toast({
          type: "success",
          title: "配置已保存",
          message: wasRunning ? "运行中的服务需要重启后才会应用新配置。" : `「${base.name}」已更新`,
          action: wasRunning
            ? {
                label: "立即重启",
                onClick: async () => {
                  await restartService(base.id, { quiet: true });
                  base.stale = false;
                  renderAll();
                  toast({ type: "success", title: "新配置已生效", message: base.name });
                },
              }
            : null,
          duration: wasRunning ? 9000 : 4000,
        });
        if (startAfter && !wasRunning) {
          await startService(base.id, { quiet: true });
        }
        return;
      }

      const id = `svc-${Date.now().toString(36)}`;
      const newService = {
        id,
        ...payload,
        status: "stopped",
        portActive: false,
        cpu: 0,
        mem: 0,
        uptime: 0,
        pid: null,
        lastUsed: Date.now(),
        lastError: "",
        stale: false,
        logs: [
          log("SYS", "配置已写入 config/services.d/*.json", -5),
          log("SYS", "等待首次启动", -4),
        ],
        events: [{ text: "加入小屋", time: "刚刚", type: "success" }],
      };
      DB.services.push(newService);
      state.demo = "normal";
      state.recovered.delete(id);
      closeModal();
      renderAll();
      toast({ type: "success", title: "已加入小屋", message: `「${newService.name}」现在就等你启动了` });
      if (startAfter) {
        await startService(id, { quiet: true });
        toast({
          type: "success",
          title: "已加入并启动",
          message: `「${newService.name}」正在运行`,
          action: { label: "查看详情", onClick: () => openDrawer(id, "overview") },
        });
      }
    };

    $$("[data-save]", dialog).forEach((button) => {
      button.addEventListener("click", () => save(button.dataset.save === "1"));
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      save(true);
    });
  }

  /* ------------------------------------------------------------------------
     Auto-detect modal
     ------------------------------------------------------------------------ */

  function openDetectModal() {
    const html = `
      <div class="fm-modal-head">
        <span class="fm-modal-mascot"><span class="mascot-slot" data-mascot="idle" data-size="40"></span></span>
        <div class="fm-modal-head-copy">
          <h2>把文件夹交给小闪</h2>
          <p>输入项目目录或脚本路径，自动识别 Python / Node / Nginx / EXE / BAT，并生成可确认的启动配置。</p>
        </div>
        <button class="fm-modal-close" data-modal-close aria-label="关闭"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <div class="fm-modal-body">
        <div class="fm-field">
          <label for="detectPath">项目目录或脚本路径 <span class="req">*</span></label>
          <div class="fm-input-row">
            <input class="fm-input" id="detectPath" value="D:/Develop/Deepseek/my-rag-service" placeholder="D:/Develop/Deepseek/my-service" autocomplete="off" data-autofocus />
            <button class="fm-btn fm-btn-soft" type="button" data-detect-browse><svg class="i"><use href="#i-folder"/></svg>浏览</button>
          </div>
          <span class="fm-field-hint">会优先读取 <code>.flashservice.json</code>；没有的话按入口文件与 .venv 推断。</span>
        </div>
        <div class="fm-field">
          <label for="detectGroup">放进哪个分组</label>
          <input class="fm-input" id="detectGroup" value="AI Agent 项目" placeholder="AI Agent 项目" autocomplete="off" />
        </div>

        <div class="fm-detect-steps" id="detectSteps" hidden>
          <div class="fm-detect-step is-active"><span class="fm-detect-dot">1</span><span>读取目录与清单文件…</span></div>
          <div class="fm-detect-step"><span class="fm-detect-dot">2</span><span>识别运行器与入口脚本…</span></div>
          <div class="fm-detect-step"><span class="fm-detect-dot">3</span><span>生成启动命令与端口建议…</span></div>
        </div>
        <div class="fm-detect-result" id="detectResult" hidden></div>
      </div>
      <div class="fm-modal-foot">
        <span class="fm-modal-foot-note">识别结果会先给你确认；接入后会立即启动，可随时停止</span>
        <button class="fm-btn fm-btn-soft" data-modal-close>取消</button>
        <button class="fm-btn fm-btn-primary" data-detect-start><svg class="i"><use href="#i-sparkles"/></svg>开始识别</button>
      </div>`;

    const dialog = openModal(html, { label: "自动识别服务" });
    hydrateMascots(dialog);
    const pathInput = $("#detectPath", dialog);
    const groupInput = $("#detectGroup", dialog);
    const steps = $("#detectSteps", dialog);
    const result = $("#detectResult", dialog);
    const startBtn = $("[data-detect-start]", dialog);
    let phase = "idle";
    let busy = false;

    const setSteps = (activeIndex) => {
      $$(".fm-detect-step", steps).forEach((step, index) => {
        step.classList.toggle("is-active", index === activeIndex);
        step.classList.toggle("is-done", index < activeIndex);
        const dot = $(".fm-detect-dot", step);
        if (dot) dot.textContent = index < activeIndex ? "✓" : String(index + 1);
      });
    };

    const scan = () => {
      if (busy) return;
      const path = pathInput.value.trim();
      if (!path) {
        pathInput.focus();
        toast({ type: "error", title: "还差一个路径", message: "输入项目文件夹或脚本路径后，小闪才能开始找。" });
        return;
      }
      busy = true;
      phase = "scanning";
      startBtn.disabled = true;
      startBtn.style.opacity = "0.65";
      startBtn.innerHTML = `<svg class="i"><use href="#i-restart"/></svg>正在识别…`;
      result.hidden = true;
      steps.hidden = false;
      setSteps(0);

      const mark = (index, delay) =>
        window.setTimeout(() => {
          if (!startBtn.isConnected) return;
          setSteps(index);
        }, delay);

      mark(1, 560);
      mark(2, 1120);

      window.setTimeout(() => {
        if (!startBtn.isConnected) return;
        setSteps(3);
        const name = path.split(/[\\/]/).filter(Boolean).pop() || "auto-service";
        const pretty = name
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
        result.hidden = false;
        result.innerHTML = `<b><svg class="i" style="width:12px;height:12px"><use href="#i-check"/></svg>识别完成：Python 项目</b>
          <p>入口 <code>server.py</code> · 检测到 <code>.venv</code> · 建议端口 <code>8000</code> · 名称「${esc(pretty || "Auto Service")}」</p>
          <p style="margin-top:4px">启动命令：<code>python server.py --port 8000</code></p>`;
        busy = false;
        phase = "ready";
        startBtn.disabled = false;
        startBtn.style.opacity = "";
        startBtn.innerHTML = `<svg class="i"><use href="#i-check"/></svg>接入并启动`;
      }, 1820);
    };

    startBtn.addEventListener("click", () => {
      if (phase !== "ready") {
        scan();
        return;
      }
      const path = pathInput.value.trim();
      const group = groupInput.value.trim() || "AI Agent 项目";
      const name = path.split(/[\\/]/).filter(Boolean).pop() || "auto-service";
      const pretty = name.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const id = `svc-${Date.now().toString(36)}`;
      const service = {
        id,
        name: `${pretty} 服务`,
        group,
        serviceType: "python",
        status: "stopped",
        port: 8000,
        portActive: false,
        frontendUrl: "http://127.0.0.1:8000",
        cpu: 0,
        mem: 0,
        uptime: 0,
        pid: null,
        autoRestart: true,
        encoding: "utf-8",
        cwd: path,
        executable: "python",
        scriptPath: `${path.replace(/[\\/]$/, "")}/server.py`,
        args: ["--port", "8000"],
        cmd: "python server.py --port 8000",
        lastUsed: Date.now(),
        lastError: "",
        stale: false,
        logs: [log("SYS", "自动识别接入：python + .venv", -8)],
        events: [{ text: "通过自动识别加入小屋", time: "刚刚", type: "success" }],
      };
      DB.services.push(service);
      state.demo = "normal";
      closeModal();
      renderAll();
      startService(id, { quiet: true }).then(() => {
        toast({
          type: "success",
          title: "已自动接入并启动",
          message: `「${service.name}」· ${group}`,
          action: { label: "查看详情", onClick: () => openDrawer(id, "overview") },
        });
      });
    });

    $("[data-detect-browse]", dialog)?.addEventListener("click", () => {
      pathInput.value = "D:/Develop/Deepseek/my-rag-service";
      toast({ type: "info", title: "已填入示例目录", message: "正式版会调用系统文件夹选择器。" });
    });
  }

  /* ------------------------------------------------------------------------
     Settings / shortcuts / sleep
     ------------------------------------------------------------------------ */

  function openSettingsModal() {
    const html = `
      <div class="fm-modal-head">
        <span class="fm-modal-mascot"><span class="mascot-slot" data-mascot="idle" data-size="40"></span></span>
        <div class="fm-modal-head-copy"><h2>小屋偏好</h2><p>让界面更像你习惯的样子。所有设置只影响本机显示。</p></div>
        <button class="fm-modal-close" data-modal-close aria-label="关闭"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <div class="fm-modal-body">
        <div class="fm-settings-section">
          <h3>外观</h3>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>主题</b><small>樱昼是奶油底色，樱夜适合长时间盯日志。</small></div>
            <div class="fm-segmented">
              <button data-set-theme="day" class="${state.theme === "day" ? "is-active" : ""}">樱昼</button>
              <button data-set-theme="night" class="${state.theme === "night" ? "is-active" : ""}">樱夜</button>
            </div>
          </div>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>萌度</b><small>装饰强度。克制模式会收起吉祥物与闪光，不影响功能。</small></div>
            <div class="fm-segmented">
              <button data-set-moe="0" class="${state.moe === "0" ? "is-active" : ""}">克制</button>
              <button data-set-moe="1" class="${state.moe === "1" ? "is-active" : ""}">标准</button>
              <button data-set-moe="2" class="${state.moe === "2" ? "is-active" : ""}">满开</button>
            </div>
          </div>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>减少动效</b><small>关闭浮动、闪烁与弹跳；系统开启“减少动态效果”时会自动生效。</small></div>
            <label class="fm-switch"><input type="checkbox" data-setting-motion ${state.reduceMotion ? "checked" : ""} /><span></span></label>
          </div>
        </div>

        <div class="fm-settings-section">
          <h3>状态刷新</h3>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>刷新频率</b><small>窗口不可见时自动暂停轮询，回到前台立即刷新。</small></div>
            <div class="fm-segmented">
              ${[1000, 3000, 5000]
                .map(
                  (ms) => `<button data-refresh="${ms}" class="${state.refreshMs === ms ? "is-active" : ""}">${ms / 1000}s</button>`
                )
                .join("")}
            </div>
          </div>
        </div>

        <div class="fm-settings-section">
          <h3>通知</h3>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>异常时在系统托盘提醒</b><small>只在服务从运行变为异常时提醒一次，不重复打扰。</small></div>
            <label class="fm-switch"><input type="checkbox" checked /><span></span></label>
          </div>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>完成操作时播放轻提示音</b><small>默认关闭；可在系统设置里统一控制。</small></div>
            <label class="fm-switch"><input type="checkbox" /><span></span></label>
          </div>
        </div>

        <div class="fm-settings-section">
          <h3>演示数据</h3>
          <div class="fm-setting-row">
            <div class="fm-setting-copy"><b>重置原型</b><small>恢复七个演示服务、清空模拟操作与日志。</small></div>
            <button class="fm-btn fm-btn-soft" style="height:28px;font-size:9px" data-reset-demo>重置</button>
          </div>
        </div>
      </div>
      <div class="fm-modal-foot">
        <span class="fm-modal-foot-note">主题、萌度与动效偏好会保存在本机 localStorage</span>
        <button class="fm-btn fm-btn-primary" data-modal-close>完成</button>
      </div>`;

    const dialog = openModal(html, { label: "偏好设置" });
    hydrateMascots(dialog);
    $$("[data-set-theme]", dialog).forEach((button) => {
      button.addEventListener("click", () => setTheme(button.dataset.setTheme));
    });
    $$("[data-set-moe]", dialog).forEach((button) => {
      button.addEventListener("click", () => setMoe(button.dataset.setMoe));
    });
    $("[data-setting-motion]", dialog)?.addEventListener("change", (event) => {
      state.reduceMotion = event.target.checked;
      app.classList.toggle("reduce-motion", state.reduceMotion);
      try {
        localStorage.setItem("fm-proto-motion", state.reduceMotion ? "1" : "0");
      } catch {
        /* ignore */
      }
    });
    $$("[data-refresh]", dialog).forEach((button) => {
      button.addEventListener("click", () => {
        state.refreshMs = Number(button.dataset.refresh);
        $$("[data-refresh]", dialog).forEach((item) => item.classList.toggle("is-active", item === button));
      });
    });
    $("[data-reset-demo]", dialog)?.addEventListener("click", resetDemo);
  }

  function openShortcutsModal() {
    const rows = [
      ["打开 / 关闭命令面板", ["Ctrl", "K"]],
      ["聚焦服务搜索", ["/"]],
      ["添加服务", ["N"]],
      ["打开选中服务的日志", ["L"]],
      ["关闭抽屉 / 浮层", ["Esc"]],
      ["在结果中上下移动", ["↑", "↓"]],
      ["执行 / 打开选中项", ["Enter"]],
      ["显示快捷键表", ["?"]],
    ];
    const html = `
      <div class="fm-modal-head">
        <span class="fm-modal-mascot"><span class="mascot-slot" data-mascot="happy" data-size="40"></span></span>
        <div class="fm-modal-head-copy"><h2>快捷键</h2><p>键盘是第二条主路径。焦点在哪，操作就发生在哪。</p></div>
        <button class="fm-modal-close" data-modal-close aria-label="关闭"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <div class="fm-modal-body">
        <table class="fm-shortcut-table">
          <tbody>${rows
            .map(
              ([label, keys]) =>
                `<tr><td>${label}</td><td>${keys.map((key) => `<kbd>${esc(key)}</kbd>`).join("")}</td></tr>`
            )
            .join("")}</tbody>
        </table>
        <p class="fm-field-hint" style="margin-top:10px">输入框内不会触发单字母快捷键，避免误操作。所有浮层都可以用 Esc 关闭。</p>
      </div>
      <div class="fm-modal-foot"><button class="fm-btn fm-btn-primary" data-modal-close>知道了</button></div>`;
    const dialog = openModal(html, { className: "is-small", label: "快捷键" });
    hydrateMascots(dialog);
  }

  function showSleepOverlay() {
    if ($(".fm-sleep")) return;
    const overlay = document.createElement("div");
    overlay.className = "fm-sleep";
    overlay.innerHTML = `
      <span class="mascot-slot" data-mascot="sleep" data-size="170"></span>
      <h2>小闪去睡觉啦</h2>
      <p>WebView 已释放约 45 MB 内存，Rust 守护进程还在托盘里看着服务。</p>
      <small>点击任意位置唤醒 · 原型模拟</small>`;
    app.appendChild(overlay);
    hydrateMascots(overlay);
    const wake = () => {
      overlay.style.opacity = "0";
      window.setTimeout(() => {
        overlay.remove();
        toast({ type: "success", title: "欢迎回来", message: "小屋还在，服务也都好好的。" });
      }, 220);
    };
    overlay.addEventListener("click", wake);
    overlay.addEventListener("keydown", wake);
    overlay.setAttribute("tabindex", "0");
    overlay.focus();
  }

  /* ------------------------------------------------------------------------
     Action router
     ------------------------------------------------------------------------ */

  function handleAction(action, element, event) {
    const id = element?.dataset.id || "";
    switch (action) {
      case "noop":
        break;
      case "go-home":
        state.filter = "all";
        state.group = "all";
        state.type = "all";
        state.query = "";
        closeDrawer();
        renderAll();
        updateSearchValue();
        mainScroll?.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "open-palette":
        openPalette();
        break;
      case "toggle-theme":
        setTheme(state.theme === "day" ? "night" : "day");
        break;
      case "open-moe-menu":
        openMoeMenu(element);
        break;
      case "open-notifications":
        openNotificationsMenu(element);
        break;
      case "open-user-menu":
        openUserMenu(element);
        break;
      case "open-settings":
        openSettingsModal();
        break;
      case "open-shortcuts":
        openShortcutsModal();
        break;
      case "open-batch":
        openBatchMenu(element);
        break;
      case "open-add":
        openServiceModal();
        break;
      case "open-detect":
        openDetectModal();
        break;
      case "greet-mascot": {
        const bubble = $("#heroBubble");
        if (bubble) bubble.textContent = greetingLines[Math.floor(Math.random() * greetingLines.length)];
        toast({
          type: "info",
          title: "小闪收到啦",
          message: greetingLines[Math.floor(Math.random() * greetingLines.length)],
          duration: 2400,
        });
        break;
      }
      case "show-errors":
        state.filter = "error";
        state.group = "all";
        state.type = "all";
        state.query = "";
        closeDrawer();
        renderAll();
        updateSearchValue();
        mainScroll?.scrollTo({ top: 280, behavior: "smooth" });
        break;
      case "stat":
        state.filter = element.dataset.filter || "all";
        state.group = "all";
        closeDrawer();
        renderAll();
        mainScroll?.scrollTo({ top: 260, behavior: "smooth" });
        break;
      case "clear-filters":
        state.filter = "all";
        state.group = "all";
        state.type = "all";
        state.query = "";
        renderAll();
        updateSearchValue();
        break;
      case "cycle-sort": {
        const index = SORT_OPTIONS.findIndex((item) => item.key === state.sort);
        state.sort = SORT_OPTIONS[(index + 1) % SORT_OPTIONS.length].key;
        updateSortLabel();
        renderGrid(getVisibleServices(), false, state.demo === "empty");
        break;
      }
      case "card-menu":
        openCardMenu(element, id);
        break;
      case "start-service":
        startService(id);
        break;
      case "stop-service":
        stopService(id);
        break;
      case "drawer-toggle": {
        const service = currentService();
        if (!service) break;
        if (service.status === "running") stopService(service.id);
        else startService(service.id);
        break;
      }
      case "restart-service":
        restartService(id);
        break;
      case "open-frontend":
        openFrontend(id);
        break;
      case "open-logs":
        openDrawer(id, "logs");
        break;
      case "diagnose-service":
        runDiagnose(id, true);
        break;
      case "drawer-tab":
        setDrawerTab(element.dataset.tab);
        break;
      case "close-drawer":
        closeDrawer();
        break;
      case "edit-service":
        openServiceModal(baseService(id));
        break;
      case "delete-service":
        deleteService(id);
        break;
      case "copy-command": {
        const service = baseService(id);
        if (service) copyText(service.cmd, "启动命令已复制");
        break;
      }
      case "run-diagnose":
        runDiagnose(id, false);
        break;
      case "log-level":
        state.logLevel = element.dataset.level || "all";
        renderDrawer();
        break;
      case "log-follow":
        state.logFollow = !state.logFollow;
        renderDrawer();
        if (state.logFollow) {
          requestAnimationFrame(() => {
            const lines = $(".fm-console-lines", drawerBody);
            if (lines) lines.scrollTop = lines.scrollHeight;
          });
        }
        break;
      case "log-wrap":
        state.logWrap = !state.logWrap;
        renderDrawer();
        break;
      case "log-clear": {
        const service = baseService(state.selectedId);
        if (!service) break;
        service.logs = [];
        addLog(service.id, "SYS", "日志已清空（仅清空界面缓冲，不删除磁盘日志）");
        renderDrawer();
        toast({ type: "success", title: "日志已清空", message: "新的输出会继续出现在这里。" });
        break;
      }
      case "log-copy": {
        const service = currentService();
        if (!service) break;
        const text = visibleLogs(service)
          .map((line) => `[${line.t}] ${line.level} ${line.text}`)
          .join("\n");
        copyText(text || "（没有可见日志）", "可见日志已复制");
        break;
      }
      case "log-jump":
        state.logFollow = true;
        refreshLogLines();
        updateLogFollowUI();
        {
          const lines = $(".fm-console-lines", drawerBody);
          if (lines) lines.scrollTop = lines.scrollHeight;
        }
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------------
     Command palette
     ------------------------------------------------------------------------ */

  let paletteItems = [];

  function paletteCommands() {
    const commands = [
      { label: "添加服务", hint: "手动填写配置", icon: "i-plus", run: () => openServiceModal() },
      { label: "从文件夹自动识别", hint: "交给小闪", icon: "i-folder", run: () => openDetectModal() },
      { label: "全部启动", hint: "启动所有未运行服务", icon: "i-play", run: () => batchStart(null) },
      { label: "全部停止", hint: "先确认影响范围", icon: "i-stop", run: () => confirmBatchStop(null) },
      { label: "重启异常服务", hint: "只处理需要关心的", icon: "i-restart", run: () => restartErrors(null) },
      { label: "切换樱昼 / 樱夜", hint: "外观", icon: state.theme === "day" ? "i-moon" : "i-sun", run: () => setTheme(state.theme === "day" ? "night" : "day") },
      { label: "萌度：克制", hint: "收起装饰", icon: "i-eye", run: () => setMoe("0") },
      { label: "萌度：标准", hint: "推荐", icon: "i-sparkles", run: () => setMoe("1") },
      { label: "萌度：满开", hint: "多一点闪光", icon: "i-star", run: () => setMoe("2") },
      { label: "偏好设置", hint: "主题 / 萌度 / 刷新", icon: "i-sliders", run: () => openSettingsModal() },
      { label: "快捷键", hint: "键盘地图", icon: "i-keyboard", run: () => openShortcutsModal() },
      { label: "休眠到系统托盘", hint: "释放 WebView 内存", icon: "i-moon", run: () => showSleepOverlay() },
    ];
    return commands;
  }

  function buildPaletteItems() {
    const query = state.paletteQuery.trim().toLowerCase();
    const services = (getServices() || []).filter((service) => {
      if (!query) return true;
      return `${service.name} ${service.group} ${service.cmd} ${service.port || ""}`.toLowerCase().includes(query);
    });
    const commands = paletteCommands().filter((command) => {
      if (!query) return true;
      return `${command.label} ${command.hint}`.toLowerCase().includes(query);
    });

    const items = [];
    services.slice(0, 10).forEach((service) => {
      items.push({ kind: "service", service, key: `service-${service.id}` });
    });
    commands.slice(0, 8).forEach((command, index) => {
      items.push({ kind: "command", command, key: `command-${index}` });
    });
    return items;
  }

  function openPalette() {
    if (state.paletteOpen) return;
    closeMenu();
    if (modalRoot.classList.contains("is-open")) closeModal(false);
    state.paletteOpen = true;
    state.paletteQuery = "";
    state.paletteIndex = 0;
    paletteRoot.classList.add("is-open");
    paletteRoot.innerHTML = `
      <div class="fm-palette-backdrop" data-palette-backdrop></div>
      <div class="fm-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div class="fm-palette-search">
          <svg class="i"><use href="#i-search"/></svg>
          <input id="paletteInput" type="text" placeholder="搜索服务，或输入一个操作…" autocomplete="off" spellcheck="false" />
          <kbd>Esc</kbd>
        </div>
        <div class="fm-palette-list" id="paletteList"></div>
        <div class="fm-palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd>选择</span>
          <span><kbd>↵</kbd>执行</span>
          <span><kbd>Esc</kbd>关闭</span>
          <span class="fm-palette-brand">Ctrl K</span>
        </div>
      </div>`;

    const input = $("#paletteInput", paletteRoot);
    renderPaletteList();
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));

    input?.addEventListener("input", () => {
      state.paletteQuery = input.value;
      state.paletteIndex = 0;
      renderPaletteList();
    });

    input?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        movePalette(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        movePalette(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = paletteItems[state.paletteIndex];
        if (item) executePaletteItem(item);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
      }
    });

    $("[data-palette-backdrop]", paletteRoot)?.addEventListener("click", closePalette);
    $("#paletteList", paletteRoot)?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-palette-index]");
      if (!button) return;
      const item = paletteItems[Number(button.dataset.paletteIndex)];
      if (item) executePaletteItem(item);
    });
    $("#paletteList", paletteRoot)?.addEventListener("mousemove", (event) => {
      const button = event.target.closest("[data-palette-index]");
      if (!button) return;
      const index = Number(button.dataset.paletteIndex);
      if (index === state.paletteIndex) return;
      state.paletteIndex = index;
      $$("[data-palette-index]", paletteRoot).forEach((node) => {
        node.classList.toggle("is-focus", Number(node.dataset.paletteIndex) === index);
      });
    });
  }

  function closePalette() {
    if (!state.paletteOpen) return;
    state.paletteOpen = false;
    paletteRoot.classList.remove("is-open");
    paletteRoot.innerHTML = "";
  }

  function movePalette(direction) {
    if (!paletteItems.length) return;
    state.paletteIndex = (state.paletteIndex + direction + paletteItems.length) % paletteItems.length;
    $$("[data-palette-index]", paletteRoot).forEach((node) => {
      node.classList.toggle("is-focus", Number(node.dataset.paletteIndex) === state.paletteIndex);
    });
    const focused = $(`[data-palette-index="${state.paletteIndex}"]`, paletteRoot);
    focused?.scrollIntoView({ block: "nearest" });
  }

  function renderPaletteList() {
    const list = $("#paletteList", paletteRoot);
    if (!list) return;
    paletteItems = buildPaletteItems();
    state.paletteIndex = clamp(state.paletteIndex, 0, Math.max(0, paletteItems.length - 1));

    if (!paletteItems.length) {
      list.innerHTML = `<div class="fm-palette-empty">
        <span class="mascot-slot" data-mascot="idle" data-size="70"></span>
        <b>没有找到「${esc(state.paletteQuery)}」</b>
        <span>试试服务名、端口，或“添加 / 停止 / 主题”。</span>
      </div>`;
      hydrateMascots(list);
      return;
    }

    const serviceItems = paletteItems.filter((item) => item.kind === "service");
    const commandItems = paletteItems.filter((item) => item.kind === "command");
    let html = "";
    if (serviceItems.length) {
      html += `<div class="fm-palette-group">服务 · ${serviceItems.length}</div>`;
      html += serviceItems
        .map((item, index) => {
          const globalIndex = paletteItems.indexOf(item);
          const service = item.service;
          return `<button class="fm-palette-item ${globalIndex === state.paletteIndex ? "is-focus" : ""}" data-palette-index="${globalIndex}">
            ${typeIcon(service)}
            <span class="fm-palette-item-copy"><b>${esc(service.name)}</b><small>${esc(service.group)} · ${service.port ? `:${service.port}` : "无端口"}</small></span>
            ${statusPill(service.status)}
            <span class="fm-palette-enter">↵</span>
          </button>`;
        })
        .join("");
    }
    if (commandItems.length) {
      html += `<div class="fm-palette-group">操作 · ${commandItems.length}</div>`;
      html += commandItems
        .map((item) => {
          const globalIndex = paletteItems.indexOf(item);
          return `<button class="fm-palette-item ${globalIndex === state.paletteIndex ? "is-focus" : ""}" data-palette-index="${globalIndex}">
            <span class="fm-palette-icon"><svg class="i"><use href="#${item.command.icon}"/></svg></span>
            <span class="fm-palette-item-copy"><b>${esc(item.command.label)}</b><small>${esc(item.command.hint)}</small></span>
            <span class="fm-palette-enter">↵</span>
          </button>`;
        })
        .join("");
    }
    list.innerHTML = html;
  }

  function executePaletteItem(item) {
    closePalette();
    if (item.kind === "service") {
      openDrawer(item.service.id, "overview");
    } else if (item.kind === "command") {
      item.command.run();
    }
  }

  /* ------------------------------------------------------------------------
     Global event wiring
     ------------------------------------------------------------------------ */

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  function trapModalFocus(event) {
    if (event.key !== "Tab") return;
    const dialog = $(".fm-modal", modalRoot);
    if (!dialog) return;
    const focusables = $$(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      dialog
    ).filter((node) => node.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  app.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      event.preventDefault();
      event.stopPropagation();
      handleAction(actionEl.dataset.action, actionEl, event);
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      state.filter = nav.dataset.nav;
      state.group = "all";
      state.type = "all";
      state.query = "";
      closeDrawer();
      renderAll();
      updateSearchValue();
      return;
    }

    const group = event.target.closest("[data-group]");
    if (group) {
      state.group = group.dataset.group;
      state.filter = "all";
      state.type = "all";
      state.query = "";
      closeDrawer();
      renderAll();
      updateSearchValue();
      return;
    }

    const type = event.target.closest("[data-type]");
    if (type) {
      state.type = type.dataset.type;
      state.filter = "all";
      state.group = "all";
      state.query = "";
      closeDrawer();
      renderAll();
      updateSearchValue();
      return;
    }

    const filter = event.target.closest("[data-filter]");
    if (filter) {
      state.filter = filter.dataset.filter;
      state.group = "all";
      closeDrawer();
      renderAll();
      return;
    }

    const view = event.target.closest("[data-view]");
    if (view) {
      state.view = view.dataset.view;
      updateViewButtons();
      renderGrid(getVisibleServices(), false, state.demo === "empty");
      return;
    }

    const card = event.target.closest(".fm-card");
    if (card) {
      openDrawer(card.dataset.id, "overview");
    }
  });

  app.addEventListener("keydown", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    const card = event.target.closest(".fm-card");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openDrawer(card.dataset.id, "overview");
      return;
    }
    if (event.key === "Escape") {
      if (state.drawerOpen) {
        event.preventDefault();
        closeDrawer();
      }
    }
  });

  app.addEventListener("input", (event) => {
    if (event.target.id === "fmSearch") {
      state.query = event.target.value;
      renderGrid(getVisibleServices(), false, state.demo === "empty");
      renderListFoot(counts(), state.demo === "loading");
    }
    if (event.target.id === "logSearch") {
      state.logQuery = event.target.value;
      refreshLogLines();
    }
  });

  app.addEventListener("scroll", (event) => {
    if (event.target === mainScroll && state.annotations) {
      positionAnnotations();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    const commandK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
    if (commandK) {
      event.preventDefault();
      if (state.paletteOpen) closePalette();
      else openPalette();
      return;
    }

    if (state.paletteOpen) {
      if (event.key === "Tab") {
        event.preventDefault();
        $("#paletteInput")?.focus({ preventScroll: true });
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        if (isTypingTarget(event.target) && event.target.id === "paletteInput") return;
        const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (direction) {
          event.preventDefault();
          movePalette(direction);
        } else if (event.key === "Enter") {
          event.preventDefault();
          const item = paletteItems[state.paletteIndex];
          if (item) executePaletteItem(item);
        }
        return;
      }
    }

    if (modalRoot.classList.contains("is-open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      trapModalFocus(event);
      return;
    }

    if (event.key === "Escape") {
      if (state.drawerOpen) {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (activeMenu) {
        event.preventDefault();
        closeMenu();
        return;
      }
      const shell = $("#previewShell");
      if (shell?.classList.contains("is-fullscreen")) {
        event.preventDefault();
        toggleFullscreen(false);
        return;
      }
    }

    if (isTypingTarget(event.target)) return;
    if (event.key === "/") {
      event.preventDefault();
      $("#fmSearch")?.focus();
      return;
    }
    if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openServiceModal();
      return;
    }
    if (event.key.toLowerCase() === "l" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (state.selectedId) {
        event.preventDefault();
        openDrawer(state.selectedId, "logs");
      }
      return;
    }
    if (event.key === "?") {
      event.preventDefault();
      openShortcutsModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tickStatus();
    }
  });

  /* ------------------------------------------------------------------------
     Tickers
     ------------------------------------------------------------------------ */

  function updateLiveDom(stat) {
    const all = getServices() || [];
    all.forEach((service) => {
      const card = $(`.fm-card[data-id="${service.id}"]`);
      if (!card) return;
      const running = service.status === "running";
      const cpu = card.querySelector(".fm-cpu");
      const mem = card.querySelector(".fm-mem");
      const uptime = card.querySelector(".fm-uptime");
      if (cpu) cpu.textContent = running ? `${service.cpu.toFixed(1)}%` : "0.0%";
      if (mem) mem.textContent = running ? `${Math.round(service.mem)}M` : "0M";
      if (uptime) uptime.textContent = formatUptime(service.uptime, true);
    });

    if (state.drawerOpen && state.drawerTab === "overview") {
      const service = currentService();
      const tiles = $$(".fm-metric-tile b", drawerBody);
      if (service && tiles.length >= 3) {
        tiles[0].textContent = service.pid || "—";
        tiles[1].textContent = service.port || "—";
        tiles[2].textContent = formatUptime(service.uptime, false);
      }
    }
  }

  function tickStatus() {
    if (document.hidden) return;
    if (state.demo === "loading" || state.demo === "empty") return;
    const all = getServices() || [];
    all.forEach((view) => {
      if (view.status !== "running") return;
      const service = baseService(view.id);
      if (!service || service.status !== "running") return;
      service.uptime += Math.round(state.refreshMs / 1000);
      service.cpu = Number(clamp(service.cpu + (Math.random() - 0.5) * 1.8, 0.2, 38).toFixed(1));
      service.mem = Math.round(clamp(service.mem + (Math.random() - 0.5) * 2.4, 12, 980));
    });
    state.lastUpdated = Date.now();
    const stat = counts();
    renderStats(stat, false);
    renderListFoot(stat, false);
    updateLiveDom(stat);
  }

  function tickLogs() {
    if (document.hidden) return;
    if (state.demo === "loading" || state.demo === "empty") return;
    const running = (getServices() || []).filter((service) => service.status === "running");
    if (!running.length) return;
    const selected = state.drawerOpen && state.drawerTab === "logs" ? currentService() : null;
    const target =
      selected && selected.status === "running" && Math.random() < 0.68
        ? selected
        : running[Math.floor(Math.random() * running.length)];
    const templates = LOG_TEMPLATES[target.id];
    if (!templates || !templates.length) return;
    const [level, text] = templates[Math.floor(Math.random() * templates.length)];
    addLog(target.id, level, text);
    if (state.drawerOpen && state.drawerTab === "logs" && state.selectedId === target.id) {
      refreshLogLines();
    }
  }

  function scheduleStatusTicker() {
    window.setTimeout(() => {
      tickStatus();
      scheduleStatusTicker();
    }, state.refreshMs);
  }

  function scheduleLogTicker() {
    window.setTimeout(() => {
      tickLogs();
      scheduleLogTicker();
    }, 2400);
  }

  /* ------------------------------------------------------------------------
     Annotations
     ------------------------------------------------------------------------ */

  const ANNOTATIONS = [
    { selector: ".fm-omni", label: "01 全局命令入口", description: "用 Ctrl+K 把搜索与操作收进一个入口，顶栏不再需要排满批量按钮。" },
    { selector: "#moeBtn", label: "02 萌度可调", description: "克制 / 标准 / 满开三档。可爱是默认款，不是强制款。" },
    { selector: '.fm-nav button[data-nav="error"]', label: "03 健康聚合", description: "异常主动浮到侧栏和主区顶部，不需要逐行扫描状态标签。" },
    { selector: ".fm-stat", label: "04 指标扫读", description: "四张卡只回答“现在好不好”，细节趋势留给详情抽屉。" },
    { selector: ".fm-card .fm-card-primary", label: "05 单主行动", description: "每张服务卡只有一个主按钮；打开、日志、更多降级为图标。" },
    { selector: ".fm-card .fm-status", label: "06 状态三件套", description: "颜色 + 图标 + 文案。色弱用户也能分辨运行、停止与异常。" },
  ];

  function buildAnnotations() {
    annotationsRoot.innerHTML = ANNOTATIONS.map(
      (item, index) => `<button class="fm-anno-pin" data-anno-index="${index}" data-label="${esc(item.label)}" aria-label="${esc(item.description)}">${index + 1}</button>`
    ).join("");
    $$("[data-anno-index]", annotationsRoot).forEach((pin) => {
      pin.addEventListener("click", () => {
        const item = ANNOTATIONS[Number(pin.dataset.annoIndex)];
        if (item) toast({ type: "info", title: item.label.slice(3), message: item.description, duration: 6000 });
      });
    });
    positionAnnotations();
  }

  function positionAnnotations() {
    if (!state.annotations) return;
    const appRect = app.getBoundingClientRect();
    $$("[data-anno-index]", annotationsRoot).forEach((pin) => {
      const item = ANNOTATIONS[Number(pin.dataset.annoIndex)];
      const target = $(item.selector);
      if (!target || !target.offsetParent) {
        pin.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      const left = clamp(rect.right - appRect.left + 3, 14, appRect.width - 14);
      const top = clamp(rect.top - appRect.top - 3, 14, appRect.height - 14);
      pin.style.display = "";
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
    });
  }

  function toggleAnnotations(force) {
    state.annotations = typeof force === "boolean" ? force : !state.annotations;
    annotationsRoot.hidden = !state.annotations;
    const button = $("#annotateBtn");
    if (button) {
      button.setAttribute("aria-pressed", String(state.annotations));
      const span = $("span", button);
      if (span) span.textContent = state.annotations ? "隐藏标注" : "显示标注";
    }
    if (state.annotations) {
      if (state.drawerOpen) closeDrawer();
      buildAnnotations();
      requestAnimationFrame(positionAnnotations);
    } else {
      annotationsRoot.innerHTML = "";
    }
  }

  /* ------------------------------------------------------------------------
     Preview shell / document interactions
     ------------------------------------------------------------------------ */

  let previewFullscreen = false;

  function toggleFullscreen(force) {
    const shell = $("#previewShell");
    if (!shell) return;
    previewFullscreen = typeof force === "boolean" ? force : !previewFullscreen;
    shell.classList.toggle("is-fullscreen", previewFullscreen);
    document.body.classList.toggle("preview-locked", previewFullscreen);
    const button = $("#fullscreenBtn");
    if (button) {
      button.setAttribute("aria-pressed", String(previewFullscreen));
      const span = $("span", button);
      if (span) span.textContent = previewFullscreen ? "退出全屏" : "全屏";
    }
    requestAnimationFrame(() => {
      positionAnnotations();
      if (previewFullscreen) {
        $("#fmApp")?.focus?.({ preventScroll: true });
      }
    });
  }

  function initDocument() {
    const progress = $("#scrollProgress");
    const nav = $("#docNav");
    const sections = ["audit", "principles", "language", "prototype", "delivery"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const navSections = ["audit", "principles", "language", "prototype", "flows", "system", "delivery"];
    const navAlias = { flows: "prototype", system: "prototype" };

    const updateNav = () => {
      const offset = window.scrollY + 150;
      let current = null;
      navSections.forEach((id) => {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top + window.scrollY <= offset) {
          current = navAlias[id] || id;
        }
      });
      $$(".doc-nav-links a").forEach((link) => {
        link.classList.toggle("is-active", current !== null && link.getAttribute("href") === `#${current}`);
      });
    };

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      if (progress) progress.style.width = `${clamp(ratio * 100, 0, 100)}%`;
      nav?.classList.toggle("is-scrolled", window.scrollY > 12);
      updateNav();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    window.setTimeout(updateNav, 300);

    const params = new URLSearchParams(location.search);
    if (params.get("still") === "1") {
      document.body.classList.add("fm-still");
    }
    if (params.get("app") === "1") {
      toggleFullscreen(true);
    }

    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (hash) {
      const target = document.getElementById(hash);
      if (target) {
        window.setTimeout(() => {
          const previous = document.documentElement.style.scrollBehavior;
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 82);
          document.documentElement.style.scrollBehavior = previous;
        }, 120);
      }
    }

    $$("[data-copy-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.copyTarget);
        if (!target) return;
        copyDocText(target.textContent || "", button);
      });
    });

    $("#demoState")?.addEventListener("change", (event) => setDemo(event.target.value));
    $("#annotateBtn")?.addEventListener("click", () => toggleAnnotations());
    $("#legendToggle")?.addEventListener("click", () => toggleAnnotations());
    $("#fullscreenBtn")?.addEventListener("click", () => toggleFullscreen());

    $$(".annotation-list > div").forEach((item, index) => {
      item.addEventListener("mouseenter", () => {
        $(`[data-anno-index="${index}"]`, annotationsRoot)?.classList.add("is-hot");
      });
      item.addEventListener("mouseleave", () => {
        $(`[data-anno-index="${index}"]`, annotationsRoot)?.classList.remove("is-hot");
      });
      item.addEventListener("click", () => {
        if (!state.annotations) toggleAnnotations(true);
        $(`[data-anno-index="${index}"]`, annotationsRoot)?.classList.add("is-hot");
      });
    });

    window.addEventListener("resize", () => {
      if (state.annotations) positionAnnotations();
    });

    hydrateMascots(document);
  }

  function copyDocText(text, button) {
    const done = () => {
      const original = button.innerHTML;
      button.innerHTML = `<svg class="i"><use href="#i-check"/></svg>已复制`;
      window.setTimeout(() => {
        button.innerHTML = original;
      }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  function loadPreferences() {
    try {
      const theme = localStorage.getItem("fm-proto-theme");
      if (theme === "night" || theme === "day") state.theme = theme;
      const moe = localStorage.getItem("fm-proto-moe");
      if (["0", "1", "2"].includes(moe)) state.moe = moe;
      const motion = localStorage.getItem("fm-proto-motion");
      if (motion === "1") state.reduceMotion = true;
    } catch {
      /* ignore */
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.reduceMotion = true;
    }
  }

  function initApp() {
    loadPreferences();
    app.dataset.theme = state.theme;
    app.dataset.moe = state.moe;
    app.classList.toggle("reduce-motion", state.reduceMotion);
    updateMoeLabel();
    updateSortLabel();
    updateViewButtons();
    renderAll();
    scheduleStatusTicker();
    scheduleLogTicker();
  }

  initDocument();
  hydrateMascots(document);
  initApp();

  // Expose a tiny debug handle for design reviews (not part of the production surface).
  window.__FM_PROTO__ = {
    state,
    resetDemo,
    setDemo,
    setTheme,
    setMoe,
    toast,
  };
})();
