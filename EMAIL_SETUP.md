# Hướng dẫn cấu hình Email cho CodeAI

## Vấn đề: Gmail SMTP không hoạt động trên Render

Render Free tier **chặn các cổng SMTP** (587, 465) để tránh spam. Do đó bạn không thể dùng Gmail SMTP trực tiếp.

**Lỗi thường gặp:**
```
Network is unreachable
Connection refused
```

## Giải pháp: Dùng Brevo API (Miễn phí)

Brevo (trước đây là Sendinblue) cung cấp API gửi email qua HTTPS (port 443) - không bị chặn bởi Render.

### Bước 1: Tạo tài khoản Brevo

1. Truy cập: https://www.brevo.com
2. Đăng ký tài khoản miễn phí (Free: 300 email/ngày)
3. Xác thực email

### Bước 2: Lấy API Key

1. Đăng nhập vào Brevo
2. Vào **Settings** → **SMTP & API** → **API Keys**
3. Click **Create a new API key**
4. Đặt tên (ví dụ: "CodeAI")
5. Copy API key (dạng: `xkeysib-xxxxx...`)

### Bước 3: Verify Sender Email

1. Vào **Settings** → **Senders & IP**
2. Click **Add a sender**
3. Nhập email của bạn (ví dụ: `your-email@gmail.com`)
4. Click **Add**
5. Brevo sẽ gửi email xác thực → Click link trong email để verify

### Bước 4: Cấu hình trên Render

1. Vào dashboard Render của bạn
2. Chọn Web Service **codeaiweb**
3. Vào tab **Environment**
4. Thêm các biến môi trường:

```
BREVO_API_KEY=xkeysib-your-api-key-here
BREVO_SENDER_EMAIL=your-verified-email@gmail.com
BREVO_SENDER_NAME=CodeAI
```

5. Click **Save Changes**
6. Render sẽ tự động redeploy

### Bước 5: Cấu hình trong CodeAI

1. Truy cập trang web CodeAI của bạn
2. Vào **Setup/Cài đặt**
3. Phần **Email Configuration**:
   - Chọn **Provider**: `Brevo API`
   - Nhập **API Key** (từ Brevo)
   - Nhập **Sender Email** (email đã verify)
   - Nhập **Sender Name**: `CodeAI` (hoặc tên bạn muốn)
4. Click **Test Connection**
5. Nếu thành công → Click **Save**

## Kiểm tra

Thử đăng ký tài khoản mới hoặc gửi OTP. Bạn sẽ nhận được email từ Brevo.

## Giới hạn Free Tier

- **Brevo Free**: 300 email/ngày
- **Render Free**: App sleep sau 15 phút không hoạt động

## Nếu muốn dùng Gmail SMTP (chỉ cho localhost)

Gmail SMTP chỉ hoạt động khi chạy trên máy local:

1. Bật 2-Step Verification cho Gmail
2. Tạo App Password: https://myaccount.google.com/apppasswords
3. Trong CodeAI setup:
   - Chọn **Provider**: `Gmail SMTP`
   - Nhập Gmail và App Password
   - Click **Save**

**Lưu ý:** Gmail SMTP sẽ KHÔNG hoạt động trên Render, Heroku, Railway, hoặc các platform tương tự.
