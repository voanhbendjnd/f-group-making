# F Group Making

Hệ thống quản lý lớp, thiết lập quy định và hỗ trợ xếp nhóm sinh viên.

## Cấu trúc

```text
Client/                         React + TypeScript + Vite (FE)
server/                         Spring Boot + Gradle + Java 21 (BE)
  src/main/java/com/fmaking/     Mã nguồn Java
    FmakingApplication.java     Điểm khởi động Spring Boot
  src/test/java/com/fmaking/     Kiểm thử BE
  src/main/resources/           Cấu hình, bản dịch và template email
docs/                           Tài liệu và migration SQL
```

Package gốc BE là `com.fmaking`, dùng nhất quán cho package/import, JPQL, cấu hình và test. Gradle project có tên `server`, group `com.fmaking`.

## Chạy cục bộ

Từ thư mục gốc repository, khởi động MySQL/Redis nếu cần:

```powershell
docker compose -f server/docker-compose.yml up -d
```

Compose giữ tên project hạ tầng hiện có để tái sử dụng các container. Đường dẫn bind mount MySQL là `server/mysql_data`; khi đổi thư mục của repository cần dừng MySQL trước khi di chuyển dữ liệu và tạo lại container với đường dẫn mới.

Chạy BE trong một terminal:

```powershell
cd server
.\gradlew.bat bootRun
```

Giữ cấu hình BE cục bộ trong `server/src/main/resources/application.properties`; file này không đưa vào Git. Cấu hình FE cục bộ nằm ở `Client/.env`, tham khảo `Client/.env.example`. Các file cấu hình hiện có được giữ khi đổi tên thư mục.

Chạy FE trong terminal khác:

```powershell
cd Client
npm ci
npm run dev
```

FE chạy ở `http://localhost:3000`; Vite chuyển các request `/api` tới BE ở `http://localhost:8080`.

## Kiểm tra

```powershell
cd server
.\gradlew.bat clean test bootJar
```

```powershell
cd Client
npm run test -- --maxWorkers=2
npm run build
npm run lint
```

Test BE dùng cấu hình H2 riêng trong `server/src/test/resources/application.properties`.

Sau khi chuyển sang cấu trúc này, mở/import lại Gradle project tại `server` trong IDE và khởi động bằng `com.fmaking.FmakingApplication`. Cấu hình launch VS Code cục bộ đã được cập nhật sang điểm khởi động mới.

Tài liệu chức năng: [frontend](docs/frontend/README.md), [giảng viên và quy định nhóm](docs/frontend/11-giang-vien-va-quy-dinh-nhom.md).
