// ==========================================
// 系統全域變數
// ==========================================
let currentRegion = 'sz'; 
let metroStations = null;
let metroTransfers = null;
let metroGraph = {}; 

let userRawLocation = null;
let destinationRawLocation = null;
let nearbyStartStations = [];
let isUsingAutoLocation = false; 

let mapInstance = null;
let currentMarker = null;
let currentMapTarget = null; 

document.addEventListener("DOMContentLoaded", () => {
    loadMetroData();
    // 【新增】監聽輸入框，手動輸入時立即關閉自動模式，確保搜尋結果刷新
    document.getElementById("start-station").addEventListener("input", () => {
        isUsingAutoLocation = false;
        console.log("⌨️ 手動輸入中，自動模式已關閉");
    });
});

// ==========================================
// 1. 地區切換與資料載入
// ==========================================
function changeRegion() {
    currentRegion = document.getElementById("region-select").value;
    document.getElementById("start-station").value = "";
    document.getElementById("end-station").value = "";
    document.getElementById("route-result").innerHTML = "";
    document.getElementById("start-nearby-results").innerHTML = "";
    document.getElementById("end-nearby-results").innerHTML = "";
    userRawLocation = null;
    destinationRawLocation = null;
    nearbyStartStations = [];
    isUsingAutoLocation = false; 
    window.autoSearchPending = false;
    metroStations = null;
    metroTransfers = null;
    metroGraph = {};
    document.getElementById("station-list").innerHTML = "";
    loadMetroData();
}

async function loadMetroData() {
    try {
        const stationRes = await fetch(`./cities/${currentRegion}/metro_station.json`);
        const transferRes = await fetch(`./cities/${currentRegion}/metro_transfer.json`);
        if (!stationRes.ok || !transferRes.ok) throw new Error(`找不到檔案。`);
        metroStations = await stationRes.json();
        metroTransfers = await transferRes.json();
        populateStationList();
        buildGraph(); 
    } catch (error) { console.error("載入失敗", error); }
}

function populateStationList() {
    const datalist = document.getElementById("station-list");
    datalist.innerHTML = ""; 
    const allStations = new Set();
    if (metroStations && metroStations.lines) {
        metroStations.lines.forEach(line => {
            if (line.stations) line.stations.forEach(s => allStations.add(s));
        });
    }
    allStations.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        datalist.appendChild(opt);
    });
}

function buildGraph() {
    metroGraph = {};
    if (!metroStations || !metroStations.lines) return;
    metroStations.lines.forEach(line => {
        const ss = line.stations;
        for (let i = 0; i < ss.length; i++) {
            const cur = ss[i];
            if (!metroGraph[cur]) metroGraph[cur] = [];
            if (i > 0) metroGraph[cur].push({ station: ss[i-1], line: line.name, color: line.color });
            if (i < ss.length - 1) metroGraph[cur].push({ station: ss[i+1], line: line.name, color: line.color });
        }
    });
    if (metroTransfers && metroTransfers.specialTransfers) {
        metroTransfers.specialTransfers.forEach(st => {
            if (!metroGraph[st.from]) metroGraph[st.from] = [];
            if (!metroGraph[st.to]) metroGraph[st.to] = [];
            metroGraph[st.from].push({ station: st.to, line: st.type, color: "#888888" });
            metroGraph[st.to].push({ station: st.from, line: st.type, color: "#888888" });
        });
    }
}

// ==========================================
// 3. 路線搜尋演算法 (多起點比較優化)
// ==========================================
function searchRoute() {
    const manualStart = document.getElementById("start-station").value.trim();
    const end = document.getElementById("end-station").value.trim();
    const pref = document.querySelector('input[name="search-pref"]:checked').value;

    if (!end) return alert("請輸入終點站！");

    // 如果起點留空且沒定位過，觸發自動搜尋
    if (!manualStart && !isUsingAutoLocation) {
        const wantAuto = confirm("您沒有輸入起點。要自動定位並尋找最佳路線嗎？");
        if (wantAuto) {
            window.autoSearchPending = true;
            findNearbyStations('start', 'gps');
        }
        return; 
    }

    if (!metroGraph[end]) return alert("找不到終點站。");

    let routesToCompare = [];

    // 自動模式：計算所有候選站
    if (isUsingAutoLocation && nearbyStartStations.length > 0) {
        nearbyStartStations.forEach(s => {
            const res = findShortestPath(s.name, end, pref);
            if (res) routesToCompare.push({ startStation: s, path: res, cost: calculateTotalCost(res, pref) });
        });
    } else {
        // 手動模式：直接計算該站
        if (!metroGraph[manualStart]) return alert("找不到起點站。");
        const res = findShortestPath(manualStart, end, pref);
        if (res) routesToCompare.push({ startStation: {name: manualStart, distance: 0}, path: res, cost: 0 });
    }

    routesToCompare.sort((a, b) => a.cost - b.cost);

    if (routesToCompare.length > 0) {
        renderMultiRouteResults(routesToCompare);
        document.getElementById("route-result").scrollIntoView({ behavior: 'smooth' });
    } else {
        document.getElementById("route-result").innerHTML = "<p>無法找到路線。</p>";
    }
}

