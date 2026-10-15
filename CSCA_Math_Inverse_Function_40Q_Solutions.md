# HƯỚNG DẪN GIẢI CHI TIẾT & PHÂN TÍCH BẪY (TRAP ANALYSIS)
## CHUYÊN ĐỀ ĐẶC BIỆT: HÀM SỐ NGƯỢC (INVERSE FUNCTION)
**Mã đề thi:** CSCA-MATH-02  
**Quy chế:** Chuẩn giải toán tính tay không dùng máy tính bỏ túi (CSCA No-Calculator Standard)  

---

## BẢNG ĐÁP ÁN NHANH (ANSWER KEY)

| Câu | Đ/A | Câu | Đ/A | Câu | Đ/A | Câu | Đ/A |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | **B** | **11** | **A** | **21** | **B** | **31** | **A** |
| **2** | **C** | **12** | **D** | **22** | **C** | **32** | **D** |
| **3** | **A** | **13** | **B** | **23** | **A** | **33** | **B** |
| **4** | **D** | **14** | **C** | **24** | **D** | **34** | **C** |
| **5** | **B** | **15** | **A** | **25** | **B** | **35** | **A** |
| **6** | **C** | **16** | **D** | **26** | **C** | **36** | **D** |
| **7** | **A** | **17** | **B** | **27** | **A** | **37** | **B** |
| **8** | **D** | **18** | **C** | **28** | **D** | **38** | **C** |
| **9** | **B** | **19** | **A** | **29** | **B** | **39** | **A** |
| **10**| **C** | **20** | **D** | **30** | **C** | **40** | **D** |

---

## HƯỚNG DẪN GIẢI CHI TIẾT TỪNG CÂU

### Câu 1
- **Phương pháp tính tay:**  
  Từ phương trình $y = 3x - 2$, ta biểu diễn $x$ theo $y$:  
  $3x = y + 2 \Leftrightarrow x = \dfrac{y + 2}{3}$.  
  Hoán đổi vai trò của $x$ và $y$, ta được hàm số ngược: $f^{-1}(x) = \dfrac{x + 2}{3}$.
- **Phân tích bẫy:** Thí sinh nhầm dấu khi chuyển vế thành $\dfrac{x - 2}{3}$ hoặc nhầm hàm ngược với phân thức nghịch đảo $\dfrac{1}{f(x)}$.
- **Chọn B.**

### Câu 2
- **Phương pháp tính tay:**  
  Áp dụng tính chất cơ bản của hàm số ngược: $f^{-1}(b) = a \Leftrightarrow f(a) = b$.  
  Đặt $f^{-1}(11) = x_0 \Leftrightarrow f(x_0) = 11$.  
  Ta có phương trình: $2x_0 + 5 = 11 \Leftrightarrow 2x_0 = 6 \Leftrightarrow x_0 = 3$.
- **Phân tích bẫy:** Thí sinh tính nhầm $f(11) = 2(11) + 5 = 27$ (tính giá trị hàm gốc thay vì hàm ngược).
- **Chọn C.**

### Câu 3
- **Phương pháp tính tay:**  
  Xét phương trình: $y = \dfrac{x - 1}{x + 2}$ ($x \ne -2$).  
  Quy đồng khử mẫu: $y(x + 2) = x - 1 \Leftrightarrow yx + 2y = x - 1$.  
  Chuyển các số hạng chứa $x$ về một vế: $x(y - 1) = -2y - 1 \Leftrightarrow x = \dfrac{-2y - 1}{y - 1} = \dfrac{2y + 1}{1 - y}$.  
  Đổi biến $x$ thành $y$: $f^{-1}(x) = \dfrac{2x + 1}{1 - x}$ với điều kiện $x \ne 1$.
- **Phân tích bẫy:** Công thức tổng quát cho hàm phân thức $y = \dfrac{ax + b}{cx + d}$ là $f^{-1}(x) = \dfrac{-dx + b}{cx - a}$. Áp dụng với $a=1, b=-1, c=1, d=2$ ra ngay $\dfrac{-2x - 1}{x - 1} = \dfrac{2x + 1}{1 - x}$.
- **Chọn A.**

