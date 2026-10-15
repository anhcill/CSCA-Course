# HƯỚNG DẪN GIẢI CHI TIẾT & PHÂN TÍCH BẪY (TRAP ANALYSIS)
## CHUYÊN ĐỀ ĐẶC BIỆT: THỐNG KÊ MÔ TẢ & PHÂN PHỐI CHUẨN
**Mã đề thi:** CSCA-MATH-04  
**Quy chế:** Chuẩn giải toán tính tay không dùng máy tính bỏ túi (CSCA No-Calculator Standard)  

---

## BẢNG ĐÁP ÁN NHANH (ANSWER KEY)

| Câu | Đ/A | Câu | Đ/A | Câu | Đ/A | Câu | Đ/A |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | **B** | **11** | **C** | **21** | **B** | **31** | **C** |
| **2** | **C** | **12** | **D** | **22** | **A** | **32** | **D** |
| **3** | **A** | **13** | **B** | **23** | **C** | **33** | **B** |
| **4** | **D** | **14** | **A** | **24** | **D** | **34** | **A** |
| **5** | **B** | **15** | **C** | **25** | **B** | **35** | **C** |
| **6** | **A** | **16** | **B** | **26** | **A** | **36** | **D** |
| **7** | **C** | **17** | **D** | **27** | **C** | **37** | **B** |
| **8** | **D** | **18** | **A** | **28** | **D** | **38** | **A** |
| **9** | **B** | **19** | **C** | **29** | **B** | **39** | **C** |
| **10**| **A** | **20** | **D** | **30** | **A** | **40** | **D** |

---

## HƯỚNG DẪN GIẢI CHI TIẾT TỪNG CÂU

### Câu 1
- **Phương pháp tính tay:**  
  Số trung bình cộng của mẫu số liệu là:  
  $\bar{x} = \dfrac{2 + 4 + 6 + 8 + 10}{5} = \dfrac{30}{5} = 6$.
- **Chọn B.**

### Câu 2
- **Phương pháp tính tay:**  
  Bước 1: Sắp xếp mẫu số liệu theo thứ tự không giảm:  
  $2, 3, 5, 7, 9$.  
  Số phần tử $n = 5$ là số lẻ, do đó trung vị là phần tử đứng chính giữa (vị trí thứ 3):  
  $M_e = 5$.
- **Phân tích bẫy:** Thí sinh không sắp xếp lại dãy số mà lấy luôn phần tử đứng giữa ở dãy ban đầu là số 9 (Phương án A).
- **Chọn C.**

### Câu 3
- **Phương pháp tính tay:**  
  Dãy số liệu gồm $n = 6$ số đã sắp xếp: $1, 3, 4, 8, 10, 12$.  
  Vì $n = 6$ là số chẵn, trung vị là trung bình cộng của hai số đứng chính giữa (vị trí thứ 3 và thứ 4):  
  $M_e = \dfrac{4 + 8}{2} = \dfrac{12}{2} = 6$.
- **Chọn A.**

### Câu 4
- **Phương pháp tính tay:**  
  Mốt ($M_o$) là giá trị có tần số xuất hiện nhiều nhất trong mẫu số liệu.  
  Trong mẫu $2, 3, 3, 5, 7, 8$, giá trị $3$ xuất hiện 2 lần (nhiều nhất).  
  Vậy $M_o = 3$.
- **Chọn D.**

### Câu 5
- **Phương pháp tính tay:**  
  Mẫu số liệu: $1, 2, 3, 4, 5$ có số trung bình $\bar{x} = 3$.  
  Độ lệch của từng phần tử so với trung bình:  
  $(1 - 3) = -2, \, (2 - 3) = -1, \, (3 - 3) = 0, \, (4 - 3) = 1, \, (5 - 3) = 2$.  
  Tổng bình phương độ lệch:  
  $(-2)^2 + (-1)^2 + 0^2 + 1^2 + 2^2 = 4 + 1 + 0 + 1 + 4 = 10$.  
  Phương sai: $s^2 = \dfrac{10}{5} = 2$.
- **Chọn B.**

### Câu 6
- **Phương pháp tính tay:**  
  Độ lệch chuẩn là căn bậc hai số học của phương sai:  
  $s = \sqrt{s^2} = \sqrt{9} = 3$.  
  *(Lưu ý: Độ lệch chuẩn luôn là số không âm, không có giá trị âm).*
