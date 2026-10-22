# HƯỚNG DẪN GIẢI CHI TIẾT & PHÂN TÍCH BẪY (TRAP ANALYSIS)
## CHUYÊN ĐỀ ĐẶC BIỆT: TẬP XÁC ĐỊNH (DOMAIN) & TẬP GIÁ TRỊ (RANGE)
**Mã đề thi:** CSCA-MATH-01  
**Quy chế:** Chuẩn giải toán tính tay không dùng máy tính bỏ túi (CSCA No-Calculator Standard)  

---

## BẢNG ĐÁP ÁN NHANH (ANSWER KEY)

| Câu | Đ/A | Câu | Đ/A | Câu | Đ/A | Câu | Đ/A |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | **B** | **11** | **B** | **21** | **D** | **31** | **C** |
| **2** | **C** | **12** | **D** | **22** | **B** | **32** | **B** |
| **3** | **A** | **13** | **C** | **23** | **C** | **33** | **D** |
| **4** | **D** | **14** | **A** | **24** | **A** | **34** | **B** |
| **5** | **B** | **15** | **A** | **25** | **D** | **35** | **A** |
| **6** | **A** | **16** | **B** | **26** | **B** | **36** | **C** |
| **7** | **C** | **17** | **C** | **27** | **A** | **37** | **A** |
| **8** | **C** | **18** | **D** | **28** | **C** | **38** | **D** |
| **9** | **D** | **19** | **C** | **29** | **D** | **39** | **B** |
| **10**| **A** | **20** | **B** | **30** | **A** | **40** | **C** |

---

## HƯỚNG DẪN GIẢI CHI TIẾT TỪNG CÂU

### Câu 1
- **Điều kiện:** Căn ở mẫu nên bắt buộc biểu thức trong căn phải **lớn hơn hẳn 0**:  
  $4 - x^2 > 0 \Leftrightarrow x^2 < 4 \Leftrightarrow -2 < x < 2$.  
  Tử số $x - 1$ xác định với mọi $x \in \mathbb{R}$. Do đó $D = (-2; 2)$.
- **Phân tích bẫy:** Thí sinh quen tay đặt $4 - x^2 \ge 0$ dẫn đến chọn nhầm $[-2; 2]$ (Phương án A) hoặc bẫy $x \ne 1$ (tử số bằng 0 thì $y = 0$ vẫn hoàn toàn xác định).
- **Chọn B.**

### Câu 2
- **Điều kiện:** Biểu thức trong logarit phải dương:  
  $x^2 - 2x > 0 \Leftrightarrow x(x - 2) > 0 \Leftrightarrow x < 0$ hoặc $x > 2$.  
  Vậy $D = (-\infty; 0) \cup (2; +\infty)$.
- **Phân tích bẫy:** Nhầm dấu xét khoảng giữa hai nghiệm thành $(0; 2)$ (Phương án A) hoặc lấy dấu bằng $[0; 2]$ (Phương án B).
- **Chọn C.**

### Câu 3
- **Điều kiện:**
  - $(x - 2)^{-3} = \dfrac{1}{(x - 2)^3} \Rightarrow x - 2 \ne 0 \Leftrightarrow x \ne 2$.
  - Căn bậc ba $\sqrt[3]{x - 1}$ xác định với mọi $x \in \mathbb{R}$ (căn bậc lẻ không cần điều kiện $\ge 0$).
  - Giao lại ta được $D = \mathbb{R} \setminus \{2\}$.
- **Phân tích bẫy:** Nhiều bạn nhầm căn bậc 3 cũng cần $x - 1 \ge 0 \Rightarrow x \ge 1$ nên chọn nhầm B hoặc C.
- **Chọn A.**

### Câu 4
- **Điều kiện:**
  1. Biểu thức trong logarit dương: $x - 1 > 0 \Leftrightarrow x > 1$.
  2. Mẫu thức khác 0: $\ln(x - 1) \ne 0 \Leftrightarrow x - 1 \ne 1 \Leftrightarrow x \ne 2$.
  - Kết hợp lại: $x \in (1; +\infty) \setminus \{2\} = (1; 2) \cup (2; +\infty)$.
- **Phân tích bẫy:** Rất nhiều thí sinh chỉ nhớ $x - 1 > 0$ mà quên mất mẫu bằng 0 khi biểu thức bằng 1, chọn ngay A.
- **Chọn D.**

