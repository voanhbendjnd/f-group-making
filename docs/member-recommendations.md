# Gợi ý thành viên và nhóm (Spring backend)

Hai API `recommended-students` và `recommended-groups` dùng chung
`GroupRecommendationPolicy`. Đây là điểm xếp hạng theo cấu trúc ngành của nhóm,
không phải xác suất phù hợp, điểm năng lực hay điểm hoàn thành nhóm.

## Điều kiện trước khi chấm điểm

- Chỉ xét sinh viên chưa có nhóm trong lớp và đợt sắp nhóm hiện tại.
- Không gợi ý vào nhóm đầy hoặc vượt số ngành tối đa đang bật.
- Sau khi thêm ứng viên, phải tồn tại một cách chọn thêm sinh viên từ danh sách
  chưa có nhóm để đạt mọi điều kiện tối thiểu về sĩ số, SE và số ngành, đồng thời
  không vượt các giới hạn đang bật. Một sinh viên SE thuộc ngành mới có thể đáp ứng
  cả điều kiện SE lẫn đa ngành.
- Gợi ý thành viên cho giảng viên hỗ trợ nhóm OPEN/REVOKED; gợi ý nhóm cho sinh viên
  chỉ xét OPEN. Các điều kiện truy cập và quy định tham gia vẫn được kiểm tra ở API lưu.
- Luật đã tắt không được dùng để cộng điểm đạt ngưỡng hoặc giữ chỗ.

Kiểm tra khả năng hoàn thành dùng quy hoạch động theo nguồn sinh viên từng ngành,
không liệt kê mọi tập con sinh viên. Các ứng viên cùng ngành và cùng trạng thái SE
dùng chung kết quả kiểm tra trong một lần gọi API. Mỗi lần gọi đọc lại thành viên
và danh sách chưa có nhóm hiện tại; không lưu điểm vào database.

## Công thức

| Thành phần | Điểm |
| --- | ---: |
| Điểm nền | 30 |
| Ứng viên SE và nhóm còn thiếu SE theo luật đang bật | +35 |
| Ngành mới giúp nhóm tiến tới số ngành tối thiểu đang bật | +5 |
| Cân bằng ngành (ứng viên có majorId) | +round(25 / (1 + số thành viên cùng ngành hiện có)) |
| Nhóm chưa đạt sĩ số tối thiểu đang bật | +5 |

Tổng tối đa 100, không cắt trần một tổng điểm lớn hơn 100 gây mất phân biệt.
Ngành chưa có luôn nhận đủ 25 điểm cân bằng, kể cả khi đã đạt số ngành tối thiểu
hoặc luật số ngành tối thiểu đang tắt. Ngành chưa xác định không nhận điểm đa dạng.
Mô tả bản thân được trả về để xem hồ sơ nhưng không ảnh hưởng điểm.

Ví dụ luật mặc định, nhóm `SE + ENG` vẫn thiếu sĩ số: ứng viên MKT/GD được 60 điểm,
ứng viên SE/ENG được 48 điểm. Nếu một ngành đã có 2 người, ứng viên cùng ngành đó
được 43 điểm trong cùng điều kiện. Các ngành đều chưa có có thể bằng điểm nhau.

Bằng điểm thì xếp theo tên, rồi ID để thứ tự ổn định.

## Giới hạn

Kiểm tra khả năng hoàn thành chỉ xét một nhóm với nguồn sinh viên chưa có nhóm hiện
tại. Không giữ chỗ sinh viên hay bảo đảm mọi nhóm trong lớp đều hoàn thành đồng thời;
chức năng sắp nhóm tự động xử lý việc phân bổ toàn lớp. Một ứng viên không xuất hiện
trong gợi ý vẫn có thể được giảng viên xếp thủ công nếu thao tác đó hợp lệ.