- **Chọn A.**

### Câu 7
- **Lý thuyết phân phối chuẩn CSCA:**  
  Ký hiệu chuẩn quốc tế của phân phối chuẩn là $X \sim \mathcal{N}(\mu; \sigma^2)$, trong đó tham số thứ nhất là kỳ vọng $\mu$, tham số thứ hai là phương sai $\sigma^2$.  
  Ở đây $\mu = 80$ và phương sai $\sigma^2 = 16 \Rightarrow$ độ lệch chuẩn $\sigma = \sqrt{16} = 4$.
- **Phân tích bẫy:** Thí sinh nhầm tham số thứ hai là độ lệch chuẩn nên kết luận $\sigma = 16$ (Phương án A).
- **Chọn C.**

### Câu 8
- **Lý thuyết đồ thị hình chuông Gauss:**  
  Đường cong mật độ xác suất của phân phối chuẩn đối xứng qua đường thẳng đứng đi qua đỉnh, tức là đường thẳng $x = \mu$.  
  Ở đây $\mu = 5$, do đó trục đối xứng là $x = 5$.
- **Chọn D.**

### Câu 9
- **Phương pháp suy luận đối xứng:**  
  Tổng diện tích dưới đường cong mật độ phân phối chuẩn bằng 1.  
  Vì đường cong đối xứng tuyệt đối qua trục $x = \mu$, diện tích phần bên trái $\mu$ bằng diện tích phần bên phải $\mu$:  
  $P(X \le \mu) = P(X \ge \mu) = \dfrac{1}{2} = 0{,}5$.
- **Chọn B.**

### Câu 10
- **Phương pháp tính tay:**  
  Khoảng biến thiên của mẫu số liệu là hiệu giữa giá trị lớn nhất và giá trị nhỏ nhất:  
  $R = x_{\max} - x_{\min} = 11 - 2 = 9$.
- **Chọn A.**

### Câu 11
- **Tính chất biến đổi số liệu CSCA:**  
  Cho mẫu số liệu $x_1, \dots, x_n$ có trung bình $\bar{x}$ và phương sai $s_x^2$.  
  Khi biến đổi $y_i = x_i + c$ (tịnh tiến một hằng số $c$):  
  - Trung bình mới tịnh tiến tương ứng: $\bar{y} = \bar{x} + c = 5 + 2 = 7$.  
  - Độ phân tán của các số liệu quanh giá trị trung bình **hoàn toàn không thay đổi**, do đó phương sai không đổi: $s_y^2 = s_x^2 = 3$.
- **Phân tích bẫy:** Thí sinh nghĩ cộng 2 thì phương sai cũng tăng thêm 2 hoặc tăng thêm $2^2 = 4$.
- **Chọn C.**

### Câu 12
- **Tính chất độ lệch chuẩn:**  
  Khi biến đổi tuyến tính $y_i = a x_i + b$, độ lệch chuẩn biến đổi theo quy tắc:  
  $s_y = |a| \cdot s_x$.  
  Ở đây $a = -3 \Rightarrow s_y = |-3| \times 2 = 3 \times 2 = 6$.
- **Phân tích bẫy:** Quên dấu giá trị tuyệt đối dẫn đến $s_y = -6$ (sai vì độ lệch chuẩn không bao giờ âm).
- **Chọn D.**

### Câu 13
- **Lý thuyết thống kê:**  
  Trong mẫu số liệu $1, 2, 3, 4, 5$, mỗi giá trị đều chỉ xuất hiện đúng 1 lần (tần số bằng nhau). Khi không có giá trị nào có tần số vượt trội hơn các giá trị khác thì mẫu số liệu này **không có mốt**.
- **Chọn B.**

### Câu 14
- **Lý thuyết mẫu bimodal:**  
  Trong mẫu $2, 3, 3, 4, 5, 5, 6$: hai giá trị $3$ và $5$ đều xuất hiện 2 lần (nhiều hơn các số còn lại). Khi đó mẫu số liệu có hai mốt là $3$ và $5$ (gọi là mẫu hai mốt - bimodal).
- **Chọn A.**

### Câu 15
- **Phương pháp tính tay:**  
  Tổng của 5 số là: $5 \times 8 = 40$.  
  Tổng của 4 số đã biết: $4 + 6 + 8 + 12 = 30$.  
  Giá trị của $x$ là: $x = 40 - 30 = 10$.