### Câu 4
- **Lý thuyết hình học CSCA:**  
  Nếu điểm $M(a; b)$ thuộc đồ thị hàm số $y = f(x)$ thì $b = f(a) \Leftrightarrow a = f^{-1}(b)$, nghĩa là điểm $M'(b; a)$ thuộc đồ thị hàm số ngược $y = f^{-1}(x)$.  
  Hai điểm $M(a; b)$ và $M'(b; a)$ luôn đối xứng nhau qua đường phân giác thứ nhất của góc phần tư thứ nhất và thứ ba, tức là đường thẳng $y = x$.
- **Chọn D.**

### Câu 5
- **Phương pháp tính tay:**  
  Từ $y = 2^{x - 1} + 3$, ta cô lập biểu thức chứa $x$:  
  $2^{x - 1} = y - 3$.  
  Vì $2^{x - 1} > 0$ nên điều kiện là $y - 3 > 0 \Leftrightarrow y > 3$.  
  Lấy logarit cơ số 2 hai vế: $x - 1 = \log_2(y - 3) \Leftrightarrow x = 1 + \log_2(y - 3)$.  
  Vậy hàm số ngược là $f^{-1}(x) = 1 + \log_2(x - 3)$ với $x > 3$.
- **Phân tích bẫy:** Bắt buộc phải có điều kiện $x > 3$ (tập xác định của hàm ngược chính là tập giá trị của hàm gốc).
- **Chọn B.**

### Câu 6
- **Phương pháp tính tay:**  
  Đặt $f^{-1}(2) = x \Leftrightarrow f(x) = 2$.  
  $\log_3(2x + 1) = 2 \Leftrightarrow 2x + 1 = 3^2 = 9 \Leftrightarrow 2x = 8 \Leftrightarrow x = 4$.
- **Phân tích bẫy:** Nhầm $3^2 = 6 \Rightarrow 2x = 5 \Rightarrow x = 5/2$.
- **Chọn C.**

### Câu 7
- **Phương pháp tính tay:**  
  Đồ thị $y = f(x)$ đi qua $A(2; -5) \Leftrightarrow f(2) = -5$.  
  Theo định nghĩa hàm ngược: $f^{-1}(-5) = 2$.  
  Điều này đồng nghĩa với việc đồ thị $y = f^{-1}(x)$ chắc chắn đi qua điểm $M(-5; 2)$.
- **Chọn A.**

### Câu 8
- **Phương pháp tính tay:**  
  Xét $y = \sqrt{2x - 4}$. Vì căn bậc hai luôn không âm nên $y \ge 0$.  
  Bình phương hai vế: $y^2 = 2x - 4 \Leftrightarrow 2x = y^2 + 4 \Leftrightarrow x = \dfrac{y^2 + 4}{2}$.  
  Hoán đổi biến: $f^{-1}(x) = \dfrac{x^2 + 4}{2}$ kèm điều kiện bắt buộc $x \ge 0$.
- **Phân tích bẫy:** Rất nhiều thí sinh bỏ qua điều kiện $x \ge 0$ (Phương án A), nếu không có điều kiện $x \ge 0$ thì hàm số ngược sẽ sinh ra nhánh âm vô lý.
- **Chọn D.**

### Câu 9
- **Phương pháp tính tay:**  
  Ta có tính chất: $f^{-1}(3) = 1 \Leftrightarrow f(1) = 3$.  
  Thay $x = 1$ vào biểu thức hàm số $f(x)$:  
  $f(1) = \dfrac{a(1) + 1}{1 - 2} = \dfrac{a + 1}{-1} = -(a + 1)$.  
  Cho bằng 3: $-(a + 1) = 3 \Leftrightarrow a + 1 = -3 \Leftrightarrow a = -4$.
- **Chọn B.**

### Câu 10
- **Phương pháp tính tay:**  
  Từ $y = x^3 - 1$, ta có $x^3 = y + 1$.  
  Lấy căn bậc ba hai vế (căn bậc lẻ xác định trên toàn bộ $\mathbb{R}$):  
  $x = \sqrt[3]{y + 1}$.  
  Vậy $f^{-1}(x) = \sqrt[3]{x + 1}$.
- **Chọn C.**