### Câu 5
- **Điều kiện:** $\dfrac{x - 1}{2 - x} \ge 0$ và mẫu khác 0 ($x \ne 2$).
- Nghiệm tử $x = 1$, nghiệm mẫu $x = 2$. Lập bảng xét dấu: biểu thức mang dấu dương trên $(1; 2)$.
- Tại $x = 1$: tử bằng 0 (nhận). Tại $x = 2$: mẫu bằng 0 (loại).
- Vậy $D = [1; 2)$.
- **Phân tích bẫy:** Chọn nhầm $[1; 2]$ (quên mẫu $\ne 0$) hoặc $(1; 2)$ (quên tử bằng 0 vẫn lấy được).
- **Chọn B.**

### Câu 6
- **Lý thuyết lũy thừa CSCA:** Với hàm $y = [u(x)]^\alpha$:
  - Nếu $\alpha \in \mathbb{Z}^+$: $u(x)$ tùy ý.
  - Nếu $\alpha \in \mathbb{Z}^- \cup \{0\}$: $u(x) \ne 0$.
  - Nếu $\alpha$ không nguyên (số vô tỉ, số thập phân như $\sqrt{2}, \pi, \dfrac{1}{3}$): **bắt buộc cơ số $u(x) > 0$**.
- Ở đây $\alpha = \sqrt{2} \notin \mathbb{Z} \Rightarrow x^2 - 1 > 0 \Leftrightarrow x \in (-\infty; -1) \cup (1; +\infty)$.
- **Chọn A.**

### Câu 7
- **Tập xác định:** $4 - x^2 \ge 0 \Leftrightarrow x \in [-2; 2]$.
- Khi $x \in [-2; 2]$ thì $0 \le x^2 \le 4 \Rightarrow 0 \le 4 - x^2 \le 4 \Rightarrow 0 \le \sqrt{4 - x^2} \le 2$.
- Nhân $-1$ đổi chiều: $-2 \le -\sqrt{4 - x^2} \le 0$.
- Cộng thêm 3: $3 - 2 \le 3 - \sqrt{4 - x^2} \le 3 + 0 \Leftrightarrow 1 \le y \le 3$.
- Vậy $R_y = [1; 3]$.
- **Chọn C.**

### Câu 8
- Biến đổi hàm phân thức: $y = \dfrac{2(x + 1) - 3}{x + 1} = 2 - \dfrac{3}{x + 1}$.
- Vì $\dfrac{3}{x + 1} \ne 0$ với mọi $x \ne -1$, nên $y \ne 2$.
- Khi $x \to \pm\infty$ thì $\dfrac{3}{x+1} \to 0 \Rightarrow y \to 2$ (tiệm cận ngang).
- Tập giá trị là $R_y = \mathbb{R} \setminus \{2\}$.
- **Chọn C.**

### Câu 9
- Điều kiện đồng thời: $\begin{cases} x - 3 \ge 0 \\ 1 - x \ge 0 \end{cases} \Leftrightarrow \begin{cases} x \ge 3 \\ x \le 1 \end{cases} \Rightarrow x \in \emptyset$.
- Không tồn tại giá trị nào của $x$ để hàm số xác định.
- **Chọn D.**

### Câu 10
- Vì $|x| \ge 0$ với mọi $x \in \mathbb{R}$, mà cơ số $2 > 1$ nên $2^{|x|} \ge 2^0 = 1$.
- Suy ra $y = 2^{|x|} + 1 \ge 1 + 1 = 2$.
- Đạt giá trị nhỏ nhất bằng 2 khi $x = 0$. Khi $|x| \to +\infty$ thì $y \to +\infty$.
- Do đó $R_y = [2; +\infty)$.
- **Phân tích bẫy:** Tưởng $2^u > 0 \Rightarrow y > 1$ chọn nhầm C.
- **Chọn A.**

### Câu 11
- **Bẫy triệt tiêu:** Rất nhiều thí sinh rút gọn $\dfrac{x - 1}{x - 1} = 1 \Rightarrow y = \sqrt{1} = 1$ rồi kết luận TXĐ là $\mathbb{R}$.
- **Nguyên tắc:** Tập xác định phải tìm trên **biểu thức ban đầu trước khi rút gọn**:  
  $\dfrac{x - 1}{x - 1} \ge 0$ và mẫu $x - 1 \ne 0 \Leftrightarrow x \ne 1$. Khi $x \ne 1$ thì thương luôn bằng 1 ($\ge 0$ đúng).
