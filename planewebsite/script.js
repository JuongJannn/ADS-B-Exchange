// Khởi tạo bản đồ
const map = L.map('map').setView([10.8, 106.6], 10); // Trung tâm ban đầu tại khu vực Thành phố Hồ Chí Minh
// Thêm lớp bản đồ OpenStreetMap chế độ tối
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
// Lưu trữ các đánh dấu máy bay và dữ liệu
const planeMarkers = {};
const planePaths = {};
const planeData = {};
const planePositionHistory = {};
const planeColors = {}; // Store fixed colors for each plane
const routePaths = {}; // Store route paths on the map

// Mảng màu sắc đẹp cho các đường bay
const predefinedColors = [
    '#FF5757', // Đỏ
    '#47A0FF', // Xanh dương
    '#FFD700', // Vàng
    '#32CD32', // Xanh lá
    '#8A2BE2', // Tím
    '#FF8C00', // Cam
    '#00CED1', // Xanh ngọc
    '#FF69B4', // Hồng
    '#7B68EE', // Tím nhạt
    '#00FF7F'  // Xanh lá nhạt
];
// Tham chiếu đến các phần tử DOM
const infoPanel = document.getElementById('info-panel');
const planeDetails = document.getElementById('plane-details');
const closePanel = document.getElementById('close-panel');
let selectedPlaneId = null;
// Hàm tạo biểu tượng máy bay xoay theo hướng bay
// Thêm -30 độ để điều chỉnh hướng biểu tượng máy bay
function createPlaneIcon(track) {
    return L.divIcon({
        html: `<div style="transform: rotate(${(track - 45) % 360}deg);">✈️</div>`,
        className: 'plane-icon',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}
// Hàm tạo nội dung popup cho máy bay
function createPopupContent(plane) {
    return `
        <div class="plane-popup">
            <h3>${plane.flight?.trim() || 'Unknown Flight'}</h3>
            <p><strong>Click for more details</strong></p>
        </div>
    `;
}
// Hàm lấy màu cho máy bay - đảm bảo mỗi máy bay có màu cố định
function getPlaneColor(planeId) {
    if (!planeColors[planeId]) {
        // Trước tiên kiểm tra xem có màu đã lưu trong localStorage không
        const savedColors = JSON.parse(localStorage.getItem('planeColors') || '{}');
        if (savedColors[planeId]) {
            planeColors[planeId] = savedColors[planeId];
        } else {
            // Gán một màu ngẫu nhiên từ danh sách cố định
            const colorIndex = Object.keys(planeColors).length % predefinedColors.length;
            planeColors[planeId] = predefinedColors[colorIndex];
           
            // Lưu màu mới vào savedColors
            savedColors[planeId] = planeColors[planeId];
            localStorage.setItem('planeColors', JSON.stringify(savedColors));
        }
    }
    return planeColors[planeId];
}
// Hàm lưu lịch sử vị trí vào localStorage
function savePositionHistory() {
    localStorage.setItem('planePositionHistory', JSON.stringify(planePositionHistory));
}
// Hàm tải lịch sử vị trí từ localStorage
function loadPositionHistory() {
    const savedHistory = JSON.parse(localStorage.getItem('planePositionHistory') || '{}');
    return savedHistory;
}
// Hàm tạo đường bay
function createFlightPath(positions, color) {
    if (positions.length < 2) return null;
   
    // Tạo đường bay với màu đồng nhất
    const polyline = L.polyline(positions, {
        weight: 4,
        opacity: 0.8,
        color: color
    }).addTo(map);
   
    return polyline;
}

// Hàm lấy thông tin máy bay từ API HexDB
async function fetchAircraftInfo(hex) {
    try {
        const response = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return { error: "Aircraft not found" };
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching aircraft info:', error);
        return null;
    }
}

// Hàm lấy thông tin lộ trình từ API HexDB
async function fetchRouteInfo(callsign) {
    if (!callsign || callsign.trim() === '' || callsign.toLowerCase() === 'unknown flight') {
        return null;
    }
    
    try {
        const response = await fetch(`https://hexdb.io/api/v1/route/icao/${callsign.trim()}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return { error: "Route not found" };
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching route info:', error);
        return null;
    }
}

// Hàm lấy thông tin sân bay từ API HexDB
async function fetchAirportInfo(icao) {
    if (!icao || icao.trim() === '') {
        return null;
    }
    
    try {
        const response = await fetch(`https://hexdb.io/api/v1/airport/icao/${icao.trim()}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return { error: "Airport not found" };
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching airport info:', error);
        return null;
    }
}


let lastHighlightedRoute = null;
let lastHighlightedPlaneHex = null;

async function highlightRouteAirports(route, planeId) {
    console.log("Highlighting airports for plane:", planeId);
    
    // Đảm bảo tất cả các điểm đánh dấu trước đó được xóa trước
    // Xóa TẤT CẢ các điểm đánh dấu lộ trình hiện có trước khi thêm mới
    clearRouteHighlightTracking();
    
    if (!route || !route.route) return null;
    
    // Phân tích sân bay từ lộ trình (định dạng: ORIG-DEST)
    const airports = route.route.split('-');
    if (airports.length !== 2) return null;
    
    const originIcao = airports[0];
    const destIcao = airports[1];
    
    try {
        const originInfo = await fetchAirportInfo(originIcao);
        const destInfo = await fetchAirportInfo(destIcao);
        
        if (!originInfo || !destInfo || originInfo.error || destInfo.error) {
            return null;
        }
        
        const planeColor = getPlaneColor(planeId);
        const airportMarkers = [];
        
        const originMarker = L.circleMarker(
            [originInfo.latitude, originInfo.longitude], 
            {
                color: planeColor,
                fillColor: planeColor,
                fillOpacity: 0.3,
                radius: 10,
                weight: 2
            }
        ).addTo(map);
        
        // Thêm nhãn cho sân bay đầu
        const originLabel = L.divIcon({
            className: 'airport-label',
            html: `<div style="background-color: transparent; padding: 2px 5px; font-weight: bold; color: ${planeColor};">${originInfo.icao} - ${originInfo.airport}</div>`,
            iconAnchor: [0, 30]
        });
        
        const originLabelMarker = L.marker([originInfo.latitude, originInfo.longitude], {
            icon: originLabel,
            zIndexOffset: 1000
        }).addTo(map);
        
        // Tạo điểm đánh dấu cho sân bay đến
        const destMarker = L.circleMarker(
            [destInfo.latitude, destInfo.longitude], 
            {
                color: planeColor,
                fillColor: planeColor,
                fillOpacity: 0.3,
                radius: 10,
                weight: 2
            }
        ).addTo(map);
        
        // Thêm nhãn cho sân bay đến
        const destLabel = L.divIcon({
            className: 'airport-label',
            html: `<div style="background-color: transparent; padding: 2px 5px; font-weight: bold; color: ${planeColor};">${destInfo.icao} - ${destInfo.airport}</div>`,
            iconAnchor: [0, 30]
        });
        
        const destLabelMarker = L.marker([destInfo.latitude, destInfo.longitude], {
            icon: destLabel,
            zIndexOffset: 1000
        }).addTo(map);
        
        airportMarkers.push(originMarker, originLabelMarker, destMarker, destLabelMarker);
        
        routePaths[planeId] = airportMarkers;
        
        lastHighlightedRoute = route.route;
        lastHighlightedPlaneHex = planeId;
        
        return { origin: originInfo, destination: destInfo };
        
    } catch (error) {
        console.error('Error highlighting airports:', error);
        return null;
    }
}

// Xóa tất cả các điểm đánh dấu lộ trình
function clearRouteHighlightTracking() {
    Object.keys(routePaths).forEach(planeId => {
        if (routePaths[planeId]) {
            if (Array.isArray(routePaths[planeId])) {
                routePaths[planeId].forEach(marker => {
                    try {
                        map.removeLayer(marker);
                    } catch (e) {
                        console.error("Error removing marker:", e);
                    }
                });
            } else {
                try {
                    map.removeLayer(routePaths[planeId]);
                } catch (e) {
                    console.error("Error removing path:", e);
                }
            }
        }
    });
    
    Object.keys(routePaths).forEach(key => {
        delete routePaths[key];
    });
    
    // Xóa các biến theo dõi (sau khi xóa các lớp)
    lastHighlightedRoute = null;
    lastHighlightedPlaneHex = null;
}

async function updatePlaneDetailsPanel(plane) {
    const flightId = plane.flight?.trim() || 'Unknown Flight';
    
    // Lưu tất cả dữ liệu vào một đối tượng duy nhất để có thể xuất ra
    const panelData = {
        plane: plane,
        flightId: flightId,
        aircraftInfo: null,
        originInfo: null,
        destInfo: null,
        routeInfo: null
    };
    
    let detailsHTML = `<div class="plane-detail-header">
        <h3>${flightId}</h3>
        <p class="hex-code">ICAO: ${plane.hex.toUpperCase()}</p>
    </div>`;
    
    detailsHTML += `
    <div class="aircraft-image">
        <img src="placeholder-aircraft.jpg" class="placeholder-img" alt="Aircraft placeholder" />
        <img src="https://hexdb.io/hex-image?hex=${plane.hex}" 
             onerror="this.style.display='none'" 
             onload="this.previousElementSibling.style.display='none'" 
             alt="Aircraft ${plane.hex}" 
             class="plane-image real-image" />
    </div>`;
    
    detailsHTML += `
        <div class="data-section">
            <h4>Tracking Data</h4>
            <div class="data-row">
                <div class="data-label">Altitude:</div>
                <div class="data-value">${plane.altitude} ft</div>
            </div>
            <div class="data-row">
                <div class="data-label">Ground Speed:</div>
                <div class="data-value">${plane.speed} knots</div>
            </div>
            <div class="data-row">
                <div class="data-label">Heading:</div>
                <div class="data-value">${plane.track}°</div>
            </div>
            <div class="data-row">
                <div class="data-label">Latitude:</div>
                <div class="data-value">${plane.lat.toFixed(6)}°</div>
            </div>
            <div class="data-row">
                <div class="data-label">Longitude:</div>
                <div class="data-value">${plane.lon.toFixed(6)}°</div>
            </div>
            <div class="data-row">
                <div class="data-label">Last Updated:</div>
                <div class="data-value">${new Date().toLocaleTimeString()}</div>
            </div>
        </div>
    `;
    
    let aircraftInfoHTML = '';
    try {
        const aircraftInfo = await fetchAircraftInfo(plane.hex);
        
        if (aircraftInfo && !aircraftInfo.error) {
            panelData.aircraftInfo = aircraftInfo;
            
            aircraftInfoHTML = `<div class="separator"></div>
            <div class="data-section">
                <h4>Aircraft Details from hexdb.io</h4>`;
            
            // Thêm thông tin loại máy bay
            if (aircraftInfo.Type) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Type:</div>
                    <div class="data-value">${aircraftInfo.Type}</div>
                </div>`;
            }
            
            // Thêm hãng sản xuất
            if (aircraftInfo.Manufacturer) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Manufacturer:</div>
                    <div class="data-value">${aircraftInfo.Manufacturer}</div>
                </div>`;
            }
            
            // Thêm số đăng ký
            if (aircraftInfo.Registration) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Registration:</div>
                    <div class="data-value">${aircraftInfo.Registration}</div>
                </div>`;
            }
            
            // Thêm mã loại ICAO
            if (aircraftInfo.ICAOTypeCode) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">ICAO Type:</div>
                    <div class="data-value">${aircraftInfo.ICAOTypeCode}</div>
                </div>`;
            }
            
            // Thêm hãng vận hành/hãng hàng không
            if (aircraftInfo.RegisteredOwners) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Operator:</div>
                    <div class="data-value">${aircraftInfo.RegisteredOwners}</div>
                </div>`;
            }
            
            // Thêm mã quốc gia của hãng vận hành nếu có
            if (aircraftInfo.OperatorFlagCode) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Operator Code:</div>
                    <div class="data-value">${aircraftInfo.OperatorFlagCode}</div>
                </div>`;
            }
            
            aircraftInfoHTML += `</div>`;
        }
    } catch (error) {
        console.log("Could not fetch aircraft details: ", error);
    }
    
    // Thêm chi tiết máy bay ngay sau dữ liệu theo dõi
    detailsHTML += aircraftInfoHTML;
    
    // Thử lấy thông tin lộ trình nếu có mã chuyến bay
    if (flightId && flightId !== 'Unknown Flight') {
        try {
            const routeInfo = await fetchRouteInfo(flightId);
            
            if (routeInfo && !routeInfo.error && routeInfo.route) {
                panelData.routeInfo = routeInfo;
                
                clearRouteHighlightTracking();
                
                try {
                    console.log("Highlighting route:", routeInfo.route);
                    const airportsInfo = await highlightRouteAirports(routeInfo, plane.hex);
                    
                    lastHighlightedRoute = routeInfo.route;
                    lastHighlightedPlaneHex = plane.hex;
                } catch (highlightError) {
                    console.error("Error highlighting airports:", highlightError);
                }
                
                // Thêm thông tin lộ trình vào bảng điều khiển
                detailsHTML += `
                    <div class="separator"></div>
                    <div class="data-section">
                        <h4>Route Information</h4>
                        <div class="data-row">
                            <div class="data-label">Route:</div>
                            <div class="data-value">${routeInfo.route}</div>
                        </div>
                        <div class="data-row">
                            <div class="data-label">Updated:</div>
                            <div class="data-value">${new Date(routeInfo.updatetime * 1000).toLocaleString()}</div>
                        </div>
                    </div>
                `;
                
                // Phân tích sân bay từ lộ trình
                const airports = routeInfo.route.split('-');
                if (airports.length === 2) {
                    const originInfo = await fetchAirportInfo(airports[0]);
                    const destInfo = await fetchAirportInfo(airports[1]);
                    
                    panelData.originInfo = originInfo;
                    panelData.destInfo = destInfo;
                    
                    if (originInfo && !originInfo.error) {
                        detailsHTML += `
                            <div class="data-section airport-info">
                                <h4>Origin Airport</h4>
                                <div class="data-row">
                                    <div class="data-label">ICAO/IATA:</div>
                                    <div class="data-value">${originInfo.icao}/${originInfo.iata || 'N/A'}</div>
                                </div>
                                <div class="data-row">
                                    <div class="data-label">Name:</div>
                                    <div class="data-value">${originInfo.airport}</div>
                                </div>
                                <div class="data-row">
                                    <div class="data-label">Location:</div>
                                    <div class="data-value">${originInfo.region_name || 'N/A'}, ${originInfo.country_code || 'N/A'}</div>
                                </div>
                            </div>
                        `;
                    }
                    
                    if (destInfo && !destInfo.error) {
                        detailsHTML += `
                            <div class="data-section airport-info">
                                <h4>Destination Airport</h4>
                                <div class="data-row">
                                    <div class="data-label">ICAO/IATA:</div>
                                    <div class="data-value">${destInfo.icao}/${destInfo.iata || 'N/A'}</div>
                                </div>
                                <div class="data-row">
                                    <div class="data-label">Name:</div>
                                    <div class="data-value">${destInfo.airport}</div>
                                </div>
                                <div class="data-row">
                                    <div class="data-label">Location:</div>
                                    <div class="data-value">${destInfo.region_name || 'N/A'}, ${destInfo.country_code || 'N/A'}</div>
                                </div>
                            </div>
                        `;
                    }
                }
            }
        } catch (error) {
            console.log("Could not fetch route details: ", error);
        }
    }
    
    // Thêm nút xuất dữ liệu
    detailsHTML += `
        <div class="separator"></div>
        <div class="export-section">
            <button id="exportDataBtn" class="export-button">Export Flight Data</button>
        </div>
    `;
    
    planeDetails.innerHTML = detailsHTML;
    
    const style = document.createElement('style');
    style.textContent = `
        .aircraft-image {
            position: relative;
            width: 100%;
            text-align: center;
            margin: 10px 0;
            background: #f0f0f0;
            border-radius: 5px;
            overflow: hidden;
            height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .plane-image {
            max-width: 100%;
            max-height: 200px;
            object-fit: contain;
        }
        .placeholder-img {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.5;
            z-index: 1;
        }
        .real-image {
            position: relative;
            z-index: 2;
        }
        .export-section {
            margin: 15px 0;
            text-align: center;
        }
        .export-button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: background-color 0.3s;
        }
        .export-button:hover {
            background-color: #2980b9;
        }
    `;
    document.head.appendChild(style);
    
    if (!infoPanel.classList.contains('open')) {
        infoPanel.classList.add('open');
    }
    
    window.currentPanelData = panelData;
    
    // Thêm bộ lắng nghe sự kiện cho nút xuất dữ liệu
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function(event) {
            // Ngăn sự kiện lan lên bản đồ
            event.stopPropagation();
            
            const exportData = formatExportData(window.currentPanelData);
            downloadFlightData(exportData, panelData.flightId);
        });
    }

    planeDetails.addEventListener('click', function(event) {
        event.stopPropagation();
    });

    infoPanel.addEventListener('click', function(event) {
        event.stopPropagation();
    });
}

