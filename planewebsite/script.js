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

// Function to fetch aircraft information from HexDB API
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

// Function to fetch route information from HexDB API
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

// Function to fetch airport information from HexDB API
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
    
    // IMPORTANT: Ensure all previous highlights are removed first
    // Clear ALL existing route highlights before adding new ones
    clearRouteHighlightTracking();
    
    // Now continue with creating new markers
    if (!route || !route.route) return null;
    
    // Parse airports from route (format: ORIG-DEST)
    const airports = route.route.split('-');
    if (airports.length !== 2) return null;
    
    const originIcao = airports[0];
    const destIcao = airports[1];
    
    try {
        // Fetch airport coordinates
        const originInfo = await fetchAirportInfo(originIcao);
        const destInfo = await fetchAirportInfo(destIcao);
        
        if (!originInfo || !destInfo || originInfo.error || destInfo.error) {
            return null;
        }
        
        const planeColor = getPlaneColor(planeId);
        const airportMarkers = [];
        
        // Create origin airport marker
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
        
        // Add label for origin airport
        const originLabel = L.divIcon({
            className: 'airport-label',
            html: `<div style="background-color: transparent; padding: 2px 5px; font-weight: bold; color: ${planeColor};">${originInfo.icao} - ${originInfo.airport}</div>`,
            iconAnchor: [0, 30]
        });
        
        const originLabelMarker = L.marker([originInfo.latitude, originInfo.longitude], {
            icon: originLabel,
            zIndexOffset: 1000
        }).addTo(map);
        
        // Create destination airport marker
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
        
        // Add label for destination airport
        const destLabel = L.divIcon({
            className: 'airport-label',
            html: `<div style="background-color: transparent; padding: 2px 5px; font-weight: bold; color: ${planeColor};">${destInfo.icao} - ${destInfo.airport}</div>`,
            iconAnchor: [0, 30]
        });
        
        const destLabelMarker = L.marker([destInfo.latitude, destInfo.longitude], {
            icon: destLabel,
            zIndexOffset: 1000
        }).addTo(map);
        
        // Store all markers in the array
        airportMarkers.push(originMarker, originLabelMarker, destMarker, destLabelMarker);
        
        // Store the airport markers
        routePaths[planeId] = airportMarkers;
        
        // Update our cache of last highlighted route/plane
        lastHighlightedRoute = route.route;
        lastHighlightedPlaneHex = planeId;
        
        return { origin: originInfo, destination: destInfo };
        
    } catch (error) {
        console.error('Error highlighting airports:', error);
        return null;
    }
}

// Clear all route highlights - improved version
function clearRouteHighlightTracking() {
    // Remove all airport highlights from the map
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
    
    // Clear the routePaths object completely
    Object.keys(routePaths).forEach(key => {
        delete routePaths[key];
    });
    
    // Clear tracking variables (after removing the layers)
    lastHighlightedRoute = null;
    lastHighlightedPlaneHex = null;
}