- Vậy $D = \mathbb{R} \setminus \{1\}$.
- **Chọn B.**

### Câu 12
- Hàm số $y = \log_{x - 1}(5 - x)$ có ẩn cả ở cơ số và biểu thức:
  1. Điều kiện cơ số: $\begin{cases} x - 1 > 0 \\ x - 1 \ne 1 \end{cases} \Leftrightarrow \begin{cases} x > 1 \\ x \ne 2 \end{cases}$.
  2. Điều kiện biểu thức: $5 - x > 0 \Leftrightarrow x < 5$.
- Giao lại: $x \in (1; 5) \setminus \{2\} = (1; 2) \cup (2; 5)$.
- **Chọn D.**

### Câu 13
- **Điều kiện 1:** Biểu thức trong logarit dương: $2x - 3 > 0 \Leftrightarrow x > \dfrac{3}{2}$.
- **Điều kiện 2:** Biểu thức dưới căn không âm: $\log_{0.5}(2x - 3) \ge 0$.  
  Vì cơ số $0 < 0.5 < 1$ nên **BẤT ĐẲNG THỨC ĐỔI CHIỀU**:  
  $2x - 3 \le (0.5)^0 = 1 \Leftrightarrow 2x \le 4 \Leftrightarrow x \le 2$.
- Kết hợp hai điều kiện: $\dfrac{3}{2} < x \le 2 \Rightarrow D = \left(\dfrac{3}{2}; 2\right]$.
- **Phân tích bẫy:** Quên đổi chiều cơ số $< 1$ dẫn tới $x \ge 2$ chọn A, hoặc lấy ngoặc vuông ở $\dfrac{3}{2}$ chọn B.
- **Chọn C.**

### Câu 14
- Căn trong: $4 - x^2 \ge 0 \Leftrightarrow -2 \le x \le 2$.
- Căn ngoài: $1 - \sqrt{4 - x^2} \ge 0 \Leftrightarrow \sqrt{4 - x^2} \le 1 \Leftrightarrow 4 - x^2 \le 1 \Leftrightarrow x^2 \ge 3 \Leftrightarrow x \le -\sqrt{3}$ hoặc $x \ge \sqrt{3}$.
- Giao hai điều kiện: $[-2; 2] \cap \big((-\infty; -\sqrt{3}] \cup [\sqrt{3}; +\infty)\big) = [-2; -\sqrt{3}] \cup [\sqrt{3}; 2]$.
- **Chọn A.**

### Câu 15
- Tập xác định: $D = [1; 5]$.
- Vì $y > 0$, bình phương hai vế:  
  $y^2 = (x - 1) + (5 - x) + 2\sqrt{(x - 1)(5 - x)} = 4 + 2\sqrt{-x^2 + 6x - 5}$.
- Tam thức $-x^2 + 6x - 5 = 4 - (x - 3)^2$:
  - Lớn nhất bằng 4 khi $x = 3 \in [1; 5] \Rightarrow y^2 \le 4 + 2\sqrt{4} = 8 \Rightarrow y \le 2\sqrt{2}$.
  - Nhỏ nhất bằng 0 khi $x = 1$ hoặc $x = 5 \Rightarrow y^2 \ge 4 + 2\sqrt{0} = 4 \Rightarrow y \ge 2$.
- Do $y > 0 \Rightarrow 2 \le y \le 2\sqrt{2}$.
- **Chọn A.**

### Câu 16
- Điều kiện: $1 - \cos x > 0 \Leftrightarrow \cos x < 1$.
- Ta luôn có $\cos x \le 1$ với mọi $x \in \mathbb{R}$.  
  Do đó $\cos x < 1 \Leftrightarrow \cos x \ne 1 \Leftrightarrow x \ne k2\pi$ ($k \in \mathbb{Z}$).
- Vậy $D = \mathbb{R} \setminus \{k2\pi \mid k \in \mathbb{Z}\}$.
- **Chọn B.**

### Câu 17
- Điều kiện: $|x| - x \ge 0 \Leftrightarrow |x| \ge x$.
- Theo tính chất cơ bản của giá trị tuyệt đối:
  - Nếu $x \ge 0 \Rightarrow |x| = x \ge x$ (luôn đúng).
  - Nếu $x < 0 \Rightarrow |x| > 0 > x$ (luôn đúng).