// Hàm định dạng dữ liệu để xuất
function formatExportData(panelData) {
    const timestamp = new Date().toLocaleString();

    const formattedData = {
        "flightDataExport": {
            "flightId": panelData.flightId,
            "generatedOn": timestamp,
            "aircraftInformation": {
                "flightId": panelData.flightId,
                "icaoHexCode": panelData.plane.hex.toUpperCase(),
                "altitude": panelData.plane.altitude,
                "groundSpeed": panelData.plane.speed,
                "heading": panelData.plane.track,
                "position": {
                    "latitude": panelData.plane.lat.toFixed(6),
                    "longitude": panelData.plane.lon.toFixed(6)
                }
            },
            "detailedAircraftInformation": panelData.aircraftInfo && !panelData.aircraftInfo.error ? {
                "type": panelData.aircraftInfo.Type || null,
                "manufacturer": panelData.aircraftInfo.Manufacturer || null,
                "registration": panelData.aircraftInfo.Registration || null,
                "icaoTypeCode": panelData.aircraftInfo.ICAOTypeCode || null,
                "operator": panelData.aircraftInfo.RegisteredOwners || null,
                "operatorCode": panelData.aircraftInfo.OperatorFlagCode || null
            } : null,
            "routeInformation": panelData.routeInfo && !panelData.routeInfo.error && panelData.routeInfo.route ? {
                "route": panelData.routeInfo.route,
                "updated": new Date(panelData.routeInfo.updatetime * 1000).toLocaleString()
            } : null,
            "originAirport": panelData.originInfo && !panelData.originInfo.error ? {
                "icao": panelData.originInfo.icao,
                "iata": panelData.originInfo.iata || 'N/A',
                "name": panelData.originInfo.airport,
                "location": {
                    "region": panelData.originInfo.region_name || 'N/A',
                    "country": panelData.originInfo.country_code || 'N/A'
                }
            } : null,
            "destinationAirport": panelData.destInfo && !panelData.destInfo.error ? {
                "icao": panelData.destInfo.icao,
                "iata": panelData.destInfo.iata || 'N/A',
                "name": panelData.destInfo.airport,
                "location": {
                    "region": panelData.destInfo.region_name || 'N/A',
                    "country": panelData.destInfo.country_code || 'N/A'
                }
            } : null,
            "flightInformation": panelData.distance ? {
                "distance": Math.round(panelData.distance),
                "estimatedFlightTime": estimateFlightTime(panelData.distance, panelData.plane.speed)
            } : null
        }
    };

    return formattedData;
}