function findShortestPath(start, end, pref) {
    let pq = [{ cost: 0, path: [{ station: start, line: null, color: null }] }];
    let minCost = {};
    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        let cur = pq.shift();
        let last = cur.path[cur.path.length-1];
        if (last.station === end) return cur.path;
        let neighbors = metroGraph[last.station] || [];
        for (let n of neighbors) {
            let isTransfer = last.line !== null && last.line !== n.line;
            let weight = pref === 'transfer' ? (isTransfer ? 100 : 1) : (isTransfer ? 1.1 : 1);
            let newCost = cur.cost + weight;
            let key = `${n.station}_${n.line}`;
            if (minCost[key] === undefined || newCost < minCost[key]) {
                minCost[key] = newCost;
                pq.push({ cost: newCost, path: [...cur.path, n] });
            }
        }
    }
    return null;
}

function calculateTotalCost(path, pref) {
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
        if (path[i-1].line !== null && path[i-1].line !== path[i].line) cost += (pref === 'transfer' ? 100 : 1);
        else cost += 1;
    }
    return cost;
}

// ==========================================
// 4. 渲染結果與導航
// ==========================================
function renderMultiRouteResults(routes) {
    const container = document.getElementById("route-result");
    container.innerHTML = `<h3>系統推薦路線：</h3>`;
    
    routes.slice(0, 3).forEach((r, idx) => {
        const div = document.createElement("div");
        div.className = "route-option";
        div.style = "border:1px solid #ccc; border-radius:8px; padding:15px; margin-bottom:15px; background:#fff;";
        
        let headerHtml = `<h4 style="margin-top:0; color:#007BFF;">選項 ${idx+1}：從 ${r.startStation.name} 出發</h4>`;
        
        if (r.startStation.distance > 0) {
            const dist = r.startStation.distance < 1000 ? `${Math.round(r.startStation.distance)}m` : `${(r.startStation.distance/1000).toFixed(2)}km`;
            headerHtml += `<p style="font-size:24px; color:gray; margin-top:-10px;">(距離您約 ${dist})</p>`;
        }

        // 🚀 【新增】：呼叫預估時間函數，並顯示在畫面上
        const estimatedTime = calculateEstimatedTime(r.path);
        headerHtml += `<p style="font-size:15px; color:#d63384; font-weight:bold; margin-top:5px; margin-bottom:15px;">⏱️ 預估乘車時間：約 ${estimatedTime} 分鐘</p>`;
        
        div.innerHTML = headerHtml;

        if (userRawLocation && r.startStation.distance > 0) {
            const btn = document.createElement("button");
            btn.innerText = `🚶 導航至 ${r.startStation.name}站`;
            btn.style = "background:#28a745; margin-bottom:10px;";
            btn.onclick = () => openGoogleNav(userRawLocation, r.startStation.name + "站");
            div.appendChild(btn);
        }

        div.appendChild(createRouteDOM(r.path));

        if (destinationRawLocation) {
            const endS = r.path[r.path.length-1].station;
            const btn2 = document.createElement("button");
            btn2.innerText = `🏁 出站後導航至目的地`;
            btn2.style = "background:#17a2b8; margin-top:10px;";
            btn2.onclick = () => openGoogleNav(endS + "站", destinationRawLocation);
            div.appendChild(btn2);
        }
        container.appendChild(div);
    });
}

function createRouteDOM(path) {
    const frag = document.createDocumentFragment();
    path.forEach((node, i) => {
        const div = document.createElement("div");
        div.className = "station-item";
        
        // 設定站點圓點顏色
        div.style.setProperty("--line-color", node.color || (path[1] ? path[1].color : "#333"));
        
        let text = node.station;

        if (i === 0) {
            let startLine = path[1] ? path[1].line : "";
            let directionText = "";
            // 呼叫 getDirection 取得開往哪裡
            if (path[1] && startLine !== "站外轉乘") {
                let dir = getDirection(node.station, path[1].station, startLine);
                if (dir) directionText = ` ${dir}方向`; 
            }
            text += ` (起點 - 乘搭 ${startLine}${directionText})`;
        } 
        else {
            div.style.setProperty("--line-color", node.color);
            if (i < path.length - 1 && node.line !== path[i+1].line) {
                div.classList.add("transfer");
                let nextLine = path[i+1].line;
                
                if (nextLine === "站外轉乘") {
                    text += ` (🚶 徒步換線)`;
                } else {
                    let directionText = "";
                    // 轉乘時，呼叫 getDirection 取得新路線開往哪裡
                    let dir = getDirection(node.station, path[i+1].station, nextLine);
                    if (dir) directionText = ` ${dir}方向`; 
                    text += ` (轉乘 ${nextLine}${directionText})`;
                }
            }
            if (i === path.length - 1) text += " (終點)";
        }
        
        div.textContent = text;
        frag.appendChild(div);
    });
    return frag;
}

