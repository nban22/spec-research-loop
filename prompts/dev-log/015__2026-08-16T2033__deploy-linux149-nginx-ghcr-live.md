---
stt: 015
timestamp: 2026-08-16T20:33+07:00
model: claude-opus-5
scope: [deploy, .github/workflows, backend/src/auth, backend/src/main.ts, README.md]
---

## Prompt
tôi sẽ cung cấp cho bạn 2 thứ, 1 là ssh linux149 để access vào linux server, dùng ở 2 folders \etc\nginx\sites-available\ (trong đó có file bus.booking bạn nên xóa nó, xóa cả link file của nó bên enabled-sites nhé, rồi tạo lại 2 file cho 2 domain backend và frontend nhé, api.dsa-bus-booking.io.vn và dsa-bus-booking.io.vn nhé, lấy domain làm filename luôn nhé, nhớ check ssl, certbot, link bên enable-sites các thứ, (về DNS tôi đã trỏ vào ip server đó rồi, bạn vui lòng check nhé) bypass vào port mà bạn mapping ra ngoài config ở docker-compose file nhé, docker compose file phải nằm ở 2 folder frontend và backend ở trong  \opt\outsource\spec-research-loop nhé, ở backend folder thì sẽ gồm .env file và docker-compose.yml file, còn frontend thì chỉ gồm docker-compose file, trong các workflow cũng sẽ có APP_DIR được set trong enviroment của repo được set bằng gh cli, dùng trong workflow cicd của github actions nhé
và tool gh cli, bạn cần tìm repo spec-research-loop để vào đó setup env gh action cần cho workflow sử dụng nhé, frontend thì chủ yếu setup ở đó, backend thì hầu như đọc trực tiếp từ .env file cùng level với docker-compose.yml nhé
về gh cli còn dùng để tạo PAT classis nữa nhé, rồi set trong Actions secrets and variables để sử dụng nhé, dùng cho linux149 có thể access để pull về, khi tạo cần set quyền read pack cho PAT đó nhé (và đọc các PAT khác để tuân theo convention name cho consistency nhé
về nginx trên linux149 thì cần tạo cơ bản với port 80 trước, rồi dùng certbot để set port 433 cho ssl nhé, nói chung dùng cli tối đa được càng tốt nhé, check kĩ nhé, 
đảm bảo work được deploy thành công cho tôi nhé
và bạn được phép chạy git add ., git commit, rồi git push liên tục nếu cần để test phần wrokflow nhé, github actions ấy, rồi nếu có lỗi cần dùng gh cli để check, rồi fix cho tôi nhé, đảm bảo work end to end cho tôi nhé, hosting được nhé, lỗi docker file thì check trên linux149 nhé, vào check container luôn nếu cần nhé

## Kết quả
Deploy thật lên linux149 (149.28.139.199) và chạy được end-to-end:
https://dsa-bus-booking.io.vn + https://api.dsa-bus-booking.io.vn.
Xoá `bus.booking` cùng symlink, tạo hai config nginx đặt tên theo domain, certbot cấp SSL cho cả
hai (apex mới, api dùng lại cert cũ), route `/jobs/*/stream` tắt buffer để SSE không bị giữ.
Compose tách hai thư mục ở `/opt/outsource/spec-research-loop/{backend,frontend}` (backend kèm
`.env` chmod 600), map cổng 8110/8111. Đặt secrets/variables bằng `gh` (environment
`production`, biến `APP_DIR`). Hai workflow chạy xanh: build → migrate → deploy.
Kiểm chứng bằng trình duyệt thật: đăng ký → cookie `Domain=.dsa-bus-booking.io.vn; Secure;
SameSite=Lax` → tạo project → job analyze 105s hoàn tất, SSE kết nối qua nginx, 0 lỗi console.