- **Chọn C.**

### Câu 16
- **Tính chất đối xứng phân phối chuẩn:**  
  Biến ngẫu nhiên $X$ đối xứng qua $\mu = 10$.  
  Khoảng cách từ 14 đến 10 là $14 - 10 = 4$.  
  Khoảng cách từ 6 đến 10 là $10 - 6 = 4$.  
  Do tính đối xứng của chuông Gauss: phần đuôi bên phải số 14 có diện tích bằng đúng phần đuôi bên trái số 6:  
  $P(X < 6) = P(X > 14) = 0{,}12$.
- **Chọn B.**

### Câu 17
- **Phương pháp tính tay:**  
  Ta có $\mu = 10$.  
  Hai điểm $x = 7$ và $x = 13$ đối xứng nhau qua $\mu = 10$ ($10 - 3 = 7$ và $10 + 3 = 13$).  
  Do đó: $P(X < 7) = P(X > 13) = 0{,}15$.  
  Xác suất rơi vào khoảng giữa hai điểm đối xứng:  
  $P(7 < X < 13) = 1 - \big[P(X \le 7) + P(X \ge 13)\big] = 1 - (0{,}15 + 0{,}15) = 1 - 0{,}30 = 0{,}70$.
- **Chọn D.**

### Câu 18
- **Phương pháp tính tay:**  
  Hai đuôi có xác suất bằng nhau $P(X < 8) = P(X > 16)$ nghĩa là hai điểm $x = 8$ và $x = 16$ phải nằm đối xứng hoàn toàn qua trục đối xứng $x = \mu$.  
  Do đó kỳ vọng $\mu$ chính là trung điểm:  
  $\mu = \dfrac{8 + 16}{2} = 12$.
- **Chọn A.**

### Câu 19
- **Quy tắc thực nghiệm 3-sigma CSCA:**  
  Với $X \sim \mathcal{N}(70; 25)$, ta có $\mu = 70$ và $\sigma = \sqrt{25} = 5$.  
  Khoảng từ 65 đến 75 điểm chính là khoảng 1-sigma:  
  $(\mu - \sigma; \mu + \sigma) = (70 - 5; 70 + 5) = (65; 75)$.  
  Theo quy tắc thực nghiệm, xác suất rơi vào khoảng $(\mu \pm \sigma)$ xấp xỉ bằng $68{,}3\%$.
- **Chọn C.**

### Câu 20
- **Phương pháp tính tay:**  
  Mẫu số liệu gồm $n = 8$ phần tử: $2, 4, 5, 7, 8, 10, 12, 14$.  
  - Nửa dưới gồm 4 số: $2, 4, 5, 7 \Rightarrow$ Tứ phân vị thứ nhất là $Q_1 = \dfrac{4 + 5}{2} = 4{,}5$.  
  - Nửa trên gồm 4 số: $8, 10, 12, 14 \Rightarrow$ Tứ phân vị thứ ba là $Q_3 = \dfrac{10 + 12}{2} = 11$.  
  Khoảng tứ phân vị: $IQR = Q_3 - Q_1 = 11 - 4{,}5 = 6{,}5$.
- **Chọn D.**

### Câu 21
- **Phương pháp tính tay:**  
  Khi tất cả các phần tử trong mẫu số liệu đều bằng nhau, số liệu hoàn toàn không có độ phân tán (mọi phần tử đều trùng với số trung bình $\bar{x} = 7$).  
  Do đó phương sai và độ lệch chuẩn đều bằng 0: $s = 0$.
- **Chọn B.**

### Câu 22
- **Phương pháp tính tay:**  
  $\mu = 20$. Khoảng $(17; 23) = (20 - 3; 20 + 3)$ đối xứng qua $\mu$.  
  Tổng diện tích hai phần đuôi ngoài khoảng $(17; 23)$ là:  
  $1 - 0{,}68 = 0{,}32$.  
  Do tính đối xứng, phần đuôi bên phải có xác suất là:  
  $P(X > 23) = \dfrac{0{,}32}{2} = 0{,}16$.
- **Chọn A.**