- Vậy bất đẳng thức $|x| \ge x$ nghiệm đúng với **mọi $x \in \mathbb{R}$**.
- **Chọn C.**

### Câu 18
- Nhẩm nhanh không cần đạo hàm:  
  Đặt $t = x^2 - 2x + 2 = (x - 1)^2 + 1 \ge 1$.
- Biểu thức trở thành: $y = \dfrac{t + 1}{t} = 1 + \dfrac{1}{t}$.
- Vì $t \in [1; +\infty)$ nên $\dfrac{1}{t} \in (0; 1]$.
- Do đó $y = 1 + \dfrac{1}{t} \in (1; 2]$. (Đạt $y = 2$ khi $t = 1 \Leftrightarrow x = 1$; khi $x \to \pm\infty$ thì $t \to +\infty \Rightarrow y \to 1$).
- **Phân tích bẫy:** Chọn nhầm $[1; 2]$ do tưởng $y$ có thể chạm tới 1.
- **Chọn D.**

### Câu 19
- Biểu thức trong logarit: $\dfrac{x - 2}{x + 3} > 0$.
- Tích $(x - 2)(x + 3) > 0 \Leftrightarrow x < -3$ hoặc $x > 2$.  
  $D = (-\infty; -3) \cup (2; +\infty)$.
- **Phân tích bẫy:** Tách thành $\log_2(x - 2) - \log_2(x + 3)$ làm phát sinh điều kiện sai là $x > 2$.
- **Chọn C.**

### Câu 20
- Hàm $g(x) = f(4 - x^2)$ xác định khi $4 - x^2$ thuộc tập xác định của $f$:  
  $0 \le 4 - x^2 \le 4 \Leftrightarrow \begin{cases} 4 - x^2 \ge 0 \\ 4 - x^2 \le 4 \end{cases} \Leftrightarrow \begin{cases} x^2 \le 4 \\ x^2 \ge 0 \text{ (luôn đúng)} \end{cases} \Leftrightarrow -2 \le x \le 2$.
- Vậy $D = [-2; 2]$.
- **Chọn B.**

### Câu 21
- Sử dụng biến đổi lượng giác: $y = \sin x + \cos x = \sqrt{2}\sin\left(x + \dfrac{\pi}{4}\right)$.
- Vì $-1 \le \sin\left(x + \dfrac{\pi}{4}\right) \le 1 \Rightarrow -\sqrt{2} \le y \le \sqrt{2}$.
- **Phân tích bẫy:** Nhiều bạn cộng rời rạc $[-1; 1] + [-1; 1] = [-2; 2]$ là sai vì $\sin x$ và $\cos x$ không thể cùng lúc đạt cực trị tại một điểm.
- **Chọn D.**

### Câu 22
- Điều kiện: $\dfrac{1}{x} - 1 \ge 0 \Leftrightarrow \dfrac{1 - x}{x} \ge 0$.
- Nghiệm tử $x = 1$, nghiệm mẫu $x = 0$. Xét dấu phân thức: dương trong khoảng $(0; 1]$.
- Mẫu $x \ne 0$ nên ngoặc tròn tại 0, tử bằng 0 nên ngoặc vuông tại 1.
- $D = (0; 1]$.
- **Chọn B.**

### Câu 23
- Cần giải hệ 3 tầng điều kiện:
  1. Trong cùng: $x > 0$.
  2. Tầng giữa: $\log_2 x > 0 \Leftrightarrow x > 2^0 = 1$.
  3. Căn ngoài: $\log_{\frac{1}{3}}(\log_2 x) \ge 0 \Leftrightarrow \log_2 x \le \left(\dfrac{1}{3}\right)^0 = 1$ (đổi chiều vì cơ số $1/3 < 1$)  
     $\Leftrightarrow x \le 2^1 = 2$.
- Kết hợp: $1 < x \le 2 \Rightarrow D = (1; 2]$.
- **Chọn C.**

### Câu 24
- Tìm tập giá trị của $y = \dfrac{x}{x^2 + 1}$:
  - Nếu $x = 0 \Rightarrow y = 0$.
  - Nếu $x \ne 0 \Rightarrow y = \dfrac{1}{x + \dfrac{1}{x}}$.
  - Áp dụng AM-GM:
    - Khi $x > 0 \Rightarrow x + \dfrac{1}{x} \ge 2 \Rightarrow 0 < y \le \dfrac{1}{2}$.
    - Khi $x < 0 \Rightarrow x + \dfrac{1}{x} \le -2 \Rightarrow -\dfrac{1}{2} \le y < 0$.
  - Gộp lại: $y \in \left[-\dfrac{1}{2}; \dfrac{1}{2}\right]$.