// 【剛剛遺失的關鍵函數：負責計算開往哪裡】
function getDirection(currentStation, nextStation, lineName) {
    if (lineName === "站外轉乘") return ""; 
    let stations = [];
    let l = metroStations.lines.find(l => l.name === lineName);
    if (l) stations = l.stations;
    if (!stations || stations.length === 0) return "";
    
    let currentIndex = stations.indexOf(currentStation);
    let nextIndex = stations.indexOf(nextStation);
    
    // 如果下一站的索引大於目前站，代表往陣列的尾巴開（取最後一站）；反之則是往陣列的頭開（取第一站）
    return nextIndex > currentIndex ? stations[stations.length - 1] : stations[0]; 
}

function openGoogleNav(origin, dest) {
    let url = "https://www.google.com/maps/dir/?api=1&travelmode=walking";
    if (origin.lat) url += `&origin=${origin.lat},${origin.lng}`; else url += `&origin=${encodeURIComponent(origin)}`;
    if (dest.lat) url += `&destination=${dest.lat},${dest.lng}`; else url += `&destination=${encodeURIComponent(dest)}`;
    window.open(url, '_blank');
}

// ==========================================
// 5. 定位與過濾 (修復版)
// ==========================================
function findNearbyStations(targetInput, mode) {
    const resDiv = document.getElementById(`${targetInput}-nearby-results`);
    if (mode === 'gps') {
        navigator.geolocation.getCurrentPosition(
            (pos) => processLocationToStations(pos.coords.latitude, pos.coords.longitude, targetInput),
            () => { resDiv.innerHTML = "❌ 定位失敗"; window.autoSearchPending = false; },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    } else if (mode === 'street') {
        const name = document.getElementById(`${targetInput}-street`).value.trim();
        if (!name) return;
        let prefix = currentRegion === 'hk' ? "香港 " : (currentRegion === 'twp' ? "台灣 " : "深圳 ");
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(prefix + name)}&limit=1`)
            .then(r => r.json()).then(d => {
                if (d.length > 0) processLocationToStations(parseFloat(d[0].lat), parseFloat(d[0].lon), targetInput);
            });
    }
}

function processLocationToStations(lat, lng, targetInput) {
    const resDiv = document.getElementById(`${targetInput}-nearby-results`);
    if (targetInput === 'start') { userRawLocation = {lat, lng}; isUsingAutoLocation = true; }
    else destinationRawLocation = {lat, lng};

    let stations = [];
    for (let name in metroStations.coordinates) {
        const s = metroStations.coordinates[name];
        const R = 6371000;
        const dLat = (s.lat - lat) * Math.PI / 180;
        const dLon = (s.lng - lng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180)*Math.cos(s.lat*Math.PI/180)*Math.sin(dLon/2)**2;
        stations.push({ name, distance: R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) });
    }
    stations.sort((a, b) => a.distance - b.distance);

    if (targetInput === 'start') {
        let filtered = [];
        let seenLines = new Set();
        // 【優化】絕對保留物理距離最近的第一名！
        filtered.push(stations[0]);
        metroStations.lines.forEach(l => { if(l.stations.includes(stations[0].name)) seenLines.add(l.name); });

        for (let i = 1; i < stations.length; i++) {
            let myLines = [];
            metroStations.lines.forEach(l => { if(l.stations.includes(stations[i].name)) myLines.push(l.name); });
            if (!myLines.every(ln => seenLines.has(ln))) {
                filtered.push(stations[i]);
                myLines.forEach(ln => seenLines.add(ln));
            }
            if (filtered.length >= 3) break;
        }
        nearbyStartStations = filtered;
    }

    let top = (targetInput === 'start') ? nearbyStartStations : stations.slice(0, 3);
    let html = `<div style="margin-bottom:8px; color:#28a745;">✅ 找到附近車站：</div>`;
    top.forEach(s => {
        const d = s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance/1000).toFixed(2)}km`;
        html += `<button onclick="selectNearby('${targetInput}', '${s.name}')" style="display:block; width:100%; margin-bottom:5px; padding:10px; background:#0080FF; border:1px solid #ccc; text-align:left; border-radius:5px;">🚶 <b>${d}</b> - ${s.name}</button>`;
    });
    resDiv.innerHTML = html;
    if (targetInput === 'start' && window.autoSearchPending) { window.autoSearchPending = false; searchRoute(); }
}