### Câu 11
- **Phương pháp tính tay:**  
  Biến đổi hằng đẳng thức: $y = x^2 + 2x = (x + 1)^2 - 1$.  
  Suy ra $(x + 1)^2 = y + 1$.  
  Vì $x \ge -1$ nên $x + 1 \ge 0$. Do đó khi khai căn ta lấy **dấu dương**:  
  $x + 1 = \sqrt{y + 1} \Leftrightarrow x = -1 + \sqrt{y + 1} = \sqrt{y + 1} - 1$.  
  Tập giá trị của $f(x)$ với $x \ge -1$ là $y \ge -1$.  
  Vậy $f^{-1}(x) = \sqrt{x + 1} - 1$ với $x \ge -1$.
- **Chọn A.**

### Câu 12
- **Phương pháp tính tay:**  
  Tương tự: $(x + 1)^2 = y + 1$.  
  Nhưng ở đây điều kiện là $x \le -1 \Leftrightarrow x + 1 \le 0$.  
  Do đó khi khai căn ta phải lấy **dấu âm**:  
  $x + 1 = -\sqrt{y + 1} \Leftrightarrow x = -1 - \sqrt{y + 1} = -\sqrt{y + 1} - 1$.  
  Tập giá trị vẫn là $y \ge -1$.  
  Vậy $f^{-1}(x) = -\sqrt{x + 1} - 1$ với $x \ge -1$.
- **Phân tích bẫy:** Đây là một trong những câu bẫy kinh điển nhất của kỳ thi chuẩn hóa. Rất nhiều học sinh quên dấu trừ trước căn khi $x \le -1$.
- **Chọn D.**

### Câu 13
- **Phương pháp tính tay:**  
  Với hàm phân thức $f(x) = \dfrac{ax + b}{cx + d}$, hàm ngược là $f^{-1}(x) = \dfrac{-dx + b}{cx - a}$.  
  Để $f^{-1}(x) = f(x)$ thì đồng nhất hệ số ta phải có: $-d = a \Leftrightarrow a + d = 0$.  
  Ở đây $a = m, d = -5$.  
  Do đó: $m + (-5) = 0 \Leftrightarrow m = 5$.
- **Chọn B.**

### Câu 14
- **Phương pháp tính tay:**  
  $y = \dfrac{2x - 3}{x - 1} \Leftrightarrow y(x - 1) = 2x - 3 \Leftrightarrow yx - y = 2x - 3$.  
  $\Leftrightarrow x(y - 2) = y - 3 \Leftrightarrow x = \dfrac{y - 3}{y - 2}$.  
  Vậy $f^{-1}(x) = \dfrac{x - 3}{x - 2}$ với $x \ne 2$.
- **Chọn C.**

### Câu 15
- **Phương pháp tính tay:**  
  Tìm từng giá trị:  
  - $f^{-1}(7) = x_1 \Leftrightarrow 3^{x_1} - 2 = 7 \Leftrightarrow 3^{x_1} = 9 \Leftrightarrow x_1 = 2$.  
  - $f^{-1}(25) = x_2 \Leftrightarrow 3^{x_2} - 2 = 25 \Leftrightarrow 3^{x_2} = 27 \Leftrightarrow x_2 = 3$.  
  Vậy $T = x_1 + x_2 = 2 + 3 = 5$.
- **Chọn A.**

### Câu 16
- **Phương pháp tính tay:**  
  $y = -\sqrt{4 - x} + 1 \Leftrightarrow \sqrt{4 - x} = 1 - y$.  
  Điều kiện: $1 - y \ge 0 \Leftrightarrow y \le 1$.  
  Bình phương hai vế: $4 - x = (1 - y)^2 \Leftrightarrow x = 4 - (1 - y)^2 = 4 - (y - 1)^2$.  
  Đổi biến: $f^{-1}(x) = 4 - (x - 1)^2$ với điều kiện $x \le 1$.
- **Phân tích bẫy:** Thí sinh quên điều kiện $x \le 1$ của biến trong hàm ngược.
- **Chọn D.**

### Câu 17
- **Phương pháp tính tay:**  
  $y = 1 - 2\log_3(x + 2) \Leftrightarrow 2\log_3(x + 2) = 1 - y \Leftrightarrow \log_3(x + 2) = \dfrac{1 - y}{2}$.  
  Mũ hóa cơ số 3: $x + 2 = 3^{\frac{1 - y}{2}} \Leftrightarrow x = 3^{\frac{1 - y}{2}} - 2$.  
  Vậy $f^{-1}(x) = 3^{\frac{1 - x}{2}} - 2$.