- **Chọn A.**

### Câu 25
- Điều kiện đồng thời: $\begin{cases} x^2 - 4 > 0 \\ x - 2 > 0 \end{cases} \Leftrightarrow \begin{cases} x \in (-\infty; -2) \cup (2; +\infty) \\ x > 2 \end{cases} \Leftrightarrow x > 2$.
- **Phân tích bẫy:** Rút gọn $\ln\dfrac{x^2 - 4}{x - 2} = \ln(x + 2)$ rồi lấy $x > -2$ là sai vì hàm số ban đầu không xác định trên $(-2; 2)$.
- **Chọn D.**

### Câu 26
- $f(2x - 1)$ xác định khi: $0 \le 2x - 1 \le 2 \Leftrightarrow 1 \le 2x \le 3 \Leftrightarrow \dfrac{1}{2} \le x \le \dfrac{3}{2}$.
- Phân thức $\dfrac{1}{\sqrt{1 - x}}$ xác định khi $1 - x > 0 \Leftrightarrow x < 1$.
- Giao hai khoảng: $\left[\dfrac{1}{2}; \dfrac{3}{2}\right] \cap (-\infty; 1) = \left[\dfrac{1}{2}; 1\right)$.
- **Chọn B.**

### Câu 27
- Biểu thức trong căn: $\dfrac{-(x - 1)^2}{x + 1} \ge 0$.
- Nhận xét: $-(x - 1)^2 \le 0$ với mọi $x$.
  - TH1: Tử số bằng 0 $\Leftrightarrow -(x - 1)^2 = 0 \Leftrightarrow x = 1$. Khi đó mẫu $1 + 1 = 2 \ne 0$ (thỏa mãn).
  - TH2: Tử số âm $\Leftrightarrow x \ne 1$. Để thương $\ge 0$ thì mẫu phải **âm**: $x + 1 < 0 \Leftrightarrow x < -1$.
- Hợp hai trường hợp: $D = (-\infty; -1) \cup \{1\}$. (Có điểm cô lập $x = 1$).
- **Chọn A.**

### Câu 28
- Tập xác định: $D = [-1; 2]$.
- Đạo hàm: $y' = -\dfrac{1}{2\sqrt{2 - x}} - \dfrac{1}{2\sqrt{x + 1}} < 0, \, \forall x \in (-1; 2)$.
- Hàm số nghịch biến ngặt trên $[-1; 2]$.
  - $y_{\max} = y(-1) = \sqrt{3} - 0 = \sqrt{3}$.
  - $y_{\min} = y(2) = 0 - \sqrt{3} = -\sqrt{3}$.
- Do tính liên tục, $R_y = [-\sqrt{3}; \sqrt{3}]$.
- **Chọn C.**

### Câu 29
- Điều kiện trong căn: $\log_2(x^2 - 3x + 3) \ge 0$.
- Vì cơ số $2 > 1$: $x^2 - 3x + 3 \ge 2^0 = 1 \Leftrightarrow x^2 - 3x + 2 \ge 0 \Leftrightarrow x \le 1$ hoặc $x \ge 2$.
- Kiểm tra điều kiện logarit: $x^2 - 3x + 3 = (x - 1.5)^2 + 0.75 > 0$ (luôn đúng với mọi $x$).
- Vậy $D = (-\infty; 1] \cup [2; +\infty)$.
- **Chọn D.**

### Câu 30
- Đặt $t = 2^x$ (điều kiện $t > 0$).
- Hàm số trở thành $y = t^2 - 2t + 3 = (t - 1)^2 + 2$.
- Xét hàm trên $(0; +\infty)$: parabol có đỉnh tại $t = 1 \in (0; +\infty)$.
  - Giá trị nhỏ nhất: $y_{\min} = y(1) = 2$ (đạt được khi $2^x = 1 \Leftrightarrow x = 0$).
  - Khi $t \to +\infty$ thì $y \to +\infty$.
  - Khi $t \to 0^+$ thì $y \to 3$.
- Do đó tập giá trị quét từ 2 đến $+\infty$: $R_y = [2; +\infty)$.
- **Chọn A.**