async function updatePlaneDetailsPanel(plane) {
    const flightId = plane.flight?.trim() || 'Unknown Flight';
    
    // Store all data in a single object that will be accessible for export
    const panelData = {
        plane: plane,
        flightId: flightId,
        aircraftInfo: null,
        originInfo: null,
        destInfo: null,
        routeInfo: null
    };
    
    // Start with aircraft header
    let detailsHTML = `<div class="plane-detail-header">
        <h3>${flightId}</h3>
        <p class="hex-code">ICAO: ${plane.hex.toUpperCase()}</p>
    </div>`;
    
    // Add aircraft image at the top
    detailsHTML += `
    <div class="aircraft-image">
        <img src="placeholder-aircraft.jpg" class="placeholder-img" alt="Aircraft placeholder" />
        <img src="https://hexdb.io/hex-image?hex=${plane.hex}" 
             onerror="this.style.display='none'" 
             onload="this.previousElementSibling.style.display='none'" 
             alt="Aircraft ${plane.hex}" 
             class="plane-image real-image" />
    </div>`;
    
    // Add tracking data
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
    
    // Try to fetch additional aircraft information
    let aircraftInfoHTML = '';
    try {
        const aircraftInfo = await fetchAircraftInfo(plane.hex);
        
        if (aircraftInfo && !aircraftInfo.error) {
            // Store aircraft info in our data object
            panelData.aircraftInfo = aircraftInfo;
            
            // Add a separator
            aircraftInfoHTML = `<div class="separator"></div>
            <div class="data-section">
                <h4>Aircraft Details from hexdb.io</h4>`;
            
            // Add aircraft type information
            if (aircraftInfo.Type) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Type:</div>
                    <div class="data-value">${aircraftInfo.Type}</div>
                </div>`;
            }
            
            // Add manufacturer
            if (aircraftInfo.Manufacturer) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Manufacturer:</div>
                    <div class="data-value">${aircraftInfo.Manufacturer}</div>
                </div>`;
            }
            
            // Add registration
            if (aircraftInfo.Registration) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Registration:</div>
                    <div class="data-value">${aircraftInfo.Registration}</div>
                </div>`;
            }
            
            // Add ICAO type code
            if (aircraftInfo.ICAOTypeCode) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">ICAO Type:</div>
                    <div class="data-value">${aircraftInfo.ICAOTypeCode}</div>
                </div>`;
            }
            
            // Add operator/airline
            if (aircraftInfo.RegisteredOwners) {
                aircraftInfoHTML += `
                <div class="data-row">
                    <div class="data-label">Operator:</div>
                    <div class="data-value">${aircraftInfo.RegisteredOwners}</div>
                </div>`;
            }
            
            // Add operator flag code if available
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
    
    // Add aircraft details right after tracking data
    detailsHTML += aircraftInfoHTML;
    
    // Try to fetch route information if flight ID is available
    if (flightId && flightId !== 'Unknown Flight') {
        try {
            const routeInfo = await fetchRouteInfo(flightId);
            
            if (routeInfo && !routeInfo.error && routeInfo.route) {
                // Store route info in our data object
                panelData.routeInfo = routeInfo;
                
                // Always clear existing highlights first
                clearRouteHighlightTracking();
                
                // Then create new highlights
                try {
                    console.log("Highlighting route:", routeInfo.route);
                    const airportsInfo = await highlightRouteAirports(routeInfo, plane.hex);
                    
                    // Update our cache of last highlighted route/plane
                    lastHighlightedRoute = routeInfo.route;
                    lastHighlightedPlaneHex = plane.hex;
                } catch (highlightError) {
                    console.error("Error highlighting airports:", highlightError);
                    // Continue execution even if highlighting fails
                }
                
                // Add route information to the panel
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
                
                // Parse airports from route
                const airports = routeInfo.route.split('-');
                if (airports.length === 2) {
                    const originInfo = await fetchAirportInfo(airports[0]);
                    const destInfo = await fetchAirportInfo(airports[1]);
                    
                    // Store airport info in our data object
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
    
    // Add export button
    detailsHTML += `
        <div class="separator"></div>
        <div class="export-section">
            <button id="exportDataBtn" class="export-button">Export Flight Data</button>
        </div>
    `;
    
    // Update the panel with all information
    planeDetails.innerHTML = detailsHTML;
    
    // Add CSS for the image and airport labels
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
    
    // Open the info panel if it's not already open
    if (!infoPanel.classList.contains('open')) {
        infoPanel.classList.add('open');
    }
    
    // Store the panel data in a global variable so it can be accessed by the export function
    window.currentPanelData = panelData;
    
    // Add event listener for the export button
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function(event) {
            // Stop the event from bubbling up to the map
            event.stopPropagation();
            
            // Format and download the data
            const exportData = formatExportData(window.currentPanelData);
            downloadFlightData(exportData, panelData.flightId);
        });
    }

    planeDetails.addEventListener('click', function(event) {
        // Prevent clicks inside the panel from reaching the map
        event.stopPropagation();
    });

    // Make sure the info panel itself stops propagation
    infoPanel.addEventListener('click', function(event) {
        event.stopPropagation();
    });
}

// Function to format the data for export
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


// Function to download the formatted data as a JSON file
function downloadFlightData(data, flightId) {
    // Ensure the data is a JSON string
    const jsonData = JSON.stringify(data, null, 2);  // Pretty print with indentation
    
    // Sanitize flight ID for filename
    const safeFlightId = (flightId || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `flight_data_${safeFlightId}_${Date.now()}.json`;

    // Create a blob and download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    
    // Trigger download and clean up
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
        
        // Store the currently selected plane ID and route info before updating
        const currentSelectedId = selectedPlaneId;
        const currentHighlightedRoute = lastHighlightedRoute;
        const currentHighlightedPlaneHex = lastHighlightedPlaneHex;
        
        // Flag to prevent re-drawing airport highlights during polling
        const isPollingUpdate = true;
        
        // Update planes data
        updatePlanes(data, isPollingUpdate);
        
        // If we have a selected plane with a highlighted route, ensure it stays highlighted
        if (currentSelectedId && currentHighlightedRoute && 
            planeData[currentSelectedId] && 
            (!routePaths[currentSelectedId] || Object.keys(routePaths).length === 0)) {
            
            console.log("Re-highlighting route after data update");
            // Re-create the route object from stored data
            const routeObj = { route: currentHighlightedRoute };
            await highlightRouteAirports(routeObj, currentSelectedId);
        }
    } catch (error) {
        console.error('Error fetching plane data:', error);
        // Vẫn hiển thị máy bay đã lưu nếu có lỗi
        if (Object.keys(planePositionHistory).length > 0) {
            // Tạo lại tất cả đường bay từ lịch sử lưu trữ
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

// Set up data polling with configurable interval and error handling
function setupDataPolling(intervalSeconds = 10) {
    console.log(`Setting up data polling every ${intervalSeconds} seconds`);
    
    // Initial data fetch
    fetchPlaneData().catch(error => {
        console.error('Initial data fetch failed:', error);
    });
    
    // Set up polling interval
    const pollingIntervalId = setInterval(() => {
        fetchPlaneData().catch(error => {
            console.error('Polling data fetch failed:', error);
        });
    }, intervalSeconds * 1000);
    
    // Return the interval ID so it can be cleared if needed
    return pollingIntervalId;
}

// Function to handle plane selection and show/hide detail panel
function setupPlaneSelection() {
    console.log('Setting up plane selection handling');
    
    // Add click handler to the map for closing the panel
    map.on('click', function() {
        // When clicking on the map (but not on a plane), close the panel
        if (infoPanel.classList.contains('open')) {
            infoPanel.classList.remove('open');
            
            // If we had a selected plane, deselect it
            if (selectedPlaneId && planeMarkers[selectedPlaneId]) {
                // Reset marker style if needed
                const marker = planeMarkers[selectedPlaneId];
                if (marker) {
                    // Optional: Reset marker appearance if you're styling selected planes differently
                    // For example, if you change icon size or add a highlight
                }
            }
            
            // Clear selected plane
            selectedPlaneId = null;
            
            // Clear route highlights
            clearRouteHighlightTracking();
        }
    });
    
    // Add click handler for the close button
    if (closePanel) {
        closePanel.addEventListener('click', function(event) {
            // Prevent event from reaching the map
            event.stopPropagation();
            
            // Close the panel
            infoPanel.classList.remove('open');
            
            // Clear selected plane
            selectedPlaneId = null;
            
            // Clear route highlights
            clearRouteHighlightTracking();
        });
    }
    
// Add at the top of your file
let detailsPanelUpdateTimer = null;

// In your setupPlaneMarkerEvents function
function setupPlaneMarkerEvents(marker, planeId, planeObject) {
    marker.on('click', async function(e) {
        // Prevent the click from reaching the map
        L.DomEvent.stopPropagation(e);
        
        console.log('Plane clicked:', planeId);
        
        // Set as selected plane
        selectedPlaneId = planeId;
        
        // Clear any pending update
        if (detailsPanelUpdateTimer) {
            clearTimeout(detailsPanelUpdateTimer);
        }
        
        // Show a loading indicator in the panel immediately
        infoPanel.classList.add('open');
        planeDetails.innerHTML = '<div class="loading">Loading flight details...</div>';
        
        // Debounce the actual update
        detailsPanelUpdateTimer = setTimeout(async () => {
            await updatePlaneDetailsPanel(planeObject);
        }, 100);
    });
}
    
    // Expose the setup function so it can be used when adding new planes
    window.setupPlaneMarkerEvents = setupPlaneMarkerEvents;
}

// Function to update planes on the map
function updatePlanes(data, isPollingUpdate = false) {
    console.log(`Updating planes data with ${data.length} planes`);
    
    // Create a set of plane IDs in the new data for tracking removed planes
    const activeIds = new Set();
    
    data.forEach(plane => {
        // Skip planes with invalid coordinates
        if (!plane.lat || !plane.lon || isNaN(plane.lat) || isNaN(plane.lon)) return;
        
        // Create a unique ID for the plane
        const planeId = plane.hex;
        activeIds.add(planeId);
        
        // Cache plane data
        planeData[planeId] = plane;
        
        // Update position history - working with the constant object
        // We can't reassign planePositionHistory but we can modify its contents
        if (!planePositionHistory[planeId]) {
            // Create a new array for this plane ID
            planePositionHistory[planeId] = [];
        }
        
        const position = [plane.lat, plane.lon];
        const lastPositions = planePositionHistory[planeId];
        
        // Only add new position if it's different from the last one
        if (lastPositions.length === 0 ||
            lastPositions[lastPositions.length - 1][0] !== position[0] ||
            lastPositions[lastPositions.length - 1][1] !== position[1]) {
            // Add to the existing array (not reassigning)
            planePositionHistory[planeId].push(position);
            savePositionHistory();
        }
        
        // Get the plane's color
        const planeColor = getPlaneColor(planeId);
        
        // Update or create the flight path
        if (planePaths[planeId]) {
            map.removeLayer(planePaths[planeId]);
        }
        
        // Create a new path from position history
        if (planePositionHistory[planeId].length > 1) {
            planePaths[planeId] = createFlightPath(planePositionHistory[planeId], planeColor);
        }
        
        // Update or create the plane marker
        if (planeMarkers[planeId]) {
            // Update existing marker
            planeMarkers[planeId].setLatLng([plane.lat, plane.lon]);
            planeMarkers[planeId].setIcon(createPlaneIcon(plane.track || 0));
            planeMarkers[planeId].setPopupContent(createPopupContent(plane));
        } else {
            // Create new marker
            const newMarker = L.marker([plane.lat, plane.lon], {
                icon: createPlaneIcon(plane.track || 0),
                riseOnHover: true
            }).addTo(map);
            
            // Add popup
            newMarker.bindPopup(createPopupContent(plane));
            
            // Set up click event for the new marker
            if (window.setupPlaneMarkerEvents) {
                window.setupPlaneMarkerEvents(newMarker, planeId, plane);
            }
            
            planeMarkers[planeId] = newMarker;
        }
        
        // If this is the selected plane, we need to update its detail panel
        // But don't re-fetch all data and re-draw routes during polling updates
        if (planeId === selectedPlaneId && !isPollingUpdate) {
            updatePlaneDetailsPanel(plane);
        }
    });
    
    // Remove planes that are no longer in the data
    Object.keys(planeMarkers).forEach(planeId => {
        if (!activeIds.has(planeId)) {
            // Remove marker
            map.removeLayer(planeMarkers[planeId]);
            delete planeMarkers[planeId];
            
            // Remove path if it exists
            if (planePaths[planeId]) {
                map.removeLayer(planePaths[planeId]);
                delete planePaths[planeId];
            }
            
            // If this was the selected plane, close the info panel
            // But preserve airport highlights during polling updates
            if (planeId === selectedPlaneId && !isPollingUpdate) {
                infoPanel.classList.remove('open');
                selectedPlaneId = null;
                clearRouteHighlightTracking();
            }
        }
    });
}

// Function to estimate flight time
function estimateFlightTime(distance, speed) {
    if (!distance || !speed || speed < 10) return 'Unknown';
    
    // Calculate estimated time in hours
    const hours = distance / speed;
    
    // Convert to hours and minutes
    const hoursWhole = Math.floor(hours);
    const minutesDecimal = (hours - hoursWhole) * 60;
    const minutes = Math.round(minutesDecimal);
    
    // Format the time string
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

// Initialize the application
function initializeApp() {
    console.log('Initializing flight tracking application');
    
    // Load position history from localStorage
    const savedHistory = loadPositionHistory();
    if (savedHistory) {
        // Can't reassign planePositionHistory, so we need to merge the data
        Object.keys(savedHistory).forEach(planeId => {
            planePositionHistory[planeId] = savedHistory[planeId];
        });
    }
    
    // Set up plane selection
    setupPlaneSelection();
    
    // Start polling for data (every 5 seconds)
    const pollingInterval = setupDataPolling(5);
    
    // Set up a DOM event listener for when the window is closing
    window.addEventListener('beforeunload', function() {
        // Save position history before closing
        savePositionHistory();
        
        // Clean up polling interval
        clearInterval(pollingInterval);
    });
    
    console.log('Flight tracking application initialized');
}

// Start the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);