- **Chọn B.**

### Câu 18
- **Phương pháp tính tay:**  
  - Tính $f^{-1}(4)$: Đặt $f(x) = 4$.  
    + Nếu $x \ge 0 \Rightarrow 2x = 4 \Leftrightarrow x = 2$ (thỏa mãn $x \ge 0$).  
    Vậy $f^{-1}(4) = 2$.  
  - Tính $f^{-1}(-2)$: Đặt $f(x) = -2$.  
    + Nếu $x < 0 \Rightarrow x + 1 = -2 \Leftrightarrow x = -3$ (thỏa mãn $x < 0$).  
    Vậy $f^{-1}(-2) = -3$.  
  Tổng: $P = 2 + (-3) = -1$.
- **Chọn C.**

### Câu 19
- **Phương pháp tính tay:**  
  $f^{-1}(x) = 14 \Leftrightarrow x = f(14)$.  
  Thay trực tiếp $x = 14$ vào hàm gốc:  
  $x = \sqrt[3]{2(14) - 1} = \sqrt[3]{28 - 1} = \sqrt[3]{27} = 3$.
- **Phân tích bẫy:** Học sinh đi tìm hàm ngược $f^{-1}(x)$ trước rồi giải phương trình mất nhiều thời gian; dùng tính chất $f^{-1}(x) = a \Leftrightarrow x = f(a)$ chỉ mất 5 giây tính nhẩm!
- **Chọn A.**

### Câu 20
- **Phương pháp tính tay:**  
  $A(3; 0) \in (C_f) \Leftrightarrow f(3) = 0 \Rightarrow f^{-1}(0) = 3 \Rightarrow (0; 3) \in (C_{f^{-1}})$. Điểm này nằm trên trục tung $Oy$.  
  $B(0; -2) \in (C_f) \Leftrightarrow f(0) = -2 \Rightarrow f^{-1}(-2) = 0 \Rightarrow (-2; 0) \in (C_{f^{-1}})$. Điểm này nằm trên trục hoành $Ox$.  
  Vậy đồ thị hàm ngược cắt $Ox, Oy$ lần lượt tại $(-2; 0)$ và $(0; 3)$.
- **Chọn D.**

### Câu 21
- **Phương pháp tính tay:**  
  Đặt $t = \sqrt{x} \ge 0$. Hàm số trở thành $y = \dfrac{t - 1}{t + 1} = 1 - \dfrac{2}{t + 1}$.  
  Vì $t \ge 0 \Rightarrow t + 1 \ge 1 \Rightarrow 0 < \dfrac{2}{t + 1} \le 2 \Rightarrow -1 \le y < 1$.  
  Biểu diễn $t$ theo $y$:  
  $y(t + 1) = t - 1 \Leftrightarrow t(1 - y) = 1 + y \Leftrightarrow t = \dfrac{1 + y}{1 - y}$.  
  Suy ra $x = t^2 = \left(\dfrac{1 + y}{1 - y}\right)^2$.  
  Vậy $f^{-1}(x) = \left(\dfrac{1 + x}{1 - x}\right)^2$ với $-1 \le x < 1$.
- **Chọn B.**

### Câu 22
- **Phương pháp tính tay:**  
  Nhận xét hằng đẳng thức bậc ba: $(x + 1)^3 = x^3 + 3x^2 + 3x + 1$.  
  Do đó: $y = (x + 1)^3 + 1 \Leftrightarrow (x + 1)^3 = y - 1$.  
  Khai căn bậc ba hai vế: $x + 1 = \sqrt[3]{y - 1} \Leftrightarrow x = \sqrt[3]{y - 1} - 1$.  
  Vậy $f^{-1}(x) = \sqrt[3]{x - 1} - 1$.
- **Chọn C.**

