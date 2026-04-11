const TOPICS = [
  {
    topic: "previsao/simepar",
    label: "Previsão Simepar Diária",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/previsao_simepar.json",
    type: "simepar_daily",
  },
  {
    topic: "plugfield/forecast/daily",
    label: "Previsão Plugfield Diária",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/plugfield_forecast_daily.json",
    type: "plug_daily",
  },
  {
    topic: "plugfield/forecast/hourly",
    label: "Histórico Plugfield Diário",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/plugfield_forecast_hourly.json",
    type: "plug_hourly",
  },
  {
    topic: "canteiros/get",
    label: "Canteiros",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/canteiros_get.json",
    type: "canteiros",
  },
  {
    topic: "cultures/get",
    label: "Culturas / Fases",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/cultures_get.json",
    type: "cultures",
  },
  {
    topic: "irrigationRBS/schedule",
    label: "Irrigação RBS",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/irrigationRBS_schedule.json",
    type: "irrigation_rbs",
  },
  {
    topic: "irrigationRL/schedule",
    label: "Irrigação RL",
    url: "https://raspbpibucket.s3.us-east-1.amazonaws.com/dashboard/irrigationRL_schedule.json",
    type: "irrigation_rl",
  },
];

const PASSIVE_TOPICS = ["cultures/get", "irrigationRBS/schedule", "irrigationRL/schedule"];

const FARM_CONFIG = {
  doisvizinhos: {
    label: "Dois Vizinhos",
    location: "PR",
    unitLabel: "Dois Vizinhos",
    ucId: "4000",
  },
  "miringuava-luciane": {
    label: "Miringuava - Luciane",
    location: "Miringuava",
    unitLabel: "Luciane",
    ucId: "3003",
    strictUcId: "3003",
  },
};

function isPassiveTopic(topic) {
  return PASSIVE_TOPICS.includes(topic);
}

let globalFilter = {
  date: null,
  time: null,
};

const dashboardData = {
  "previsao/simepar": null,
  "plugfield/forecast/daily": null,
  "plugfield/forecast/hourly": null,
  "canteiros/get": null,
  "cultures/get": null,
  "irrigationRBS/schedule": null,
  "irrigationRL/schedule": null,
};

const historicalData = {
  irrigationRBS: [],
  irrigationRL: [],
  loaded: false,
};

let plantingFilters = [];
let currentPlantingId = null;
let historyChart = null;
let autoRefreshInterval = null;
let dashboardInitialized = false;
let currentFarm = "doisvizinhos";
let activeFarmOnDashboard = null;

function getCurrentFarmConfig() {
  return FARM_CONFIG[currentFarm] || FARM_CONFIG.doisvizinhos;
}

function getStrictUcIdForCurrentFarm() {
  return getCurrentFarmConfig().strictUcId || null;
}

function getRecordUcId(record) {
  if (!record || typeof record !== "object") return null;
  return record.UC_id ?? record.data?.UC_id ?? null;
}

function filterDataForCurrentFarm(data) {
  const strictUcId = getStrictUcIdForCurrentFarm();
  if (!strictUcId) return data;

  if (Array.isArray(data)) {
    return data.filter((item) => String(getRecordUcId(item) ?? "") === strictUcId);
  }

  const ucId = getRecordUcId(data);
  if (ucId === null || ucId === undefined) {
    return null;
  }

  return String(ucId) === strictUcId ? data : null;
}

function resetFarmDataState() {
  globalFilter = {
    date: null,
    time: null,
  };

  Object.keys(dashboardData).forEach((key) => {
    dashboardData[key] = null;
  });

  historicalData.irrigationRBS = [];
  historicalData.irrigationRL = [];
  historicalData.loaded = false;

  plantingFilters = [];
  currentPlantingId = null;

  const globalDate = document.getElementById("globalFilterDate");
  const globalTime = document.getElementById("globalFilterTime");
  const histDateStart = document.getElementById("histDateStart");
  const histDateEnd = document.getElementById("histDateEnd");
  const histTimeStart = document.getElementById("histTimeStart");
  const histTimeEnd = document.getElementById("histTimeEnd");
  const histMethod = document.getElementById("histMethod");

  if (globalDate) globalDate.value = "";
  if (globalTime) globalTime.value = "";
  if (histDateStart) histDateStart.value = "";
  if (histDateEnd) histDateEnd.value = "";
  if (histTimeStart) histTimeStart.value = "";
  if (histTimeEnd) histTimeEnd.value = "";
  if (histMethod) histMethod.value = "all";
}

function fixMojibakeText(value) {
  if (value === null || value === undefined) return value;
  let text = String(value);

  const directReplacements = [
    ["Ãš", "Ú"],
    ["Ã", "Á"],
    ["Ã©", "é"],
    ["Ãª", "ê"],
    ["Ã§", "ç"],
    ["Ã£", "ã"],
    ["Ã¡", "á"],
    ["Ã³", "ó"],
    ["Ãº", "ú"],
    ["Ã­", "í"],
    ["Â°C", "°C"],
    ["mÂ²", "m²"],
    ["â€”", "-"],
    ["â€¢", "•"],
    ["â†’", "→"],
    ["âœ…", "✓"],
    ["ðŸŒ±", "🌱"],
    ["ðŸ“¥", ""],
    ["ðŸ”„", ""],
    ["â³", ""],
  ];

  for (let i = 0; i < 3; i += 1) {
    if (/[ÃÂâð]/.test(text)) {
      try {
        text = decodeURIComponent(escape(text));
      } catch (error) {
        break;
      }
    }
  }

  directReplacements.forEach(([from, to]) => {
    text = text.split(from).join(to);
  });

  return text;
}

function repairVisibleText(root = document.body) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (node.nodeValue && node.nodeValue.trim()) {
      node.nodeValue = fixMojibakeText(node.nodeValue);
    }
    node = walker.nextNode();
  }
}

let textRepairObserverStarted = false;

