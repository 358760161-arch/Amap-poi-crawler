(function () {
  "use strict";

  const POI_TYPES = [
    ["010000", "汽车服务"],
    ["020000", "汽车销售"],
    ["030000", "汽车维修"],
    ["040000", "摩托车服务"],
    ["050000", "餐饮服务"],
    ["060000", "购物服务"],
    ["070000", "生活服务"],
    ["080000", "体育休闲服务"],
    ["090000", "医疗保健服务"],
    ["100000", "住宿服务"],
    ["110000", "风景名胜"],
    ["120000", "商务住宅"],
    ["130000", "政府机构及社会团体"],
    ["140000", "科教文化服务"],
    ["150000", "交通设施服务"],
    ["160000", "金融保险服务"],
    ["170000", "公司企业"],
    ["180000", "道路附属设施"],
    ["190000", "地名地址信息"],
    ["200000", "公共设施"]
  ];

  const FIELDS = [
    "id",
    "name",
    "type",
    "typecode",
    "address",
    "location",
    "lng",
    "lat",
    "pname",
    "cityname",
    "adname",
    "tel",
    "website",
    "business_area",
    "distance",
    "query",
    "queryTypeCode",
    "queryTypeName",
    "fetchedAt"
  ];

  const appState = {
    AMap: null,
    map: null,
    mouseTool: null,
    polygon: null,
    polygonEditor: null,
    geocoder: null,
    poiMarkers: [],
    results: [],
    dedupeMap: new Map(),
    isSearching: false,
    shouldStop: false,
    logs: [],
    metrics: {
      success: 0,
      fail: 0,
      totalTasks: 0,
      doneTasks: 0
    }
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    apiKeyInput: $("apiKeyInput"),
    securityCodeInput: $("securityCodeInput"),
    cityInput: $("cityInput"),
    cityLimitInput: $("cityLimitInput"),
    centerSearchInput: $("centerSearchInput"),
    initMapBtn: $("initMapBtn"),
    searchCenterBtn: $("searchCenterBtn"),
    drawPolygonBtn: $("drawPolygonBtn"),
    editPolygonBtn: $("editPolygonBtn"),
    closeEditorBtn: $("closeEditorBtn"),
    clearPolygonBtn: $("clearPolygonBtn"),
    poiTypeList: $("poiTypeList"),
    keywordInput: $("keywordInput"),
    pageSizeInput: $("pageSizeInput"),
    maxPagesInput: $("maxPagesInput"),
    delayInput: $("delayInput"),
    coordSystemSelect: $("coordSystemSelect"),
    startSearchBtn: $("startSearchBtn"),
    stopSearchBtn: $("stopSearchBtn"),
    exportExcelBtn: $("exportExcelBtn"),
    exportGeoJsonBtn: $("exportGeoJsonBtn"),
    resultFilterInput: $("resultFilterInput"),
    resultTableBody: $("resultTableBody"),
    logPanel: $("logPanel"),
    clearLogBtn: $("clearLogBtn"),
    successCount: $("successCount"),
    failCount: $("failCount"),
    dedupeCount: $("dedupeCount"),
    taskCount: $("taskCount"),
    progressBar: $("progressBar"),
    progressText: $("progressText"),
    mapStatus: $("mapStatus"),
    polygonStatus: $("polygonStatus"),
    queryStatus: $("queryStatus")
  };

  function init() {
    renderPoiTypes();
    bindEvents();
    renderLogs();
    updateControls();
    updateMetrics();
  }

  function bindEvents() {
    els.initMapBtn.addEventListener("click", initMap);
    els.searchCenterBtn.addEventListener("click", searchMapCenter);
    els.centerSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchMapCenter();
    });
    els.drawPolygonBtn.addEventListener("click", startDrawPolygon);
    els.editPolygonBtn.addEventListener("click", openPolygonEditor);
    els.closeEditorBtn.addEventListener("click", closePolygonEditor);
    els.clearPolygonBtn.addEventListener("click", clearPolygon);
    els.startSearchBtn.addEventListener("click", startSearch);
    els.stopSearchBtn.addEventListener("click", stopSearch);
    els.exportExcelBtn.addEventListener("click", exportExcel);
    els.exportGeoJsonBtn.addEventListener("click", exportGeoJson);
    els.resultFilterInput.addEventListener("input", renderTable);
    els.clearLogBtn.addEventListener("click", () => {
      appState.logs = [];
      renderLogs();
    });
  }

  function renderPoiTypes() {
    els.poiTypeList.innerHTML = POI_TYPES.map(([code, name]) => `
      <label class="type-item">
        <input type="checkbox" value="${code}" data-name="${name}">
        <span>${name}</span>
        <code>${code}</code>
      </label>
    `).join("");
  }

  async function initMap() {
    const key = els.apiKeyInput.value.trim();
    const securityJsCode = els.securityCodeInput.value.trim();
    const city = els.cityInput.value.trim() || "北京";

    if (!key || !securityJsCode) {
      addLog("请先填写 JS API Key 和 securityJsCode。", "error");
      return;
    }
    if (!window.AMapLoader) {
      addLog("AMapLoader 未加载，请检查网络或 CDN。", "error");
      return;
    }

    setBusy(els.initMapBtn, true, "加载中");
    addLog("开始加载高德 JSAPI v2.0。");

    try {
      window._AMapSecurityConfig = {
        securityJsCode
        // 生产环境建议改为 serviceHost: "https://your-domain.com/_AMapService"
      };

      const AMap = await window.AMapLoader.load({
        key,
        version: "2.0",
        plugins: [
          "AMap.Scale",
          "AMap.ToolBar",
          "AMap.MouseTool",
          "AMap.PolygonEditor",
          "AMap.PlaceSearch",
          "AMap.Geocoder"
        ]
      });

      if (appState.map) appState.map.destroy();

      appState.AMap = AMap;
      AMap.getConfig().appname = "amap-poi-crawler";
      appState.map = new AMap.Map("mapContainer", {
        viewMode: "3D",
        zoom: 11,
        center: [116.397428, 39.90923],
        pitch: 0,
        mapStyle: "amap://styles/normal"
      });
      appState.map.addControl(new AMap.Scale());
      appState.map.addControl(new AMap.ToolBar({ position: "RT" }));
      appState.mouseTool = new AMap.MouseTool(appState.map);
      appState.geocoder = new AMap.Geocoder({ city });

      appState.map.on("complete", () => {
        addLog("地图加载完成。", "success");
      });

      if (city) await setMapCity(city);

      els.mapStatus.textContent = "地图已初始化";
      addLog(`当前城市限定：${city || "全国"}`);
    } catch (error) {
      addLog(`地图初始化失败：${getErrorText(error)}`, "error");
    } finally {
      setBusy(els.initMapBtn, false, "初始化地图");
      updateControls();
    }
  }

  function startDrawPolygon() {
    if (!ensureMap()) return;
    closePolygonEditor();
    if (appState.mouseTool) appState.mouseTool.close(true);
    addLog("进入绘制模式：单击添加顶点，双击结束。");

    appState.mouseTool.polygon({
      fillColor: "#2a9d8f",
      fillOpacity: 0.18,
      strokeColor: "#1f7a63",
      strokeWeight: 2,
      strokeOpacity: 1,
      strokeStyle: "solid",
      zIndex: 80
    });

    const handleDraw = (event) => {
      if (appState.mouseTool.off) appState.mouseTool.off("draw", handleDraw);
      if (appState.polygon) appState.map.remove(appState.polygon);
      appState.polygon = event.obj;
      appState.mouseTool.close(false);
      appState.map.setFitView([appState.polygon], false, [40, 40, 40, 40]);
      els.polygonStatus.textContent = `已绘制 ${getPolygonPath().length} 个顶点`;
      addLog("多边形绘制完成。", "success");
      updateControls();
    };
    appState.mouseTool.on("draw", handleDraw);
  }

  function openPolygonEditor() {
    if (!ensurePolygon()) return;
    if (!appState.polygonEditor) {
      appState.polygonEditor = new appState.AMap.PolygonEditor(appState.map, appState.polygon);
      appState.polygonEditor.on("end", () => {
        els.polygonStatus.textContent = `已绘制 ${getPolygonPath().length} 个顶点`;
        addLog("边界编辑已保存。", "success");
      });
    }
    appState.polygonEditor.open();
    addLog("已开启边界编辑。");
    updateControls();
  }

  function closePolygonEditor() {
    if (appState.polygonEditor) {
      appState.polygonEditor.close();
      els.polygonStatus.textContent = `已绘制 ${getPolygonPath().length} 个顶点`;
      addLog("已结束边界编辑。");
    }
    updateControls();
  }

  function clearPolygon() {
    closePolygonEditor();
    if (appState.mouseTool) appState.mouseTool.close(true);
    if (appState.polygon && appState.map) {
      appState.map.remove(appState.polygon);
    }
    appState.polygon = null;
    appState.polygonEditor = null;
    clearMarkers();
    resetResults();
    els.polygonStatus.textContent = "未绘制区域";
    addLog("已清空区域和查询结果。");
    updateControls();
  }

  async function searchMapCenter() {
    if (!ensureMap()) return;
    const keyword = els.centerSearchInput.value.trim();
    const city = els.cityInput.value.trim();
    if (!keyword) {
      addLog("请输入地图中心搜索关键词。", "warn");
      return;
    }

    try {
      const geocoder = appState.geocoder || new appState.AMap.Geocoder({ city });
      const result = await geocode(geocoder, keyword, city);
      if (!result) {
        addLog(`未找到位置：${keyword}`, "warn");
        return;
      }
      appState.map.setZoomAndCenter(14, result.location);
      addLog(`地图已移动到：${result.formattedAddress || keyword}`, "success");
    } catch (error) {
      addLog(`地图搜索失败：${getErrorText(error)}`, "error");
    }
  }

  async function setMapCity(city) {
    if (!city || !appState.geocoder) return;
    try {
      const result = await geocode(appState.geocoder, city, city);
      if (result) appState.map.setZoomAndCenter(11, result.location);
    } catch (error) {
      addLog(`城市定位失败：${getErrorText(error)}`, "warn");
    }
  }

  function geocode(geocoder, keyword, city) {
    if (city && geocoder.setCity) geocoder.setCity(city);
    return new Promise((resolve, reject) => {
      geocoder.getLocation(keyword, (status, result) => {
        if (status === "complete" && result.geocodes && result.geocodes.length) {
          resolve(result.geocodes[0]);
        } else if (status === "no_data") {
          resolve(null);
        } else {
          reject(result || status);
        }
      });
    });
  }

  async function startSearch() {
    if (!ensureMap() || !ensurePolygon()) return;
    const tasks = buildQueryTasks();
    if (!tasks.length) {
      addLog("请选择至少一个 POI 类型或输入关键词。", "error");
      return;
    }

    appState.isSearching = true;
    appState.shouldStop = false;
    appState.metrics = {
      success: 0,
      fail: 0,
      totalTasks: tasks.length,
      doneTasks: 0
    };
    resetResults();
    updateControls();
    updateMetrics();
    addLog(`开始查询，共 ${tasks.length} 个任务。`);

    const pageSize = clampNumber(els.pageSizeInput.value, 1, 50, 25);
    const maxPages = clampNumber(els.maxPagesInput.value, 1, 100, 20);
    const delayMs = clampNumber(els.delayInput.value, 0, 5000, 500);

    try {
      for (const task of tasks) {
        if (appState.shouldStop) break;
        await runTask(task, pageSize, maxPages, delayMs);
        appState.metrics.doneTasks += 1;
        updateMetrics();
      }

      if (appState.shouldStop) {
        addLog("查询已由用户停止。", "warn");
        els.queryStatus.textContent = "已停止";
      } else if (appState.results.length) {
        addLog(`查询完成，去重后 ${appState.results.length} 条。`, "success");
        els.queryStatus.textContent = "查询完成";
      } else {
        addLog("查询完成，但没有返回数据。", "warn");
        els.queryStatus.textContent = "无结果";
      }
    } finally {
      appState.isSearching = false;
      updateControls();
      updateMetrics();
    }
  }

  async function runTask(task, pageSize, maxPages, delayMs) {
    addLog(`任务开始：${task.label}`);
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
      if (appState.shouldStop) return;

      els.queryStatus.textContent = `${task.label} · 第 ${pageIndex} 页`;
      updateMetrics();

      try {
        const result = await searchInPolygon(task, pageSize, pageIndex);
        if (!result || !result.poiList || !Array.isArray(result.poiList.pois)) {
          addLog(`${task.label} 第 ${pageIndex} 页没有标准 POI 列表：${getErrorText(result)}`, "warn");
        }
        const rawPois = extractPois(result);
        const pois = rawPois.filter(isPoiInsidePolygon);
        const added = ingestPois(pois, task);
        appState.metrics.success += pois.length;
        addLog(`${task.label} 第 ${pageIndex} 页返回 ${rawPois.length} 条，多边形内 ${pois.length} 条，新增 ${added} 条。`, pois.length ? "success" : "");

        renderMarkers();
        renderTable();
        updateControls();

        if (pois.length < pageSize) break;
      } catch (error) {
        appState.metrics.fail += 1;
        addLog(`${task.label} 第 ${pageIndex} 页失败：${getErrorText(error)}`, "error");
        break;
      }

      if (delayMs > 0 && pageIndex < maxPages) {
        await sleep(delayMs);
      }
    }
  }

  function searchInPolygon(task, pageSize, pageIndex) {
    const city = els.cityInput.value.trim();
    const citylimit = els.cityLimitInput.checked;
    const bounds = appState.polygon.getBounds ? appState.polygon.getBounds() : appState.polygon;
    const placeSearch = new appState.AMap.PlaceSearch({
      pageSize,
      pageIndex,
      type: task.queryTypeCode || "",
      city: citylimit && city ? city : undefined,
      citylimit,
      extensions: "all"
    });

    return new Promise((resolve, reject) => {
      placeSearch.searchInBounds(task.keyword, bounds, (status, result) => {
        if (status === "complete") {
          resolve(result);
        } else if (status === "no_data") {
          resolve({ poiList: { pois: [] } });
        } else {
          reject(result || status);
        }
      });
    });
  }

  function buildQueryTasks() {
    const selectedTypes = Array.from(els.poiTypeList.querySelectorAll("input:checked")).map((input) => ({
      keyword: input.dataset.name,
      query: input.dataset.name,
      queryTypeCode: input.value,
      queryTypeName: input.dataset.name,
      label: `${input.dataset.name}(${input.value})`
    }));

    const keywords = els.keywordInput.value
      .split(/[\n,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((keyword) => ({
        keyword,
        query: keyword,
        queryTypeCode: "",
        queryTypeName: "自定义关键词",
        label: `关键词：${keyword}`
      }));

    return [...selectedTypes, ...keywords];
  }

  function extractPois(result) {
    if (!result || !result.poiList || !Array.isArray(result.poiList.pois)) return [];
    return result.poiList.pois;
  }

  function isPoiInsidePolygon(poi) {
    if (!appState.polygon || typeof appState.polygon.contains !== "function") return true;
    const location = parseLocation(poi.location);
    if (!Number.isFinite(location.lng) || !Number.isFinite(location.lat)) return false;
    try {
      return appState.polygon.contains([location.lng, location.lat]);
    } catch (error) {
      addLog(`多边形过滤失败，已保留该点：${getErrorText(error)}`, "warn");
      return true;
    }
  }

  function ingestPois(pois, task) {
    let added = 0;
    const fetchedAt = new Date().toISOString();

    for (const poi of pois) {
      const normalized = normalizePoi(poi, task, fetchedAt);
      if (!Number.isFinite(normalized.lng) || !Number.isFinite(normalized.lat)) continue;
      const key = normalized.id || `${normalized.name}|${normalized.location}|${normalized.type}`;
      if (appState.dedupeMap.has(key)) {
        const old = appState.dedupeMap.get(key);
        old.query = mergeUnique(old.query, normalized.query);
        old.queryTypeCode = mergeUnique(old.queryTypeCode, normalized.queryTypeCode);
        old.queryTypeName = mergeUnique(old.queryTypeName, normalized.queryTypeName);
        continue;
      }
      appState.dedupeMap.set(key, normalized);
      appState.results.push(normalized);
      added += 1;
    }

    return added;
  }

  function normalizePoi(poi, task, fetchedAt) {
    const location = parseLocation(poi.location);
    const bizExt = poi.biz_ext || {};
    return {
      id: stringValue(poi.id),
      name: stringValue(poi.name),
      type: stringValue(poi.type),
      typecode: stringValue(poi.typecode),
      address: normalizeAddress(poi.address),
      location: location.text,
      lng: location.lng,
      lat: location.lat,
      pname: stringValue(poi.pname),
      cityname: stringValue(poi.cityname),
      adname: stringValue(poi.adname),
      tel: stringValue(poi.tel),
      website: stringValue(poi.website || bizExt.website),
      business_area: stringValue(poi.business_area),
      distance: stringValue(poi.distance),
      query: task.query,
      queryTypeCode: task.queryTypeCode,
      queryTypeName: task.queryTypeName,
      fetchedAt
    };
  }

  function parseLocation(location) {
    if (!location) return { text: "", lng: NaN, lat: NaN };
    let lng;
    let lat;

    if (typeof location.getLng === "function" && typeof location.getLat === "function") {
      lng = Number(location.getLng());
      lat = Number(location.getLat());
    } else if (Array.isArray(location)) {
      lng = Number(location[0]);
      lat = Number(location[1]);
    } else {
      const parts = String(location).split(",");
      lng = Number(parts[0]);
      lat = Number(parts[1]);
    }

    return {
      text: Number.isFinite(lng) && Number.isFinite(lat) ? `${lng},${lat}` : stringValue(location),
      lng,
      lat
    };
  }

  function normalizeAddress(address) {
    if (Array.isArray(address)) return address.join("");
    return stringValue(address);
  }

  function renderMarkers() {
    if (!appState.map || !appState.AMap) return;
    clearMarkers();

    const infoWindow = new appState.AMap.InfoWindow({
      offset: new appState.AMap.Pixel(0, -28)
    });

    appState.poiMarkers = appState.results.map((poi) => {
      const markerTitle = escapeHtml(poi.name || "POI");
      const marker = new appState.AMap.Marker({
        position: [poi.lng, poi.lat],
        content: `<div class="poi-marker" title="${markerTitle}" aria-label="${markerTitle}"><span></span></div>`,
        offset: new appState.AMap.Pixel(-9, -9),
        title: poi.name,
        extData: poi
      });
      marker.on("click", () => {
        infoWindow.setContent(`
          <div class="info-window">
            <strong>${escapeHtml(poi.name)}</strong><br>
            <span>${escapeHtml(poi.type || "未知类型")}</span><br>
            <span>${escapeHtml(poi.address || "无地址")}</span>
          </div>
        `);
        infoWindow.open(appState.map, marker.getPosition());
      });
      return marker;
    });

    if (appState.poiMarkers.length) {
      appState.map.add(appState.poiMarkers);
    }
  }

  function clearMarkers() {
    if (appState.map && appState.poiMarkers.length) {
      appState.map.remove(appState.poiMarkers);
    }
    appState.poiMarkers = [];
  }

  function renderTable() {
    const keyword = els.resultFilterInput.value.trim().toLowerCase();
    const rows = appState.results.filter((poi) => {
      if (!keyword) return true;
      return [poi.name, poi.type, poi.address, poi.query, poi.adname]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

    if (!rows.length) {
      els.resultTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">${appState.results.length ? "没有匹配结果" : "暂无数据"}</td></tr>`;
      return;
    }

    els.resultTableBody.innerHTML = rows.slice(0, 500).map((poi) => `
      <tr>
        <td>${escapeHtml(poi.name)}</td>
        <td>${escapeHtml(poi.type)}</td>
        <td>${escapeHtml(poi.address)}</td>
        <td>${formatCoord(poi.lng)}</td>
        <td>${formatCoord(poi.lat)}</td>
        <td>${escapeHtml(poi.queryTypeName || poi.query)}</td>
      </tr>
    `).join("");
  }

  function exportExcel() {
    if (!appState.results.length) {
      addLog("没有可导出的 Excel 数据。", "warn");
      return;
    }
    if (!window.XLSX) {
      addLog("SheetJS 未加载，无法导出 Excel。", "error");
      return;
    }

    const rows = appState.results.map((poi) => {
      const row = {};
      FIELDS.forEach((field) => {
        row[field] = poi[field] ?? "";
      });
      return row;
    });
    const sheet = window.XLSX.utils.json_to_sheet(rows, { header: FIELDS });
    const lngIndex = FIELDS.indexOf("lng");
    const latIndex = FIELDS.indexOf("lat");
    for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
      const lngCell = window.XLSX.utils.encode_cell({ c: lngIndex, r: rowIndex - 1 });
      const latCell = window.XLSX.utils.encode_cell({ c: latIndex, r: rowIndex - 1 });
      if (sheet[lngCell]) sheet[lngCell].z = "0.000000";
      if (sheet[latCell]) sheet[latCell].z = "0.000000";
    }

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, sheet, "POI Results");
    window.XLSX.writeFile(workbook, `amap-poi-${formatTimestamp()}.xlsx`);
    addLog("Excel 导出完成。", "success");
  }

  function exportGeoJson() {
    if (!appState.results.length) {
      addLog("没有可导出的 GeoJSON 数据。", "warn");
      return;
    }

    const featureCollection = {
      type: "FeatureCollection",
      name: "amap-poi-export",
      metadata: {
        source: "AMap",
        coordinateSystem: els.coordSystemSelect.value,
        exportedAt: new Date().toISOString(),
        polygon: getPolygonPath()
      },
      features: appState.results.map((poi) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [poi.lng, poi.lat]
        },
        properties: {
          ...FIELDS.reduce((acc, field) => {
            if (field !== "lng" && field !== "lat" && field !== "location") acc[field] = poi[field] ?? "";
            return acc;
          }, {}),
          coordinateSystem: els.coordSystemSelect.value
        }
      }))
    };

    downloadBlob(
      JSON.stringify(featureCollection, null, 2),
      `amap-poi-${formatTimestamp()}.geojson`,
      "application/geo+json"
    );
    addLog("GeoJSON 导出完成。", "success");
  }

  function stopSearch() {
    if (!appState.isSearching) return;
    appState.shouldStop = true;
    els.queryStatus.textContent = "正在停止";
    addLog("收到停止指令，当前请求完成后终止。", "warn");
    updateControls();
  }

  function resetResults() {
    clearMarkers();
    appState.results = [];
    appState.dedupeMap = new Map();
    renderTable();
    updateMetrics();
    updateControls();
  }

  function getPolygonPath() {
    if (!appState.polygon) return [];
    return appState.polygon.getPath().map((point) => {
      if (typeof point.getLng === "function") return [point.getLng(), point.getLat()];
      return [Number(point[0]), Number(point[1])];
    });
  }

  function ensureMap() {
    if (!appState.map || !appState.AMap) {
      addLog("请先初始化地图。", "error");
      return false;
    }
    return true;
  }

  function ensurePolygon() {
    if (!appState.polygon) {
      addLog("请先绘制多边形区域。", "error");
      return false;
    }
    if (getPolygonPath().length < 3) {
      addLog("多边形至少需要 3 个顶点。", "error");
      return false;
    }
    return true;
  }

  function updateControls() {
    const hasMap = Boolean(appState.map);
    const hasPolygon = Boolean(appState.polygon);
    const hasResults = appState.results.length > 0;
    const searching = appState.isSearching;

    els.drawPolygonBtn.disabled = !hasMap || searching;
    els.editPolygonBtn.disabled = !hasMap || !hasPolygon || searching;
    els.closeEditorBtn.disabled = !hasMap || !hasPolygon || searching;
    els.clearPolygonBtn.disabled = !hasMap || (!hasPolygon && !hasResults) || searching;
    els.startSearchBtn.disabled = !hasMap || !hasPolygon || searching;
    els.stopSearchBtn.disabled = !searching;
    els.exportExcelBtn.disabled = !hasResults || searching;
    els.exportGeoJsonBtn.disabled = !hasResults || searching;
    els.searchCenterBtn.disabled = !hasMap;
  }

  function updateMetrics() {
    els.successCount.textContent = String(appState.metrics.success);
    els.failCount.textContent = String(appState.metrics.fail);
    els.dedupeCount.textContent = String(appState.results.length);
    els.taskCount.textContent = `${appState.metrics.doneTasks}/${appState.metrics.totalTasks}`;

    const percent = appState.metrics.totalTasks
      ? Math.round((appState.metrics.doneTasks / appState.metrics.totalTasks) * 100)
      : 0;
    els.progressBar.style.width = `${percent}%`;
    els.progressText.textContent = appState.metrics.totalTasks
      ? `任务进度 ${percent}%`
      : "暂无任务";
  }

  function addLog(message, type) {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    appState.logs.push({ time, message, type: type || "" });
    if (appState.logs.length > 300) appState.logs.shift();
    renderLogs();
  }

  function renderLogs() {
    if (!appState.logs.length) {
      els.logPanel.innerHTML = `<div class="log-line">等待操作。</div>`;
      return;
    }

    els.logPanel.innerHTML = appState.logs.map((log) => {
      const className = log.type ? ` log-${log.type}` : "";
      return `<div class="log-line${className}">[${log.time}] ${escapeHtml(log.message)}</div>`;
    }).join("");
    els.logPanel.scrollTop = els.logPanel.scrollHeight;
  }

  function setBusy(button, busy, text) {
    button.disabled = busy;
    button.textContent = text;
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(number)));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mergeUnique(left, right) {
    return Array.from(new Set(String(left || "").split("、").concat(String(right || "").split("、")).filter(Boolean))).join("、");
  }

  function stringValue(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function formatCoord(value) {
    return Number.isFinite(value) ? value.toFixed(6) : "";
  }

  function formatTimestamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getErrorText(error) {
    if (!error) return "未知错误";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.info) return error.info;
    if (error.infoCode) return `${error.infoCode}`;
    try {
      return JSON.stringify(error);
    } catch (e) {
      return String(error);
    }
  }

  function escapeHtml(value) {
    return stringValue(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  init();
})();