### Câu 23
- **Phương pháp tính tay:**  
  Đặt $y = \dfrac{e^x - e^{-x}}{2} \Leftrightarrow 2y = e^x - \dfrac{1}{e^x}$.  
  Quy đồng nhân với $e^x > 0$: $(e^x)^2 - 2y(e^x) - 1 = 0$.  
  Xem đây là phương trình bậc hai đối với $t = e^x > 0$:  
  $\Delta' = y^2 + 1 > 0$.  
  Hai nghiệm: $t = y \pm \sqrt{y^2 + 1}$.  
  Vì $\sqrt{y^2 + 1} > |y| \ge y$, nên nghiệm $y - \sqrt{y^2 + 1} < 0$ (loại).  
  Nghiệm nhận: $e^x = y + \sqrt{y^2 + 1}$.  
  Lấy logarit tự nhiên: $x = \ln(y + \sqrt{y^2 + 1})$.  
  Vậy $f^{-1}(x) = \ln(x + \sqrt{x^2 + 1})$.
- **Chọn A.**

### Câu 24
- **Phương pháp tính tay:**  
  $y = \dfrac{e^x + e^{-x}}{2}$ với $x \ge 0$.  
  Vì $x \ge 0$, theo AM-GM: $y \ge \sqrt{e^x \cdot e^{-x}} = 1$.  
  Tương tự: $(e^x)^2 - 2y(e^x) + 1 = 0$.  
  $\Delta' = y^2 - 1 \ge 0$ (do $y \ge 1$).  
  $e^x = y \pm \sqrt{y^2 - 1}$.  
  Vì $x \ge 0 \Rightarrow e^x \ge 1$. Mà $y - \sqrt{y^2 - 1} = \dfrac{1}{y + \sqrt{y^2 - 1}} \le 1$.  
  Do đó để $e^x \ge 1$ bắt buộc lấy dấu cộng: $e^x = y + \sqrt{y^2 - 1}$.  
  $\Rightarrow x = \ln(y + \sqrt{y^2 - 1})$.  
  Vậy $f^{-1}(x) = \ln(x + \sqrt{x^2 - 1})$ với $x \ge 1$.
- **Chọn D.**

### Câu 25
- **Phương pháp tính tay:**  
  Đạo hàm $f'(x) = 2x - 2 \ge 0$ với mọi $x \ge 1$, suy ra hàm số $f(x)$ đồng biến ngặt trên $[1; +\infty)$.  
  **Định lý quan trọng:** Nếu $f(x)$ là hàm số đồng biến thì mọi giao điểm của hai đồ thị $y = f(x)$ và $y = f^{-1}(x)$ đều nằm trên đường thẳng $y = x$.  
  Do đó tọa độ giao điểm là nghiệm của phương trình:  
  $f(x) = x \Leftrightarrow x^2 - 2x + 2 = x \Leftrightarrow x^2 - 3x + 2 = 0 \Leftrightarrow \begin{cases} x = 1 \\ x = 2 \end{cases}$ (cả hai đều $\ge 1$).  
  Vậy hai giao điểm là $(1; 1)$ và $(2; 2)$.
- **Chọn B.**

### Câu 26
- **Phương pháp tính tay:**  
  Hàm số $f(x) = -x^3$ là hàm số nghịch biến ngặt trên $\mathbb{R}$.  
  Hàm số ngược: $y = -x^3 \Leftrightarrow x^3 = -y \Leftrightarrow x = -\sqrt[3]{y} \Rightarrow f^{-1}(x) = -\sqrt[3]{x}$.  
  Xét phương trình hoành độ giao điểm:  
  $-x^3 = -\sqrt[3]{x} \Leftrightarrow x^3 = \sqrt[3]{x}$.  
  Lũy thừa bậc ba hai vế: $x^9 = x \Leftrightarrow x(x^8 - 1) = 0 \Leftrightarrow x(x^4 - 1)(x^4 + 1) = 0 \Leftrightarrow x \in \{-1; 0; 1\}$.  
  Vậy phương trình có đúng 3 nghiệm thực.  
- **Phân tích bẫy:** Rất nhiều thí sinh nhầm tưởng phương trình $f(x) = f^{-1}(x)$ luôn chỉ tương đương với $f(x) = x$ (dẫn đến nghiệm $x = 0$ duy nhất). Quy tắc này chỉ đúng khi hàm $f$ **đồng biến**; khi hàm $f$ **nghịch biến**, các giao điểm có thể nằm ngoài đường thẳng $y = x$ và đối xứng nhau qua $y = x$ (ở đây là $(1; -1)$ và $(-1; 1)$).
- **Chọn C.**