### Câu 23
- **Phương pháp tính tay:**  
  Vì hai nhóm có **cùng số trung bình** $\bar{x}_1 = \bar{x}_2 = 4$, trung bình của mẫu gộp vẫn là $\bar{x} = 4$.  
  Khi đó, phương sai của mẫu gộp là trung bình có trọng số của các phương sai:  
  $s^2 = \dfrac{n_1 s_1^2 + n_2 s_2^2}{n_1 + n_2} = \dfrac{3(2) + 2(7)}{3 + 2} = \dfrac{6 + 14}{5} = \dfrac{20}{5} = 4$.
- **Chọn C.**

### Câu 24
- **Công thức khai triển phương sai:**  
  Ta có công thức: $s^2 = \dfrac{1}{n} \displaystyle\sum_{i=1}^n x_i^2 - (\bar{x})^2$.  
  Số trung bình: $\bar{x} = \dfrac{30}{5} = 6 \Rightarrow (\bar{x})^2 = 36$.  
  $\dfrac{1}{5} \displaystyle\sum_{i=1}^5 x_i^2 = \dfrac{200}{5} = 40$.  
  Do đó: $s^2 = 40 - 36 = 4$.
- **Chọn D.**

### Câu 25
- **Phương pháp tính tay:**  
  Kỳ vọng $\mu = 50$.  
  Do tính đối xứng: $P(X \ge 55) = P(X \le 45) = 0{,}2$.  
  Biến cố $X \le 55$ là biến cố đối của biến cố $X > 55$:  
  $P(X \le 55) = 1 - P(X > 55) = 1 - 0{,}2 = 0{,}8$.
- **Phân tích bẫy:** Thí sinh nhầm tính chất đối xứng $P(X \le 55) = P(X \le 45) = 0{,}2$ (Phương án A).
- **Chọn B.**

### Câu 26
- **Công thức chuẩn hóa Z-score:**  
  $Z = \dfrac{X - \mu}{\sigma}$.  
  Ở đây $\mu = 170$, phương sai $\sigma^2 = 25 \Rightarrow$ độ lệch chuẩn $\sigma = 5$.  
  Với $X = 180$:  
  $Z = \dfrac{180 - 170}{5} = \dfrac{10}{5} = 2$.
- **Chọn A.**

### Câu 27
- **Lý thuyết hệ số biến thiên:**  
  Hệ số biến thiên $CV = \dfrac{s}{\bar{x}}$ dùng để đo lường độ phân tán tương đối:  
  - Lớp 12A: $CV_A = \dfrac{8}{80} = 0{,}10 = 10\%$.  
  - Lớp 12B: $CV_B = \dfrac{6}{50} = 0{,}12 = 12\%$.  
  Vì $CV_B > CV_A$, lớp 12B có độ phân tán tương đối lớn hơn lớp 12A (dù độ lệch chuẩn tuyệt đối của lớp B nhỏ hơn).
- **Chọn C.**

### Câu 28
- **Phương pháp tính tay:**  
  - Do $P(X < 2) = P(X > 6)$, trục đối xứng là: $\mu = \dfrac{2 + 6}{2} = 4$.  
  - Khoảng $(3; 5) = (4 - 1; 4 + 1) = (\mu - 1; \mu + 1)$.  
    Đề cho xác suất trên khoảng này bằng $0{,}68$, trùng với quy tắc $(\mu - \sigma; \mu + \sigma) \Rightarrow \sigma = 1$.  
  Vậy $\mu = 4$ và $\sigma = 1$.
- **Chọn D.**

### Câu 29
- **Lý thuyết thống kê vững (Robust Statistics):**  
  - Số trung bình, Phương sai, Khoảng biến thiên đều sử dụng trực tiếp độ lớn của từng phần tử nên rất nhạy cảm với các giá trị cực trị đột biến (ngoại lai).  
  - **Trung vị (Median)** chỉ phụ thuộc vào thứ tự vị trí đứng giữa, không bị kéo lệch bởi các giá trị quá lớn hoặc quá bé ở hai đầu, do đó là đại lượng vững nhất.
- **Chọn B.**

### Câu 30
- **Phương pháp tính tay:**  
  Số trung bình của 5 số cấp số cộng là số đứng giữa: $\bar{x} = a + 2d$.  
  Hiệu của từng số hạng với trung bình:  
  $-2d, \, -d, \, 0, \, d, \, 2d$.  
  Tổng bình phương độ lệch:  
  $(-2d)^2 + (-d)^2 + 0^2 + d^2 + (2d)^2 = 4d^2 + d^2 + 0 + d^2 + 4d^2 = 10d^2$.  
  Phương sai: $s^2 = \dfrac{10d^2}{5} = 2d^2$.  
  *(Nhận xét: Phương sai chỉ phụ thuộc vào công sai $d$, hoàn toàn không phụ thuộc vào số hạng đầu $a$).*
