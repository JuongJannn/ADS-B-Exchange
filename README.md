# ADS-B-Exchange

**ADS-B-Exchange** là ứng dụng web theo dõi máy bay thời gian thực, hiển thị vị trí, lộ trình và thông tin chuyến bay trên bản đồ.

# Cài đặt

Clone project và chạy trên web server cục bộ.

# Cấu trúc file
| index.html |
| script.js |
| styles.css |
| data.json |
| placeholder-aircraft.jpg |
| fetchdata.py |

# Sử dụng

- Theo dõi máy bay trực tiếp trên bản đồ
- Xem chi tiết chuyến bay khi nhấn vào máy bay
- Xuất dữ liệu chuyến bay ra file JSON

# Chức năng chính trong script.js
| fetchPlaneData() // Lấy dữ liệu máy bay |
| updatePlanes() // Cập nhật máy bay và lộ trình |
| updatePlaneDetailsPanel() // Hiển thị chi tiết chuyến bay |
| exportFlightData() // Xuất dữ liệu JSON |

# Lưu ý khi sử dụng fetchdata.py

Người dùng **phải thay API key MQTT** trong file fetchdata.py bằng key riêng của mình để kết nối và lấy dữ liệu.

# Giấy phép

[MIT](https://choosealicense.com/licenses/mit/)