### Câu 27
- **Phương pháp tính tay:**  
  Từ $y = \log_2(x + \sqrt{x^2 + 1})$, mũ hóa: $x + \sqrt{x^2 + 1} = 2^y$ (1).  
  Nhân liên hợp tử mẫu: $\dfrac{(x + \sqrt{x^2 + 1})(\sqrt{x^2 + 1} - x)}{\sqrt{x^2 + 1} - x} = \dfrac{1}{\sqrt{x^2 + 1} - x} = 2^y$.  
  Suy ra $\sqrt{x^2 + 1} - x = \dfrac{1}{2^y} = 2^{-y}$ (2).  
  Lấy (1) trừ (2): $2x = 2^y - 2^{-y} \Leftrightarrow x = \dfrac{2^y - 2^{-y}}{2}$.  
  Vậy $f^{-1}(x) = \dfrac{2^x - 2^{-x}}{2}$.
- **Chọn A.**

### Câu 28
- **Phương pháp tính tay:**  
  $y = \sqrt{\dfrac{1 - x}{1 + x}} \ge 0$.  
  Bình phương: $y^2 = \dfrac{1 - x}{1 + x} \Leftrightarrow y^2(1 + x) = 1 - x \Leftrightarrow y^2 + xy^2 = 1 - x$.  
  $\Leftrightarrow x(1 + y^2) = 1 - y^2 \Leftrightarrow x = \dfrac{1 - y^2}{1 + y^2}$.  
  Vì $y \ge 0$, ta có $f^{-1}(x) = \dfrac{1 - x^2}{1 + x^2}$ với $x \ge 0$.
- **Chọn D.**

### Câu 29
- **Phương pháp tính tay:**  
  $y = \dfrac{2^x - 1}{2^x + 1} = 1 - \dfrac{2}{2^x + 1}$.  
  Vì $2^x > 0 \Rightarrow 2^x + 1 > 1 \Rightarrow 0 < \dfrac{2}{2^x + 1} < 2 \Rightarrow -1 < y < 1$.  
  Biểu diễn theo $y$: $y(2^x + 1) = 2^x - 1 \Leftrightarrow 2^x(1 - y) = 1 + y \Leftrightarrow 2^x = \dfrac{1 + y}{1 - y}$.  
  Lấy logarit: $x = \log_2\left(\dfrac{1 + y}{1 - y}\right)$.  
  Vậy $f^{-1}(x) = \log_2\left(\dfrac{1 + x}{1 - x}\right)$ với $-1 < x < 1$.
- **Chọn B.**

### Câu 30
- **Phương pháp tính tay:**  
  - Nhánh 1: Với $x \ge 0 \Rightarrow y = x^2 + 1 \ge 1$.  
    $x^2 = y - 1 \Rightarrow x = \sqrt{y - 1}$ (vì $x \ge 0$).  
  - Nhánh 2: Với $x < 0 \Rightarrow y = 2x + 1 < 1$.  
    $2x = y - 1 \Rightarrow x = \dfrac{y - 1}{2}$.  
  Gộp lại theo biến $x$:  
  $f^{-1}(x) = \begin{cases} \sqrt{x - 1} & (x \ge 1) \\ \dfrac{x - 1}{2} & (x < 1) \end{cases}$.
- **Chọn C.**

### Câu 31
- **Phương pháp tính tay:**  
  Công thức đạo hàm hàm ngược: $(f^{-1})'(y_0) = \dfrac{1}{f'(x_0)}$ với $f(x_0) = y_0$.  
  Đề bài cho $f(1) = 2 \Rightarrow x_0 = 1, y_0 = 2$.  
  Đạo hàm hàm gốc: $f'(x) = 3x^2 + 2$.  
  Tại $x_0 = 1$: $f'(1) = 3(1)^2 + 2 = 5$.  
  Do đó: $(f^{-1})'(2) = \dfrac{1}{f'(1)} = \dfrac{1}{5}$.
- **Chọn A.**

