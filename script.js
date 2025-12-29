

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

// ===============================
// UTILITÁRIOS
// ===============================

function createMetric(label, value, extraLabelClass = "") {
  const div = document.createElement("div");
  div.className = "metric";
  div.innerHTML = `
    <div class="metric-label ${extraLabelClass}">${label}</div>
    <div class="metric-value">${value}</div>
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
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function fmtNum(v, casas = 2) {
  if (v === null || v === undefined) return "—";
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
// HELPERS PARA HISTORY NO S3
// ===============================

// ===============================
// FUNÇÃO PARA BUSCAR HISTÓRICO DE IRRIGAÇÃO
// ===============================

async function fetchIrrigationHistory(irrigationType, isoDate) {
  if (!isoDate) return null;
  
  // Mapeamento de tipos
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
      console.warn(`Histórico não encontrado para ${irrigationType} em ${isoDate}: HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    
    // Extrai os dados da nova estrutura
    if (irrigationType === 'rbs') {
      return extractIrrigationDataFromNewFormat(data, 'rbs');
    } else if (irrigationType === 'rl') {
      return extractIrrigationDataFromNewFormat(data, 'rl');
    }
    
    return data;
  } catch (e) {
    console.error("Erro ao buscar histórico de irrigação:", e);
    return null;
  }
}
function getHistoryKeyFromConfig(config) {
  try {
    // Para mapear os tópicos para os novos caminhos
    const topicMap = {
      "irrigationRBS/schedule": "irrigationRBS_schedule",
      "irrigationRL/schedule": "irrigationRL_schedule"
    };
    
    // Se for um dos tópicos de irrigação, retorna a chave mapeada
    if (topicMap[config.topic]) {
      return topicMap[config.topic];
    }
    
    // Para outros tópicos, mantém a lógica original
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

  // Para os tópicos de irrigação, usa o novo padrão
  if (config.topic === "irrigationRBS/schedule" || config.topic === "irrigationRL/schedule") {
    // Novo padrão: Irrigacoes_Decisoes/{historyKey}/acumulado/YYYYMMDD.json
    const [y, m, d] = isoDate.split("-");
    if (y.length !== 4) return null;
    
    const fileName = `${y}${m}${d}.json`;
    
    // URL no novo padrão
    const url = `https://raspbpibucket.s3.us-east-1.amazonaws.com/Irrigacoes_Decisoes/${historyKey}/acumulado/${fileName}?t=${Date.now()}`;
    
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`Histórico não encontrado para ${config.topic} em ${isoDate}: HTTP ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      
      // Extrai os dados da nova estrutura
      if (config.topic === "irrigationRBS/schedule") {
        return extractIrrigationDataFromNewFormat(data, 'rbs');
      } else if (config.topic === "irrigationRL/schedule") {
        return extractIrrigationDataFromNewFormat(data, 'rl');
      }
      
      return data;
    } catch (e) {
      console.error("Erro ao buscar histórico no S3 (novo padrão):", e);
      return null;
    }
  } else {
    // Para outros tópicos, mantém a lógica original
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
        console.warn(`Histórico não encontrado para ${config.topic} em ${isoDate}: HTTP ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      return data;
    } catch (e) {
      console.error("Erro ao buscar histórico no S3 (padrão antigo):", e);
      return null;
    }
  }
}
// ===============================
// PLANTIOS (EXTRAÍDOS DE cultures/get)
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
    emptyMessage.innerHTML = `
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌱</div>
      <p>Nenhum plantio cadastrado ainda.</p>
    `;
    container.appendChild(emptyMessage);
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
          end ? formatDateBR(end) : "—"
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
// CARREGAMENTO DE DADOS HISTÓRICOS
// ===============================

// ===============================
// CARREGAMENTO DE DADOS HISTÓRICOS
// ===============================

async function loadCompleteHistoricalData() {
  console.log("🚀 Carregando dados históricos COMPLETOS...");

  if (!historicalData.loaded) {
    historicalData.irrigationRBS = [];
    historicalData.irrigationRL = [];
  }

  const startDate = new Date("2025-11-27");
  const endDate = new Date();
  const dates = [];

  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const isoDate = date.toISOString().split("T")[0];
    dates.push(isoDate);
  }

  console.log(`📅 Buscando dados para ${dates.length} datas`);

  // Buscar dados RBS
  console.log("📥 Carregando dados históricos RBS...");
  for (const date of dates) {
    try {
      // Usando a função já existente
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
        console.log(`✓ RBS - ${date}: ${data.length} registros`);
      }
    } catch (error) {
      console.warn(`Erro ao carregar RBS para ${date}:`, error);
    }
  }

  // Buscar dados RL
  console.log("📥 Carregando dados históricos RL...");
  for (const date of dates) {
    try {
      // Usando a função já existente
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
        console.log(`✓ RL - ${date}: ${data.length} registros`);
      }
    } catch (error) {
      console.warn(`Erro ao carregar RL para ${date}:`, error);
    }
  }

  historicalData.loaded = true;

  console.log("✅ Dados históricos carregados:", {
    RBS: historicalData.irrigationRBS.length,
    RL: historicalData.irrigationRL.length,
  });

  applyHistoryFilters();
}
// ===============================
// LANDING / NAVEGAÇÃO
// ===============================