// Hàm tải dữ liệu đã định dạng về dưới dạng tệp JSON
function downloadFlightData(data, flightId) {
    const jsonData = JSON.stringify(data, null, 2);  // Pretty print with indentation
    
    const safeFlightId = (flightId || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `flight_data_${safeFlightId}_${Date.now()}.json`;

    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

// Hàm lấy dữ liệu từ API
async function fetchPlaneData() {
    try {
        console.log('Trying to fetch data.json...');
        const response = await fetch('data.json');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Successfully loaded data:', data);
        
        const currentSelectedId = selectedPlaneId;
        const currentHighlightedRoute = lastHighlightedRoute;
        const currentHighlightedPlaneHex = lastHighlightedPlaneHex;
        
        const isPollingUpdate = true;
        
        updatePlanes(data, isPollingUpdate);
        
        if (currentSelectedId && currentHighlightedRoute && 
            planeData[currentSelectedId] && 
            (!routePaths[currentSelectedId] || Object.keys(routePaths).length === 0)) {
            
            console.log("Re-highlighting route after data update");
            const routeObj = { route: currentHighlightedRoute };
            await highlightRouteAirports(routeObj, currentSelectedId);
        }
    } catch (error) {
        console.error('Error fetching plane data:', error);
        if (Object.keys(planePositionHistory).length > 0) {
            Object.keys(planePositionHistory).forEach(planeId => {
                const positions = planePositionHistory[planeId];
                if (positions && positions.length > 1) {
                    if (planePaths[planeId]) {
                        map.removeLayer(planePaths[planeId]);
                    }
                    planePaths[planeId] = createFlightPath(positions, getPlaneColor(planeId));
                }
            });
        }
    }
}

function setupDataPolling(intervalSeconds = 10) {
    console.log(`Setting up data polling every ${intervalSeconds} seconds`);
    
    fetchPlaneData().catch(error => {
        console.error('Initial data fetch failed:', error);
    });
    
    const pollingIntervalId = setInterval(() => {
        fetchPlaneData().catch(error => {
            console.error('Polling data fetch failed:', error);
        });
    }, intervalSeconds * 1000);
    
    return pollingIntervalId;
}

function setupPlaneSelection() {
    console.log('Setting up plane selection handling');
    
    map.on('click', function() {
        if (infoPanel.classList.contains('open')) {
            infoPanel.classList.remove('open');
            
            selectedPlaneId = null;
            
            clearRouteHighlightTracking();
        }
    });
    
    if (closePanel) {
        closePanel.addEventListener('click', function(event) {
            event.stopPropagation();
            
            infoPanel.classList.remove('open');
            
            selectedPlaneId = null;
            
            clearRouteHighlightTracking();
        });
    }
    
let detailsPanelUpdateTimer = null;

function setupPlaneMarkerEvents(marker, planeId, planeObject) {
    marker.on('click', async function(e) {
        L.DomEvent.stopPropagation(e);
        
        console.log('Plane clicked:', planeId);
        
        selectedPlaneId = planeId;
        
        if (detailsPanelUpdateTimer) {
            clearTimeout(detailsPanelUpdateTimer);
        }
        
        infoPanel.classList.add('open');
        planeDetails.innerHTML = '<div class="loading">Loading flight details...</div>';
        
        detailsPanelUpdateTimer = setTimeout(async () => {
            await updatePlaneDetailsPanel(planeObject);
        }, 100);
    });
}
    
    window.setupPlaneMarkerEvents = setupPlaneMarkerEvents;
}

// Hàm cập nhật máy bay trên bản đồ
function updatePlanes(data, isPollingUpdate = false) {
    console.log(`Updating planes data with ${data.length} planes`);
    
    // Tạo một tập hợp các ID máy bay trong dữ liệu mới để theo dõi các máy bay bị xóa
    const activeIds = new Set();
    
    data.forEach(plane => {
        if (!plane.lat || !plane.lon || isNaN(plane.lat) || isNaN(plane.lon)) return;
        
        const planeId = plane.hex;
        activeIds.add(planeId);
        
        planeData[planeId] = plane;
        
        if (!planePositionHistory[planeId]) {
            planePositionHistory[planeId] = [];
        }
        
        const position = [plane.lat, plane.lon];
        const lastPositions = planePositionHistory[planeId];
        
        if (lastPositions.length === 0 ||
            lastPositions[lastPositions.length - 1][0] !== position[0] ||
            lastPositions[lastPositions.length - 1][1] !== position[1]) {
            planePositionHistory[planeId].push(position);
            savePositionHistory();
        }
        
        const planeColor = getPlaneColor(planeId);
        
        if (planePaths[planeId]) {
            map.removeLayer(planePaths[planeId]);
        }
        
        if (planePositionHistory[planeId].length > 1) {
            planePaths[planeId] = createFlightPath(planePositionHistory[planeId], planeColor);
        }
        
        if (planeMarkers[planeId]) {
            planeMarkers[planeId].setLatLng([plane.lat, plane.lon]);
            planeMarkers[planeId].setIcon(createPlaneIcon(plane.track || 0));
            planeMarkers[planeId].setPopupContent(createPopupContent(plane));
        } else {
            const newMarker = L.marker([plane.lat, plane.lon], {
                icon: createPlaneIcon(plane.track || 0),
                riseOnHover: true
            }).addTo(map);
            
            newMarker.bindPopup(createPopupContent(plane));
            
            if (window.setupPlaneMarkerEvents) {
                window.setupPlaneMarkerEvents(newMarker, planeId, plane);
            }
            
            planeMarkers[planeId] = newMarker;
        }
        
        if (planeId === selectedPlaneId && !isPollingUpdate) {
            updatePlaneDetailsPanel(plane);
        }
    });
    
    Object.keys(planeMarkers).forEach(planeId => {
        if (!activeIds.has(planeId)) {
            map.removeLayer(planeMarkers[planeId]);
            delete planeMarkers[planeId];
            
            if (planePaths[planeId]) {
                map.removeLayer(planePaths[planeId]);
                delete planePaths[planeId];
            }
            
            if (planeId === selectedPlaneId && !isPollingUpdate) {
                infoPanel.classList.remove('open');
                selectedPlaneId = null;
                clearRouteHighlightTracking();
            }
        }
    });
}

// Hàm ước tính thời gian bay
function estimateFlightTime(distance, speed) {
    if (!distance || !speed || speed < 10) return 'Unknown';
    
    const hours = distance / speed;
    
    const hoursWhole = Math.floor(hours);
    const minutesDecimal = (hours - hoursWhole) * 60;
    const minutes = Math.round(minutesDecimal);
    
    if (hoursWhole === 0) {
        return `${minutes} minutes`;
    } else if (hoursWhole === 1 && minutes === 0) {
        return '1 hour';
    } else if (minutes === 0) {
        return `${hoursWhole} hours`;
    } else {
        return `${hoursWhole} hours ${minutes} minutes`;
    }
}

// Khởi tạo ứng dụng
function initializeApp() {
    console.log('Initializing flight tracking application');
    
    const savedHistory = loadPositionHistory();
    if (savedHistory) {
        Object.keys(savedHistory).forEach(planeId => {
            planePositionHistory[planeId] = savedHistory[planeId];
        });
    }
    
    setupPlaneSelection();
    
    const pollingInterval = setupDataPolling(5);
    
    window.addEventListener('beforeunload', function() {
        savePositionHistory();
        
        clearInterval(pollingInterval);
    });
    
    console.log('Flight tracking application initialized');
}

// Khởi động ứng dụng khi DOM được tải đầy đủ
document.addEventListener('DOMContentLoaded', initializeApp);