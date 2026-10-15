# HƯỚNG DẪN GIẢI CHI TIẾT & PHÂN TÍCH BẪY (TRAP ANALYSIS)
## CHUYÊN ĐỀ ĐẶC BIỆT: TẬP HỢP & BẤT ĐẲNG THỨC
**Mã đề thi:** CSCA-MATH-05  
**Quy chế:** Chuẩn giải toán tính tay không dùng máy tính bỏ túi (CSCA No-Calculator Standard)  

---

## BẢNG ĐÁP ÁN NHANH (ANSWER KEY)

| Câu | Đ/A | Câu | Đ/A | Câu | Đ/A | Câu | Đ/A |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | **B** | **11** | **C** | **21** | **A** | **31** | **B** |
| **2** | **A** | **12** | **D** | **22** | **C** | **32** | **D** |
| **3** | **C** | **13** | **A** | **23** | **B** | **33** | **A** |
| **4** | **D** | **14** | **B** | **24** | **D** | **34** | **C** |
| **5** | **B** | **15** | **C** | **25** | **A** | **35** | **B** |
| **6** | **A** | **16** | **D** | **26** | **C** | **36** | **D** |
| **7** | **C** | **17** | **A** | **27** | **B** | **37** | **A** |
| **8** | **D** | **18** | **C** | **28** | **D** | **38** | **C** |
| **9** | **B** | **19** | **B** | **29** | **A** | **39** | **B** |
| **10**| **A** | **20** | **D** | **30** | **C** | **40** | **D** |

---

## HƯỚNG DẪN GIẢI CHI TIẾT TỪNG CÂU

### Câu 1
- **Phương pháp tính tay:**  
  Giao của hai tập hợp $A \cap B$ là tập hợp gồm các phần tử vừa thuộc $A$ vừa thuộc $B$.  
  Ta thấy phần tử chung giữa $A = \{1; 2; 3; 4\}$ và $B = \{3; 4; 5; 6\}$ là $3$ và $4$.  
  Do đó $A \cap B = \{3; 4\}$.
- **Phân tích bẫy:** Thí sinh nhầm lẫn giữa ký hiệu giao ($\cap$) và hợp ($\cup$), chọn $\{1; 2; 3; 4; 5; 6\}$ (Phương án C).
- **Chọn B.**

### Câu 2
- **Phương pháp tính tay:**  
  Hợp của hai khoảng $A = (-2; 3)$ và $B = [1; 5)$ là tập hợp tất cả các số thực thuộc $A$ hoặc thuộc $B$.  
  Biểu diễn trên trục số: khoảng từ $-2$ đến $3$ gộp với nửa khoảng từ $1$ đến $5$ tạo thành khoảng liên tục $(-2; 5)$.
- **Phân tích bẫy:** Nhầm hợp với giao (giao là $[1; 3)$ - Phương án B).
- **Chọn A.**

### Câu 3
- **Phương pháp tính tay:**  
  Hiệu của hai tập hợp $A \setminus B$ là tập hợp các phần tử thuộc $A$ nhưng không thuộc $B$.  
  $A = [-1; 4]$ và $B = (2; 6)$.  
  Vì khoảng $B = (2; 6)$ không chứa số $2$, nên khi loại bỏ các phần tử của $B$ ra khỏi $A$, số $2$ vẫn nằm lại trong $A$.  
  Vậy $A \setminus B = [-1; 2]$.
- **Phân tích bẫy:** Bẫy kinh điển về ngoặc tròn vs ngoặc vuông. Rất nhiều học sinh nghĩ rằng $B$ bắt đầu từ $2$ nên loại bỏ cả số $2$, dẫn đến chọn $[-1; 2)$ (Phương án A).
- **Chọn C.**

### Câu 4
- **Phương pháp tính tay:**  
  Phần bù của $A$ trong $\mathbb{R}$ là $C_{\mathbb{R}} A = \mathbb{R} \setminus A$.  
  Tập $A = (-\infty; 3]$ đã lấy mút $3$ (ngoặc vuông).  
  Do đó phần bù của $A$ không được chứa điểm $3$, tức là khoảng $(3; +\infty)$.
- **Phân tích bẫy:** Nhầm lẫn đầu mút ngoặc vuông/tròn dẫn tới chọn $[3; +\infty)$ (Phương án A).
- **Chọn D.**

### Câu 5
- **Phương pháp tính tay:**  
  Nhẩm nghiệm bằng định lý Viète: $x^2 - 5x + 6 = 0$ có $S = 5, P = 6 \implies x_1 = 2, x_2 = 3$.  
  Bất phương trình có hệ số $a = 1 > 0$ và dấu $< 0$ ("trong trái ngoài cùng"), do đó nghiệm nằm trong khoảng hai nghiệm: $2 < x < 3$.  
  Tập nghiệm là $(2; 3)$.
- **Phân tích bẫy:** Đề bài dùng dấu bất đẳng thức ngặt $(<)$, nếu chọn ngoặc vuông $[2; 3]$ (Phương án C) là sai.
- **Chọn B.**

