# ADS-B-Exchange

**ADS-B-Exchange** là ứng dụng web theo dõi máy bay thời gian thực, hiển thị vị trí, lộ trình và thông tin chuyến bay trên bản đồ.

# Cài đặt

# Cách cài đặt và sử dụng Dump1090:
Các package cần cài đặt: librtlsdr-dev
- Clone git dump1090 về máy: https://github.com/antirez/dump1090/tree/master
- Trong terminal, cd vào thư mục dump1090 đã clone về
- Vào thư mục của dump1090 đã build, chạy lệnh make
- Sau khi make thành công, chạy lệnh ./dump1090 –net –interactive –aggressive để bắt đầu bắt các gói tin
Cách sử dụng code để gửi dữ liệu từ raspberry pi lên Amazon Iotcore:
- Kết nối thing raspberry pi lên Iotcore theo hướng dẫn của web
- Sau khi kết nối xong, nhận được file root-CA.crt, cert.perm và file private.key và tải về
- Thả 2 file này vào thư mục chứa code gửi dữ liệu
- Edit file code, thay tên của các file này vào giá trị CLIENT_CERT, PRIVATE_KEY, ROOT_CA.
- Edit CLIENT_ID Thành tên của thing Raspberry pi mà mình đặt trên Amazon Iotcore
- Vào terminal, cài đặt các package để chạy code: libssl-dev, awsiotsdk
- Quay lại Amazon Iot core, vào thing vừa thiết lập trên, vào tab “Device shadow” và tạo một Shadow tên là “connectivity”, edit Shadow document đó và thay nội dung trong đó bằng nội dung sau:
{
  "state": {
    "desired": {
      "welcome": "aws-iot",
      "connected": true
    },
    "reported": {
      "welcome": "aws-iot",
      "connected": true,
      "last_seen": ""
    }
  }
}
Và lưu
- Sau khi thực hiện các bước trên, vào terminal và cd vào thư mục chứa code gửi dữ liệu, chạy code bằng lệnh “python Start.py”, Sau khi chạy thành công nếu hiển thị “Connected to Aws Iot Core” và cập nhật trạng thái của Shadow và tiến hành gửi dữ liệu qua topic data/adsb-data, có thể kiểm tra qua Mqtt test client bằng cách subscribe vào topic trên

# Clone project và chạy trên web server cục bộ.

# Cấu trúc file
| File                      | Ghi chú           |
|---------------------------|--------------------|
| index.html                | Trang chính        |
| script.js                 | Logic JavaScript   |
| styles.css                | Giao diện CSS      |
| data.json                 | Dữ liệu chuyến bay |
| placeholder-aircraft.jpg  | Ảnh máy bay mặc định |
| fetchdata.py              | Fetch dữ liệu từ API |

# Sử dụng

- Theo dõi máy bay trực tiếp trên bản đồ
- Xem chi tiết chuyến bay khi nhấn vào máy bay
- Xuất dữ liệu chuyến bay ra file JSON

# Chức năng chính trong script.js
| Hàm                          | Mô tả                             |
|-----------------------------|-----------------------------------|
| fetchPlaneData()            | Lấy dữ liệu máy bay               |
| updatePlanes()              | Cập nhật máy bay và lộ trình      |
| updatePlaneDetailsPanel()   | Hiển thị chi tiết chuyến bay      |
| exportFlightData()          | Xuất dữ liệu JSON                 |

# Lưu ý khi sử dụng fetchdata.py

Người dùng **phải thay API key MQTT** trong file fetchdata.py bằng key riêng của mình để kết nối và lấy dữ liệu.

# Giấy phép

[MIT](https://choosealicense.com/licenses/mit/)