### Câu 31
- Điều kiện căn ở mẫu: $|x - 1| - (x - 1) > 0 \Leftrightarrow |x - 1| > x - 1$.
- Với mọi số thực $A$, ta luôn có $|A| \ge A$, dấu bằng xảy ra khi $A \ge 0$.
- Do đó $|A| > A \Leftrightarrow A < 0$.
- Áp dụng: $x - 1 < 0 \Leftrightarrow x < 1$. Vậy $D = (-\infty; 1)$.
- **Chọn C.**

### Câu 32
- Chia xuống: $y = x + \dfrac{1}{x}$.
- Với $x > 0$, áp dụng bất đẳng thức AM-GM: $x + \dfrac{1}{x} \ge 2\sqrt{x \cdot \dfrac{1}{x}} = 2$.
- Dấu bằng xảy ra khi $x = \dfrac{1}{x} \Leftrightarrow x = 1 \in (0; +\infty)$.
- Khi $x \to +\infty$ thì $y \to +\infty$. Do đó $R_y = [2; +\infty)$.
- **Chọn B.**

### Câu 33
- Điều kiện: $\cos(\pi x) - 1 \ge 0 \Leftrightarrow \cos(\pi x) \ge 1$.
- Mà ta luôn có $\cos(\pi x) \le 1$ với mọi $x$.
- Do đó bắt buộc $\cos(\pi x) = 1 \Leftrightarrow \pi x = k 2\pi \Leftrightarrow x = 2k$ ($k \in \mathbb{Z}$).
- Tập xác định gồm các điểm rời rạc là các số nguyên chẵn: $D = \{2k \mid k \in \mathbb{Z}\}$.
- **Chọn D.**

### Câu 34
- Yêu cầu: $f(x) = x^2 - 2mx + m + 2 \ge 0$ với mọi $x \in \mathbb{R}$.
- Vì hệ số $a = 1 > 0$, tam thức bậc hai không âm trên $\mathbb{R}$ khi và chỉ khi:  
  $\Delta' \le 0 \Leftrightarrow m^2 - (m + 2) \le 0 \Leftrightarrow m^2 - m - 2 \le 0 \Leftrightarrow (m - 2)(m + 1) \le 0 \Leftrightarrow -1 \le m \le 2$.
- **Phân tích bẫy:** Quên dấu bằng ở $\Delta \le 0$ sẽ chọn nhầm A.
- **Chọn B.**

### Câu 35
- Đặt $u = (x + 1)^2 \ge 0$.
  - Mẫu số: $x^2 + 2x + 2 = (x + 1)^2 + 1 = u + 1 \ge 1$.
  - Tử số: $2x^2 + 4x + 5 = 2(x + 1)^2 + 3 = 2u + 3$.
- Biểu thức trở thành: $y = \dfrac{2u + 3}{u + 1} = 2 + \dfrac{1}{u + 1}$.
- Vì $u \in [0; +\infty) \Rightarrow u + 1 \in [1; +\infty) \Rightarrow \dfrac{1}{u + 1} \in (0; 1]$.
- Do đó $y \in (2 + 0; 2 + 1] = (2; 3]$.
- **Phân tích bẫy:** Rất tinh vi giữa ngoặc tròn và ngoặc vuông: đạt $y = 3$ khi $u = 0 \Leftrightarrow x = -1$, nhưng chỉ tiệm cận 2 khi $x \to \pm\infty$ (không bao giờ đạt được 2).
- **Chọn A.**

### Câu 36
- Điều kiện:
  1. $x > 0$ và $\ln x - 1 \ne 0 \Leftrightarrow x \ne e$.
  2. $\dfrac{1}{\ln x - 1} - 1 \ge 0 \Leftrightarrow \dfrac{1 - (\ln x - 1)}{\ln x - 1} \ge 0 \Leftrightarrow \dfrac{2 - \ln x}{\ln x - 1} \ge 0$.
- Nghiệm tử: $\ln x = 2 \Leftrightarrow x = e^2$. Nghiệm mẫu: $\ln x = 1 \Leftrightarrow x = e$.
- Thương mang dấu không âm khi: $1 < \ln x \le 2 \Leftrightarrow e < x \le e^2$.
- Vậy $D = (e; e^2]$.
- **Chọn C.**