### Câu 6
- **Phương pháp tính tay:**  
  Tam thức bậc hai $f(x) = x^2 - 2x + 3$ có $\Delta' = (-1)^2 - 1 \cdot 3 = -2 < 0$.  
  Hệ số $a = 1 > 0$.  
  Vì $\Delta' < 0$ và $a > 0$, tam thức luôn cùng dấu với hệ số $a$ với mọi $x \in \mathbb{R}$, tức $x^2 - 2x + 3 > 0, \, \forall x \in \mathbb{R}$.  
  (Hoặc biến đổi hằng đẳng thức: $x^2 - 2x + 3 = (x - 1)^2 + 2 \ge 2 > 0$ luôn đúng).  
  Tập nghiệm là $\mathbb{R}$.
- **Phân tích bẫy:** Thấy $\Delta < 0$ vội vàng kết luận phương trình vô nghiệm nên bất phương trình cũng vô nghiệm $\emptyset$ (Phương án B).
- **Chọn A.**

### Câu 7
- **Phương pháp tính tay:**  
  Dạng $|A| \le c$ ($c > 0$) tương đương $-c \le A \le c$.  
  Ta có: $-3 \le 2x - 1 \le 3 \iff -2 \le 2x \le 4 \iff -1 \le x \le 2$.  
  Tập nghiệm là $[-1; 2]$.
- **Phân tích bẫy:** Nhầm lẫn cộng trừ hai vế hoặc đổi dấu bất đẳng thức.
- **Chọn C.**