### Câu 32
- **Phương pháp tính tay:**  
  Đặt $t = 2x - 3 \Leftrightarrow 2x = t + 3 \Leftrightarrow x = \dfrac{t + 3}{2}$.  
  Thay vào đẳng thức: $f(t) = 4\left(\dfrac{t + 3}{2}\right) + 1 = 2(t + 3) + 1 = 2t + 7$.  
  Vậy $f(x) = 2x + 7$.  
  Tìm hàm ngược của $y = 2x + 7 \Leftrightarrow 2x = y - 7 \Leftrightarrow x = \dfrac{y - 7}{2}$.  
  Do đó $f^{-1}(x) = \dfrac{x - 7}{2}$.
- **Chọn D.**

### Câu 33
- **Phương pháp tính tay:**  
  Xét tính chẵn lẻ của hàm gốc $f(x)$:  
  $f(-x) = \log_a(-x + \sqrt{(-x)^2 + 1}) = \log_a(\sqrt{x^2 + 1} - x) = \log_a\left(\dfrac{1}{x + \sqrt{x^2 + 1}}\right) = -\log_a(x + \sqrt{x^2 + 1}) = -f(x)$.  
  Vậy $f(x)$ là hàm số lẻ trên $\mathbb{R}$.  
  **Tính chất:** Hàm số ngược của một hàm số lẻ (nếu tồn tại) luôn là một **hàm số lẻ**.
- **Chọn B.**

### Câu 34
- **Phương pháp tính tay:**  
  Xét các bước lặp đầu tiên:  
  - $f_1(x) = \dfrac{x}{\sqrt{1 + x^2}}$.  
  - $f_2(x) = f(f(x)) = \dfrac{\frac{x}{\sqrt{1+x^2}}}{\sqrt{1 + \frac{x^2}{1+x^2}}} = \dfrac{\frac{x}{\sqrt{1+x^2}}}{\sqrt{\frac{1+2x^2}{1+x^2}}} = \dfrac{x}{\sqrt{1 + 2x^2}}$.  
  Bằng quy nạp, ta có: $f_n(x) = \dfrac{x}{\sqrt{1 + nx^2}}$.  
  Để tìm $f_n^{-1}(x)$, giải phương trình $y = \dfrac{x}{\sqrt{1 + nx^2}}$:  
  $y^2(1 + nx^2) = x^2 \Leftrightarrow y^2 + n x^2 y^2 = x^2 \Leftrightarrow x^2(1 - ny^2) = y^2 \Leftrightarrow x^2 = \dfrac{y^2}{1 - ny^2}$.  
  Vì $x$ và $y$ luôn cùng dấu nên: $x = \dfrac{y}{\sqrt{1 - ny^2}}$ với điều kiện $1 - ny^2 > 0 \Leftrightarrow |y| < \dfrac{1}{\sqrt{n}}$.  
  Vậy $f_n^{-1}(x) = \dfrac{x}{\sqrt{1 - nx^2}}$ với $|x| < \dfrac{1}{\sqrt{n}}$.
- **Chọn C.**

### Câu 35
- **Phương pháp tính tay:**  
  Hàm số liên tục tại $x = 0$ vì $\lim_{x \to 0^+} f(x) = \lim_{x \to 0^-} f(x) = f(0) = 1$.  
  Để hàm số có hàm ngược trên toàn bộ $\mathbb{R}$, $f(x)$ phải là song ánh $\Leftrightarrow f(x)$ phải **đơn điệu ngặt** trên $\mathbb{R}$ (hoặc cùng đồng biến, hoặc cùng nghịch biến).  
  Điều này tương đương với tích hai hệ số góc của hai nhánh phải cùng dương:  
  $k_1 \cdot k_2 > 0 \Leftrightarrow m(m - 2) > 0 \Leftrightarrow m < 0$ hoặc $m > 2$.
- **Chọn A.**

### Câu 36
- **Phương pháp tính tay:**  
  Biến đổi hằng đẳng thức: $f(x) = x^3 - 3x^2 + 3x - 1 + 2 = (x - 1)^3 + 2$.  
  Vì hàm số $g(t) = t^3$ đồng biến nên $f(x)$ đồng biến ngặt trên $[1; 3]$.  
  Tập giá trị của $f(x)$ trên $[1; 3]$:  
  - Tại $x = 1$: $y = (1 - 1)^3 + 2 = 2$.  
  - Tại $x = 3$: $y = (3 - 1)^3 + 2 = 2^3 + 2 = 10$.  
  Suy ra $R_f = [2; 10]$.  
  Vì tập xác định của $f^{-1}(x)$ chính là tập giá trị của $f(x)$, nên $D_{f^{-1}} = [2; 10]$.