### Câu 37
- Tập xác định: $D = [0; 2]$.
- Đặt $t = \sqrt{x} + \sqrt{2 - x} \ge 0$.
  - $t^2 = 2 + 2\sqrt{2x - x^2} \Rightarrow \sqrt{2x - x^2} = \dfrac{t^2 - 2}{2}$.
  - Tìm miền của $t$: Vì $0 \le 2x - x^2 = 1 - (x - 1)^2 \le 1$ nên $0 \le \sqrt{2x - x^2} \le 1$.  
    $\Rightarrow 2 \le t^2 \le 4 \Rightarrow \sqrt{2} \le t \le 2$.
- Thay vào hàm số:  
  $y = t + \dfrac{t^2 - 2}{2} = \dfrac{1}{2}t^2 + t - 1$ với $t \in [\sqrt{2}; 2]$.
- Xét hàm số $g(t) = \dfrac{1}{2}t^2 + t - 1$:  
  Đạo hàm $g'(t) = t + 1 > 0$ với mọi $t \in [\sqrt{2}; 2]$ nên $g(t)$ đồng biến.
  - $y_{\min} = g(\sqrt{2}) = \dfrac{1}{2}(2) + \sqrt{2} - 1 = \sqrt{2}$ (đạt khi $x = 0$ hoặc $x = 2$).
  - $y_{\max} = g(2) = \dfrac{1}{2}(4) + 2 - 1 = 3$ (đạt khi $x = 1$).
- Vậy $R_y = [\sqrt{2}; 3]$.
- **Chọn A.**

### Câu 38
- Điều kiện đồng thời: $\begin{cases} x - m + 1 > 0 \\ 2m - x > 0 \end{cases} \Leftrightarrow \begin{cases} x > m - 1 \\ x < 2m \end{cases}$.
- Để tập xác định là một khoảng thì $m - 1 < 2m \Leftrightarrow m > -1$.
- Khi đó $D = (m - 1; 2m)$.
- Độ dài khoảng là: $L = 2m - (m - 1) = m + 1$.
- Theo đề bài $L = 3 \Leftrightarrow m + 1 = 3 \Leftrightarrow m = 2$ (thỏa mãn $m > -1$).
- **Chọn D.**

### Câu 39
- Điều kiện hàm số $y = \sqrt{\log_x(3 - x)}$:
  1. Biểu thức trong logarit: $3 - x > 0 \Leftrightarrow x < 3$.
  2. Cơ số: $0 < x \ne 1$.
  3. Biểu thức dưới căn: $\log_x(3 - x) \ge 0$.
- Xét 2 trường hợp cơ số:
  - **TH1: $x > 1$** (cơ số lớn hơn 1, giữ nguyên chiều):  
    $\log_x(3 - x) \ge 0 \Leftrightarrow 3 - x \ge x^0 = 1 \Leftrightarrow x \le 2$.  
    Kết hợp $x > 1$ và $x < 3$: $1 < x \le 2$.
  - **TH2: $0 < x < 1$** (cơ số nhỏ hơn 1, đảo chiều bất đẳng thức):  
    $\log_x(3 - x) \ge 0 \Leftrightarrow 3 - x \le x^0 = 1 \Leftrightarrow x \ge 2$.  
    Kết hợp với $0 < x < 1$: vô nghiệm ($\emptyset$).
- Hợp hai trường hợp: $D = (1; 2]$.
- **Phân tích bẫy:** Thí sinh hay quên xét cơ số $< 1$ bị đảo chiều nên làm ẩu ra $(0; 2] \setminus \{1\}$.
- **Chọn B.**

### Câu 40
- Đặt $u = |x| \ge 0$.
- Biểu thức trở thành: $y = \dfrac{u + 1}{u + 2} = 1 - \dfrac{1}{u + 2}$.
- Vì $u \in [0; +\infty) \Rightarrow u + 2 \in [2; +\infty) \Rightarrow \dfrac{1}{u + 2} \in \left(0; \dfrac{1}{2}\right]$.
- Do đó:  
  $y = 1 - \dfrac{1}{u + 2} \in \left[1 - \dfrac{1}{2}; 1 - 0\right) = \left[\dfrac{1}{2}; 1\right)$.
- Nhỏ nhất bằng $\dfrac{1}{2}$ khi $u = 0 \Leftrightarrow x = 0$; tiệm cận 1 khi $|x| \to +\infty$.
- Vậy $R_y = \left[\dfrac{1}{2}; 1\right)$.
- **Chọn C.**