// 【新增】點選推薦車站時，明確關閉自動模式，讓搜尋邏輯變為單一車站
function selectNearby(target, name) {
    document.getElementById(`${target}-station`).value = name;
    document.getElementById(`${target}-nearby-results`).innerHTML = "";
    if (target === 'start') {
        isUsingAutoLocation = false; // 既然你點了特定一個，就不再進行三站對決
        console.log("📍 已選擇特定車站，切換為精確模式");
    }
    searchRoute(); // 直接觸發搜尋
}

// ==========================================
// 6. 視覺化地圖選點 (Leaflet)
// ==========================================
function openMapPicker(targetInput) {
    currentMapTarget = targetInput;
    document.getElementById("map-modal").style.display = "flex";
    
    // 預設中心點 (可根據 currentRegion 判斷，這裡簡化為香港)
    let defaultCenter = [22.3193, 114.1694]; 
    if (currentRegion === 'twp') defaultCenter = [25.0478, 121.5170]; 
    if (currentRegion === 'sz') defaultCenter = [22.5431, 114.0579];

    if (!mapInstance) {
        mapInstance = L.map('map-container').setView(defaultCenter, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
        mapInstance.on('click', (e) => {
            if (currentMarker) currentMarker.setLatLng(e.latlng);
            else currentMarker = L.marker(e.latlng).addTo(mapInstance);
            document.getElementById("confirm-map-btn").disabled = false;
            document.getElementById("confirm-map-btn").onclick = () => {
                closeMapPicker(); // 使用獨立函數關閉
                processLocationToStations(e.latlng.lat, e.latlng.lng, currentMapTarget);
            };
        });
    } else {
        mapInstance.setView(defaultCenter, 13);
        if (currentMarker) {
            mapInstance.removeLayer(currentMarker);
            currentMarker = null;
        }
        document.getElementById("confirm-map-btn").disabled = true;
    }
    setTimeout(() => mapInstance.invalidateSize(), 100);
}

// 【補回的關閉地圖函數】
function closeMapPicker() {
    document.getElementById("map-modal").style.display = "none";
}

// ==========================================
// 7. 預估車程時間引擎 (物理距離 + 路線速限)
// ==========================================
const LINE_SPEEDS = {
    // 【香港 HK】
    "東涌綫": 80, "機場快綫": 80,
    "東鐵綫": 50, "屯馬綫": 50, "落馬洲支綫": 50, "馬場支綫": 50,
    "荃灣綫": 33, "觀塘綫": 33, "港島綫": 33, "將軍澳綫": 33, "康城支綫": 33, "南港島綫": 33, "迪士尼綫": 33,
    
    // 【台灣 TWP】 
    "桃園機場線": 60, "文湖線": 30, "環狀線": 30,

    // 【深圳 SZ】 
    "11號線": 60, "14號線": 60,

    // 步行速度 (站外轉乘)
    "站外轉乘": 4
};

function calculateEstimatedTime(path) {
    let totalMinutes = 0;

    for (let i = 1; i < path.length; i++) {
        const prevNode = path[i - 1];
        const currNode = path[i];

        const coords1 = metroStations.coordinates[prevNode.station];
        const coords2 = metroStations.coordinates[currNode.station];

        if (coords1 && coords2) {
            // 利用 Haversine 計算物理距離 (公尺轉公里)
            // (注意：因為我們上面的 calculateHaversine 拿掉了，這裡補上一個迷你的計算公式)
            const R = 6371; 
            const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
            const dLon = (coords2.lng - coords1.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(coords1.lat*Math.PI/180)*Math.cos(coords2.lat*Math.PI/180)*Math.sin(dLon/2)**2;
            const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

            let speed = LINE_SPEEDS[currNode.line] || 35; 
            totalMinutes += (distKm / speed) * 60;
        }

        // 常數緩衝：停站與轉乘
        if (i < path.length - 1) {
            const nextNode = path[i + 1];
            if (currNode.line !== nextNode.line) {
                totalMinutes += 4; // 換線加 4 分鐘
            } else {
                totalMinutes += 1; // 停靠加 1 分鐘
            }
        }
    }
    
    return Math.ceil(totalMinutes); 
}