- **Chọn A.**

### Câu 31
- **Phương pháp tính tay:**  
  Với $\mu = 20\text{ mm}$ và $\sigma^2 = 0{,}01 \Rightarrow \sigma = 0{,}1\text{ mm}$.  
  Khoảng đạt chuẩn là: $[19{,}8; 20{,}2] = [20 - 2(0{,}1); 20 + 2(0{,}1)] = [\mu - 2\sigma; \mu + 2\sigma]$.  
  Tỉ lệ đạt chuẩn là $95{,}4\% \Rightarrow$ tỉ lệ phế phẩm là:  
  $100\% - 95{,}4\% = 4{,}6\%$.  
  Số lượng phế phẩm ước tính trong 1000 sản phẩm:  
  $1000 \times 4{,}6\% = 46$ sản phẩm.
- **Chọn C.**

### Câu 32
- **Phương pháp tính tay:**  
  Mẫu ban đầu gồm 4 số có $\bar{x} = 5 \Rightarrow \displaystyle\sum_{i=1}^4 (x_i - 5)^2 = 4 \times s^2 = 4 \times 5 = 20$.  
  Khi thêm số $x_5 = 5$, trung bình mới vẫn là $\bar{x} = 5$.  
  Tổng bình phương độ lệch mới:  
  $\displaystyle\sum_{i=1}^5 (x_i - 5)^2 = 20 + (5 - 5)^2 = 20$.  
  Phương sai của mẫu mới (gồm 5 số):  
  $s^2 = \dfrac{20}{5} = 4$.  
  Vậy phương sai giảm từ 5 xuống 4.
- **Chọn D.**

### Câu 33
- **Phương pháp tính tay:**  
  Xác suất để một ngày chờ hơn 10 phút là $p = 0{,}5$.  
  Xác suất không phải chờ hơn 10 phút là $q = 1 - 0{,}5 = 0{,}5$.  
  Trong 3 ngày, số ngày chờ hơn 10 phút tuân theo phân phối nhị thức $B(3; 0{,}5)$.  
  Xác suất đúng 2 ngày:  
  $P = C_3^2 \times (0{,}5)^2 \times (0{,}5)^1 = 3 \times \dfrac{1}{8} = \dfrac{3}{8}$.
- **Chọn B.**

### Câu 34
- **Phương pháp chuẩn hóa Z-score:**  
  - Biến $X \sim \mathcal{N}(1; 4) \Rightarrow \mu_X = 1, \sigma_X = 2$.  
    $Z_X = \dfrac{3 - 1}{2} = 1 \Rightarrow P(X < 3) = P(Z < 1)$.  
  - Biến $Y \sim \mathcal{N}(2; 9) \Rightarrow \mu_Y = 2, \sigma_Y = 3$.  
    $Z_Y = \dfrac{5 - 2}{3} = 1 \Rightarrow P(Y < 5) = P(Z < 1)$.  
  Vì cùng tương đương với xác suất $P(Z < 1)$ của phân phối chuẩn chuẩn tắc, ta có:  
  $P(X < 3) = P(Y < 5)$.
- **Chọn A.**

### Câu 35
- **Phương pháp tính tay:**  
  Theo công thức phương sai:  
  $s^2 = \dfrac{1}{4} \displaystyle\sum_{i=1}^4 (x_i - \bar{x})^2$.  
  Do $\bar{x} = 0$, ta có: $s^2 = \dfrac{1}{4} \displaystyle\sum_{i=1}^4 x_i^2$.  
  Đề bài cho $s = 2 \Rightarrow s^2 = 4$.  
  Do đó: $\dfrac{1}{4}(x_1^2 + x_2^2 + x_3^2 + x_4^2) = 4$.  
  Vế trái chính là số trung bình cộng của mẫu mới $y_i = x_i^2$.  
  Vậy $\bar{y} = 4$.
- **Chọn C.**