### Câu 8
- **Phương pháp tính tay:**  
  Dạng $|A| > c$ ($c > 0$) tương đương $A > c$ hoặc $A < -c$.  
  $\left[\begin{array}{l} x - 2 > 3 \\ x - 2 < -3 \end{array}\right. \iff \left[\begin{array}{l} x > 5 \\ x < -1 \end{array}\right.$.  
  Tập nghiệm là $(-\infty; -1) \cup (5; +\infty)$.
- **Phân tích bẫy:** Nhầm $|A| > c$ với $|A| < c$ dẫn đến chọn khoảng $(-1; 5)$ (Phương án A).
- **Chọn D.**

### Câu 9
- **Phương pháp tính tay:**  
  Dấu của thương $\dfrac{x - 1}{x + 2}$ cùng dấu với tích $(x - 1)(x + 2)$.  
  Nghiệm của tử và mẫu lần lượt là $x = 1$ và $x = -2$.  
  Thương nhận giá trị dương ở ngoài khoảng hai nghiệm: $x < -2$ hoặc $x > 1$.  
  Tập nghiệm là $(-\infty; -2) \cup (1; +\infty)$.
- **Phân tích bẫy:** Tự ý nhân chéo mẫu $x + 2$ sang vế phải thành $x - 1 > 0 \iff x > 1$, làm mất hoàn toàn khoảng nghiệm âm $(-\infty; -2)$.
- **Chọn B.**

### Câu 10
- **Phương pháp tính tay:**  
  Vì $x > 0$ nên $\dfrac{9}{x} > 0$. Áp dụng bất đẳng thức AM-GM (Cauchy) cho hai số dương:  
  $P = x + \dfrac{9}{x} \ge 2\sqrt{x \cdot \dfrac{9}{x}} = 2\sqrt{9} = 6$.  
  Dấu "=" xảy ra khi $x = \dfrac{9}{x} \iff x^2 = 9 \iff x = 3$ (thỏa mãn $x > 0$).  
  Vậy giá trị nhỏ nhất của $P$ bằng $6$.
- **Phân tích bẫy:** Quên nhân hệ số $2$ trong công thức $a + b \ge 2\sqrt{ab}$, ra kết quả $3$ (Phương án C).
- **Chọn A.**

### Câu 11
- **Phương pháp tính tay:**  
  Điều kiện mẫu số: $x + 1 \ne 0 \iff x \ne -1$.  
  Nghiệm của tử số: $x = 3$ (tử bằng $0$ được chấp nhận vì có dấu $\ge$).  
  Nghiệm của mẫu số: $x = -1$ (bắt buộc lấy ngoặc tròn vì làm mẫu bằng $0$).  
  Xét dấu phân thức trên trục số: dương trên $(-\infty; -1)$ và $[3; +\infty)$.  
  Vậy tập nghiệm là $(-\infty; -1) \cup [3; +\infty)$.
- **Phân tích bẫy:** Thấy dấu $\ge 0$ liền lấy ngoặc vuông ở cả hai đầu mút $[ -1 ]$ thành $(-\infty; -1] \cup [3; +\infty)$ (Phương án A), vi phạm điều kiện xác định.
- **Chọn C.**

### Câu 12
- **Phương pháp tính tay:**  
  Đổi dấu tử số để đưa về dạng chuẩn có hệ số cao nhất dương:  
  $\dfrac{2 - x}{x + 3} \ge 0 \iff \dfrac{x - 2}{x + 3} \le 0$.  
  Điều kiện: $x \ne -3$.  
  Hai nghiệm là $x = -3$ và $x = 2$. Phân thức nhận dấu âm (hoặc bằng 0) trong đoạn giữa hai nghiệm.  
  Vì mẫu $x + 3 \ne 0$ nên tại $-3$ lấy ngoặc tròn, tại $2$ lấy ngoặc vuông.  
  Tập nghiệm là $(-3; 2]$.
- **Phân tích bẫy:** Bẫy dấu âm ở tử $(2 - x)$ khiến nhiều thí sinh quên đảo chiều bất phương trình, hoặc lấy ngoặc vuông tại mẫu $[-3; 2]$.
- **Chọn D.**

### Câu 13
- **Phương pháp tính tay:**  
  Giá trị tuyệt đối của một biểu thức luôn không âm với mọi số thực: $|3x - 5| \ge 0, \, \forall x \in \mathbb{R}$.  
  Do $-2 < 0$, bất đẳng thức $|3x - 5| < -2$ không thể xảy ra với bất kỳ giá trị nào của $x$.  
  Tập nghiệm là $\emptyset$.
- **Phân tích bẫy:** Thí sinh áp dụng máy móc quy tắc $-c < A < c$ thành $2 < 3x - 5 < -2$ dẫn đến hệ vô nghiệm nhưng loay hoay tính toán mất thời gian hoặc chọn bừa.
- **Chọn A.**

### Câu 14
- **Phương pháp tính tay:**  
  Vì $|2x + 1| \ge 0$ với mọi $x \in \mathbb{R}$, mà $0 > -3$, nên bất đẳng thức $|2x + 1| \ge -3$ hiển nhiên nghiệm đúng với mọi $x \in \mathbb{R}$.  
  Tập nghiệm là $\mathbb{R}$.
- **Phân tích bẫy:** Nhìn thấy số âm bên vế phải vội vàng kết luận phương trình/bất phương trình vô nghiệm $\emptyset$ (Phương án A).
- **Chọn B.**

### Câu 15
- **Phương pháp tính tay:**  
  Trong chương trình chuẩn CSCA, tập hợp số tự nhiên $\mathbb{N} = \{0; 1; 2; 3; \dots\}$.  
  Do đó tập vũ trụ $U = \{x \in \mathbb{N} \mid x < 6\} = \{0; 1; 2; 3; 4; 5\}$.  
  Tập $A = \{1; 3; 5\}$.  
  Phần bù $C_U A = U \setminus A = \{0; 2; 4\}$.
- **Phân tích bẫy:** Quên mất số $0$ thuộc $\mathbb{N}$, chỉ liệt kê $U = \{1; 2; 3; 4; 5\}$, dẫn tới chọn $\{2; 4\}$ (Phương án A).
- **Chọn C.**

### Câu 16
- **Phương pháp tính tay:**  
  Điều kiện xác định: $x - 1 \ne 0 \iff x \ne 1$.  
  Với mọi $x \ne 1$, mẫu số $(x - 1)^2 > 0$ luôn dương.  
  Do đó phân thức mang dấu dương khi và chỉ khi tử số dương: $x - 2 > 0 \iff x > 2$.  
  Vì mọi $x > 2$ hiển nhiên thỏa mãn $x \ne 1$, tập nghiệm là $(2; +\infty)$.
- **Phân tích bẫy:** Thấy điều kiện $x \ne 1$ liền viết $(2; +\infty) \setminus \{1\}$ một cách máy móc, hoặc nhầm sang khoảng $(1; +\infty)$.
- **Chọn D.**

### Câu 17
- **Phương pháp tính tay:**  
  Điều kiện: $x \ne 1$.  
  Vì $(x - 1)^2 > 0$ với mọi $x \ne 1$, phân thức $\ge 0 \iff x - 2 \ge 0 \iff x \ge 2$.  
  Các số thực $x \ge 2$ đều khác $1$, do đó tập nghiệm là $[2; +\infty)$.
- **Phân tích bẫy:** Nhầm tưởng rằng tại nghiệm của mẫu $x = 1$ cũng phải xét thêm điều kiện vào tập nghiệm thành $[2; +\infty) \cup \{1\}$ (Phương án B) trong khi tại $x = 1$ phân thức không xác định!
- **Chọn A.**

### Câu 18
- **Phương pháp tính tay:**  
  Xét thừa số $(x - 3)^2$: Ta luôn có $(x - 3)^2 \ge 0, \, \forall x \in \mathbb{R}$.  
  - Trường hợp 1: $(x - 3)^2 = 0 \iff x = 3$. Thay $x = 3$ vào BPT ta được $0 \le 0$ (luôn đúng). Vậy $x = 3$ là một nghiệm.  
  - Trường hợp 2: $x \ne 3 \implies (x - 3)^2 > 0$. Chia cả hai vế cho số dương $(x - 3)^2$:  
    $x + 2 \le 0 \iff x \le -2$.  
  Kết hợp hai trường hợp: $x \le -2$ hoặc $x = 3$.  
  Tập nghiệm là $(-\infty; -2] \cup \{3\}$.
- **Phân tích bẫy:** Bẫy nghiệm bội chẵn kinh điển! Học sinh thường chia bỏ ngay $(x - 3)^2$ mà quên mất giá trị làm thừa số này bằng $0$ ($x = 3$), dẫn đến chỉ chọn $(-\infty; -2]$ (Phương án A).
- **Chọn C.**

### Câu 19
- **Phương pháp tính tay:**  
  Tam thức $f(x) = x^2 - 2(m - 1)x + 4$ có $a = 1 > 0$.  
  Để $f(x) > 0, \, \forall x \in \mathbb{R}$ thì $\Delta' < 0$:  
  $\Delta' = [-(m - 1)]^2 - 1 \cdot 4 = (m - 1)^2 - 4 < 0$.  
  $(m - 1)^2 < 4 \iff -2 < m - 1 < 2 \iff -1 < m < 3$.  
  Vậy $m \in (-1; 3)$.
- **Phân tích bẫy:** Nhầm lẫn giữa bất phương trình ngặt ($> 0$, cần $\Delta < 0$) và bất phương trình không ngặt ($\ge 0$, cần $\Delta \le 0$), dẫn đến chọn $[-1; 3]$ (Phương án A).
- **Chọn B.**

### Câu 20
- **Phương pháp tính tay:**  
  Hai đoạn $A = [m; m + 2]$ và $B = [1; 4]$ có giao bằng rỗng $A \cap B = \emptyset$ khi và chỉ khi đoạn $A$ nằm hoàn toàn bên trái hoặc hoàn toàn bên phải đoạn $B$:  
  - Nằm hoàn toàn bên trái: đầu mút phải của $A$ nhỏ hơn đầu mút trái của $B$: $m + 2 < 1 \iff m < -1$.  
  - Nằm hoàn toàn bên phải: đầu mút trái của $A$ lớn hơn đầu mút phải của $B$: $m > 4$.  
  Vậy $m < -1$ hoặc $m > 4$.
- **Phân tích bẫy:** Lấy cả dấu bằng $m \le -1$ hoặc $m \ge 4$ (Phương án B). Nếu $m = -1$ thì $A = [-1; 1]$, khi đó $A \cap B = \{1\} \ne \emptyset$.
- **Chọn D.**

### Câu 21
- **Phương pháp tính tay:**  
  Để đoạn $A = [1; 3]$ là tập con của đoạn $B = [m - 1; 2m + 1]$ thì đầu mút trái của $B$ phải $\le$ đầu mút trái của $A$, và đầu mút phải của $B$ phải $\ge$ đầu mút phải của $A$:  
  $\begin{cases} m - 1 \le 1 \\ 2m + 1 \ge 3 \end{cases} \iff \begin{cases} m \le 2 \\ 2m \ge 2 \end{cases} \iff \begin{cases} m \le 2 \\ m \ge 1 \end{cases} \iff 1 \le m \le 2$.  
  (Với $1 \le m \le 2$, đoạn $B$ luôn thỏa mãn $m - 1 < 2m + 1$ nên là đoạn hợp lệ).
- **Phân tích bẫy:** Chỉ xét một đầu mút hoặc nhầm chiều bất đẳng thức.
- **Chọn A.**

### Câu 22
- **Phương pháp tính tay:**  
  Theo công thức hợp của hai tập hợp hữu hạn:  
  Số học sinh thích ít nhất một môn Toán hoặc Văn là:  
  $|T \cup V| = |T| + |V| - |T \cap V| = 18 + 15 - 10 = 23$ học sinh.  
  Số học sinh không thích môn nào trong hai môn là:  
  $30 - 23 = 7$ học sinh.
- **Phân tích bẫy:** Lấy $30 - 18 - 15 = -3$ hoặc quên trừ phần giao dẫn tới tính sai.
- **Chọn C.**

### Câu 23
- **Phương pháp tính tay:**  
  Phân tích tử số thành nhân tử: $x^2 - 4x + 3 = (x - 1)(x - 3)$.  
  BPT trở thành: $\dfrac{(x - 1)(x - 3)}{x - 2} \le 0$.  
  Điều kiện: $x \ne 2$.  
  Các điểm làm tử và mẫu triệt tiêu là $1, 2, 3$.  
  Lập trục xét dấu:  
  - $x < 1$: âm (nhận, kể cả $x = 1$).  
  - $1 < x < 2$: dương (loại).  
  - $2 < x < 3$: âm (nhận, kể cả $x = 3$, không lấy $x = 2$).  
  - $x > 3$: dương (loại).  
  Tập nghiệm là $(-\infty; 1] \cup (2; 3]$.
- **Phân tích bẫy:** Lấy ngoặc vuông tại $2$ thành $[2; 3]$ (Phương án A), làm mẫu số bằng $0$.
- **Chọn B.**

### Câu 24
- **Phương pháp tính tay:**  
  Chuyển vế quy đồng (tuyệt đối không bỏ mẫu):  
  $\dfrac{1}{x - 1} \le 1 \iff \dfrac{1}{x - 1} - 1 \le 0 \iff \dfrac{1 - (x - 1)}{x - 1} \le 0 \iff \dfrac{2 - x}{x - 1} \le 0$.  
  Nghiệm tử: $x = 2$ (lấy ngoặc vuông). Nghiệm mẫu: $x = 1$ (ngoặc tròn).  
  Hệ số của $x$ ở tử là $-1 < 0$, ở mẫu là $1 > 0 \implies$ khoảng ngoài mang dấu âm.  
  Vậy phân thức $\le 0$ khi $x < 1$ hoặc $x \ge 2$.  
  Tập nghiệm là $(-\infty; 1) \cup [2; +\infty)$.
- **Phân tích bẫy:** Bẫy nguy hiểm nhất trong giải BPT: quy đồng bỏ mẫu $1 \le x - 1 \iff x \ge 2$ dẫn đến chọn $[2; +\infty)$ (Phương án A), mất trắng khoảng nghiệm $(-\infty; 1)$.
- **Chọn D.**

### Câu 25
- **Phương pháp tính tay:**  
  Vì cả hai vế đều là giá trị tuyệt đối không âm, bình phương hai vế:  
  $(2x - 3)^2 < (x + 1)^2 \iff (2x - 3)^2 - (x + 1)^2 < 0$.  
  Dùng hằng đẳng thức hiệu hai bình phương $A^2 - B^2 = (A - B)(A + B)$:  
  $[(2x - 3) - (x + 1)][(2x - 3) + (x + 1)] < 0 \iff (x - 4)(3x - 2) < 0$.  
  Hai nghiệm là $\dfrac{2}{3}$ và $4$. Bất phương trình lấy khoảng giữa: $\dfrac{2}{3} < x < 4$.  
  Tập nghiệm là $\left(\dfrac{2}{3}; 4\right)$.
- **Phân tích bẫy:** Khai triển $4x^2 - 12x + 9 < x^2 + 2x + 1 \iff 3x^2 - 14x + 8 < 0$, nếu nhẩm nghiệm sai dấu sẽ ra kết quả sai.
- **Chọn A.**

### Câu 26
- **Phương pháp tính tay:**  
  Hệ số $a = m - 1$ có chứa tham số, bắt buộc phải xét trường hợp $a = 0$:  
  - Trường hợp 1: $m - 1 = 0 \iff m = 1$.  
    BPT trở thành: $0 \cdot x^2 - 2 \cdot 0 \cdot x + 3 > 0 \iff 3 > 0$ (luôn đúng với mọi $x \in \mathbb{R}$).  
    Do đó $m = 1$ thỏa mãn!  
  - Trường hợp 2: $m - 1 \ne 0 \iff m \ne 1$.  
    BPT là tam thức bậc hai, nghiệm đúng với mọi $x \in \mathbb{R}$ khi và chỉ khi:  
    $\begin{cases} a > 0 \\ \Delta' < 0 \end{cases} \iff \begin{cases} m - 1 > 0 \\ [-(m - 1)]^2 - 3(m - 1) < 0 \end{cases}$.  
    Ta có: $(m - 1)^2 - 3(m - 1) = (m - 1)(m - 1 - 3) = (m - 1)(m - 4) < 0$.  
    Vì $m - 1 > 0$ nên $m - 4 < 0 \iff m < 4$.  
    Suy ra $1 < m < 4$.  
  Kết hợp hai trường hợp: $1 \le m < 4$.
- **Phân tích bẫy:** Bẫy kinh điển số 1 của BPT chứa tham số: quên xét $a = 0$, vội vã dùng $\Delta < 0$ dẫn đến chỉ có $1 < m < 4$ (Phương án A), bỏ mất giá trị $m = 1$.
- **Chọn C.**

### Câu 27
- **Phương pháp tính tay:**  
  Tách biến số để làm xuất hiện biểu thức mẫu số rồi dùng AM-GM:  
  $P = x + \dfrac{4}{x - 1} = (x - 1) + \dfrac{4}{x - 1} + 1$.  
  Vì $x > 1 \implies x - 1 > 0$. Áp dụng BĐT AM-GM:  
  $(x - 1) + \dfrac{4}{x - 1} \ge 2\sqrt{(x - 1) \cdot \dfrac{4}{x - 1}} = 2\sqrt{4} = 4$.  
  Suy ra $P \ge 4 + 1 = 5$.  
  Dấu "=" xảy ra khi $x - 1 = \dfrac{4}{x - 1} \iff (x - 1)^2 = 4 \iff x - 1 = 2 \iff x = 3$ (thỏa mãn $x > 1$).  
  Vậy GTNN của $P$ bằng $5$.
- **Phân tích bẫy:** Áp dụng AM-GM cho $(x - 1) + \dfrac{4}{x - 1} \ge 4$ nhưng quên cộng lại số $1$ đã bớt ra, chọn $4$ (Phương án A).
- **Chọn B.**

### Câu 28
- **Phương pháp tính tay:**  
  Bất phương trình dạng $\sqrt{A} < B$ tương đương với hệ điều kiện:  
  $\begin{cases} A \ge 0 \\ B > 0 \\ A < B^2 \end{cases} \iff \begin{cases} 2x - 1 \ge 0 \\ x - 2 > 0 \\ 2x - 1 < (x - 2)^2 \end{cases} \iff \begin{cases} x \ge 1/2 \\ x > 2 \\ 2x - 1 < x^2 - 4x + 4 \end{cases}$.  
  Giải BPT thứ ba: $x^2 - 6x + 5 > 0 \iff (x - 1)(x - 5) > 0 \iff \left[\begin{array}{l} x < 1 \\ x > 5 \end{array}\right.$.  
  Giao với điều kiện $x > 2$, ta được $x > 5$.  
  Tập nghiệm là $(5; +\infty)$.
- **Phân tích bẫy:** Quên điều kiện $B > 0$ ($x > 2$), vội vàng bình phương ra $x < 1$ hoặc $x > 5$, sau đó giao với $x \ge 1/2$ ra khoảng sai $[1/2; 1) \cup (5; +\infty)$.
- **Chọn D.**

### Câu 29
- **Phương pháp tính tay:**  
  Bất phương trình dạng $\sqrt{A} \ge B$.  
  Điều kiện trong căn: $x + 2 \ge 0 \iff x \ge -2$.  
  - Trường hợp 1: Vế phải âm: $x < 0$.  
    Vì $\sqrt{x + 2} \ge 0$ luôn lớn hơn số âm $x$, nên BPT luôn đúng với mọi $x \in [-2; 0)$.  
  - Trường hợp 2: Vế phải không âm: $x \ge 0$.  
    Bình phương hai vế: $x + 2 \ge x^2 \iff x^2 - x - 2 \le 0 \iff (x + 1)(x - 2) \le 0 \iff -1 \le x \le 2$.  
    Kết hợp $x \ge 0$ được $0 \le x \le 2$.  
  Hợp hai trường hợp: $[-2; 0) \cup [0; 2] = [-2; 2]$.
- **Phân tích bẫy:** Thí sinh chỉ bình phương hai vế mà quên trường hợp vế phải âm, dẫn đến chỉ giải được $[-1; 2]$ và bỏ sót khoảng $[-2; -1)$.
- **Chọn A.**

### Câu 30
- **Phương pháp tính tay:**  
  Phân tích đa thức thành nhân tử: $\dfrac{(x - 3)(x + 3)}{x(x - 2)} \le 0$.  
  Điều kiện mẫu số: $x \ne 0$ và $x \ne 2$.  
  Các điểm mốc trên trục số: $-3, 0, 2, 3$.  
  Lập bảng xét dấu:  
  - $x < -3$: dương  
  - $-3 \le x < 0$: âm (nhận $[-3; 0)$, chú ý ngoặc vuông tại $-3$, ngoặc tròn tại $0$).  
  - $0 < x < 2$: dương  
  - $2 < x \le 3$: âm (nhận $(2; 3]$, chú ý ngoặc tròn tại $2$, ngoặc vuông tại $3$).  
  - $x > 3$: dương  
  Tập nghiệm là $[-3; 0) \cup (2; 3]$.  
  Các nghiệm nguyên là:  
  - Trong $[-3; 0)$: $x \in \{-3; -2; -1\}$ ($3$ nghiệm).  
  - Trong $(2; 3]$: $x = 3$ ($1$ nghiệm).  
  Tổng cộng có $3 + 1 = 4$ nghiệm nguyên.
- **Phân tích bẫy:** Đếm nhầm cả $x = 0$ hoặc $x = 2$ làm mẫu bằng $0$, dẫn tới chọn $5$ nghiệm (Phương án A).
- **Chọn C.**

### Câu 31
- **Phương pháp tính tay:**  
  Tập hợp $A = \{x \in \mathbb{R} \mid x^2 - 2x + m = 0\}$.  
  Để $A = \emptyset$ thì phương trình bậc hai $x^2 - 2x + m = 0$ vô nghiệm thực.  
  Điều này tương đương với $\Delta' < 0$:  
  $\Delta' = (-1)^2 - 1 \cdot m = 1 - m < 0 \iff m > 1$.
- **Phân tích bẫy:** Nhầm $A = \emptyset$ với $A \ne \emptyset$ (có nghiệm, $\Delta' \ge 0 \iff m \le 1$).
- **Chọn B.**

### Câu 32
- **Phương pháp tính tay:**  
  Áp dụng bất đẳng thức Cauchy-Schwarz (Bunhiacopxki) cho hai bộ số $(2, 1)$ và $(x, y)$:  
  $S^2 = (2x + 1y)^2 \le (2^2 + 1^2)(x^2 + y^2) = (4 + 1) \cdot 5 = 25$.  
  $\implies -5 \le S \le 5$.  
  Giá trị lớn nhất của $S$ bằng $5$.  
  Dấu "=" xảy ra khi $\dfrac{x}{2} = \dfrac{y}{1} > 0 \implies x = 2y$.  
  Thay vào: $(2y)^2 + y^2 = 5 \iff 5y^2 = 5 \iff y = 1 \implies x = 2$.
- **Phân tích bẫy:** Tính ra $S^2 \le 25$ nhưng quên khai căn bậc hai, chọn $25$ (Phương án B).
- **Chọn D.**

### Câu 33
- **Phương pháp tính tay:**  
  Ý nghĩa hình học của $|x - 1| + |x - 3|$ là tổng khoảng cách từ điểm $x$ đến hai điểm $1$ và $3$ trên trục số.  
  Khoảng cách giữa $1$ và $3$ bằng $|3 - 1| = 2$.  
  - Nếu $x \in [1; 3]$ thì tổng khoảng cách luôn đúng bằng $2 \le 4$. Do đó toàn bộ đoạn $[1; 3]$ đều là nghiệm.  
  - Nếu $x > 3$: $(x - 1) + (x - 3) \le 4 \iff 2x - 4 \le 4 \iff 2x \le 8 \iff x \le 4$. Nhận $(3; 4]$.  
  - Nếu $x < 1$: $(1 - x) + (3 - x) \le 4 \iff 4 - 2x \le 4 \iff 2x \ge 0 \iff x \ge 0$. Nhận $[0; 1)$.  
  Hợp tất cả các khoảng lại ta được: $[0; 4]$.
- **Phân tích bẫy:** Chỉ xét trường hợp $x$ nằm giữa $1$ và $3$, kết luận đoạn $[1; 3]$ (Phương án B).
- **Chọn A.**

### Câu 34
- **Phương pháp tính tay:**  
  Xét tam thức ở mẫu: $2x^2 - 2x + 3 = 2\left(x - \dfrac{1}{2}\right)^2 + \dfrac{5}{2} > 0, \, \forall x \in \mathbb{R}$  
  (vì $\Delta' = 1 - 6 = -5 < 0$ và $a = 2 > 0$).  
  Vì mẫu luôn dương với mọi $x$, ta được quyền nhân chéo hai vế mà không đổi chiều BPT:  
  $x^2 + mx - 1 < 2x^2 - 2x + 3 \iff x^2 - (m + 2)x + 4 > 0, \, \forall x \in \mathbb{R}$.  
  Tam thức bậc hai có $a = 1 > 0$, để luôn dương với mọi $x$ thì $\Delta < 0$:  
  $\Delta = [-(m + 2)]^2 - 4 \cdot 1 \cdot 4 = (m + 2)^2 - 16 < 0$.  
  $(m + 2)^2 < 16 \iff -4 < m + 2 < 4 \iff -6 < m < 2$.
- **Phân tích bẫy:** Tính nhầm $(m + 2)^2 < 16 \iff -4 < m < 4$ (quên trừ $2$), chọn Phương án A.
- **Chọn C.**

### Câu 35
- **Phương pháp tính tay:**  
  Bất phương trình đầu: $x^2 - 4x + 3 \le 0 \iff (x - 1)(x - 3) \le 0 \iff 1 \le x \le 3$. Tập nghiệm là đoạn $S_1 = [1; 3]$.  
  Bất phương trình thứ hai: $x \ge m \iff S_2 = [m; +\infty)$.  
  Tập nghiệm của hệ là giao $S_1 \cap S_2 = [1; 3] \cap [m; +\infty)$.  
  - Nếu $m < 1$: giao là đoạn $[1; 3]$ (vô số nghiệm).  
  - Nếu $1 \le m < 3$: giao là đoạn $[m; 3]$ (vô số nghiệm).  
  - Nếu $m = 3$: giao là điểm duy nhất $\{3\}$ (đúng $1$ nghiệm duy nhất $x = 3$).  
  - Nếu $m > 3$: giao là $\emptyset$ (vô nghiệm).  
  Vậy để hệ có đúng một nghiệm duy nhất thì $m = 3$.
- **Phân tích bẫy:** Nhầm lẫn đầu mút $m = 1$, nghĩ rằng $m = 1$ sẽ cho đúng một nghiệm tại $1$.
- **Chọn B.**

### Câu 36
- **Phương pháp tính tay:**  
  Để triệt tiêu biến $x^2$ khi áp dụng AM-GM, ta tách $\dfrac{16}{x}$ thành tổng của hai số hạng bằng nhau:  
  $P = x^2 + \dfrac{8}{x} + \dfrac{8}{x}$.  
  Với $x > 0$, áp dụng bất đẳng thức AM-GM cho ba số dương:  
  $P \ge 3\sqrt[3]{x^2 \cdot \dfrac{8}{x} \cdot \dfrac{8}{x}} = 3\sqrt[3]{64} = 3 \cdot 4 = 12$.  
  Dấu "=" xảy ra khi $x^2 = \dfrac{8}{x} \iff x^3 = 8 \iff x = 2$ (thỏa mãn $x > 0$).  
  Vậy giá trị nhỏ nhất của $P$ bằng $12$.
- **Phân tích bẫy:** Áp dụng AM-GM hai số $x^2 + \dfrac{16}{x} \ge 2\sqrt{16x}$ vẫn còn chứa biến $x$, không thể kết luận giá trị nhỏ nhất.
- **Chọn D.**

### Câu 37
- **Phương pháp tính tay:**  
  Tập hợp $S = \{1; 2; 3; 4; 5; 6\}$ có $6$ phần tử.  
  Số tập con khác rỗng của $S$ là $2^6 - 1 = 64 - 1 = 63$ tập con.  
  Tích của các phần tử trong tập con là số LẺ khi và chỉ khi TẤT CẢ các phần tử được chọn đều là số lẻ.  
  Các phần tử lẻ trong $S$ là $\{1; 3; 5\}$ ($3$ phần tử).  
  Số tập con khác rỗng toàn số lẻ là $2^3 - 1 = 8 - 1 = 7$ tập con.  
  Theo nguyên lý bù trừ, số tập con khác rỗng có tích là số CHẴN bằng:  
  (Tổng số tập con khác rỗng) $-$ (Số tập con toàn phần tử lẻ)  
  $= 63 - 7 = 56$ tập con.
- **Phân tích bẫy:** Quên trừ đi $1$ tập con rỗng ở cả hai bên, hoặc cố gắng đếm trực tiếp từng trường hợp có 1 chẵn, 2 chẵn... rất dễ sót hoặc trùng lặp.
- **Chọn A.**

### Câu 38
- **Phương pháp tính tay:**  
  Giải tập $A$: $x^2 - 4 \le 0 \iff -2 \le x \le 2 \implies A = [-2; 2]$.  
  Giải tập $B$: $|x - m| \le 1 \iff -1 \le x - m \le 1 \iff m - 1 \le x \le m + 1 \implies B = [m - 1; m + 1]$.  
  Để $B \subset A$ thì toàn bộ đoạn $[m - 1; m + 1]$ phải nằm trọn trong đoạn $[-2; 2]$:  
  $\begin{cases} m - 1 \ge -2 \\ m + 1 \le 2 \end{cases} \iff \begin{cases} m \ge -1 \\ m \le 1 \end{cases} \iff -1 \le m \le 1$.
- **Phân tích bẫy:** Nhầm $A \subset B$ thay vì $B \subset A$, dẫn tới điều kiện ngược chiều.
- **Chọn C.**

### Câu 39
- **Phương pháp tính tay:**  
  Các điểm làm vế trái triệt tiêu là $x = -2, x = 1, x = 3$.  
  Vì đề bài có dấu $\ge 0$, nên tất cả các điểm này đều thỏa mãn BPT. Đặc biệt, $x = -2$ chắc chắn là một nghiệm!  
  Với mọi $x \ne -2$, thừa số $(x + 2)^2 > 0$ luôn dương. Chia hai vế cho $(x + 2)^2$:  
  $(x - 1)^3 (3 - x) \ge 0$.  
  Vì $(x - 1)^3$ cùng dấu với $(x - 1)$, BPT tương đương:  
  $(x - 1)(3 - x) \ge 0 \iff 1 \le x \le 3$.  
  Kết hợp nghiệm rời rạc $x = -2$:  
  Tập nghiệm là $\{-2\} \cup [1; 3]$.
- **Phân tích bẫy:** Bẫy cực kỳ tinh vi của CSCA! Học sinh thấy $(x + 2)^2 \ge 0$ liền vứt bỏ thừa số này và giải ra đoạn $[1; 3]$ (Phương án A), quên mất điểm làm mẫu bằng không hay vế trái bằng không là $x = -2$.
- **Chọn B.**

### Câu 40
- **Phương pháp tính tay:**  
  Vì mẫu số $x^2 + x + 1 = \left(x + \dfrac{1}{2}\right)^2 + \dfrac{3}{4} > 0, \, \forall x \in \mathbb{R}$, hàm số xác định trên toàn bộ $\mathbb{R}$.  
  Đặt $y = \dfrac{x}{x^2 + x + 1} \iff yx^2 + (y - 1)x + y = 0 \quad (*)$.  
  - Nếu $y = 0 \implies x = 0$ (thỏa mãn).  
  - Nếu $y \ne 0$: Để tồn tại số thực $x$ thỏa mãn phương trình bậc hai $(*)$, điều kiện cần và đủ là $\Delta \ge 0$:  
    $\Delta = (y - 1)^2 - 4 \cdot y \cdot y = y^2 - 2y + 1 - 4y^2 = -3y^2 - 2y + 1 \ge 0$.  
    $3y^2 + 2y - 1 \le 0 \iff (3y - 1)(y + 1) \le 0 \iff -1 \le y \le \dfrac{1}{3}$.  
  Do đó giá trị lớn nhất của $y$ bằng $\dfrac{1}{3}$.  
  Dấu "=" đạt được khi $x = -\dfrac{y - 1}{2y} = -\dfrac{1/3 - 1}{2/3} = 1$ (thử lại: $y(1) = \dfrac{1}{1 + 1 + 1} = \dfrac{1}{3}$).
- **Phân tích bẫy:** Áp dụng AM-GM vội vàng cho cả mẫu khi $x < 0$, hoặc tính sai $\Delta$ của phương trình bậc hai.
- **Chọn D.**
