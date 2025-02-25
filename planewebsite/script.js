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

// Tham chiếu đến các phần tử DOM
const infoPanel = document.getElementById('info-panel');
const planeDetails = document.getElementById('plane-details');
const closePanel = document.getElementById('close-panel');

// Hàm tạo biểu tượng máy bay xoay theo hướng bay
function createPlaneIcon(track) {
    return L.divIcon({
        html: `<div style="transform: rotate(${track}deg);">✈️</div>`,
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

// Hàm tạo đường bay với hiệu ứng gradient
function createFlightPath(positions, color) {
    if (positions.length < 2) return null;
    
    // Tăng độ dày của đường
    const polyline = L.polyline(positions, {
        className: 'flight-path',
        weight: 5,  // Tăng từ 3 lên 5
        opacity: 0.9,  // Tăng độ mờ một chút
        color: color || '#4287f5'  // Sử dụng màu được cung cấp hoặc màu xanh mặc định
    }).addTo(map);
    
    // Áp dụng hiệu ứng gradient sử dụng SVG
    const pathElement = polyline.getElement();
    if (pathElement) {
        // Tìm phần tử đường dẫn SVG
        const svgPath = pathElement.querySelector('path');
        if (svgPath) {
            // Áp dụng độ dày nét vẽ
            svgPath.setAttribute('stroke-width', '5');  // Tăng từ 3 lên 5
            
            // Cố gắng áp dụng gradient nếu SVG hỗ trợ trong ngữ cảnh này
            try {
                // Tạo gradient
                const gradientId = `gradient-${Math.floor(Math.random() * 1000000)}`;
                const svg = pathElement.closest('svg');
                
                if (svg) {
                    // Tạo phần tử gradient tuyến tính
                    const defs = svg.querySelector('defs') || svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
                    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
                    gradient.setAttribute('id', gradientId);
                    gradient.setAttribute('x1', '0%');
                    gradient.setAttribute('y1', '0%');
                    gradient.setAttribute('x2', '100%');
                    gradient.setAttribute('y2', '100%');
                    defs.appendChild(gradient);
                    
                    // Thêm các điểm dừng gradient với màu đã chỉ định hoặc màu dự phòng
                    const startColor = color || '#4287f5';  // Bắt đầu với màu được cung cấp hoặc màu xanh
                    const endColor = color ? shiftHue(color) : '#8c14fc';  // Tạo biến thể gradient
                    
                    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                    stop1.setAttribute('offset', '0%');
                    stop1.setAttribute('stop-color', startColor);
                    gradient.appendChild(stop1);
                    
                    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                    stop2.setAttribute('offset', '100%');
                    stop2.setAttribute('stop-color', endColor);
                    gradient.appendChild(stop2);
                    
                    // Áp dụng gradient cho đường dẫn
                    svgPath.setAttribute('stroke', `url(#${gradientId})`);
                }
            } catch (e) {
                console.log('Áp dụng gradient thất bại, sử dụng màu đơn thay thế', e);
            }
        }
    }
    
    return polyline;
}

// Hàm hỗ trợ để thay đổi màu sắc cho điểm cuối gradient
function shiftHue(hexColor) {
    // Chuyển đổi hex sang RGB
    let r = parseInt(hexColor.slice(1, 3), 16);
    let g = parseInt(hexColor.slice(3, 5), 16);
    let b = parseInt(hexColor.slice(5, 7), 16);
    
    // Thay đổi màu sắc đơn giản - tạo biến thể bổ sung
    // Đây là cách đơn giản để tạo màu liên quan nhưng khác biệt
    r = (r + 100) % 255;
    b = (b + 50) % 255;
    
    // Chuyển trở lại hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Hàm cập nhật chi tiết máy bay trong bảng điều khiển bên
function updatePlaneDetailsPanel(plane) {
    const flightId = plane.flight?.trim() || 'Unknown Flight';
    
    planeDetails.innerHTML = `
        <div class="plane-detail-header">
            <h3>${flightId}</h3>
            <p class="hex-code">ICAO: ${plane.hex.toUpperCase()}</p>
        </div>
        
        <div class="data-section">
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
    
    // Mở bảng nếu chưa mở
    if (!infoPanel.classList.contains('open')) {
        infoPanel.classList.add('open');
    }
}

// Hàm cập nhật các máy bay trên bản đồ
// Hàm cập nhật máy bay trên bản đồ
function updatePlanes(data) {
    // Theo dõi ID máy bay hiện có để xóa máy bay không còn xuất hiện
    const currentPlanes = new Set();
    
    data.forEach(plane => {
        const planeId = plane.hex;
        currentPlanes.add(planeId);
        
        // Lưu vị trí hiện tại
        if (!planePositionHistory[planeId]) {
            planePositionHistory[planeId] = [];
        }
        
        // Thêm vị trí mới vào lịch sử (tăng giới hạn để giữ vệt bay lâu hơn)
        planePositionHistory[planeId].push([plane.lat, plane.lon]);
        if (planePositionHistory[planeId].length > 200) {  // Tăng từ 50 lên 200
            planePositionHistory[planeId].shift();
        }
        
        // Lưu dữ liệu máy bay hiện tại
        planeData[planeId] = plane;
        
        if (planeMarkers[planeId]) {
            // Cập nhật đánh dấu hiện có
            planeMarkers[planeId].setLatLng([plane.lat, plane.lon]);
            planeMarkers[planeId].setIcon(createPlaneIcon(plane.track));
            
            // Cập nhật popup
            const popup = planeMarkers[planeId].getPopup();
            if (popup) {
                popup.setContent(createPopupContent(plane));
            }
            
            // Cập nhật đường bay
            if (planePaths[planeId]) {
                map.removeLayer(planePaths[planeId]);
            }
            
            // Sử dụng màu được chỉ định của máy bay cho đường bay
            planePaths[planeId] = createFlightPath(planePositionHistory[planeId], plane.color);
            
        } else {
            // Tạo đánh dấu mới
            const marker = L.marker([plane.lat, plane.lon], {
                icon: createPlaneIcon(plane.track)
            }).addTo(map);
            
            // Thêm popup
            marker.bindPopup(createPopupContent(plane));
            
            // Thêm trình xử lý sự kiện click để hiển thị chi tiết trong bảng bên
            marker.on('click', () => {
                updatePlaneDetailsPanel(plane);
                
                // Căn giữa bản đồ trên máy bay với một độ lệch nhỏ để tính đến bảng điều khiển
                const mapCenter = map.getCenter();
                const targetPoint = map.project([plane.lat, plane.lon], map.getZoom());
                const offsetX = infoPanel.offsetWidth / 6; // Một nửa ảnh hưởng của bảng đến trung tâm
                const newPoint = L.point(targetPoint.x - offsetX, targetPoint.y);
                const newCenter = map.unproject(newPoint, map.getZoom());
                
                map.panTo(newCenter);
            });
            
            // Lưu trữ đánh dấu
            planeMarkers[planeId] = marker;
            
            // Tạo đường bay với màu được chỉ định của máy bay
            planePaths[planeId] = createFlightPath(planePositionHistory[planeId], plane.color);
        }
    });
    
    // Xóa máy bay không còn trong dữ liệu
    Object.keys(planeMarkers).forEach(planeId => {
        if (!currentPlanes.has(planeId)) {
            map.removeLayer(planeMarkers[planeId]);
            delete planeMarkers[planeId];
            
            if (planePaths[planeId]) {
                map.removeLayer(planePaths[planeId]);
                delete planePaths[planeId];
            }
            
            delete planePositionHistory[planeId];
            delete planeData[planeId];
        }
    });
}

// Trình xử lý nút đóng bảng
closePanel.addEventListener('click', () => {
    infoPanel.classList.remove('open');
});

// Hàm lấy dữ liệu từ API
async function fetchPlaneData() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        updatePlanes(data);
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu máy bay:', error);
        
        // Nếu không thể lấy dữ liệu thực, sử dụng dữ liệu mẫu
        generateDemoData();
    }
}

// Chuyển động đáng chú ý hơn cho mục đích demo
let demoCounter = 0;
function generateDemoData() {
    demoCounter++;
    
    // Xác định màu sắc duy nhất cho mỗi quỹ đạo máy bay
    const planeColors = {
        '8b8097': '#FF5733', // Màu đỏ-cam cho máy bay đầu tiên
        '76d24b': '#33A1FF', // Màu xanh cho máy bay thứ hai
        'a1b2c3': '#33FF57', // Màu xanh lá cho máy bay thứ ba
        'd4e5f6': '#D433FF'  // Màu tím cho máy bay thứ tư
    };
    
    // Tạo đường thẳng bằng cách sử dụng điểm bắt đầu/kết thúc cố định và nội suy
    const exampleData = [
        {
            "hex": "8b8097", 
            "flight": "VJC274 ", 
            // Đường thẳng từ tây bắc đến đông nam
            "lat": 11.1 - (demoCounter * 0.01), // Di chuyển về phía nam
            "lon": 106.2 + (demoCounter * 0.01), // Di chuyển về phía đông
            "altitude": 10325,
            "track": 135, // Hướng đông nam (luôn hướng theo hướng bay)
            "speed": 294,
            "color": planeColors['8b8097']
        },
        {
            "hex": "76d24b", 
            "flight": "TGW305 ", 
            // Đường thẳng từ đông bắc đến tây nam
            "lat": 11.0 - (demoCounter * 0.008),  // Di chuyển về phía nam
            "lon": 106.9 - (demoCounter * 0.008), // Di chuyển về phía tây
            "altitude": 3750,
            "track": 225, // Hướng tây nam (luôn hướng theo hướng bay)
            "speed": 274,
            "color": planeColors['76d24b']
        },
        {
            "hex": "a1b2c3", 
            "flight": "SIA123 ", 
            // Đường thẳng từ đông sang tây
            "lat": 10.6, // Vĩ độ không đổi
            "lon": 107.0 - (demoCounter * 0.012), // Di chuyển về phía tây
            "altitude": 8500,
            "track": 270, // Hướng tây (luôn hướng theo hướng bay)
            "speed": 320,
            "color": planeColors['a1b2c3']
        },
        {
            "hex": "d4e5f6", 
            "flight": "UAL789 ", 
            // Đường thẳng từ nam đến bắc
            "lat": 10.3 + (demoCounter * 0.009), // Di chuyển về phía bắc
            "lon": 106.5, // Kinh độ không đổi
            "altitude": 6200,
            "track": 0, // Hướng bắc (luôn hướng theo hướng bay)
            "speed": 285,
            "color": planeColors['d4e5f6']
        }
    ];
    
    // Cập nhật máy bay trên bản đồ
    updatePlanes(exampleData);
}

// Tải dữ liệu ban đầu
generateDemoData(); // Sử dụng dữ liệu demo thay vì fetchPlaneData()

// Thiết lập cập nhật thường xuyên
setInterval(generateDemoData, 2000);  // Gọi trực tiếp demo để đảm bảo chuyển động