- **Chọn D.**

### Câu 37
- **Phương pháp tính tay:**  
  Đề cho $f(1) = 1^5 + 2(1)^3 + 3(1) - 6 = 0$.  
  Theo tính chất hàm ngược: $f(1) = 0 \Leftrightarrow f^{-1}(0) = 1$.  
  Đạo hàm hàm gốc: $f'(x) = 5x^4 + 6x^2 + 3$.  
  Tại $x = 1$: $f'(1) = 5(1)^4 + 6(1)^2 + 3 = 14$.  
  Áp dụng công thức đạo hàm hàm ngược:  
  $(f^{-1})'(0) = \dfrac{1}{f'(1)} = \dfrac{1}{14}$.
- **Chọn B.**

### Câu 38
- **Phương pháp tính tay:**  
  Hàm số $y = \dfrac{ax - 1}{x + 2}$ có tiệm cận đứng $x = -2$ và tiệm cận ngang $y = a$.  
  Tâm đối xứng của đồ thị là giao điểm hai đường tiệm cận: $I(-2; a)$.  
  Để tâm đối xứng $I$ nằm trên đường thẳng $y = x$, ta phải có: $a = -2$.  
  Khi $a = -2$, hàm số trở thành $y = \dfrac{-2x - 1}{x + 2}$.  
  Hàm ngược của nó là: $f^{-1}(x) = \dfrac{-2x - 1}{x - (-2)} = \dfrac{-2x - 1}{x + 2} = f(x)$.  
  Do $f^{-1}(x) = f(x)$ nên đồ thị hàm số đối xứng với chính nó qua đường thẳng $y = x$.
- **Chọn C.**

### Câu 39
- **Phương pháp hình học & Tích phân:**  
  Xét hình chữ nhật tạo bởi hai trục tọa độ và các đường thẳng $x = 2, y = 4$: diện tích hình chữ nhật là $S_{rect} = 2 \times 4 = 8$.  
  Do hàm số $f(x)$ đồng biến ngặt và liên tục từ $(0; 0)$ đến $(2; 4)$, đồ thị chia hình chữ nhật thành hai phần:  
  1. Phần giới hạn bởi đồ thị $y = f(x)$, trục hoành $Ox$, và đường thẳng $x = 2$, có diện tích là $\displaystyle\int_0^2 f(x) dx$.  
  2. Phần giới hạn bởi đồ thị, trục tung $Oy$, và đường thẳng $y = 4$, chính là tích phân của hàm ngược theo biến $y$: $\displaystyle\int_0^4 f^{-1}(y) dy$.  
  Do đó: $\displaystyle\int_0^2 f(x) dx + \int_0^4 f^{-1}(y) dy = 2 \times 4 = 8$.  
  Suy ra $I = \displaystyle\int_0^4 f^{-1}(y) dy = 8 - \dfrac{8}{3} = \dfrac{16}{3}$.
- **Chọn A.**

### Câu 40
- **Phương pháp tính tay:**  
  Xét $y = x + \sqrt{x^2 - 1}$ với $x \ge 1$. Do $x \ge 1 \Rightarrow y \ge 1$.  
  Ta có: $\dfrac{1}{y} = \dfrac{1}{x + \sqrt{x^2 - 1}} = \dfrac{x - \sqrt{x^2 - 1}}{(x + \sqrt{x^2 - 1})(x - \sqrt{x^2 - 1})} = \dfrac{x - \sqrt{x^2 - 1}}{x^2 - (x^2 - 1)} = x - \sqrt{x^2 - 1}$.  
  Cộng hai đẳng thức:  
  $y + \dfrac{1}{y} = (x + \sqrt{x^2 - 1}) + (x - \sqrt{x^2 - 1}) = 2x$.  
  Suy ra: $x = \dfrac{y + \dfrac{1}{y}}{2} = \dfrac{y^2 + 1}{2y}$.  
  Vậy hàm số ngược là $f^{-1}(x) = \dfrac{x^2 + 1}{2x}$ với $x \ge 1$.
- **Chọn D.**