### Câu 36
- **Phương pháp tính tay:**  
  - Từ $P(X < 4) = P(X > 8) = 0{,}3 \Rightarrow$ trục đối xứng là: $\mu = \dfrac{4 + 8}{2} = 6$.  
  - Hai điểm $x = 5$ và $x = 7$ đối xứng nhau qua $\mu = 6$ ($6 - 1 = 5$ và $6 + 1 = 7$).  
    Do đó: $P(X < 5) = P(X > 7) = 0{,}38$.  
  - Xác suất rơi vào khoảng giữa $(5; 7)$ là:  
    $P(5 < X < 7) = 1 - \big[P(X \le 5) + P(X \ge 7)\big] = 1 - (0{,}38 + 0{,}38) = 1 - 0{,}76 = 0{,}24$.
- **Chọn D.**

### Câu 37
- **Tính chất giải tích của phương sai:**  
  Gọi 4 số đã biết là $1, 3, 4, 6$. Trung bình của 4 số này là:  
  $\bar{x}_4 = \dfrac{1 + 3 + 4 + 6}{4} = \dfrac{14}{4} = 3{,}5$.  
  Hàm phương sai $s^2(x)$ là một hàm bậc hai theo biến $x$. Nó đạt giá trị cực tiểu khi giá trị $x$ được bổ sung vào đúng bằng trung bình cộng của các phần tử còn lại:  
  $x = \bar{x}_4 = 3{,}5$.
- **Chọn B.**

### Câu 38
- **Lý thuyết hình học đường cong Gauss:**  
  Hàm mật độ $f(x) = \dfrac{1}{\sigma \sqrt{2\pi}} e^{-\frac{(x - \mu)^2}{2\sigma^2}}$ đạt giá trị cực đại (độ cao đỉnh) tại $x = \mu$ với giá trị đỉnh bằng:  
  $f(\mu) = \dfrac{1}{\sigma \sqrt{2\pi}}$.  
  Khi $\sigma$ tăng lên:  
  - Giá trị đỉnh $\dfrac{1}{\sigma \sqrt{2\pi}}$ giảm xuống $\Rightarrow$ Đỉnh của đồ thị hạ thấp xuống.  
  - Tổng diện tích dưới đồ thị luôn cố định bằng 1, do đó đồ thị phải dẹt và bè rộng sang hai phía.
- **Chọn A.**

### Câu 39
- **Công thức phương sai mẫu gộp tổng quát:**  
  - Số trung bình của mẫu gộp 5 công nhân:  
    $\bar{x} = \dfrac{n_1 \bar{x}_1 + n_2 \bar{x}_2}{n_1 + n_2} = \dfrac{2(3) + 3(8)}{2 + 3} = \dfrac{6 + 24}{5} = \dfrac{30}{5} = 6$.  
  - Công thức phương sai mẫu gộp:  
    $s^2 = \dfrac{1}{n_1 + n_2} \left[ n_1 \big(s_1^2 + (\bar{x}_1 - \bar{x})^2\big) + n_2 \big(s_2^2 + (\bar{x}_2 - \bar{x})^2\big) \right]$.  
  Thay số:  
  $s^2 = \dfrac{1}{5} \left[ 2\big(1 + (3 - 6)^2\big) + 3\big(1 + (8 - 6)^2\big) \right]$.  
  $s^2 = \dfrac{1}{5} \left[ 2(1 + 9) + 3(1 + 4) \right] = \dfrac{1}{5} [2(10) + 3(5)] = \dfrac{1}{5} [20 + 15] = \dfrac{35}{5} = 7$.
- **Chọn C.**

### Câu 40
- **Phương pháp tính tay:**  
  Áp dụng định nghĩa xác suất có điều kiện:  
  $P(X > 0 \mid X > -1) = \dfrac{P(X > 0 \cap X > -1)}{P(X > -1)} = \dfrac{P(X > 0)}{P(X > -1)}$.  
  - Vì $X \sim \mathcal{N}(0; 1)$ có $\mu = 0$, nên $P(X > 0) = 0{,}5$.  
  - Do tính đối xứng qua 0: $P(X \le -1) = P(X \ge 1) = 0{,}16$.  
    Suy ra: $P(X > -1) = 1 - P(X \le -1) = 1 - 0{,}16 = 0{,}84$.  
  Thay vào công thức:  
  $P(X > 0 \mid X > -1) = \dfrac{0{,}50}{0{,}84} = \dfrac{50}{84} = \dfrac{25}{42}$.
- **Chọn D.**