function ensureTextRepairObserver() {
  if (textRepairObserverStarted || !document.body) return;
  textRepairObserverStarted = true;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = fixMojibakeText(node.nodeValue);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          repairVisibleText(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ===============================
// UTILITÃRIOS
// ===============================

function createMetric(label, value, extraLabelClass = "") {
  const div = document.createElement("div");
  div.className = "metric";
  div.innerHTML = `
    <div class="metric-label ${extraLabelClass}">${fixMojibakeText(label)}</div>
    <div class="metric-value">${fixMojibakeText(value)}</div>
  `;
  return div;
}

function createMiniTable(headers, rows) {
  const table = document.createElement("table");
  table.className = "mini-table";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = fixMojibakeText(h);
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = fixMojibakeText(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function fmtNum(v, casas = 2) {
  if (v === null || v === undefined) return "-";
  if (typeof v !== "number" || Number.isNaN(v)) return String(v);
  return v.toFixed(casas);
}

function timeToMinutes(str) {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatDateBR(yyyyMmDd) {
  if (!yyyyMmDd || yyyyMmDd.length !== 10) return yyyyMmDd || "-";
  const [y, m, d] = yyyyMmDd.split("-");
  return `${d}/${m}/${y}`;
}

function dateBRToISO(ddMmYyyy) {
  if (!ddMmYyyy) return null;
  const parts = ddMmYyyy.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y) return null;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseIsoToDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatIsoToDateTimeBR(isoStr) {
  const d = parseIsoToDate(isoStr);
  if (!d) return { date: "-", time: "-" };
  return {
    date: d.toLocaleDateString("pt-BR"),
    time: d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function normalizeToIsoDateString(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  if (s.includes("T")) {
    s = s.split("T")[0];
  } else if (s.includes(" ")) {
    s = s.split(" ")[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function extractIrrigationDataFromNewFormat(dataArray, irrigationType) {
  if (!Array.isArray(dataArray)) return [];
  
  return dataArray.map(item => {
    if (!item || !item.data) return null;
    
    const data = item.data;
    
    if (irrigationType === 'rbs') {
      return {
        Data: data.Data,
        Horario: data.Horario ? data.Horario.split(':').slice(0, 2).join(':') : "00:00",
        HorarioOriginal: data.Horario,
        Canteiro: data.Canteiro,
        CanteiroNome: `Canteiro ${data.Canteiro}`,
        Volume_irrigacao: data.Volume_irrigacao,
        Tipo: data.Tipo,
        ExplicacaoDetalhada: data.ExplicacaoDetalhada || {},
        timestamp: item.timestamp,
        HorarioPublicacao: data.HorarioPublicacao
      };
    } else if (irrigationType === 'rl') {
      return {
        Data: data.Data,
        Horario: data.Horario ? data.Horario.split(':').slice(0, 2).join(':') : "00:00",
        HorarioOriginal: data.Horario,
        Canteiro: data.Canteiro,
        CanteiroNome: `Canteiro ${data.Canteiro}`,
        Volume_irrigacao: data.Volume_irrigacao,
        Tipo: data.Tipo,
        Detalhes: data.Detalhes || {},
        timestamp: item.timestamp,
        HorarioPublicacao: data.HorarioPublicacao,
        Meta: data.Meta || {}
      };
    }
    
    return null;
  }).filter(item => item !== null);
}

// ===============================
// FUNÃ‡ÃƒO PARA BUSCAR HISTÃ“RICO DE IRRIGAÃ‡ÃƒO
// ===============================

async function fetchIrrigationHistory(irrigationType, isoDate) {
  if (!isoDate) return null;
  
  const typeMap = {
    'rbs': 'irrigationRBS_schedule',
    'rl': 'irrigationRL_schedule'
  };
  
  const folder = typeMap[irrigationType];
  if (!folder) return null;
  
  const [y, m, d] = isoDate.split("-");
  if (y.length !== 4) return null;
  
  const fileName = `${y}${m}${d}.json`;
  const url = `https://raspbpibucket.s3.us-east-1.amazonaws.com/Irrigacoes_Decisoes/${folder}/acumulado/${fileName}?t=${Date.now()}`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`HistÃ³rico nÃ£o encontrado para ${irrigationType} em ${isoDate}: HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    
    if (irrigationType === 'rbs') {
      return extractIrrigationDataFromNewFormat(data, 'rbs');
    } else if (irrigationType === 'rl') {
      return extractIrrigationDataFromNewFormat(data, 'rl');
    }
    
    return data;
  } catch (e) {
    console.error("Erro ao buscar histÃ³rico de irrigaÃ§Ã£o:", e);
    return null;
  }
}

function getHistoryKeyFromConfig(config) {
  try {
    const topicMap = {
      "irrigationRBS/schedule": "irrigationRBS_schedule",
      "irrigationRL/schedule": "irrigationRL_schedule"
    };
    
    if (topicMap[config.topic]) {
      return topicMap[config.topic];
    }
    
    const parts = config.url.split("/");
    const file = parts[parts.length - 1] || "";
    return file.replace(/\.json$/i, "");
  } catch (e) {
    return "";
  }
}

function getBucketRootFromConfig(config) {
  try {
    const urlObj = new URL(config.url);
    const path = urlObj.pathname;
    const dashboardIdx = path.indexOf("/dashboard/");
    if (dashboardIdx >= 0) {
      const prefix = path.slice(0, dashboardIdx + "/dashboard".length);
      return `${urlObj.origin}${prefix}`;
    }
    return urlObj.origin;
  } catch (e) {
    const idx = config.url.indexOf("/dashboard/");
    if (idx > 0) return config.url.substring(0, idx + "/dashboard".length);
    return config.url;
  }
}

async function fetchHistoryJsonForDate(config, isoDate) {
  if (!isoDate) return null;

  const historyKey = getHistoryKeyFromConfig(config);
  if (!historyKey) return null;

  if (config.topic === "irrigationRBS/schedule" || config.topic === "irrigationRL/schedule") {
    const [y, m, d] = isoDate.split("-");
    if (y.length !== 4) return null;
    
    const fileName = `${y}${m}${d}.json`;
    
    const url = `https://raspbpibucket.s3.us-east-1.amazonaws.com/Irrigacoes_Decisoes/${historyKey}/acumulado/${fileName}?t=${Date.now()}`;
    
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`HistÃ³rico nÃ£o encontrado para ${config.topic} em ${isoDate}: HTTP ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      
      if (config.topic === "irrigationRBS/schedule") {
        return filterDataForCurrentFarm(extractIrrigationDataFromNewFormat(data, "rbs"));
      } else if (config.topic === "irrigationRL/schedule") {
        return filterDataForCurrentFarm(extractIrrigationDataFromNewFormat(data, "rl"));
      }
      
      return filterDataForCurrentFarm(data);
    } catch (e) {
      console.error("Erro ao buscar histÃ³rico no S3 (novo padrÃ£o):", e);
      return null;
    }
  } else {
    const bucketRoot = getBucketRootFromConfig(config);
    const parts = isoDate.split("-");
    if (parts.length !== 3) return null;

    const [y, m, d] = parts;
    const year = y.padStart(4, "0");
    const month = m.padStart(2, "0");
    const day = d.padStart(2, "0");
    const fileName = `${year}${month}${day}.json`;

    const url = `${bucketRoot}/history/${historyKey}/${year}/${month}/${day}/${fileName}?t=${Date.now()}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`HistÃ³rico nÃ£o encontrado para ${config.topic} em ${isoDate}: HTTP ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      return filterDataForCurrentFarm(data);
    } catch (e) {
      console.error("Erro ao buscar histÃ³rico no S3 (padrÃ£o antigo):", e);
      return null;
    }
  }
}

// ===============================
// PLANTIOS (EXTRAÃDOS DE cultures/get)
// ===============================

function getCurrentPlantingFilter() {
  if (!currentPlantingId) return null;
  return plantingFilters.find((p) => p.id === currentPlantingId) || null;
}

function setPlantingFilter(plantingId) {
  currentPlantingId = plantingId;

  const planting = getCurrentPlantingFilter();
  const startDateInput = document.getElementById("histDateStart");
  const endDateInput = document.getElementById("histDateEnd");

  if (planting) {
    if (startDateInput) startDateInput.value = planting.startDate || "";
    if (endDateInput) endDateInput.value = planting.endDate || "";
  } else {
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
  }

  renderPlantingFilterButtons();
  applyHistoryFilters();
}

function renderPlantingFilterButtons() {
  const container = document.getElementById("plantingButtonsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!plantingFilters.length) {
    const emptyMessage = document.createElement("div");
    emptyMessage.style.textAlign = "center";
    emptyMessage.style.padding = "2rem";
    emptyMessage.style.color = "#6b7280";
    const farm = getCurrentFarmConfig();
    emptyMessage.innerHTML = `
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌱</div>
      <p>Nenhum plantio cadastrado para a UC ${farm.ucId}.</p>
    `;
    container.appendChild(emptyMessage);
    repairVisibleText(container);
    return;
  }

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "planting-chip" + (currentPlantingId === null ? " planting-chip-active" : "");
  allBtn.innerHTML = `
    <span>Todos os plantios</span>
    <span class="planting-chip-badge">${plantingFilters.length}</span>
  `;
  allBtn.addEventListener("click", () => setPlantingFilter(null));
  container.appendChild(allBtn);

  plantingFilters.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "planting-chip" + (currentPlantingId === p.id ? " planting-chip-active" : "");

    const startDate = p.startDate ? formatDateBR(p.startDate) : "-";
    const endDate = p.endDate ? formatDateBR(p.endDate) : "-";

    btn.innerHTML = `<span>${startDate} → ${endDate}</span>`;

    if (p.subtitle) {
      btn.title = p.subtitle;
    }

    btn.addEventListener("click", () => setPlantingFilter(p.id));
    container.appendChild(btn);
  });

  repairVisibleText(container);
}

function syncPlantingFiltersFromDashboard() {
  const data = dashboardData["cultures/get"];
  const cultures = Array.isArray(data?.cultures) ? data.cultures : [];
  const map = new Map();

  cultures.forEach((cult) => {
    const plant = cult.planting_date;
    const harvest = cult.expected_harvest_date;
    if (!plant) return;

    const start = plant;
    const end = harvest || null;
    const key = `${start}|${end || ""}`;

    if (!map.has(key)) {
      const vegName = cult.vegetable?.name || "Cultura";
      const canteiroNames = (cult.canteiros || [])
        .map((c) => c.name || `Canteiro ${c.id}`)
        .join(", ");

      map.set(key, {
        id: key,
        startDate: start,
        endDate: end,
        label: `Plantio: ${formatDateBR(start)} até ${
          end ? formatDateBR(end) : "-"
        }`,
        subtitle: `${vegName}${canteiroNames ? " • " + canteiroNames : ""}`,
      });
    }
  });

  plantingFilters = Array.from(map.values()).sort((a, b) =>
    (a.startDate || "").localeCompare(b.startDate || "")
  );

  if (plantingFilters.length && !currentPlantingId) {
    const last = plantingFilters[plantingFilters.length - 1];
    currentPlantingId = last.id;
  }

  renderPlantingFilterButtons();
}

// ===============================
// CARREGAMENTO DE DADOS HISTÃ“RICOS A PARTIR DE 15/01/2026
// ===============================

async function loadCompleteHistoricalData() {
  console.log("ðŸš€ Carregando dados histÃ³ricos COMPLETOS...");

  if (!historicalData.loaded) {
    historicalData.irrigationRBS = [];
    historicalData.irrigationRL = [];
  }

  // ALTERAÃ‡ÃƒO: Data inicial modificada para 15/01/2026
  const startDate = new Date("2026-01-15");
  const endDate = new Date();
  const dates = [];

  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const isoDate = date.toISOString().split("T")[0];
    dates.push(isoDate);
  }

  console.log(`ðŸ“… Buscando dados para ${dates.length} datas (a partir de ${startDate.toISOString().split("T")[0]})`);

  console.log("ðŸ“¥ Carregando dados histÃ³ricos RBS...");
  for (const date of dates) {
    try {
      const data = await fetchHistoryJsonForDate(
        TOPICS.find(t => t.topic === "irrigationRBS/schedule"), 
        date
      );
      
      if (data && Array.isArray(data)) {
        data.forEach((newItem) => {
          const exists = historicalData.irrigationRBS.some(
            (existingItem) =>
              existingItem.Data === newItem.Data &&
              existingItem.Horario === newItem.Horario &&
              existingItem.Canteiro === newItem.Canteiro
          );
          if (!exists) {
            historicalData.irrigationRBS.push(newItem);
          }
        });
        console.log(`âœ“ RBS - ${date}: ${data.length} registros`);
      }
    } catch (error) {
      console.warn(`Erro ao carregar RBS para ${date}:`, error);
    }
  }

  console.log("ðŸ“¥ Carregando dados histÃ³ricos RL...");
  for (const date of dates) {
    try {
      const data = await fetchHistoryJsonForDate(
        TOPICS.find(t => t.topic === "irrigationRL/schedule"), 
        date
      );
      
      if (data && Array.isArray(data)) {
        data.forEach((newItem) => {
          const exists = historicalData.irrigationRL.some(
            (existingItem) =>
              existingItem.Data === newItem.Data &&
              existingItem.Horario === newItem.Horario &&
              existingItem.Canteiro === newItem.Canteiro
          );
          if (!exists) {
            historicalData.irrigationRL.push(newItem);
          }
        });
        console.log(`âœ“ RL - ${date}: ${data.length} registros`);
      }
    } catch (error) {
      console.warn(`Erro ao carregar RL para ${date}:`, error);
    }
  }

  historicalData.loaded = true;

  console.log("âœ… Dados histÃ³ricos carregados:", {
    RBS: historicalData.irrigationRBS.length,
    RL: historicalData.irrigationRL.length,
  });

  applyHistoryFilters();
}

// ===============================
// LANDING / NAVEGAÃ‡ÃƒO
// ===============================

function showDashboard() {
  updateFarmContext();
  const landing = document.getElementById("landing");
  const appWrapper = document.getElementById("appWrapper");
  if (!landing || !appWrapper) return;
  landing.style.display = "none";
  appWrapper.classList.remove("app-hidden");
  const wasInitialized = dashboardInitialized;
  const farmChanged = wasInitialized && activeFarmOnDashboard !== currentFarm;
  initDashboard();

  if (farmChanged) {
    activeFarmOnDashboard = currentFarm;
    resetFarmDataState();
    loadHighlightsFromStorage();
    loadAllJsons();

    const historyView = document.getElementById("historyView");
    if (historyView && historyView.classList.contains("view-active")) {
      loadCompleteHistoricalData();
    }
  }
}

function showLanding() {
  const landing = document.getElementById("landing");
  const appWrapper = document.getElementById("appWrapper");
  if (!landing || !appWrapper) return;
  appWrapper.classList.add("app-hidden");
  landing.style.display = "flex";
}

function openFarmDashboard(farmId) {
  if (farmId && FARM_CONFIG[farmId]) {
    currentFarm = farmId;
  }
  showDashboard();
}

window.openFarmDashboard = openFarmDashboard;

function showView(viewId) {
  const dashboardView = document.getElementById("dashboardView");
  const historyView = document.getElementById("historyView");
  const navDashboard = document.getElementById("navDashboard");
  const navHistory = document.getElementById("navHistory");

  if (!dashboardView || !historyView || !navDashboard || !navHistory) return;

  if (viewId === "dashboard") {
    dashboardView.classList.add("view-active");
    dashboardView.classList.remove("view-hidden");
    historyView.classList.remove("view-active");
    historyView.classList.add("view-hidden");
    navDashboard.classList.add("nav-button-active");
    navHistory.classList.remove("nav-button-active");
  } else {
    historyView.classList.add("view-active");
    historyView.classList.remove("view-hidden");
    dashboardView.classList.remove("view-active");
    dashboardView.classList.add("view-hidden");
    navHistory.classList.add("nav-button-active");
    navDashboard.classList.remove("nav-button-active");

    if (!historicalData.loaded) {
      console.log("ðŸ“Š Primeiro acesso ao histÃ³rico - carregando dados...");
      loadCompleteHistoricalData();
    } else {
      console.log("ðŸ“Š Usando dados histÃ³ricos existentes:", {
        RBS: historicalData.irrigationRBS.length,
        RL: historicalData.irrigationRL.length,
      });
      applyHistoryFilters();
    }

    syncPlantingFiltersFromDashboard();
  }
}

// ===============================
// RENDERIZAÃ‡ÃƒO ESPECÃFICA POR TÃ“PICO
// ===============================

// ---------- SIMEPAR DIÃRIO ----------

function selectSimeparDailyRecord(dataRaw) {
  let arr = Array.isArray(dataRaw)
    ? dataRaw
    : Array.isArray(dataRaw?.data)
    ? dataRaw.data
    : [];

  if (!arr.length) return dataRaw;

  const { date } = globalFilter;

  if (!date) return arr[arr.length - 1];

  const isoFilter = date;

  function recIsoDate(rec) {
    const d1 = rec.DataPrevisao || rec.data || rec.Data || null;
    if (!d1) return null;
    if (String(d1).includes("/")) {
      return dateBRToISO(String(d1));
    }
    return String(d1).split(" ")[0];
  }

  let subset = arr.filter((r) => recIsoDate(r) === isoFilter);
  if (!subset.length) subset = arr;

  return subset[0];
}

function renderSimeparDaily(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  const data = selectSimeparDailyRecord(dataRaw) || {};

  const grid = document.createElement("div");
  grid.className = "metric-grid";

  const dataPrev = data.DataPrevisao || data.data || data.Data || "-";
  grid.appendChild(createMetric("Data previsão", dataPrev, "date"));

  grid.appendChild(
    createMetric("T. Máx (°C)", data.leituraTemperaturaMax ?? "-", "temp")
  );
  grid.appendChild(
    createMetric("T. Mín (°C)", data.leituraTemperaturaMin ?? "-", "temp")
  );
  grid.appendChild(
    createMetric("Chuva (mm)", data.leituraPrecipitacao ?? "-", "rain")
  );

  const etoVal =
    typeof data.leituraEto === "number"
      ? data.leituraEto.toFixed(3)
      : data.leituraEto ?? "-";
  grid.appendChild(createMetric("ETo (mm)", etoVal, "eto"));

  visualEl.appendChild(grid);
}

// ---------- PLUGFIELD DIÃRIO ----------

function isValidPlugDailyRecord(rec) {
  if (!rec || typeof rec !== "object") return false;

  const tMin = rec.temp_min ?? rec.TempMin ?? null;
  const tMax = rec.temp_max ?? rec.TempMax ?? null;
  const hum = rec.umidade_media ?? rec.umidade ?? rec.ur ?? null;

  if (tMin === 999) return false;
  if (tMin == null && tMax == null && hum == null) return false;

  return true;
}

function selectPlugDailyRecord(dataRaw) {
  let arr = Array.isArray(dataRaw)
    ? dataRaw
    : Array.isArray(dataRaw?.data)
    ? dataRaw.data
    : [];

  if (!arr.length) return dataRaw;

  const { date } = globalFilter;

  function pickFirstValid(list) {
    const valid = list.filter(isValidPlugDailyRecord);
    if (valid.length) return valid[0];
    return list[0] || null;
  }

  if (!date) {
    return pickFirstValid(arr);
  }

  let subset = arr.filter((r) => r.data === date);
  if (!subset.length) subset = arr;

  return pickFirstValid(subset);
}

function renderPlugDaily(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  const data = selectPlugDailyRecord(dataRaw) || {};

  const grid = document.createElement("div");
  grid.className = "metric-grid";

  const rawDate = data.data || "-";
  const dateBR = rawDate && rawDate !== "-" ? formatDateBR(rawDate) : "-";

  grid.appendChild(createMetric("Data", dateBR, "date"));

  grid.appendChild(createMetric("Chuva (mm)", data.precipitacao_mm ?? "-", "rain"));
  grid.appendChild(createMetric("T. Máx (°C)", data.temp_max ?? "-", "temp"));
  grid.appendChild(createMetric("T. Mín (°C)", data.temp_min ?? "-", "temp"));
  grid.appendChild(createMetric("Umidade média do ar (%)", data.umidade_media ?? "-", "air"));

  visualEl.appendChild(grid);
}

// ---------- PLUGFIELD HORÃRIO ----------

function normalizePlugHourlyArray(dataRaw) {
  if (Array.isArray(dataRaw) && dataRaw.length > 0) {
    const firstItem = dataRaw[0];
    if (firstItem && typeof firstItem === "object") {
      if (
        firstItem["Data e Hora"] ||
        firstItem["DataHora"] ||
        firstItem["Temperatura MÃ©d."]
      ) {
        return dataRaw;
      }
    }

    if (Array.isArray(firstItem?.data)) {
      const flattened = [];
      dataRaw.forEach((block) => {
        if (Array.isArray(block?.data)) {
          flattened.push(...block.data);
        }
      });
      return flattened;
    }
  }

  if (Array.isArray(dataRaw?.data)) {
    return dataRaw.data;
  }

  return [];
}

function filterPlugHourlyList(dataRaw) {
  const listaHoras = normalizePlugHourlyArray(dataRaw);
  if (!listaHoras.length) return [];

  const { date } = globalFilter;

  let filtered = listaHoras;

  if (date) {
    filtered = filtered.filter((item) => {
      const dh = item["Data e Hora"] || item["DataHora"] || "";
      if (!dh) return true;
      const [dPart] = dh.split(" ");
      const iso = dPart.includes("/") ? dateBRToISO(dPart) : dPart;
      return iso === date;
    });
  }

  const uniqueMap = new Map();
  filtered.forEach((item) => {
    const dh = item["Data e Hora"] || item["DataHora"] || "";
    const [, hora] = dh.split(" ");
    const horaKey = hora || dh;

    if (uniqueMap.has(horaKey)) {
      const existing = uniqueMap.get(horaKey);
      const existingHasData =
        existing["Temperatura MÃ©d."] !== undefined &&
        existing["Temperatura MÃ©d."] !== null &&
        existing["Temperatura MÃ©d."] !== "-" &&
        existing["Temperatura MÃ©d."] !== "";
      const currentHasData =
        item["Temperatura MÃ©d."] !== undefined &&
        item["Temperatura MÃ©d."] !== null &&
        item["Temperatura MÃ©d."] !== "-" &&
        item["Temperatura MÃ©d."] !== "";

      if (currentHasData && !existingHasData) {
        uniqueMap.set(horaKey, item);
      }
    } else {
      uniqueMap.set(horaKey, item);
    }
  });

  return Array.from(uniqueMap.values());
}

function renderPlugHourly(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  const listaHoras = filterPlugHourlyList(dataRaw);

  if (!listaHoras.length) {
    visualEl.textContent = "Ainda não há dados horários para o filtro selecionado.";
    return;
  }

  const sorted = [...listaHoras].sort((a, b) => {
    const timeA = a["Data e Hora"] || a["DataHora"] || "";
    const timeB = b["Data e Hora"] || b["DataHora"] || "";
    return timeA.localeCompare(timeB);
  });

  const horasComDados = sorted.filter((item) => {
    const temp = item["Temperatura MÃ©d."];
    const chuva = item["Chuva"];
    const rad = item["Radiação"];

    return (
      (temp !== undefined && temp !== null && temp !== "-" && temp !== "") ||
      (chuva !== undefined && chuva !== null && chuva !== "-" && chuva !== "") ||
      (rad !== undefined && rad !== null && rad !== "-" && rad !== "")
    );
  });

  const rowsToShow = horasComDados.length > 0 ? horasComDados : sorted;

  const rows = rowsToShow.map((item) => {
    const dh = item["Data e Hora"] || item["DataHora"] || "";
    const [dataStr, horaStr] = dh.split(" ");
    const hora = horaStr || dh;
    const t = item["Temperatura MÃ©d."] ?? "-";
    const chuva = item["Chuva"] ?? "-";
    const rad = item["Radiação"] ?? "-";
    return [hora, t, chuva, rad];
  });

  const title = document.createElement("div");
  title.style.fontSize = "0.8rem";
  title.style.color = "#9ca3af";
  title.style.marginBottom = "0.35rem";
  title.textContent = `Horas previstas (${rows.length} registros) - Temperatura / Chuva / Radiação`;

  const wrapper = document.createElement("div");
  wrapper.style.maxHeight = "260px";
  wrapper.style.overflow = "auto";

  if (rows.length > 0) {
    wrapper.appendChild(
      createMiniTable(["Hora", "Temp (°C)", "Chuva (mm)", "Radiação"], rows)
    );
  } else {
    wrapper.textContent = "Nenhum dado disponível para exibição.";
  }

  visualEl.appendChild(title);
  visualEl.appendChild(wrapper);
}

// ---------- CANTEIROS ----------

function renderCanteiros(visualEl, data) {
  visualEl.innerHTML = "";

  let canteiros = [];

  if (Array.isArray(data)) {
    data.forEach((block) => {
      if (Array.isArray(block?.data)) {
        canteiros.push(...block.data);
      }
    });
  } else if (Array.isArray(data?.data)) {
    canteiros = data.data;
  } else if (data && typeof data === "object" && Array.isArray(data.canteiros)) {
    canteiros = data.canteiros;
  }

  if (!canteiros.length) {
    visualEl.textContent = "Nenhum canteiro recebido ainda.";
    return;
  }

  const uniqueCanteiros = new Map();

  [...canteiros].reverse().forEach((canteiro) => {
    const id = canteiro.id;
    if (id && !uniqueCanteiros.has(id)) {
      if (id === 1) {
        const hasData =
          canteiro.soil_humidity !== undefined ||
          canteiro.soil_temperature !== undefined ||
          canteiro.air_humitidy !== undefined ||
          canteiro.air_temperature !== undefined ||
          canteiro.last_irrigation !== undefined ||
          (canteiro.culture && canteiro.culture.name) ||
          canteiro.status !== undefined;

        if (hasData) {
          uniqueCanteiros.set(id, canteiro);
        }
      } else {
        uniqueCanteiros.set(id, canteiro);
      }
    }
  });

  const canteirosUnicos = Array.from(uniqueCanteiros.values());
  const canteirosComDados = canteirosUnicos.filter((c) => {
    return (
      c.soil_humidity !== undefined ||
      c.soil_temperature !== undefined ||
      c.air_humitidy !== undefined ||
      c.air_temperature !== undefined ||
      c.last_irrigation !== undefined ||
      (c.culture && c.culture.name) ||
      c.status !== undefined
    );
  });

  if (!canteirosComDados.length) {
    visualEl.textContent = "Nenhum canteiro com dados de monitoramento recebido ainda.";
    return;
  }

  const lista = document.createElement("div");
  lista.className = "canteiro-list";

  canteirosComDados.sort((a, b) => {
    const idA = a.id ?? 0;
    const idB = b.id ?? 0;
    return idA - idB;
  });

  canteirosComDados.forEach((c) => {
    const card = document.createElement("div");
    card.className = "canteiro-card";

    const header = document.createElement("div");
    header.className = "canteiro-header";

    const name = document.createElement("div");
    name.className = "canteiro-name";
    name.textContent = c.name || `Canteiro ${c.id}`;

    const status = document.createElement("div");
    status.className = "canteiro-status";
    status.textContent = c.status || "-";

    header.appendChild(name);
    header.appendChild(status);

    const body = document.createElement("div");
    body.className = "canteiro-body";

    function addField(label, value) {
      const wrapper = document.createElement("div");
      const l = document.createElement("div");
      l.className = "canteiro-field-label";
      l.textContent = label;
      const v = document.createElement("div");
      v.className = "canteiro-field-value";
      v.textContent = value ?? "-";
      wrapper.appendChild(l);
      wrapper.appendChild(v);
      body.appendChild(wrapper);
    }

    addField("Área (m²)", c.area);
    addField("Cultura", c.culture?.name || "-");
    addField(
      "Umidade solo (%)",
      c.soil_humidity?.toFixed?.(1) ?? c.soil_humidity ?? "-"
    );
    addField(
      "Temp. solo (°C)",
      c.soil_temperature?.toFixed?.(1) ?? c.soil_temperature ?? "-"
    );
    addField(
      "Umidade ar (%)",
      c.air_humitidy?.toFixed?.(1) ?? c.air_humitidy ?? "-"
    );
    addField(
      "Temp. ar (°C)",
      c.air_temperature?.toFixed?.(1) ?? c.air_temperature ?? "-"
    );

    const last = formatIsoToDateTimeBR(c.last_irrigation);
    const next = formatIsoToDateTimeBR(c.next_irrigation);

    addField("Última irrigação (Data)", last.date);
    addField("Última irrigação (Hora)", last.time);
    addField("Próx. irrigação (Data)", next.date);
    addField("Próx. irrigação (Hora)", next.time);

    card.appendChild(header);
    card.appendChild(body);
    lista.appendChild(card);
  });

  visualEl.appendChild(lista);
}

// ---------- CULTURAS ----------

function buildCultureCard(cult) {
  const card = document.createElement("div");
  card.className = "culture-card";

  const header = document.createElement("div");
  header.className = "culture-header";

  const title = document.createElement("div");
  title.className = "culture-title";
  const canteiroNames = (cult.canteiros || [])
    .map((c) => c.name || `Canteiro ${c.id}`)
    .join(", ");
  title.textContent = `${cult.vegetable?.name || "Cultura"}${canteiroNames ? " • " + canteiroNames : ""}`;

  const subtitle = document.createElement("div");
  subtitle.className = "culture-subtitle";
  subtitle.textContent = `Plantio: ${
    cult.planting_date || "-"
  } • Colheita prevista: ${cult.expected_harvest_date || "-"}`;

  header.appendChild(title);
  header.appendChild(subtitle);

  const body = document.createElement("div");
  body.className = "culture-body";

  const blockParams = document.createElement("div");
  blockParams.className = "culture-block";
  const blockParamsTitle = document.createElement("div");
  blockParamsTitle.className = "culture-block-title";
  blockParamsTitle.textContent = "Parâmetros da cultura";
  const paramsGrid = document.createElement("div");
  paramsGrid.className = "culture-grid";

  const root = cult.vegetable?.root_depth_z || {};
  const kc = cult.vegetable?.kc_coefficient || {};

  paramsGrid.appendChild(
    createMetric("Profundidade raiz inicial (m)", root.initial ?? "-", "soil")
  );
  paramsGrid.appendChild(
    createMetric("Profundidade raiz final (m)", root.final ?? "-", "soil")
  );
  paramsGrid.appendChild(createMetric("Kc inicial", kc.initial ?? "-", "kc"));
  paramsGrid.appendChild(createMetric("Kc médio", kc.medium ?? "-", "kc"));
  paramsGrid.appendChild(createMetric("Kc final", kc.final ?? "-", "kc"));
  paramsGrid.appendChild(
    createMetric(
      "Fator de depleção",
      cult.vegetable?.depletion_factor ?? "-",
      "soil"
    )
  );

  blockParams.appendChild(blockParamsTitle);
  blockParams.appendChild(paramsGrid);

  const blockPhases = document.createElement("div");
  blockPhases.className = "culture-block";
  const blockPhasesTitle = document.createElement("div");
  blockPhasesTitle.className = "culture-block-title";
  blockPhasesTitle.textContent = "Fases de desenvolvimento e regras de irrigação";

  const phasesWrapper = document.createElement("div");
  phasesWrapper.className = "culture-phases-wrapper";

  const phases = cult.phases || [];
  if (!phases.length) {
    const p = document.createElement("p");
    p.className = "culture-empty";
    p.textContent = "Nenhuma fase definida para esta cultura.";
    phasesWrapper.appendChild(p);
  } else {
    const rows = phases.map((ph) => {
      const norm = ph.normal_irrigation || {};
      const prefTimes = (norm.preferred_irrigation_times || [])
        .map(
          (t) =>
            `${t.start_hour?.slice(0, 5) || "--:--"}–${
              t.end_hour?.slice(0, 5) || "--:--"
            }`
        )
        .join(", ");

      const highTemp = ph.high_temperature_irrigation || {};
      const frost = ph.frost_irrigation || {};

      return [
        ph.name || `Fase ${ph.phase}`,
        `${ph.duration_days || 0} dias`,
        `${norm.max_irrigations_per_day || "-"} irr/dia`,
        `${norm.maximum_volume_daily || "-"} mm/dia`,
        `${norm.desired_humidity_minimum ?? "-"}–${
          norm.desired_humidity_maximum ?? "-"
        }%`,
        prefTimes || "-",
        highTemp.air_temperature_threshold !== undefined
          ? `${highTemp.air_temperature_threshold} °C / ${
              highTemp.duration_in_minutes || "-"
            } min`
          : "-",
        frost.start_temperature_threshold !== undefined
          ? `${frost.start_temperature_threshold}–${
              frost.end_temperature_threshold
            } °C`
          : "-",
      ];
    });

    const table = createMiniTable(
      [
        "Fase",
        "Duração",
        "Máx. irr/dia",
        "Volume máx (mm/dia)",
        "Faixa umidade (%)",
        "Horários preferenciais",
        "Irrigação alta T°",
        "Irrigação geada",
      ],
      rows
    );
    phasesWrapper.appendChild(table);
  }

  blockPhases.appendChild(blockPhasesTitle);
  blockPhases.appendChild(phasesWrapper);

  body.appendChild(blockParams);
  body.appendChild(blockPhases);

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

function renderCultures(visualEl, data) {
  visualEl.innerHTML = "";

  const allCultures = Array.isArray(data?.cultures) ? data.cultures : [];
  const filterDateIso = globalFilter.date || null;

  if (!allCultures.length) {
    const p = document.createElement("p");
    p.className = "culture-empty";
    p.textContent = "Nenhuma cultura configurada ainda.";
    visualEl.appendChild(p);
    return;
  }

  if (!filterDateIso) {
    const list = document.createElement("div");
    list.className = "culture-list";
    allCultures.forEach((cult) => list.appendChild(buildCultureCard(cult)));
    visualEl.appendChild(list);
    return;
  }

  const activeCultures = allCultures.filter((cult) => {
    const plantIso = normalizeToIsoDateString(cult.planting_date);
    const harvestIso = normalizeToIsoDateString(cult.expected_harvest_date);

    if (!plantIso) return false;
    if (plantIso > filterDateIso) return false;
    if (harvestIso && harvestIso < filterDateIso) return false;

    return true;
  });

  if (!activeCultures.length) {
    const info = document.createElement("p");
    info.className = "culture-empty";
    info.textContent = `Nenhuma cultura detectada como ativa exatamente em ${formatDateBR(
      filterDateIso
    )}. Exibindo todas as culturas cadastradas.`;
    visualEl.appendChild(info);

    const list = document.createElement("div");
    list.className = "culture-list";
    allCultures.forEach((cult) => list.appendChild(buildCultureCard(cult)));
    visualEl.appendChild(list);
    return;
  }

  const info = document.createElement("p");
  info.className = "culture-empty";
  info.textContent = `Mostrando culturas ativas na data ${formatDateBR(filterDateIso)}.`;
  visualEl.appendChild(info);

  const list = document.createElement("div");
  list.className = "culture-list";
  activeCultures.forEach((cult) => list.appendChild(buildCultureCard(cult)));
  visualEl.appendChild(list);
}

// ---------- AJUDANTE PARA RBS / RL ----------

function selectIrrigationRecord(dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;

  const { date, time } = globalFilter;
  
  if (!date && !time) {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = dataArray.filter(d => d.Data === today);
    
    if (todayRecords.length > 0) {
      const todayWithMinutes = todayRecords
        .map(d => ({
          obj: d,
          minutes: timeToMinutes(d.Horario) || 0
        }))
        .sort((a, b) => b.minutes - a.minutes);
        
      return todayWithMinutes[0]?.obj || dataArray[dataArray.length - 1];
    }
    
    return dataArray[dataArray.length - 1];
  }

  let subset = dataArray;

  if (date) {
    subset = subset.filter((d) => d.Data === date);
    if (!subset.length) {
      subset = dataArray;
    }
  }

  const withMinutes = subset
    .map((d) => ({
      obj: d,
      minutes: timeToMinutes(d.Horario),
    }))
    .filter((x) => x.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);

  if (!time) {
    if (withMinutes.length) {
      return withMinutes[withMinutes.length - 1].obj;
    }
    return subset[subset.length - 1] || dataArray[dataArray.length - 1];
  }

  const timeFilterMin = timeToMinutes(time);
  if (timeFilterMin === null) {
    if (withMinutes.length) {
      return withMinutes[withMinutes.length - 1].obj;
    }
    return subset[subset.length - 1] || dataArray[0];
  }

  const afterOrEqual = withMinutes.find((x) => x.minutes >= timeFilterMin);
  if (afterOrEqual) return afterOrEqual.obj;

  if (withMinutes.length) {
    return withMinutes[withMinutes.length - 1].obj;
  }

  return subset[subset.length - 1];
}

// ---------- HELPER SIMEPAR MAPA ----------

function buildSimeparDailyMap() {
  const raw = dashboardData["previsao/simepar"];
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
    ? raw.data
    : [];

  const map = {};

  arr.forEach((rec) => {
    if (!rec || typeof rec !== "object") return;

    const rawDate = rec.DataPrevisao || rec.data || rec.Data || rec.Date || null;
    if (!rawDate) return;

    const dateOnly = String(rawDate).split(" ")[0];
    const isoDate = dateOnly.includes("/") ? dateBRToISO(dateOnly) : dateOnly;
    if (!isoDate) return;

    const eto =
      rec.leituraEto ??
      rec.ETo_mm ??
      rec.ETo_mm_dia ??
      null;

    const tMax =
      rec.leituraTemperaturaMax ??
      rec.TempMax ??
      rec.temp_max ??
      null;

    const tMin =
      rec.leituraTemperaturaMin ??
      rec.TempMin ??
      rec.temp_min ??
      null;

    const rain =
      rec.leituraPrecipitacao ??
      rec.leituraPrecipitacao_mm ??
      rec.Precipitacao ??
      rec.precipitacao_mm ??
      null;

    map[isoDate] = {
      eto,
      tMax,
      tMin,
      rain,
    };
  });

  return map;
}

// ---------- IRRIGAÃ‡ÃƒO RBS (VERSÃƒO SIMPLIFICADA) ----------

function renderIrrigationRBS(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  let array = [];
  if (Array.isArray(dataRaw) && dataRaw.length > 0 && dataRaw[0].data) {
    array = extractIrrigationDataFromNewFormat(dataRaw, 'rbs');
  } else {
    array = Array.isArray(dataRaw) ? dataRaw : Array.isArray(dataRaw?.data) ? dataRaw.data : [];
  }

  if (!array.length && dataRaw && typeof dataRaw === "object" && !dataRaw.data) {
    array = [dataRaw];
  }

  if (!array.length) {
    visualEl.textContent = "Nenhum registro de irrigação RBS disponível.";
    return;
  }

  const data = selectIrrigationRecord(array);
  if (!data) {
    visualEl.textContent = "Nenhum registro encontrado para o filtro selecionado.";
    return;
  }

  const detRoot = data.ExplicacaoDetalhada || data.Detalhes || {};
  const meteor = detRoot["1_Meteorologia"] || detRoot || {};
  const cultura = detRoot["5_Cultura_e_Fase"] || {};

  const chuvaReal = meteor.chuva_real_ate_agora_mm ?? meteor.Chuva_real_mm ?? 0;
  const chuvaPrev = meteor.chuva_prevista_hoje_mm ?? meteor.Chuva_prevista_mm ?? 0;
  const faixaDesejada = "40.0–50.0";
  const faseAtual = cultura.Fase_atual ?? "Não identificada";
  const kcUtilizado = cultura.kc_utilizado ?? 1.0;
  const profundidadeRaiz = cultura.Profundidade_raiz_Z_cm ?? 20;
  const maxIrrigacoesDia = cultura.Max_irrigacoes_dia ?? 2;
  const maxVolumeDiario = cultura.Max_volume_diario_mm ?? 10.0;

  const gridTopo = document.createElement("div");
  gridTopo.className = "metric-grid";

  gridTopo.appendChild(createMetric("Data", data.Data ?? "-", "date"));
  gridTopo.appendChild(createMetric("Horário", data.Horario ?? "-", "time"));
  gridTopo.appendChild(
    createMetric("Canteiro", data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-", "rbs-main")
  );
  gridTopo.appendChild(
    createMetric("Volume irrigação (mm)", fmtNum(data.Volume_irrigacao, 2), "rbs-main")
  );
  gridTopo.appendChild(
    createMetric("Tipo de estratégia", data.Tipo || "adaptativa_inteligente", "rbs-main")
  );

  const gridChuva = document.createElement("div");
  gridChuva.className = "metric-grid";
  gridChuva.style.marginTop = "0.6rem";
  gridChuva.style.borderTop = "1px solid #e5e7eb";
  gridChuva.style.paddingTop = "0.6rem";

  gridChuva.appendChild(createMetric("Chuva real (mm)", fmtNum(chuvaReal, 2), "rain"));
  gridChuva.appendChild(createMetric("Chuva prevista (mm)", fmtNum(chuvaPrev, 2), "rain"));

  const gridFaixa = document.createElement("div");
  gridFaixa.className = "metric-grid";
  gridFaixa.style.marginTop = "0.6rem";

  gridFaixa.appendChild(createMetric("Faixa desejada (%)", faixaDesejada, "rbs-soil"));

  const gridCultura = document.createElement("div");
  gridCultura.className = "metric-grid";
  gridCultura.style.marginTop = "0.6rem";

  gridCultura.appendChild(createMetric("Kc utilizado", fmtNum(kcUtilizado, 2), "rbs-context"));
  gridCultura.appendChild(createMetric("Profundidade raiz (cm)", profundidadeRaiz, "rbs-context"));
  gridCultura.appendChild(createMetric("Máx irrigações/dia", maxIrrigacoesDia, "rbs-context"));
  gridCultura.appendChild(createMetric("Máx volume diário (mm)", fmtNum(maxVolumeDiario, 1), "rbs-context"));

  const justBox = document.createElement("div");
  justBox.className = "rbs-justification-box";
  justBox.style.marginTop = "0.9rem";
  justBox.style.padding = "0.9rem 1rem";
  justBox.style.borderRadius = "0.75rem";
  justBox.style.border = "1px solid #f59e0b";
  justBox.style.background = "#fffbeb";
  justBox.style.fontSize = "0.85rem";
  justBox.style.color = "#92400e";

  const justTitle = document.createElement("div");
  justTitle.textContent = "Por que irrigar esse volume neste horário?";
  justTitle.style.fontWeight = "600";
  justTitle.style.marginBottom = "0.4rem";

  // Na funÃ§Ã£o renderIrrigationRBS, substitua esta parte:

const justText = document.createElement("p");
justText.style.margin = "0";
justText.style.lineHeight = "1.5";

const volumeIrrigacao = fmtNum(data.Volume_irrigacao, 2);
const hora = data.Horario || "00:00";
const canteiro = data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-";
const dataFormatada = formatDateBR(data.Data);

// Buscar ETo do Simepar para o dia
const simeMap = buildSimeparDailyMap();
const simeData = data.Data ? simeMap[data.Data] : null;
const etoSimepar = simeData?.eto ?? null;
const etoSimeparStr = etoSimepar !== null ? fmtNum(etoSimepar, 3) : "-";

// Buscar necessidade bruta diÃ¡ria dos detalhes
const necessidadeBruta = meteor.necessidade_bruta_diaria_mm ?? detRoot.necessidade_bruta_diaria_mm ?? null;
const necessidadeBrutaStr = necessidadeBruta !== null ? fmtNum(necessidadeBruta, 3) : "-";

// Calcular fraÃ§Ã£o do dia baseado na hora
const horaAtual = parseInt(hora.split(':')[0]) || 0;
const minutosAtual = parseInt(hora.split(':')[1]) || 0;
const fracaoDia = (horaAtual * 60 + minutosAtual) / (24 * 60);
const fracaoDiaStr = fmtNum(fracaoDia * 100, 1);

if (data.Volume_irrigacao > 0) {
  justText.textContent =
    `A estratégia RBS sugeriu irrigar ${volumeIrrigacao} mm no ${canteiro} às ${hora}h ` +
    `(${dataFormatada}). Até este horário (${fracaoDiaStr}% do dia), ` +
    `foi detectada uma necessidade bruta diária de ${necessidadeBrutaStr} mm. ` +
    `Com chuva real acumulada de ${fmtNum(chuvaReal, 2)} mm e ` +
    `chuva prevista de ${fmtNum(chuvaPrev, 2)} mm para o dia, ` +
    `e considerando os limites operacionais (${maxIrrigacoesDia} irrigações/dia, ` +
    `${fmtNum(maxVolumeDiario, 1)} mm/dia máximo), ` +
    `foi definida esta irrigação para manter a umidade do solo na faixa desejada de ${faixaDesejada}%.`;
} else {
  justText.textContent =
    `Não foi aplicada irrigação neste horário (${hora}h, ${dataFormatada}). ` +
    `Mesmo com necessidade bruta diária de ${necessidadeBrutaStr} mm, ` +
    `chuva real de ${fmtNum(chuvaReal, 2)} mm ` +
    `e prevista de ${fmtNum(chuvaPrev, 2)} mm, ` +
    `a combinação destes fatores com os limites operacionais ` +
    `(${maxIrrigacoesDia} irrigações/dia, ${fmtNum(maxVolumeDiario, 1)} mm/dia máximo) ` +
    `indicou que não era necessário adicionar lâmina extra neste momento ` +
    `para manter a faixa desejada de ${faixaDesejada}%.`;
}
}

// Aqui estÃ¡ a parte completa da funÃ§Ã£o renderIrrigationRBS com a correÃ§Ã£o:

function renderIrrigationRBS(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  let array = [];
  if (Array.isArray(dataRaw) && dataRaw.length > 0 && dataRaw[0].data) {
    array = extractIrrigationDataFromNewFormat(dataRaw, 'rbs');
  } else {
    array = Array.isArray(dataRaw) ? dataRaw : Array.isArray(dataRaw?.data) ? dataRaw.data : [];
  }

  if (!array.length && dataRaw && typeof dataRaw === "object" && !dataRaw.data) {
    array = [dataRaw];
  }

  if (!array.length) {
    visualEl.textContent = "Nenhum registro de irrigação RBS disponível.";
    return;
  }

  const data = selectIrrigationRecord(array);
  if (!data) {
    visualEl.textContent = "Nenhum registro encontrado para o filtro selecionado.";
    return;
  }

  const detRoot = data.ExplicacaoDetalhada || data.Detalhes || {};
  const meteor = detRoot["1_Meteorologia"] || detRoot || {};
  const balancoHidrico = detRoot["2_Balanco_Hidrico_Diario"] || {}; // <-- ADICIONADO
  const cultura = detRoot["5_Cultura_e_Fase"] || {};

  const chuvaReal = meteor.chuva_real_ate_agora_mm ?? 
                   detRoot["4_Analise_Meteorologica"]?.chuva_real_ate_agora_mm ?? 0;
  const chuvaPrev = meteor.chuva_prevista_hoje_mm ?? 
                   detRoot["4_Analise_Meteorologica"]?.chuva_prevista_hoje_mm ?? 0;
  const faixaDesejada = "40.0–50.0";
  const kcUtilizado = cultura.kc_utilizado ?? balancoHidrico.Kc_aplicado ?? 1.0; // <-- ATUALIZADO
  const profundidadeRaiz = cultura.Profundidade_raiz_Z_cm ?? 
                          detRoot["5_Controle_Diario"]?.profundidade_raiz_Z_cm ?? 20; // <-- ATUALIZADO
  const maxIrrigacoesDia = cultura.Max_irrigacoes_dia ?? 2;
  const maxVolumeDiario = cultura.Max_volume_diario_mm ?? balancoHidrico.max_volume_diario_mm ?? 10.0; // <-- ATUALIZADO

  // ====== BUSCAR NECESSIDADE BRUTA DIÃRIA DO BALANÃ‡O HÃDRICO ======
  const necessidadeBruta = balancoHidrico.necessidade_bruta_diaria_mm ?? null; // <-- CORRIGIDO

  const gridTopo = document.createElement("div");
  gridTopo.className = "metric-grid";

  gridTopo.appendChild(createMetric("Data", data.Data ?? "-", "date"));
  gridTopo.appendChild(createMetric("Horário", data.Horario ?? "-", "time"));
  gridTopo.appendChild(
    createMetric("Canteiro", data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-", "rbs-main")
  );
  gridTopo.appendChild(
    createMetric("Volume irrigação (mm)", fmtNum(data.Volume_irrigacao, 2), "rbs-main")
  );
  gridTopo.appendChild(
    createMetric("Tipo de estratégia", data.Tipo || "adaptativa_inteligente", "rbs-main")
  );

  const gridChuva = document.createElement("div");
  gridChuva.className = "metric-grid";
  gridChuva.style.marginTop = "0.6rem";
  gridChuva.style.borderTop = "1px solid #e5e7eb";
  gridChuva.style.paddingTop = "0.6rem";

  gridChuva.appendChild(createMetric("Chuva real (mm)", fmtNum(chuvaReal, 2), "rain"));
  gridChuva.appendChild(createMetric("Chuva prevista (mm)", fmtNum(chuvaPrev, 2), "rain"));

  const gridFaixa = document.createElement("div");
  gridFaixa.className = "metric-grid";
  gridFaixa.style.marginTop = "0.6rem";

  gridFaixa.appendChild(createMetric("Faixa desejada (%)", faixaDesejada, "rbs-soil"));

  const gridCultura = document.createElement("div");
  gridCultura.className = "metric-grid";
  gridCultura.style.marginTop = "0.6rem";

  gridCultura.appendChild(createMetric("Kc utilizado", fmtNum(kcUtilizado, 2), "rbs-context"));
  gridCultura.appendChild(createMetric("Profundidade raiz (cm)", profundidadeRaiz, "rbs-context"));
  gridCultura.appendChild(createMetric("Máx irrigações/dia", maxIrrigacoesDia, "rbs-context"));
  gridCultura.appendChild(createMetric("Máx volume diário (mm)", fmtNum(maxVolumeDiario, 1), "rbs-context"));

  const justBox = document.createElement("div");
  justBox.className = "rbs-justification-box";
  justBox.style.marginTop = "0.9rem";
  justBox.style.padding = "0.9rem 1rem";
  justBox.style.borderRadius = "0.75rem";
  justBox.style.border = "1px solid #f59e0b";
  justBox.style.background = "#fffbeb";
  justBox.style.fontSize = "0.85rem";
  justBox.style.color = "#92400e";

  const justTitle = document.createElement("div");
  justTitle.textContent = "Por que irrigar esse volume neste horário?";
  justTitle.style.fontWeight = "600";
  justTitle.style.marginBottom = "0.4rem";

  const justText = document.createElement("p");
  justText.style.margin = "0";
  justText.style.lineHeight = "1.5";

  const volumeIrrigacao = fmtNum(data.Volume_irrigacao, 2);
  const hora = data.Horario || "00:00";
  const canteiro = data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-";
  const dataFormatada = formatDateBR(data.Data);

  // Calcular fraÃ§Ã£o do dia baseado na hora
  const horaAtual = parseInt(hora.split(':')[0]) || 0;
  const minutosAtual = parseInt(hora.split(':')[1]) || 0;
  const fracaoDia = (horaAtual * 60 + minutosAtual) / (24 * 60);
  const fracaoDiaStr = fmtNum(fracaoDia * 100, 1);

  // Formatar necessidade bruta
  const necessidadeBrutaStr = necessidadeBruta !== null ? fmtNum(necessidadeBruta, 3) : "-";

  if (data.Volume_irrigacao > 0) {
    justText.textContent =
      `A estratégia RBS sugeriu irrigar ${volumeIrrigacao} mm no ${canteiro} às ${hora}h ` +
      `(${dataFormatada}). Até este horário (${fracaoDiaStr}% do dia), ` +
      `foi detectada uma necessidade bruta diária de ${necessidadeBrutaStr} mm. ` +
      `Com chuva real acumulada de ${fmtNum(chuvaReal, 2)} mm e ` +
      `chuva prevista de ${fmtNum(chuvaPrev, 2)} mm para o dia, ` +
      `e considerando os limites operacionais (${maxIrrigacoesDia} irrigações/dia, ` +
      `${fmtNum(maxVolumeDiario, 1)} mm/dia máximo), ` +
      `foi definida esta irrigação para manter a umidade do solo na faixa desejada de ${faixaDesejada}%.`;
  } else {
    justText.textContent =
      `Não foi aplicada irrigação neste horário (${hora}h, ${dataFormatada}). ` +
      `Mesmo com necessidade bruta diária de ${necessidadeBrutaStr} mm, ` +
      `chuva real de ${fmtNum(chuvaReal, 2)} mm ` +
      `e prevista de ${fmtNum(chuvaPrev, 2)} mm, ` +
      `a combinação destes fatores com os limites operacionais ` +
      `(${maxIrrigacoesDia} irrigações/dia, ${fmtNum(maxVolumeDiario, 1)} mm/dia máximo) ` +
      `indicou que não era necessário adicionar lâmina extra neste momento ` +
      `para manter a faixa desejada de ${faixaDesejada}%.`;
  }

  justBox.appendChild(justTitle);
  justBox.appendChild(justText);

  visualEl.appendChild(gridTopo);
  visualEl.appendChild(gridChuva);
  visualEl.appendChild(gridFaixa);
  visualEl.appendChild(gridCultura);
  visualEl.appendChild(justBox);

  updateHighlightFromRBS(data);
  saveLastDecision("rbs", data);
}
// ---------- IRRIGAÃ‡ÃƒO RL (VERSÃƒO SIMPLIFICADA) ----------

function renderIrrigationRL(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  let array = [];
  if (Array.isArray(dataRaw) && dataRaw.length > 0 && dataRaw[0].data) {
    array = extractIrrigationDataFromNewFormat(dataRaw, 'rl');
  } else {
    array = Array.isArray(dataRaw) ? dataRaw : Array.isArray(dataRaw?.data) ? dataRaw.data : [];
  }

  if (!array.length && dataRaw && typeof dataRaw === "object" && !dataRaw.data) {
    array = [dataRaw];
  }

  if (!array.length) {
    visualEl.textContent = "Nenhum registro de irrigação RL disponível.";
    return;
  }

  const data = selectIrrigationRecord(array) || array[array.length - 1];
  const det = data.Detalhes || data.ExplicacaoDetalhada || {};

  const gridTopo = document.createElement("div");
  gridTopo.className = "metric-grid";

  gridTopo.appendChild(createMetric("Data", data.Data ?? "-", "date"));
  gridTopo.appendChild(createMetric("Horário", data.Horario ?? "-", "time"));
  gridTopo.appendChild(
    createMetric("Canteiro", data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-", "rbs-main")
  );
  gridTopo.appendChild(
    createMetric("Agente RL", data.Tipo || "PREVISAO-TEMPO", "rbs-main")
  );

  const doseFinal = data.Volume_irrigacao ?? 0;
  const doseFinalStr = fmtNum(doseFinal, 2) + " mm";
  gridTopo.appendChild(
    createMetric("Volume irrigação (mm)", doseFinalStr, "rbs-main")
  );

  const doseTotalDia = det.Dose_total_dia_mm ?? 0;
  if (doseTotalDia !== undefined) {
    gridTopo.appendChild(
      createMetric("Dose total do dia (mm)", fmtNum(doseTotalDia, 2), "rbs-main")
    );
  }

  const motivoBox = document.createElement("div");
  motivoBox.style.marginTop = "0.5rem";
  motivoBox.style.padding = "0.75rem";
  motivoBox.style.borderRadius = "0.5rem";
  motivoBox.style.background = "#f3f4f6";
  motivoBox.style.fontSize = "0.85rem";
  motivoBox.style.color = "#4b5563";

  const motivoTitle = document.createElement("div");
  motivoTitle.textContent = "Motivo da decisão";
  motivoTitle.style.fontWeight = "600";
  motivoTitle.style.marginBottom = "0.25rem";

  const motivoText = document.createElement("p");
  motivoText.style.margin = "0";

  let motivoTraduzido = "Sem motivo especificado";
  const reason = det.reason || "";

  const traducoes = {
    "need_insignificant": "Necessidade de irrigação insignificante",
    "need_positive": "Necessidade de irrigação detectada",
    "soil_above_target": "Umidade do solo acima da faixa alvo",
    "soil_below_target": "Umidade do solo abaixo da faixa alvo",
    "forecast_rain": "Chuva prevista para o período",
    "high_temperature": "Temperatura elevada prevista",
    "frost_protection": "Proteção contra geada",
    "max_daily_limit": "Limite diário máximo atingido",
    "no_data": "Dados insuficientes para decisão",
    "sensor_failure": "Falha no sensor",
    "manual_override": "Controle manual ativado",
    "maintenance": "Modo de manutenção"
  };

  if (reason in traducoes) {
    motivoTraduzido = traducoes[reason];
  } else if (reason) {
    motivoTraduzido = reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  motivoText.textContent = motivoTraduzido;

  motivoBox.appendChild(motivoTitle);
  motivoBox.appendChild(motivoText);

  const gridDetalhes = document.createElement("div");
  gridDetalhes.className = "metric-grid";
  gridDetalhes.style.marginTop = "0.6rem";

  gridDetalhes.appendChild(
    createMetric("Chuva prevista (mm)", fmtNum(det.rain_mm_day, 2), "rain")
  );

  gridDetalhes.appendChild(
    createMetric("Necessidade do dia (mm)", fmtNum(det.need_mm_day, 3), "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Kc do dia", fmtNum(det.kc_today, 2), "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Slots totais", det.Slots_totais ?? "-", "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Máx diário (mm)", fmtNum(det.MaxDaily_mm, 1), "rbs-context")
  );

  const fonteBox = document.createElement("div");
  fonteBox.style.marginTop = "0.5rem";
  fonteBox.style.padding = "0.5rem";
  fonteBox.style.borderRadius = "0.5rem";
  fonteBox.style.background = "#fef3c7";
  fonteBox.style.fontSize = "0.8rem";
  fonteBox.style.color = "#92400e";
  fonteBox.style.display = "flex";
  fonteBox.style.justifyContent = "space-between";

  const fonteEsq = document.createElement("div");
  fonteEsq.innerHTML = `
    <div style="font-weight: 600;">Fonte previsão:</div>
    <div>${det.Fonte_previsao || "-"}</div>
  `;

  const fonteDir = document.createElement("div");
  fonteDir.innerHTML = `
    <div style="font-weight: 600;">Fonte irrigação:</div>
    <div>${det.Fonte_irrigacao || "-"}</div>
  `;

  fonteBox.appendChild(fonteEsq);
  fonteBox.appendChild(fonteDir);

  const metaBox = document.createElement("div");
  metaBox.style.marginTop = "0.5rem";
  metaBox.style.padding = "0.5rem";
  metaBox.style.borderRadius = "0.5rem";
  metaBox.style.background = "#f0f9ff";
  metaBox.style.fontSize = "0.75rem";
  metaBox.style.color = "#0369a1";
  metaBox.style.display = "flex";
  metaBox.style.justifyContent = "space-between";
  metaBox.style.alignItems = "center";

  const metaEsq = document.createElement("div");
  metaEsq.innerHTML = `
    <div><strong>Scheduler:</strong> ${data.Meta?.Scheduler || "-"}</div>
    <div><strong>Fase:</strong> ${det.Fase || "-"}</div>
  `;

  const metaDir = document.createElement("div");
  metaDir.style.textAlign = "right";
  metaDir.innerHTML = `
    <div><strong>Sensor usado:</strong> ${det.sensor_used ? "Sim" : "Não"}</div>
    <div><strong>Baseado em previsão:</strong> ${det.forecast_based ? "Sim" : "Não"}</div>
  `;

  metaBox.appendChild(metaEsq);
  metaBox.appendChild(metaDir);

  visualEl.appendChild(gridTopo);
  visualEl.appendChild(motivoBox);
  visualEl.appendChild(gridDetalhes);
  visualEl.appendChild(fonteBox);
  visualEl.appendChild(metaBox);

  updateHighlightFromRL(data, doseFinal, {
    eto: det.eto_mm_day,
    etc: det.etc_mm_day,
    rain: det.rain_mm_day
  });
  saveLastDecision("rl", data);
}

// ---------- GENÃ‰RICO ----------

function renderGeneric(visualEl, data) {
  visualEl.innerHTML = "";
  if (Array.isArray(data)) {
    visualEl.textContent = `Itens recebidos: ${data.length}`;
    return;
  }
  if (data && typeof data === "object") {
    if (Array.isArray(data.data)) {
      visualEl.textContent = `Itens recebidos em "data": ${data.data.length}`;
    } else {
      const keys = Object.keys(data);
      visualEl.textContent = `Campos principais: ${keys.join(", ")}`;
    }
  } else {
    visualEl.textContent = "Aguardando dados deste tÃ³pico.";
  }
}

// ---------- DESPACHO VISUAL ----------

function renderVisual(config, visualEl, data) {
  switch (config.type) {
    case "simepar_daily":
      renderSimeparDaily(visualEl, data);
      break;
    case "plug_daily":
      renderPlugDaily(visualEl, data);
      break;
    case "plug_hourly":
      renderPlugHourly(visualEl, data);
      break;
    case "canteiros":
      renderCanteiros(visualEl, data);
      break;
    case "cultures":
      renderCultures(visualEl, data);
      break;
    case "irrigation_rbs":
      renderIrrigationRBS(visualEl, data);
      break;
    case "irrigation_rl":
      renderIrrigationRL(visualEl, data);
      break;
    default:
      renderGeneric(visualEl, data);
  }
}

// ===============================
// CARDS
// ===============================

function createCard(config) {
  const container = document.getElementById("cardsContainer");
  if (!container) return;

  const card = document.createElement("article");
  card.className = "card";
  card.dataset.topic = config.topic;

  card.innerHTML = `
    <div class="card-header">
      <div>
        <h3 class="card-title">${config.label}</h3>
        <div class="card-topic">${config.topic}</div>
      </div>
      <div class="card-meta">
        <span>
          <span class="dot-status"></span>
          <span class="status-text">${
            isPassiveTopic(config.topic) ? "Aguardando" : "â€”"
          }</span>
        </span>
        <span class="time-text">--</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-visual">
        <div class="card-visual-placeholder">
          Clique em "Atualizar agora" para carregar os dados.
        </div>
      </div>
      <details class="card-json-wrapper">
        <summary>Ver JSON bruto</summary>
        <pre class="card-json"></pre>
      </details>
      <p class="card-message" style="display:none;"></p>
    </div>
  `;

  container.appendChild(card);
}

function createAllCards() {
  TOPICS.forEach((config) => createCard(config));
}

// ===============================
// FILTRO GLOBAL (dashboard)
// ===============================

function updateDashboardFilterInfoText() {
  const infoEl = document.getElementById("rbsFilterInfo");
  if (!infoEl) return;

  const { date, time } = globalFilter;

  if (!date && !time) {
    infoEl.textContent =
      "Mostrando os últimos valores disponíveis de cada tópico no dashboard.";
    return;
  }

  const parts = [];
  if (date) parts.push(`Data ${formatDateBR(date)}`);
  if (time) parts.push(`Horário ${time}`);

  infoEl.textContent =
    "Filtro aplicado para todo o dashboard: " +
    parts.join(" • ") +
    ". Cada card mostra o registro mais próximo disponível.";
}

function applyGlobalFilterFromInputs() {
  const dateEl = document.getElementById("globalFilterDate");
  const timeEl = document.getElementById("globalFilterTime");

  globalFilter.date = dateEl?.value || null;
  globalFilter.time = timeEl?.value || null;

  updateDashboardFilterInfoText();
  loadAllJsons();
}

function clearGlobalFilterInputs() {
  const dateEl = document.getElementById("globalFilterDate");
  const timeEl = document.getElementById("globalFilterTime");

  if (dateEl) dateEl.value = "";
  if (timeEl) timeEl.value = "";

  globalFilter.date = null;
  globalFilter.time = null;

  updateDashboardFilterInfoText();
  loadAllJsons();
}

// ===============================
// LOAD JSON / FETCH - DASHBOARD
// ===============================

async function loadJsonForTopic(config) {
  const card = document.querySelector(`.card[data-topic="${config.topic}"]`);
  if (!card) return;

  const statusDot = card.querySelector(".dot-status");
  const statusText = card.querySelector(".status-text");
  const timeText = card.querySelector(".time-text");
  const jsonEl = card.querySelector(".card-json");
  const messageEl = card.querySelector(".card-message");
  const visualEl = card.querySelector(".card-visual");

  statusDot.classList.remove("online");
  statusText.textContent = "Carregando...";
  messageEl.style.display = "none";
  messageEl.textContent = "";

  try {
    let data = null;
    let usedHistorySource = false;

    if (globalFilter.date) {
      data = await fetchHistoryJsonForDate(config, globalFilter.date);
      usedHistorySource = true;
    }

    if (!data && !usedHistorySource) {
      const url = `${config.url}?t=${Date.now()}`;
      const response = await fetch(url);

      if (response.status === 404) {
        if (isPassiveTopic(config.topic)) {
          statusText.textContent = "Aguardando";
          visualEl.textContent = "Aguardando dados deste tÃ³pico.";
        } else {
          statusText.textContent = "Sem dados";
          visualEl.textContent =
            "Ainda não há JSON gerado para este tópico no S3.";
        }
        jsonEl.textContent = "";
        timeText.textContent = "--";
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      data = filterDataForCurrentFarm(await response.json());
    }

    if (
      data === null ||
      data === undefined ||
      (Array.isArray(data) && data.length === 0)
    ) {
      statusText.textContent = "Sem dados";
      visualEl.textContent = `Nenhum dado disponivel para a UC ${getCurrentFarmConfig().ucId}.`;
      jsonEl.textContent = "";
      timeText.textContent = "--";
      return;
    }

    const pretty = JSON.stringify(data, null, 2);

    dashboardData[config.topic] = data;

    if (config.topic === "cultures/get") {
      syncPlantingFiltersFromDashboard();
    }

    renderVisual(config, visualEl, data);
    jsonEl.textContent = pretty;
    repairVisibleText(card);

    statusDot.classList.add("online");
    statusText.textContent = "OK";

    const now = new Date();
    timeText.textContent = now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  } catch (err) {
    console.error(`Erro ao carregar ${config.url}:`, err);

    if (isPassiveTopic(config.topic)) {
      statusText.textContent = "Aguardando";
      visualEl.textContent = "Aguardando dados deste tÃ³pico.";
      timeText.textContent = "--";
    } else {
      statusText.textContent = "Erro";
      visualEl.textContent = "Erro ao carregar dados.";
      messageEl.style.display = "block";
      messageEl.textContent =
        "NÃ£o foi possÃ­vel carregar o JSON (verifique se o arquivo existe no S3, se hÃ¡ histÃ³rico para a data e se o bucket permite acesso pÃºblico).";
    }

    if (currentFarm === "doisvizinhos" && config.topic === "irrigationRBS/schedule") {
      const last = loadLastDecision("rbs");
      if (last && visualEl) {
        renderIrrigationRBS(visualEl, [last]);
      }
    } else if (currentFarm === "doisvizinhos" && config.topic === "irrigationRL/schedule") {
      const last = loadLastDecision("rl");
      if (last && visualEl) {
        renderIrrigationRL(visualEl, [last]);
      }
    }
  }
}

async function loadAllJsons() {
  console.log("ðŸ”„ Atualizando DADOS DO DASHBOARD apenas...");
  await Promise.allSettled(TOPICS.map((config) => loadJsonForTopic(config)));

  const lastUpdateEl = document.getElementById("lastUpdate");
  if (lastUpdateEl) {
    const now = new Date();
    lastUpdateEl.textContent =
      "Última atualização: " +
      now.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
  }
}

// ===============================
// AUTO-REFRESH
// ===============================

function enableAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(loadAllJsons, 60000);
}

function disableAutoRefresh() {
  if (!autoRefreshInterval) return;
  clearInterval(autoRefreshInterval);
  autoRefreshInterval = null;
}

// ===============================
// DESTAQUE / LOCALSTORAGE
// ===============================

function saveLastDecision(kind, obj) {
  try {
    localStorage.setItem(`i2horti_last_${kind}`, JSON.stringify(obj));
  } catch (e) {
    console.warn("NÃ£o foi possÃ­vel salvar em localStorage:", e);
  }
}

function loadLastDecision(kind) {
  try {
    const raw = localStorage.getItem(`i2horti_last_${kind}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function updateHighlightFromRBS(rec) {
  const info = document.getElementById("highlightRbsInfo");
  const extra = document.getElementById("highlightRbsExtra");
  if (!info || !rec) return;

  const data = rec.Data || "-";
  const hora = rec.Horario || "-";
  const vol = fmtNum(rec.Volume_irrigacao, 2);
  
  const canteiro = rec.CanteiroNome || `Canteiro ${rec.Canteiro}` || "-";

  info.textContent = `${formatDateBR(data)} às ${hora} • ${canteiro} • ${vol} mm`;

  const detRoot = rec.ExplicacaoDetalhada || rec.Detalhes || {};
  const meteor = detRoot["1_Meteorologia"] || detRoot || {};

  const simeMap = buildSimeparDailyMap();
  const sime = data ? simeMap[data] : null;

  const eto =
    sime?.eto ??
    meteor.ETo_mm_dia ??
    detRoot.ETo_mm ??
    detRoot.leituraEto ??
    null;

  const chuva =
    meteor.Chuva_real_mm ??
    detRoot.Chuva_real ??
    sime?.rain ??
    null;

  const etc =
    meteor.ETc_real_mm ??
    detRoot.ETc_real ??
    meteor.ETc_previsto_mm ??
    detRoot.ETc_previsto ??
    null;

  const parts = [];

  if (extra) {
    extra.textContent = parts.length ? parts.join(" • ") : "";
  }
}

function updateHighlightFromRL(rec, doseFinal, estadosResumo = {}) {
  const info = document.getElementById("highlightRlInfo");
  const extra = document.getElementById("highlightRlExtra");
  if (!info || !rec) return;

  const data = rec.Data || "-";
  const hora = rec.Horario || "-";
  
  const canteiro = rec.CanteiroNome || `Canteiro ${rec.Canteiro}` || "-";
  
  const doseStr =
    typeof doseFinal === "number" && !Number.isNaN(doseFinal)
      ? doseFinal.toFixed(2) + " mm"
      : String(doseFinal ?? "-");

  info.textContent = `${formatDateBR(data)} às ${hora} • ${canteiro} • ${doseStr}`;

  const det = rec.Detalhes || rec.ExplicacaoDetalhada || {};
  const etc = estadosResumo.etc ?? det.etc_mm_day ?? null;

  const simeMap = buildSimeparDailyMap();
  const sime = data ? simeMap[data] : null;
  const eto =
    estadosResumo.eto ??
    sime?.eto ??
    det.eto_mm_day ??
    det.ETo ??
    det.leituraEto ??
    null;
  const chuva =
    estadosResumo.rain ??
    det.rain_mm_day ??
    sime?.rain ??
    det.Chuva_real ??
    det.leituraPrecipitacao ??
    null;

  const tMax =
    estadosResumo.tMax ??
    sime?.tMax ??
    det.Temp_max_dia_C ??
    det.TempMax ??
    null;

  const parts = [];

  if (extra) {
    extra.textContent = parts.length ? parts.join(" • ") : "";
  }
}

function loadHighlightsFromStorage() {
  if (currentFarm !== "doisvizinhos") {
    const rbsInfo = document.getElementById("highlightRbsInfo");
    const rlInfo = document.getElementById("highlightRlInfo");
    const rbsExtra = document.getElementById("highlightRbsExtra");
    const rlExtra = document.getElementById("highlightRlExtra");

    if (rbsInfo) rbsInfo.textContent = "Nenhuma decisao RBS disponivel para esta UC.";
    if (rlInfo) rlInfo.textContent = "Nenhuma decisao RL disponivel para esta UC.";
    if (rbsExtra) rbsExtra.textContent = "";
    if (rlExtra) rlExtra.textContent = "";
    return;
  }

  const lastRbs = loadLastDecision("rbs");
  if (lastRbs) updateHighlightFromRBS(lastRbs);
  else {
    const info = document.getElementById("highlightRbsInfo");
    if (info) info.textContent = "Nenhuma decisão RBS salva ainda.";
  }

  const lastRl = loadLastDecision("rl");
  if (lastRl) {
    const det = lastRl.Detalhes || lastRl.ExplicacaoDetalhada || {};
    const doseFinal =
      lastRl.Volume_irrigacao ??
      det.Volume_irrigacao_mm ??
      det.dose_slot_mm ??
      det.dose_final_mm ??
      lastRl.Volume_zero ??
      0;
    updateHighlightFromRL(lastRl, doseFinal);
  } else {
    const info = document.getElementById("highlightRlInfo");
    if (info) info.textContent = "Nenhuma decisão RL salva ainda.";
  }
}

// ===============================
// RESUMO DE TOTAIS (RBS + RL)
// ===============================

function calculateIrrigationTotals(rows) {
  const dailyTotals = {};
  const seasonTotals = {
    rbs: 0,
    rl: 0,
    total: 0,
  };

  rows.forEach((row) => {
    if (row.volume && !Number.isNaN(row.volume)) {
      const volume = Number(row.volume);

      if (row.method === "RBS") {
        seasonTotals.rbs += volume;
      } else if (row.method === "RL") {
        seasonTotals.rl += volume;
      }
      seasonTotals.total += volume;

      if (row.date) {
        if (!dailyTotals[row.date]) {
          dailyTotals[row.date] = {
            date: row.date,
            rbs: 0,
            rl: 0,
            total: 0,
          };
        }

        if (row.method === "RBS") {
          dailyTotals[row.date].rbs += volume;
        } else if (row.method === "RL") {
          dailyTotals[row.date].rl += volume;
        }
        dailyTotals[row.date].total += volume;
      }
    }
  });

  const sortedDaily = Object.values(dailyTotals).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return {
    daily: sortedDaily,
    season: seasonTotals,
  };
}

function renderIrrigationSummary(rows) {
  const summarySection = document.getElementById("irrigationSummary");
  if (!summarySection) return;

  const totals = calculateIrrigationTotals(rows);

  summarySection.innerHTML = `
    <div class="summary-section">
      <h3>📊 Resumo de Irrigação</h3>
      
      <div class="season-totals">
        <h4>Total da Temporada</h4>
        <div class="totals-grid">
          <div class="total-card rbs-total">
            <div class="total-label">RBS</div>
            <div class="total-value">${fmtNum(totals.season.rbs, 2)} mm</div>
            <div class="total-percentage">${(
              ((totals.season.rbs / totals.season.total) * 100) ||
              0
            ).toFixed(1)}%</div>
          </div>
          <div class="total-card rl-total">
            <div class="total-label">RL</div>
            <div class="total-value">${fmtNum(totals.season.rl, 2)} mm</div>
            <div class="total-percentage">${(
              ((totals.season.rl / totals.season.total) * 100) ||
              0
            ).toFixed(1)}%</div>
          </div>
          <div class="total-card overall-total">
            <div class="total-label">Total Geral</div>
            <div class="total-value">${fmtNum(totals.season.total, 2)} mm</div>
            <div class="total-subtitle">Soma RBS + RL</div>
          </div>
        </div>
      </div>

      <div class="daily-totals">
        <h4>Totais por Dia (últimos ${
          Math.min(totals.daily.length, 7)
        } dias)</h4>
        <div class="daily-totals-table">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>RBS (mm)</th>
                <th>RL (mm)</th>
                <th>Total (mm)</th>
              </tr>
            </thead>
            <tbody>
              ${totals.daily
                .slice(0, 7)
                .map(
                  (day) => `
                <tr>
                  <td>${formatDateBR(day.date)}</td>
                  <td>${fmtNum(day.rbs, 2)}</td>
                  <td>${fmtNum(day.rl, 2)}</td>
                  <td><strong>${fmtNum(day.total, 2)}</strong></td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ===============================
// HISTÃ“RICO (TABELA + GRÃFICO)
// ===============================

function buildHistoryRows() {
  const simeMap = buildSimeparDailyMap();
  const rows = [];

  (historicalData.irrigationRBS || []).forEach((rec) => {
    if (!rec || !rec.Data) return;
    const date = rec.Data;
    const time = (rec.Horario || "00:00").slice(0, 5);
    const canteiro = rec.CanteiroNome 
      ? rec.CanteiroNome
      : `Canteiro ${rec.Canteiro}`;
    const volume = Number(
      rec.Volume_irrigacao ?? rec.Volume_mm ?? rec.Volume ?? 0
    );
    const tipo = rec.Tipo || "RBS";

    const detRoot = rec.ExplicacaoDetalhada || rec.Detalhes || {};
    const meteor = detRoot["1_Meteorologia"] || detRoot || {};

    const chuvaSime = simeMap[date]?.rain ?? null;
    const chuva =
      meteor.Chuva_real_mm ??
      detRoot.Chuva_real ??
      meteor.Chuva_prevista_mm ??
      detRoot.Chuva_prevista ??
      chuvaSime ??
      null;

    rows.push({
      date,
      time,
      method: "RBS",
      canteiro,
      volume: Number.isNaN(volume) ? null : volume,
      tipo,
      chuva,
    });
  });

  (historicalData.irrigationRL || []).forEach((rec) => {
    if (!rec || !rec.Data) return;
    const date = rec.Data;
    const time = (rec.Horario || "00:00").slice(0, 5);
    const canteiro = rec.CanteiroNome 
      ? rec.CanteiroNome
      : `Canteiro ${rec.Canteiro}`;

    const det = rec.Detalhes || rec.ExplicacaoDetalhada || {};
    const estados = det.Estados || det.States || {};

    const vol =
      rec.Volume_irrigacao ??
      det.Volume_irrigacao_mm ??
      det.dose_slot_mm ??
      det.dose_final_mm ??
      rec.Volume_zero ??
      0;
    const volume = Number(vol);
    const tipo = rec.Tipo || "RL";

    const chuvaSime = simeMap[date]?.rain ?? null;
    const chuva =
      det.rain_mm_day ??
      estados.Rain_mm_dia ??
      estados.Chuva_mm ??
      chuvaSime ??
      det.Chuva_real ??
      det.leituraPrecipitacao ??
      null;

    rows.push({
      date,
      time,
      method: "RL",
      canteiro,
      volume: Number.isNaN(volume) ? null : volume,
      tipo,
      chuva,
    });
  });

  rows.sort((a, b) => {
    const dateCompare = (a.date || "").localeCompare(b.date || "");
    if (dateCompare !== 0) return dateCompare;
    return (a.time || "").localeCompare(b.time || "");
  });

  return rows;
}

function renderHistoryTable(rows) {
  const tableBody = document.getElementById("historyTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  const today = new Date().toISOString().split("T")[0];

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    if (r.date === today) {
      tr.style.backgroundColor = "#f0f9ff";
      tr.style.borderLeft = "4px solid #3b82f6";
    }

    tr.innerHTML = `
      <td>${r.date ? formatDateBR(r.date) : "-"}</td>
      <td>${r.time || "--:--"}</td>
      <td>${r.method}</td>
      <td>${r.canteiro || "â€”"}</td>
      <td>${r.volume != null ? fmtNum(r.volume, 2) : "â€”"}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function applyHistoryFilters() {
  const infoEl = document.getElementById("histInfo");
  const tableBody = document.getElementById("historyTableBody");
  if (!tableBody) return;

  const startDateInput = document.getElementById("histDateStart");
  const endDateInput = document.getElementById("histDateEnd");
  const startTimeInput = document.getElementById("histTimeStart");
  const endTimeInput = document.getElementById("histTimeEnd");
  const methodFilter = document.getElementById("histMethod")?.value || "all";

  const startDate = startDateInput?.value || null;
  const endDate = endDateInput?.value || null;
  const startTime = startTimeInput?.value || null;
  const endTime = endTimeInput?.value || null;

  const baseRows = buildHistoryRows();

  if (!baseRows.length) {
    if (infoEl) {
      infoEl.textContent =
        currentFarm === "miringuava-luciane"
          ? `Ainda não há histórico disponível na AWS para a UC ${getCurrentFarmConfig().ucId}.`
          : "Ainda não há dados de histórico carregados.";
    }
    tableBody.innerHTML = "";
    updateHistoryChart([]);
    const summarySection = document.getElementById("irrigationSummary");
    if (summarySection) summarySection.innerHTML = "";
    repairVisibleText();
    return;
  }

  let filtered = baseRows;

  const planting = getCurrentPlantingFilter();
  if (planting) {
    const pStart = planting.startDate || null;
    const pEnd = planting.endDate || null;

    filtered = filtered.filter((r) => {
      if (!r.date) return false;
      if (pStart && r.date < pStart) return false;
      if (pEnd && r.date > pEnd) return false;
      return true;
    });
  }

  if (methodFilter === "rbs") {
    filtered = filtered.filter((r) => r.method === "RBS");
  } else if (methodFilter === "rl") {
    filtered = filtered.filter((r) => r.method === "RL");
  }

  if (startDate) {
    filtered = filtered.filter((r) => !r.date || r.date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((r) => !r.date || r.date <= endDate);
  }

  const tStart = startTime ? timeToMinutes(startTime) : null;
  const tEnd = endTime ? timeToMinutes(endTime) : null;

  if (tStart !== null) {
    filtered = filtered.filter((r) => {
      const t = timeToMinutes(r.time);
      if (t === null) return true;
      return t >= tStart;
    });
  }
  if (tEnd !== null) {
    filtered = filtered.filter((r) => {
      const t = timeToMinutes(r.time);
      if (t === null) return true;
      return t <= tEnd;
    });
  }

  if (!filtered.length) {
    if (infoEl) {
      const plantingText = planting
        ? ` para o plantio ${formatDateBR(planting.startDate)} até ${
            planting.endDate ? formatDateBR(planting.endDate) : "-"
          }`
        : "";
      infoEl.textContent = `Nenhum registro encontrado para os filtros selecionados${plantingText}.`;
    }
    tableBody.innerHTML = "";
    updateHistoryChart([]);
    const summarySection = document.getElementById("irrigationSummary");
    if (summarySection) summarySection.innerHTML = "";
    repairVisibleText();
    return;
  }

  if (infoEl) {
    const plantingText = planting
      ? ` para o plantio ${formatDateBR(planting.startDate)} até ${
          planting.endDate ? formatDateBR(planting.endDate) : "-"
        }`
      : "";
    infoEl.textContent = `Mostrando ${filtered.length} registro(s) filtrado(s)${plantingText}.`;
  }

  renderHistoryTable(filtered);
  updateHistoryChart(filtered);
  renderIrrigationSummary(filtered);
  repairVisibleText();
}

// ===============================
// EXPORTAÃ‡ÃƒO PARA EXCEL
// ===============================

function exportToExcel(rows, filename = "historico_irrigacao") {
  if (!rows.length) {
    alert("Não há dados para exportar.");
    return;
  }

  const headers = ["Data", "Horário", "Método", "Canteiro", "Volume (mm)"];
  
  const data = rows.map(row => [
    row.date ? formatDateBR(row.date) : "-",
    row.time || "--:--",
    row.method,
    row.canteiro || "-",
    row.volume != null ? fmtNum(row.volume, 2) : "â€”"
  ]);

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += headers.join(";") + "\r\n";
  data.forEach(row => {
    csvContent += row.join(";") + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function applyHistoryFiltersToRows(allRows) {
  const startDateInput = document.getElementById("histDateStart");
  const endDateInput = document.getElementById("histDateEnd");
  const startTimeInput = document.getElementById("histTimeStart");
  const endTimeInput = document.getElementById("histTimeEnd");
  const methodFilter = document.getElementById("histMethod")?.value || "all";

  const startDate = startDateInput?.value || null;
  const endDate = endDateInput?.value || null;
  const startTime = startTimeInput?.value || null;
  const endTime = endTimeInput?.value || null;

  let filtered = allRows;

  const planting = getCurrentPlantingFilter();
  if (planting) {
    const pStart = planting.startDate || null;
    const pEnd = planting.endDate || null;

    filtered = filtered.filter((r) => {
      if (!r.date) return false;
      if (pStart && r.date < pStart) return false;
      if (pEnd && r.date > pEnd) return false;
      return true;
    });
  }

  if (methodFilter === "rbs") {
    filtered = filtered.filter((r) => r.method === "RBS");
  } else if (methodFilter === "rl") {
    filtered = filtered.filter((r) => r.method === "RL");
  }

  if (startDate) {
    filtered = filtered.filter((r) => !r.date || r.date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((r) => !r.date || r.date <= endDate);
  }

  const tStart = startTime ? timeToMinutes(startTime) : null;
  const tEnd = endTime ? timeToMinutes(endTime) : null;

  if (tStart !== null) {
    filtered = filtered.filter((r) => {
      const t = timeToMinutes(r.time);
      if (t === null) return true;
      return t >= tStart;
    });
  }
  if (tEnd !== null) {
    filtered = filtered.filter((r) => {
      const t = timeToMinutes(r.time);
      if (t === null) return true;
      return t <= tEnd;
    });
  }

  return filtered;
}

function clearHistoryFilters() {
  const startDateInput = document.getElementById("histDateStart");
  const endDateInput = document.getElementById("histDateEnd");
  const startTimeInput = document.getElementById("histTimeStart");
  const endTimeInput = document.getElementById("histTimeEnd");
  const methodSel = document.getElementById("histMethod");

  if (startDateInput) startDateInput.value = "";
  if (endDateInput) endDateInput.value = "";
  if (startTimeInput) startTimeInput.value = "";
  if (endTimeInput) endTimeInput.value = "";
  if (methodSel) methodSel.value = "all";

  applyHistoryFilters();
}

function updateHistoryChart(rows) {
  const ctx = document.getElementById("historyChart");
  if (!ctx) return;

  const aggMap = {};
  rows.forEach((r) => {
    const key = r.date || "sem-data";
    if (!aggMap[key]) {
      aggMap[key] = {
        date: r.date,
        rain: r.chuva != null && !Number.isNaN(r.chuva) ? Number(r.chuva) : 0,
        irrRBS: 0,
        irrRL: 0,
      };
    }
    if (r.method === "RBS" && r.volume != null && !Number.isNaN(r.volume)) {
      aggMap[key].irrRBS += Number(r.volume);
    } else if (r.method === "RL" && r.volume != null && !Number.isNaN(r.volume)) {
      aggMap[key].irrRL += Number(r.volume);
    }
    if (r.chuva != null && !Number.isNaN(r.chuva)) {
      aggMap[key].rain = Number(r.chuva);
    }
  });

  const aggRows = Object.values(aggMap).sort((a, b) => {
    return (a.date || "").localeCompare(b.date || "");
  });

  const labels = aggRows.map((r) => {
    return r.date ? formatDateBR(r.date) : "-";
  });

  const chuvaData = aggRows.map((r) => r.rain || 0);
  const rbsData = aggRows.map((r) => r.irrRBS || 0);
  const rlData = aggRows.map((r) => r.irrRL || 0);

  if (historyChart) {
    historyChart.destroy();
  }

  historyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Chuva (mm)",
          data: chuvaData,
          backgroundColor: "rgba(54, 162, 235, 0.6)",
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 1,
        },
        {
          label: "Irrigação RBS (mm)",
          data: rbsData,
          backgroundColor: "rgba(255, 99, 132, 0.6)",
          borderColor: "rgba(255, 99, 132, 1)",
          borderWidth: 1,
        },
        {
          label: "Irrigação RL (mm)",
          data: rlData,
          backgroundColor: "rgba(75, 192, 192, 0.6)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: "#4b5563",
          },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const v = ctx.parsed.y;
              if (v === null || v === undefined || Number.isNaN(v)) {
                return `${ctx.dataset.label}: â€”`;
              }
              return `${ctx.dataset.label}: ${v.toFixed(2)} mm`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#6b7280", maxRotation: 45, minRotation: 0 },
          grid: { display: false },
        },
        y: {
          ticks: { color: "#6b7280" },
          grid: { color: "#e5e7eb" },
          beginAtZero: true,
          title: {
            display: true,
            text: "LÃ¢mina (mm)",
            color: "#6b7280",
          },
        },
      },
    },
  });
}

// ===============================
// BOTÃ•ES PARA HISTÃ“RICO
// ===============================

function addReloadHistoryButton() {
  const historyHeader = document.querySelector(".history-header");
  if (!historyHeader) return;

  const reloadButton = document.createElement("button");
  reloadButton.id = "reloadHistoryBtn";
  reloadButton.type = "button";
  reloadButton.textContent = "Recarregar dados históricos";
  reloadButton.style.marginTop = "1rem";
  reloadButton.style.padding = "0.5rem 1rem";
  reloadButton.style.borderRadius = "999px";
  reloadButton.style.border = "none";
  reloadButton.style.background = "var(--blue-green-grad)";
  reloadButton.style.color = "#ffffff";
  reloadButton.style.fontWeight = "600";
  reloadButton.style.cursor = "pointer";
  reloadButton.style.transition = "all 0.15s ease";

  reloadButton.addEventListener("click", () => {
    reloadButton.textContent = "Carregando...";
    reloadButton.disabled = true;

    loadCompleteHistoricalData().finally(() => {
      reloadButton.textContent = "Recarregar dados históricos";
      reloadButton.disabled = false;
    });
  });

  reloadButton.addEventListener("mouseenter", () => {
    if (!reloadButton.disabled) {
      reloadButton.style.transform = "translateY(-1px)";
      reloadButton.style.boxShadow = "0 8px 20px rgba(56, 189, 248, 0.4)";
    }
  });

  reloadButton.addEventListener("mouseleave", () => {
    if (!reloadButton.disabled) {
      reloadButton.style.transform = "translateY(0)";
      reloadButton.style.boxShadow = "none";
    }
  });

  historyHeader.appendChild(reloadButton);
}

function addExportButton() {
  const historyHeader = document.querySelector(".history-header");
  if (!historyHeader) return;

  const exportButton = document.createElement("button");
  exportButton.id = "exportExcelBtn";
  exportButton.type = "button";
  exportButton.textContent = "Exportar para Excel";
  exportButton.style.marginTop = "1rem";
  exportButton.style.marginLeft = "0.5rem";
  exportButton.style.padding = "0.5rem 1rem";
  exportButton.style.borderRadius = "999px";
  exportButton.style.border = "none";
  exportButton.style.background = "linear-gradient(135deg, #10b981, #059669)";
  exportButton.style.color = "#ffffff";
  exportButton.style.fontWeight = "600";
  exportButton.style.cursor = "pointer";
  exportButton.style.transition = "all 0.15s ease";

  exportButton.addEventListener("click", () => {
    const rows = buildHistoryRows();
    const filteredRows = applyHistoryFiltersToRows(rows);
    
    const planting = getCurrentPlantingFilter();
    let filename = "historico_irrigacao";
    
    if (planting) {
      filename = `historico_plantio_${planting.startDate}_${planting.endDate || "atual"}`;
    }
    
    exportToExcel(filteredRows, filename);
  });

  exportButton.addEventListener("mouseenter", () => {
    exportButton.style.transform = "translateY(-1px)";
    exportButton.style.boxShadow = "0 8px 20px rgba(16, 185, 129, 0.4)";
  });

  exportButton.addEventListener("mouseleave", () => {
    exportButton.style.transform = "translateY(0)";
    exportButton.style.boxShadow = "none";
  });

  const reloadBtn = document.getElementById("reloadHistoryBtn");
  if (reloadBtn) {
    reloadBtn.parentNode.insertBefore(exportButton, reloadBtn.nextSibling);
  } else {
    historyHeader.appendChild(exportButton);
  }
}

function updateFarmContext() {
  const farm = getCurrentFarmConfig();
  const farmPill = document.getElementById("farmPill");
  const farmSubtitle = document.getElementById("farmSubtitle");
  const topicsDescription = document.getElementById("topicsDescription");

  if (farmPill) {
    farmPill.textContent = `Propriedade: ${farm.label}`;
  }

  if (farmSubtitle) {
    farmSubtitle.innerHTML =
      `Dados publicados na AWS IoT e armazenados no S3 ` +
      `(<code>raspbpibucket/dashboard/</code>) para a unidade ${farm.unitLabel} ` +
      `(UC ${farm.ucId}).`;
  }

  if (topicsDescription) {
    topicsDescription.innerHTML =
      `Os cards mostram os tópicos MQTT da unidade <strong>${farm.unitLabel}</strong>. ` +
      `Use o filtro abaixo para aplicar a mesma data/horário em todos os cards ` +
      `com histórico (previsão, Plugfield, RBS e RL).`;
  }

  repairVisibleText();
}

// ===============================
// INIT / EVENTOS
// ===============================

function initDashboard() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;
  activeFarmOnDashboard = currentFarm;

  createAllCards();
  updateDashboardFilterInfoText();
  loadHighlightsFromStorage();
  loadAllJsons();

  addReloadHistoryButton();
  addExportButton();
  
  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadAllJsons);
  }

  const autoChk = document.getElementById("autoRefreshCheckbox");
  if (autoChk) {
    autoChk.addEventListener("change", (e) => {
      if (e.target.checked) enableAutoRefresh();
      else disableAutoRefresh();
    });
  }

  const navDashboard = document.getElementById("navDashboard");
  const navHistory = document.getElementById("navHistory");
  if (navDashboard) {
    navDashboard.addEventListener("click", () => showView("dashboard"));
  }
  if (navHistory) {
    navHistory.addEventListener("click", () => showView("history"));
  }

  const globalApply = document.getElementById("globalFilterApply");
  const globalClear = document.getElementById("globalFilterClear");
  if (globalApply) globalApply.addEventListener("click", applyGlobalFilterFromInputs);
  if (globalClear) globalClear.addEventListener("click", clearGlobalFilterInputs);

  const histApply = document.getElementById("histApply");
  const histClear = document.getElementById("histClear");
  if (histApply) histApply.addEventListener("click", applyHistoryFilters);
  if (histClear) histClear.addEventListener("click", clearHistoryFilters);

  const histDateStart = document.getElementById("histDateStart");
  const histDateEnd = document.getElementById("histDateEnd");
  const histTimeStart = document.getElementById("histTimeStart");
  const histTimeEnd = document.getElementById("histTimeEnd");
  const histMethod = document.getElementById("histMethod");

  if (histDateStart) histDateStart.addEventListener("change", applyHistoryFilters);
  if (histDateEnd) histDateEnd.addEventListener("change", applyHistoryFilters);
  if (histTimeStart) histTimeStart.addEventListener("change", applyHistoryFilters);
  if (histTimeEnd) histTimeEnd.addEventListener("change", applyHistoryFilters);
  if (histMethod) histMethod.addEventListener("change", applyHistoryFilters);

  syncPlantingFiltersFromDashboard();
}

// DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  ensureTextRepairObserver();
  const yearSpan = document.getElementById("year");
  const landingYear = document.getElementById("landingYear");
  const y = new Date().getFullYear();
  if (yearSpan) yearSpan.textContent = y;
  if (landingYear) landingYear.textContent = y;

  const landingCards = document.querySelectorAll(".landing-card-active");
  landingCards.forEach((card) => {
    const openDashboard = () => {
      const nextFarm = card.dataset.farm;
      if (nextFarm && FARM_CONFIG[nextFarm]) {
        currentFarm = nextFarm;
      }
      showDashboard();
    };

    const landingButton = card.querySelector(".landing-card-button");
    if (landingButton) {
      landingButton.addEventListener("click", openDashboard);
    } else {
      card.addEventListener("click", openDashboard);
      card.style.cursor = "pointer";
    }
  });

  const backBtn = document.getElementById("backToLanding");
  if (backBtn) {
    backBtn.addEventListener("click", showLanding);
  }

  updateFarmContext();
  repairVisibleText();
}); 