// ===============================
// ADICIONAR BOTÃO DE RECARREGAMENTO (se ainda não tiver)
// ===============================

function addReloadHistoryButton() {
  const historyHeader = document.querySelector(".history-header");
  if (!historyHeader) return;

  // Verificar se o botão já existe
  if (document.getElementById("reloadHistoryBtn")) return;

  const reloadButton = document.createElement("button");
  reloadButton.id = "reloadHistoryBtn";
  reloadButton.type = "button";
  reloadButton.textContent = "🔄 Recarregar Dados Históricos";
  reloadButton.style.marginTop = "1rem";
  reloadButton.style.padding = "0.5rem 1rem";
  reloadButton.style.borderRadius = "999px";
  reloadButton.style.border = "none";
  reloadButton.style.background = "linear-gradient(135deg, #3b82f6, #10b981)";
  reloadButton.style.color = "#ffffff";
  reloadButton.style.fontWeight = "600";
  reloadButton.style.cursor = "pointer";
  reloadButton.style.transition = "all 0.15s ease";

  reloadButton.addEventListener("click", () => {
    reloadButton.textContent = "⏳ Carregando...";
    reloadButton.disabled = true;

    loadCompleteHistoricalData().finally(() => {
      reloadButton.textContent = "🔄 Recarregar Dados Históricos";
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

function showDashboard() {
  const landing = document.getElementById("landing");
  const appWrapper = document.getElementById("appWrapper");
  if (!landing || !appWrapper) return;
  landing.style.display = "none";
  appWrapper.classList.remove("app-hidden");
  initDashboard();
}

function showLanding() {
  const landing = document.getElementById("landing");
  const appWrapper = document.getElementById("appWrapper");
  if (!landing || !appWrapper) return;
  appWrapper.classList.add("app-hidden");
  landing.style.display = "flex";
}

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
      console.log("📊 Primeiro acesso ao histórico - carregando dados...");
      loadCompleteHistoricalData();
    } else {
      console.log("📊 Usando dados históricos existentes:", {
        RBS: historicalData.irrigationRBS.length,
        RL: historicalData.irrigationRL.length,
      });
      applyHistoryFilters();
    }

    syncPlantingFiltersFromDashboard();
  }
}

// ===============================
// RENDERIZAÇÃO ESPECÍFICA POR TÓPICO
// ===============================

// ---------- SIMEPAR DIÁRIO ----------

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

// ---------- PLUGFIELD DIÁRIO ----------

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

// ---------- PLUGFIELD HORÁRIO ----------

function normalizePlugHourlyArray(dataRaw) {
  if (Array.isArray(dataRaw) && dataRaw.length > 0) {
    const firstItem = dataRaw[0];
    if (firstItem && typeof firstItem === "object") {
      if (
        firstItem["Data e Hora"] ||
        firstItem["DataHora"] ||
        firstItem["Temperatura Méd."]
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
        existing["Temperatura Méd."] !== undefined &&
        existing["Temperatura Méd."] !== null &&
        existing["Temperatura Méd."] !== "-" &&
        existing["Temperatura Méd."] !== "";
      const currentHasData =
        item["Temperatura Méd."] !== undefined &&
        item["Temperatura Méd."] !== null &&
        item["Temperatura Méd."] !== "-" &&
        item["Temperatura Méd."] !== "";

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
    const temp = item["Temperatura Méd."];
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
    const t = item["Temperatura Méd."] ?? "-";
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
    status.textContent = c.status || "—";

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
      v.textContent = value ?? "—";
      wrapper.appendChild(l);
      wrapper.appendChild(v);
      body.appendChild(wrapper);
    }

    addField("Área (m²)", c.area);
    addField("Cultura", c.culture?.name || "—");
    addField(
      "Umidade solo (%)",
      c.soil_humidity?.toFixed?.(1) ?? c.soil_humidity ?? "—"
    );
    addField(
      "Temp. solo (°C)",
      c.soil_temperature?.toFixed?.(1) ?? c.soil_temperature ?? "—"
    );
    addField(
      "Umidade ar (%)",
      c.air_humitidy?.toFixed?.(1) ?? c.air_humitidy ?? "—"
    );
    addField(
      "Temp. ar (°C)",
      c.air_temperature?.toFixed?.(1) ?? c.air_temperature ?? "—"
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
  title.textContent = `${cult.vegetable?.name || "Cultura"} • ${canteiroNames}`;

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
    createMetric("Profundidade raiz inicial (m)", root.initial ?? "—", "soil")
  );
  paramsGrid.appendChild(
    createMetric("Profundidade raiz final (m)", root.final ?? "—", "soil")
  );
  paramsGrid.appendChild(createMetric("Kc inicial", kc.initial ?? "—", "kc"));
  paramsGrid.appendChild(createMetric("Kc médio", kc.medium ?? "—", "kc"));
  paramsGrid.appendChild(createMetric("Kc final", kc.final ?? "—", "kc"));
  paramsGrid.appendChild(
    createMetric(
      "Fator de depleção",
      cult.vegetable?.depletion_factor ?? "—",
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
        prefTimes || "—",
        highTemp.air_temperature_threshold !== undefined
          ? `${highTemp.air_temperature_threshold} °C / ${
              highTemp.duration_in_minutes || "-"
            } min`
          : "—",
        frost.start_temperature_threshold !== undefined
          ? `${frost.start_temperature_threshold}–${
              frost.end_temperature_threshold
            } °C`
          : "—",
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
  
  // Se não há filtro de data/hora, mostrar o último registro de HOJE
  if (!date && !time) {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = dataArray.filter(d => d.Data === today);
    
    if (todayRecords.length > 0) {
      // Retornar o último registro de hoje
      const todayWithMinutes = todayRecords
        .map(d => ({
          obj: d,
          minutes: timeToMinutes(d.Horario) || 0
        }))
        .sort((a, b) => b.minutes - a.minutes); // Ordena decrescente
        
      return todayWithMinutes[0]?.obj || dataArray[dataArray.length - 1];
    }
    
    // Se não há registros hoje, retornar o último registro geral
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
    .sort((a, b) => a.minutes - b.minutes); // Ordena crescente

  if (!time) {
    // Quando há data mas não hora, mostrar o ÚLTIMO registro do dia
    if (withMinutes.length) {
      return withMinutes[withMinutes.length - 1].obj; // ← ÚLTIMO, não primeiro
    }
    return subset[subset.length - 1] || dataArray[dataArray.length - 1];
  }

  const timeFilterMin = timeToMinutes(time);
  if (timeFilterMin === null) {
    if (withMinutes.length) {
      return withMinutes[withMinutes.length - 1].obj; // Último quando hora inválida
    }
    return subset[subset.length - 1] || dataArray[0];
  }

  const afterOrEqual = withMinutes.find((x) => x.minutes >= timeFilterMin);
  if (afterOrEqual) return afterOrEqual.obj;

  if (withMinutes.length) {
    return withMinutes[withMinutes.length - 1].obj; // Último se não encontrou horário igual ou posterior
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

// ---------- HELPER: CHUVA REAL DO PLUGFIELD ATÉ O HORÁRIO ----------

function getPlugfieldDailyRainUntil(isoDate, timeStr) {
  if (!isoDate) return null;

  const raw = dashboardData["plugfield/forecast/hourly"];
  if (!raw) return null;

  const listaHoras = normalizePlugHourlyArray(raw);
  if (!listaHoras.length) return null;

  const limiteMin = timeToMinutes(timeStr || "23:59");
  if (limiteMin === null) return null;

  let total = 0;

  listaHoras.forEach((item) => {
    const dh = item["Data e Hora"] || item["DataHora"] || "";
    if (!dh) return;

    const [dataStr, horaStr] = dh.split(" ");
    if (!dataStr) return;

    const iso = dataStr.includes("/") ? dateBRToISO(dataStr) : dataStr;
    if (iso !== isoDate) return;

    const min = timeToMinutes(horaStr || "00:00");
    if (min === null || min > limiteMin) return;

    const chuva = item["Chuva"];
    if (
      chuva === undefined ||
      chuva === null ||
      chuva === "" ||
      chuva === "-" ||
      Number.isNaN(Number(chuva))
    ) {
      return;
    }

    total += Number(chuva);
  });

  if (Number.isNaN(total)) return null;
  return total;
}

// ---------- IRRIGAÇÃO RBS ----------

// ---------- IRRIGAÇÃO RBS ----------

function renderIrrigationRBS(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  // Se os dados estão no novo formato, extrai
  let array = [];
  if (Array.isArray(dataRaw) && dataRaw.length > 0 && dataRaw[0].data) {
    // Novo formato: extrai dados
    array = extractIrrigationDataFromNewFormat(dataRaw, 'rbs');
  } else {
    // Formato antigo
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
  const solo = detRoot["2_Solo"] || {};
  const deficit = detRoot["3_Deficit"] || {};
  const modelo = detRoot["4_Modelo_Irrigacao"] || {};
  const cultura = detRoot["5_Cultura_e_Fase"] || {};
  const status = detRoot["6_StatusCalculo"] || {};

  // ====== DADOS METEOROLÓGICOS ======
  const etcPrev = meteor.ETc_previsto_mm ?? null;
  const etcReal = meteor.ETc_real_mm ?? null;
  const etoSimepar = meteor.ETo_diario_SIMEPAR_mm ?? null;
  const etoPlugfield = meteor.ETo_estimado_Plugfield_mm ?? null;
  const chuvaReal = meteor.Chuva_real_mm ?? 0;
  const chuvaPrev = meteor.Chuva_prevista_mm ?? 0;
  const chuvaSimepar = meteor.Chuva_dia_SIMEPAR_mm ?? 0;
  const irnTotal = meteor.IRN_total_mm ?? 0;
  const peReal = meteor.Pe_real_mm ?? 0;
  const pePrev = meteor.Pe_prevista_mm ?? 0;
  const fracaoDiaRealizado = meteor.Fracao_dia_realizado ?? 0;

  // ====== DADOS DO SOLO ======
  const umidadeSensor = solo.Umidade_sensor_ ?? solo.Umidade_sensor_pct ?? 0;
  const faixaDesejada = solo.Faixa_desejada_ ?? "40.0–50.0";
  const laminaSolo = solo.Lamina_solo_mm ?? 0;
  const profundidadeZ = solo.Profundidade_Z_cm ?? 20;

  // ====== DÉFICIT ======
  const deficitDia = deficit.Deficit_do_dia_mm ?? 0;
  const deficitAcumulado = deficit.Deficit_acumulado_final_mm ?? 0;

  // ====== MODELO DE IRRIGAÇÃO ======
  const itnTeorico = modelo.ITN_teorico_mm ?? 0;
  const itnAjustado = modelo.ITN_ajustado_mm ?? 0;
  const itnFinal = modelo.ITN_final_mm ?? 0;
  const volumePorIrrigacao = modelo.Volume_por_irrigacao_mm ?? 0;

  // ====== CULTURA E FASE ======
  const faseAtual = cultura.Fase_atual ?? "Não identificada";
  const kcUtilizado = cultura.kc_utilizado ?? 1.0;
  const profundidadeRaiz = cultura.Profundidade_raiz_Z_cm ?? 20;
  const maxIrrigacoesDia = cultura.Max_irrigacoes_dia ?? 2;
  const maxVolumeDiario = cultura.Max_volume_diario_mm ?? 10.0;

  // ====== STATUS DO CÁLCULO ======
  const modo = status.modo ?? "DESCONHECIDO";
  const dadosSuficientes = status.dados_suficientes ?? false;
  const horaIrrigacao = status.hora_irrigacao ?? 10;
  const ajusteNoturno = status.ajuste_noturno ?? false;

  // =========================
  // TOPO DO CARD
  // =========================
  const gridTopo = document.createElement("div");
  gridTopo.className = "metric-grid";

  gridTopo.appendChild(
    createMetric("Data", data.Data ?? "-", "date")
  );
  gridTopo.appendChild(
    createMetric("Horário", data.Horario ?? "-", "time")
  );
  gridTopo.appendChild(
    createMetric(
      "Canteiro",
      data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-",
      "rbs-main"
    )
  );
  gridTopo.appendChild(
    createMetric(
      "Volume irrigação (mm)",
      fmtNum(data.Volume_irrigacao, 2),
      "rbs-main"
    )
  );

  gridTopo.appendChild(
    createMetric("Tipo de estratégia", data.Tipo || "adaptativa_hibrida_deficit", "rbs-main")
  );

  // =========================
  // BLOCO METEOROLOGIA
  // =========================
  const gridMeteo = document.createElement("div");
  gridMeteo.className = "metric-grid";
  gridMeteo.style.marginTop = "0.6rem";

  gridMeteo.appendChild(
    createMetric("ETo Simepar (mm)", fmtNum(etoSimepar, 3), "eto")
  );
  
  if (etoPlugfield > 0) {
    gridMeteo.appendChild(
      createMetric("ETo Plugfield (mm)", fmtNum(etoPlugfield, 3), "eto")
    );
  }
  
  gridMeteo.appendChild(
    createMetric("ETc previsto (mm)", fmtNum(etcPrev, 3), "rbs-context")
  );
  
  if (etcReal > 0) {
    gridMeteo.appendChild(
      createMetric("ETc realizado (mm)", fmtNum(etcReal, 3), "rbs-context")
    );
  }
  
  gridMeteo.appendChild(
    createMetric("Chuva real (mm)", fmtNum(chuvaReal, 2), "rain")
  );
  
  gridMeteo.appendChild(
    createMetric("Chuva prevista (mm)", fmtNum(chuvaPrev, 2), "rain")
  );
  
  gridMeteo.appendChild(
    createMetric("Chuva Simepar (mm)", fmtNum(chuvaSimepar, 2), "rain")
  );

  // =========================
  // SOLO + DÉFICIT
  // =========================
  const gridSoloDef = document.createElement("div");
  gridSoloDef.className = "metric-grid";
  gridSoloDef.style.marginTop = "0.6rem";

  if (umidadeSensor > 0) {
    gridSoloDef.appendChild(
      createMetric("Umidade solo sensor (%)", fmtNum(umidadeSensor, 1), "rbs-soil")
    );
  }

  gridSoloDef.appendChild(
    createMetric("Faixa desejada (%)", faixaDesejada, "rbs-soil")
  );

  gridSoloDef.appendChild(
    createMetric("Lâmina solo (mm)", fmtNum(laminaSolo, 2), "rbs-soil")
  );

  gridSoloDef.appendChild(
    createMetric("Profundidade Z (cm)", profundidadeZ, "rbs-soil")
  );

  gridSoloDef.appendChild(
    createMetric("Déficit do dia (mm)", fmtNum(deficitDia, 3), "rbs-soil")
  );

  gridSoloDef.appendChild(
    createMetric("Déficit acumulado (mm)", fmtNum(deficitAcumulado, 3), "rbs-soil")
  );

  // =========================
  // MODELO DE IRRIGAÇÃO
  // =========================
  const gridModelo = document.createElement("div");
  gridModelo.className = "metric-grid";
  gridModelo.style.marginTop = "0.6rem";

  gridModelo.appendChild(
    createMetric("ITN teórico (mm)", fmtNum(itnTeorico, 3), "rbs-context")
  );

  gridModelo.appendChild(
    createMetric("ITN ajustado (mm)", fmtNum(itnAjustado, 3), "rbs-context")
  );

  gridModelo.appendChild(
    createMetric("ITN final (mm)", fmtNum(itnFinal, 3), "rbs-context")
  );

  gridModelo.appendChild(
    createMetric("IRN total (mm)", fmtNum(irnTotal, 3), "rbs-context")
  );

  gridModelo.appendChild(
    createMetric("Volume por irrigação (mm)", fmtNum(volumePorIrrigacao, 2), "rbs-context")
  );

  // =========================
  // CULTURA E FASE
  // =========================
  const gridCultura = document.createElement("div");
  gridCultura.className = "metric-grid";
  gridCultura.style.marginTop = "0.6rem";

  gridCultura.appendChild(
    createMetric("Fase atual", faseAtual, "rbs-context")
  );

  gridCultura.appendChild(
    createMetric("Kc utilizado", fmtNum(kcUtilizado, 2), "rbs-context")
  );

  gridCultura.appendChild(
    createMetric("Profundidade raiz (cm)", profundidadeRaiz, "rbs-context")
  );

  gridCultura.appendChild(
    createMetric("Máx irrigações/dia", maxIrrigacoesDia, "rbs-context")
  );

  gridCultura.appendChild(
    createMetric("Máx volume diário (mm)", fmtNum(maxVolumeDiario, 1), "rbs-context")
  );

  // =========================
  // CAIXA "POR QUE IRRIGAR..." (VERSÃO ORIGINAL)
  // =========================
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

  // Informações para a explicação
  const etcPrevStr = fmtNum(etcPrev, 2);
  const etcRealStr = fmtNum(etcReal, 2);
  const etoSimeparStr = fmtNum(etoSimepar, 3);
  const chuvaRealStr = fmtNum(chuvaReal, 2);
  const chuvaPrevStr = fmtNum(chuvaPrev, 2);
  const chuvaSimeparStr = fmtNum(chuvaSimepar, 2);
  const irnTotalStr = fmtNum(irnTotal, 2);
  const laminaSoloStr = fmtNum(laminaSolo, 2);
  const deficitDiaStr = fmtNum(deficitDia, 3);
  const deficitAcumuladoStr = fmtNum(deficitAcumulado, 3);
  const volumePorIrrigacaoStr = fmtNum(volumePorIrrigacao, 2);
  const itnFinalStr = fmtNum(itnFinal, 2);
  const faseAtualStr = faseAtual;
  const kcUtilizadoStr = fmtNum(kcUtilizado, 2);
  const maxIrrigacoesDiaStr = maxIrrigacoesDia;
  const maxVolumeDiarioStr = fmtNum(maxVolumeDiario, 1);
  const fracaoDiaStr = fmtNum(fracaoDiaRealizado * 100, 1);

  if (data.Volume_irrigacao > 0) {
    justText.textContent =
      `A estratégia RBS sugeriu irrigar ${fmtNum(data.Volume_irrigacao, 2)} mm ` +
      `porque, até este horário (${fracaoDiaStr}% do dia realizado), ` +
      `a cultura (${faseAtualStr}, Kc=${kcUtilizadoStr}) apresentou ETc previsto de ${etcPrevStr} mm ` +
      `e ETc realizado de ${etcRealStr} mm (baseado em ETo Simepar de ${etoSimeparStr} mm). ` +
      `Com chuva real acumulada de ${chuvaRealStr} mm e chuva prevista de ${chuvaPrevStr} mm (Simepar: ${chuvaSimeparStr} mm), ` +
      `além de IRN total de ${irnTotalStr} mm, lâmina de solo de ${laminaSoloStr} mm, ` +
      `déficit do dia de ${deficitDiaStr} mm e déficit acumulado de ${deficitAcumuladoStr} mm, ` +
      `o modelo calculou um ITN final de ${itnFinalStr} mm. ` +
      `Considerando o limite de ${maxIrrigacoesDiaStr} irrigações/dia e ${maxVolumeDiarioStr} mm/dia máximo, ` +
      `a reposição foi dividida em ${maxIrrigacoesDiaStr} slots de aproximadamente ${volumePorIrrigacaoStr} mm cada.`;
  } else {
    justText.textContent =
      `Não foi aplicada irrigação neste horário. ` +
      `Mesmo com ETc previsto de ${etcPrevStr} mm e realizado de ${etcRealStr} mm ` +
      `(ETo Simepar: ${etoSimeparStr} mm), chuva real de ${chuvaRealStr} mm e prevista de ${chuvaPrevStr} mm, ` +
      `IRN total de ${irnTotalStr} mm, lâmina de solo de ${laminaSoloStr} mm, ` +
      `déficit do dia de ${deficitDiaStr} mm e acumulado de ${deficitAcumuladoStr} mm, ` +
      `a combinação destes fatores indicou que não era necessário adicionar lâmina extra neste momento. ` +
      `O modelo respeita os limites da fase ${faseAtualStr}: máximo ${maxIrrigacoesDiaStr} irrigações/dia ` +
      `e ${maxVolumeDiarioStr} mm/dia.`;
  }

  justBox.appendChild(justTitle);
  justBox.appendChild(justText);

  // =========================
  // MONTAGEM FINAL
  // =========================
  visualEl.appendChild(gridTopo);
  visualEl.appendChild(gridMeteo);
  visualEl.appendChild(gridSoloDef);
  visualEl.appendChild(gridModelo);
  visualEl.appendChild(gridCultura);
  visualEl.appendChild(justBox);

  updateHighlightFromRBS(data);
  saveLastDecision("rbs", data);
}
// ---------- IRRIGAÇÃO RL ----------

function renderIrrigationRL(visualEl, dataRaw) {
  visualEl.innerHTML = "";

  // Se os dados estão no novo formato, extrai
  let array = [];
  if (Array.isArray(dataRaw) && dataRaw.length > 0 && dataRaw[0].data) {
    // Novo formato: extrai dados
    array = extractIrrigationDataFromNewFormat(dataRaw, 'rl');
  } else {
    // Formato antigo
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

  // =========================
  // TOPO DO CARD
  // =========================
  const gridTopo = document.createElement("div");
  gridTopo.className = "metric-grid";

  gridTopo.appendChild(createMetric("Data", data.Data ?? "-", "date"));
  gridTopo.appendChild(createMetric("Horário", data.Horario ?? "-", "time"));
  gridTopo.appendChild(
    createMetric(
      "Canteiro",
      data.CanteiroNome || `Canteiro ${data.Canteiro}` || "-",
      "rbs-main"
    )
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

  // =========================
  // MOTIVO DA DECISÃO (TRADUZIDO)
  // =========================
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

  // Traduzir os valores de reason para português
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
    // Se não estiver no dicionário, usa o valor original mas tenta melhorar
    motivoTraduzido = reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  motivoText.textContent = motivoTraduzido;

  motivoBox.appendChild(motivoTitle);
  motivoBox.appendChild(motivoText);

  // =========================
  // DETALHES DO CÁLCULO
  // =========================
  const gridDetalhes = document.createElement("div");
  gridDetalhes.className = "metric-grid";
  gridDetalhes.style.marginTop = "0.6rem";

  // Dados meteorológicos
  gridDetalhes.appendChild(
    createMetric("ETo do dia (mm)", fmtNum(det.eto_mm_day, 3), "eto")
  );

  gridDetalhes.appendChild(
    createMetric("ETc do dia (mm)", fmtNum(det.etc_mm_day, 3), "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Chuva prevista (mm)", fmtNum(det.rain_mm_day, 2), "rain")
  );

  gridDetalhes.appendChild(
    createMetric("Necessidade do dia (mm)", fmtNum(det.need_mm_day, 3), "rbs-context")
  );

  // Parâmetros do modelo
  gridDetalhes.appendChild(
    createMetric("Kc do dia", fmtNum(det.kc_today, 2), "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Slots totais", det.Slots_totais ?? "-", "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Slots futuros", det.Slots_futuros ?? "-", "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Distribuição", det.Distribuicao ?? "-", "rbs-context")
  );

  gridDetalhes.appendChild(
    createMetric("Máx diário (mm)", fmtNum(det.MaxDaily_mm, 1), "rbs-context")
  );

  // =========================
  // FONTE DOS DADOS
  // =========================
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

  // =========================
  // METADADOS
  // =========================
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

  // =========================
  // MONTAGEM FINAL
  // =========================
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
// ---------- GENÉRICO ----------

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
    visualEl.textContent = "Aguardando dados deste tópico.";
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
            isPassiveTopic(config.topic) ? "Aguardando" : "—"
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

    if (globalFilter.date) {
      data = await fetchHistoryJsonForDate(config, globalFilter.date);
    }

    if (!data) {
      const url = `${config.url}?t=${Date.now()}`;
      const response = await fetch(url);

      if (response.status === 404) {
        if (isPassiveTopic(config.topic)) {
          statusText.textContent = "Aguardando";
          visualEl.textContent = "Aguardando dados deste tópico.";
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

      data = await response.json();
    }

    const pretty = JSON.stringify(data, null, 2);

    dashboardData[config.topic] = data;

    if (config.topic === "cultures/get") {
      syncPlantingFiltersFromDashboard();
    }

    renderVisual(config, visualEl, data);
    jsonEl.textContent = pretty;

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
      visualEl.textContent = "Aguardando dados deste tópico.";
      timeText.textContent = "--";
    } else {
      statusText.textContent = "Erro";
      visualEl.textContent = "Erro ao carregar dados.";
      messageEl.style.display = "block";
      messageEl.textContent =
        "Não foi possível carregar o JSON (verifique se o arquivo existe no S3, se há histórico para a data e se o bucket permite acesso público).";
    }

    if (config.topic === "irrigationRBS/schedule") {
      const last = loadLastDecision("rbs");
      if (last && visualEl) {
        renderIrrigationRBS(visualEl, [last]);
      }
    } else if (config.topic === "irrigationRL/schedule") {
      const last = loadLastDecision("rl");
      if (last && visualEl) {
        renderIrrigationRL(visualEl, [last]);
      }
    }
  }
}

async function loadAllJsons() {
  console.log("🔄 Atualizando DADOS DO DASHBOARD apenas...");
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
    console.warn("Não foi possível salvar em localStorage:", e);
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
      : String(doseFinal ?? "—");

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
// HISTÓRICO (TABELA + GRÁFICO)
// ===============================

function buildHistoryRows() {
  const simeMap = buildSimeparDailyMap();
  const rows = [];

  (historicalData.irrigationRBS || []).forEach((rec) => {
    if (!rec || !rec.Data) return;
    const date = rec.Data;
    const time = (rec.Horario || "00:00").slice(0, 5);
    
    // REMOVER: Mostrar apenas "Canteiro 1" sem o (1)
    const canteiro = rec.CanteiroNome 
      ? rec.CanteiroNome // Se tiver nome, usa apenas o nome
      : `Canteiro ${rec.Canteiro}`; // Se não tiver nome, mostra "Canteiro X"
    
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
    
    // REMOVER: Mostrar apenas "Canteiro 2" sem o (2)
    const canteiro = rec.CanteiroNome 
      ? rec.CanteiroNome // Se tiver nome, usa apenas o nome
      : `Canteiro ${rec.Canteiro}`; // Se não tiver nome, mostra "Canteiro X"

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

    // REMOVER: Não mostrar mais a coluna de Tipo/Regra
    tr.innerHTML = `
      <td>${r.date ? formatDateBR(r.date) : "-"}</td>
      <td>${r.time || "--:--"}</td>
      <td>${r.method}</td>
      <td>${r.canteiro || "—"}</td>
      <td>${r.volume != null ? fmtNum(r.volume, 2) : "—"}</td>
      <!-- Removido: <td>${r.tipo || "—"}</td> -->
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
    if (infoEl) infoEl.textContent = "Ainda não há dados de histórico carregados.";
    tableBody.innerHTML = "";
    updateHistoryChart([]);
    const summarySection = document.getElementById("irrigationSummary");
    if (summarySection) summarySection.innerHTML = "";
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
            planting.endDate ? formatDateBR(planting.endDate) : "—"
          }`
        : "";
      infoEl.textContent = `Nenhum registro encontrado para os filtros selecionados${plantingText}.`;
    }
    tableBody.innerHTML = "";
    updateHistoryChart([]);
    const summarySection = document.getElementById("irrigationSummary");
    if (summarySection) summarySection.innerHTML = "";
    return;
  }

  if (infoEl) {
    const plantingText = planting
      ? ` para o plantio ${formatDateBR(planting.startDate)} até ${
          planting.endDate ? formatDateBR(planting.endDate) : "—"
        }`
      : "";
    infoEl.textContent = `Mostrando ${filtered.length} registro(s) filtrado(s)${plantingText}.`;
  }

  renderHistoryTable(filtered);
  updateHistoryChart(filtered);
  renderIrrigationSummary(filtered);
}

// ===============================
// EXPORTAÇÃO PARA EXCEL
// ===============================

function exportToExcel(rows, filename = "historico_irrigacao") {
  if (!rows.length) {
    alert("Não há dados para exportar.");
    return;
  }

  // Criar cabeçalhos
  const headers = ["Data", "Horário", "Método", "Canteiro", "Volume (mm)", "Chuva (mm)"];
  
  // Criar dados
  const data = rows.map(row => [
    row.date ? formatDateBR(row.date) : "-",
    row.time || "--:--",
    row.method,
    row.canteiro || "-",
    row.volume != null ? fmtNum(row.volume, 2) : "—",
    row.chuva != null ? fmtNum(row.chuva, 2) : "—"
  ]);

  // Criar conteúdo CSV
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Adicionar cabeçalhos
  csvContent += headers.join(";") + "\r\n";
  
  // Adicionar dados
  data.forEach(row => {
    csvContent += row.join(";") + "\r\n";
  });

  // Criar link de download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function addExportButton() {
  const historyHeader = document.querySelector(".history-header");
  if (!historyHeader) return;

  // Verificar se o botão já existe
  if (document.getElementById("exportExcelBtn")) return;

  const exportButton = document.createElement("button");
  exportButton.id = "exportExcelBtn";
  exportButton.type = "button";
  exportButton.textContent = "📥 Exportar para Excel";
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

  // Adicionar ao lado do botão de recarregar
  const reloadBtn = document.getElementById("reloadHistoryBtn");
  if (reloadBtn) {
    reloadBtn.parentNode.insertBefore(exportButton, reloadBtn.nextSibling);
  } else {
    historyHeader.appendChild(exportButton);
  }
}
// ===============================
// EXPORTAÇÃO PARA EXCEL
// ===============================

function exportToExcel(rows, filename = "historico_irrigacao") {
  if (!rows.length) {
    alert("Não há dados para exportar.");
    return;
  }

  // Criar cabeçalhos APENAS com as colunas desejadas
  const headers = ["Data", "Horário", "Método", "Canteiro", "Volume (mm)"];
  
  // Criar dados APENAS com as colunas desejadas
  const data = rows.map(row => [
    row.date ? formatDateBR(row.date) : "-",
    row.time || "--:--",
    row.method,
    row.canteiro || "-",
    row.volume != null ? fmtNum(row.volume, 2) : "—"
    // REMOVER: chuva (mm) que estava aqui
  ]);

  // Criar conteúdo CSV
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Adicionar cabeçalhos
  csvContent += headers.join(";") + "\r\n";
  
  // Adicionar dados
  data.forEach(row => {
    csvContent += row.join(";") + "\r\n";
  });

  // Criar link de download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
// Função auxiliar para aplicar filtros às linhas para exportação
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
                return `${ctx.dataset.label}: —`;
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
            text: "Lâmina (mm)",
            color: "#6b7280",
          },
        },
      },
    },
  });
}

// ===============================
// BOTÃO PARA RECARREGAR HISTÓRICO
// ===============================

function addReloadHistoryButton() {
  const historyHeader = document.querySelector(".history-header");
  if (!historyHeader) return;

  const reloadButton = document.createElement("button");
  reloadButton.id = "reloadHistoryBtn";
  reloadButton.type = "button";
  reloadButton.textContent = "🔄 Recarregar Dados Históricos";
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
    reloadButton.textContent = "⏳ Carregando...";
    reloadButton.disabled = true;

    loadCompleteHistoricalData().finally(() => {
      reloadButton.textContent = "🔄 Recarregar Dados Históricos";
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

// ===============================
// INIT / EVENTOS
// ===============================

function initDashboard() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;

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
  const yearSpan = document.getElementById("year");
  const landingYear = document.getElementById("landingYear");
  const y = new Date().getFullYear();
  if (yearSpan) yearSpan.textContent = y;
  if (landingYear) landingYear.textContent = y;

  const landingButton = document.querySelector(
    ".landing-card-active .landing-card-button"
  );
  if (landingButton) {
    landingButton.addEventListener("click", showDashboard);
  }

  const backBtn = document.getElementById("backToLanding");
  if (backBtn) {
    backBtn.addEventListener("click", showLanding);
  }
});

