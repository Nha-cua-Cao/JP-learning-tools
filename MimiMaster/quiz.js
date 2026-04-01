/**
 * quiz.js — Logic chính của BlazePoll Quiz App
 * Ứng dụng quiz nghe–chọn đáp án cho tiếng Nhật
 *
 * Cấu trúc code:
 *   1. DataManager  — Xử lý dữ liệu TSV, lọc, nhóm
 *   2. AudioPlayer  — Phát âm bằng Web Speech API
 *   3. QuizEngine   — Logic tạo câu hỏi, xáo trộn, tính điểm
 *   4. UIRenderer   — Render giao diện HTML
 *   5. App          — Controller tổng hợp, xử lý sự kiện
 */

'use strict';

/* ══════════════════════════════════════════════════════
   1. DATA MANAGER — Quản lý và xử lý dữ liệu TSV
══════════════════════════════════════════════════════ */
const DataManager = (() => {

  // Mảng lưu toàn bộ sách và unit
  let bookUnits = [];

  // Mảng lưu toàn bộ câu hỏi đã parse
  let allItems = [];

  // Tập hợp filter hiện tại: { "GiaoTrinh___Unit" }
  let selectedFilters = new Set();

  /**
   * Dùng meta TSV để load sidebar trước, không cần phải load toàn bộ câu hỏi
   * Cấu trúc cột: Book\tUnit\tCount\tUrl
   */
  function parseMetaTSV(metaRaw) {
    const lines = metaRaw.trim().split('\n');
    const result = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const cols = trimmed.split('\t');
      if (cols.length < 4) return; // Bỏ qua dòng thiếu cột

      const book = cols[0].trim();
      const unit = cols[1].trim();
      const count = cols[2].trim();
      const url = cols[3].trim();

      result.push({
        book, unit, count, url, isLoaded: false
      });
    });

    return result;
  }

  /**
   * loadMetaData — Load dữ liệu metadata vào DataManager
   */
  function loadMetaData(metaRawTSV) {
    bookUnits = parseMetaTSV(metaRawTSV);
    // Mặc định chọn tất cả khi load lần đầu
    selectedFilters.clear();
    return bookUnits.length;
  }

  /**
   * parseTSV — Chuyển chuỗi TSV thành mảng object
   * Cấu trúc cột: STT | Câu JP | Đồng nghĩa JP | Tiếng Việt | Unit | Giáo trình
   */
  function parseTSV(raw) {
    const lines = raw.trim().split('\n');
    const result = [];

    lines.forEach((line) => {
      // Bỏ qua dòng header (dòng đầu tiên có chữ "STT" hoặc "stt")
      const trimmed = line.trim();
      if (!trimmed) return;

      const cols = trimmed.split('\t');
      if (cols.length < 6) return; // Bỏ qua dòng thiếu cột

      const stt = cols[0].trim();
      if (stt.toLowerCase() === 'stt' || isNaN(Number(stt))) return;

      result.push({
        id:       Number(stt),
        japanese: cols[1].trim(),   // Câu tiếng Nhật (phát âm)
        synonym:  cols[2].trim(),   // Câu đồng nghĩa tiếng Nhật
        vietnamese: cols[3].trim(), // Câu tiếng Việt
        unit:     cols[4].trim(),   // Unit
        book:     cols[5].trim(),   // Giáo trình
      });
    });

    return result;
  }

  /**
   * loadData — Load dữ liệu vào DataManager
   */
  function loadData(rawTSV) {
    // Add các câu hỏi mới vào allItems (giữ nguyên các câu đã load trước đó)
    allItems.push(...parseTSV(rawTSV));
    selectedFilters.clear();
    return allItems.length;
  }

  /**
   * lazyLoadUnit — Lazy load dữ liệu cho một unit cụ thể
   */
  async function lazyLoadUnit(book, unit) {
    if (isLoaded(book, unit)) return;

    const bookUnit = bookUnits.find(u => u.book === book && u.unit === unit);
    if (!bookUnit || !bookUnit.url) return;

    const r = await fetch(bookUnit.url);
    const tsv = await r.text();
    loadData(book, unit, tsv);
  }

  /**
   * makeKey — Tạo key duy nhất cho cặp (giáo trình, unit)
   */
  function makeKey(book, unit) {
    return `${book}___${unit}`;
  }

  /**
   * getGroupedData — Nhóm dữ liệu theo giáo trình → unit
   * Trả về: [{ book, units: [...] }]
   */
  function getGroupedData() {
    const map = new Map();
    bookUnits.forEach(item => {
      if (!map.has(item.book)) map.set(item.book, new Set());
      map.get(item.book).add(item.unit);
    });

    return Array.from(map.entries()).map(([book, unitSet]) => ({
      book,
      units: Array.from(unitSet).sort((a, b) => {
        // Sắp xếp unit theo số (nếu có)
        const na = parseFloat(a), nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      }),
    }));
  }

  /**
   * getFilteredItems — Lấy danh sách câu hỏi theo filter đang chọn
   */
  function getFilteredItems() {
    if (selectedFilters.size === 0) return [];
    return allItems.filter(item =>
      selectedFilters.has(makeKey(item.book, item.unit))
    );
  }

  /**
   * getFilteredCount — Lấy số lượng câu hỏi được lọc
   */
  function getFilteredCount() {
    if (selectedFilters.size === 0) return 0;
    return bookUnits.filter(item =>
      selectedFilters.has(makeKey(item.book, item.unit))
    ).reduce((sum, item) => sum + parseInt(item.count), 0);
  }


  /**
   * toggleFilter — Bật/tắt filter cho một cặp (book, unit)
   */
  function toggleFilter(book, unit) {
    const key = makeKey(book, unit);
    if (selectedFilters.has(key)) {
      selectedFilters.delete(key);
    } else {
      selectedFilters.add(key);
    }
  }

  /**
   * setBookFilter — Bật/tắt toàn bộ unit của một giáo trình
   */
  function setBookFilter(book, units, active) {
    units.forEach(u => {
      const key = makeKey(book, u);
      if (active) selectedFilters.add(key);
      else selectedFilters.delete(key);
    });
  }

  /**
   * isFilterActive — Kiểm tra filter có đang bật không
   */
  function isFilterActive(book, unit) {
    return selectedFilters.has(makeKey(book, unit));
  }

  /**
   * isBookAllActive — Kiểm tra tất cả unit của book có được chọn không
   */
  function isBookAllActive(book, units) {
    return units.every(u => selectedFilters.has(makeKey(book, u)));
  }

  /**
   * isLoaded — Kiểm tra xem unit đã được load chưa
   */
  function isLoaded(book, unit) {
    return bookUnits.some(u => u.book === book && u.unit === unit && u.isLoaded);
  }

  return {
    loadMetaData,
    loadData,
    lazyLoadUnit,
    getGroupedData,
    getFilteredItems,
    getFilteredCount,
    toggleFilter,
    setBookFilter,
    isFilterActive,
    isBookAllActive,
    isLoaded,
    getAllItems: () => allItems,
  };
})();


/* ══════════════════════════════════════════════════════
   2. AUDIO PLAYER — Phát âm bằng Web Speech API
══════════════════════════════════════════════════════ */
const AudioPlayer = (() => {

  // Số lần phát tối đa mỗi câu hỏi
  const MAX_PLAYS = 3;
  let playCount = 0;
  let isSpeaking = false;

  /**
   * speak — Phát âm một chuỗi tiếng Nhật
   * @param {string} text — Văn bản cần đọc
   * @param {Function} onDone — Callback sau khi phát xong
   */
  function speak(text, onDone) {
    if (playCount >= MAX_PLAYS) return; // Hết lượt nghe
    if (isSpeaking) {
      window.speechSynthesis.cancel(); // Huỷ nếu đang phát
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ja-JP'; // Tiếng Nhật
    utter.rate = 0.9;     // Tốc độ đọc hơi chậm để dễ nghe
    utter.pitch = 1.0;

    utter.onstart = () => { isSpeaking = true; };
    utter.onend   = () => {
      isSpeaking = false;
      if (typeof onDone === 'function') onDone();
    };
    utter.onerror = () => { isSpeaking = false; };

    playCount++;
    window.speechSynthesis.speak(utter);
    return playCount;
  }

  /**
   * reset — Reset về 3 lượt khi chuyển câu
   */
  function reset() {
    window.speechSynthesis.cancel();
    playCount = 0;
    isSpeaking = false;
  }

  /**
   * getRemaining — Số lần nghe còn lại
   */
  function getRemaining() {
    return MAX_PLAYS - playCount;
  }

  return { speak, reset, getRemaining, MAX_PLAYS };
})();


/* ══════════════════════════════════════════════════════
   3. QUIZ ENGINE — Logic quiz: câu hỏi, đáp án, điểm số
══════════════════════════════════════════════════════ */
const QuizEngine = (() => {

  // Hàng đợi câu hỏi (xáo trộn)
  let questionQueue = [];
  // Chỉ số câu hỏi hiện tại trong queue
  let currentIndex = 0;
  // Câu hỏi hiện tại
  let currentQuestion = null;
  // Đáp án của câu hỏi hiện tại (đã chọn hay chưa)
  let answered = false;
  // Điểm số: { correct, total }
  let score = { correct: 0, total: 0 };
  // Danh sách câu sai trong session
  let wrongItems = [];
  // Chế độ ôn câu sai
  let retryMode = false;

  /**
   * similarityScore — Tính điểm tương đồng giữa 2 chuỗi
   * Dùng để chọn câu nhiễu "gần giống" với đáp án đúng
   * Thuật toán: Bigram overlap (cặp ký tự)
   */
  function similarityScore(a, b) {
    if (!a || !b) return 0;
    const bigrams = (s) => {
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) {
        set.add(s.slice(i, i + 2));
      }
      return set;
    };
    const ba = bigrams(a);
    const bb = bigrams(b);
    let common = 0;
    ba.forEach(g => { if (bb.has(g)) common++; });
    return (2 * common) / (ba.size + bb.size + 0.001);
  }

  /**
   * shuffle — Xáo trộn mảng tại chỗ (Fisher-Yates)
   */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * buildQuestion — Tạo câu hỏi từ một item
   * Chọn ngẫu nhiên: đáp án đúng là đồng nghĩa JP hoặc tiếng Việt
   * Tạo 3 đáp án sai tương đồng
   */
  function buildQuestion(item, allItems) {
    // Chọn ngẫu nhiên loại đáp án đúng
    const useVietnamese = Math.random() < 0.5;
    const correctAnswer = useVietnamese ? item.vietnamese : item.synonym;
    const correctType   = useVietnamese ? 'vi' : 'jp';

    // Các item khác làm pool cho đáp án sai
    const pool = allItems.filter(i => i.id !== item.id);

    // Lấy text đáp án từ pool theo loại giống đáp án đúng
    const poolTexts = pool.map(i => ({
      text: useVietnamese ? i.vietnamese : i.synonym,
      item: i,
    })).filter(p => p.text && p.text !== correctAnswer);

    // Sắp xếp theo độ tương đồng giảm dần (câu nhiễu gần giống)
    poolTexts.sort((a, b) =>
      similarityScore(b.text, correctAnswer) - similarityScore(a.text, correctAnswer)
    );

    // Lấy top 6 để có sự đa dạng, rồi chọn ngẫu nhiên 3
    const topPool = poolTexts.slice(0, Math.min(6, poolTexts.length));
    shuffle(topPool);
    const wrongAnswers = topPool.slice(0, 3).map(p => p.text);

    // Nếu không đủ 3 câu nhiễu, fallback random từ toàn bộ pool
    while (wrongAnswers.length < 3 && poolTexts.length > wrongAnswers.length) {
      const fallback = poolTexts[wrongAnswers.length];
      if (!wrongAnswers.includes(fallback.text)) {
        wrongAnswers.push(fallback.text);
      } else {
        break;
      }
    }

    // Ghép đáp án đúng vào rồi xáo trộn
    const options = shuffle([correctAnswer, ...wrongAnswers]);

    return {
      item,
      correctAnswer,
      correctType,
      options,
    };
  }

  /**
   * init — Khởi tạo quiz với danh sách item
   */
  function init(items) {
    const allItems = DataManager.getAllItems();
    // Xáo trộn thứ tự câu hỏi
    questionQueue = shuffle([...items]).map(item => buildQuestion(item, allItems));
    currentIndex = 0;
    answered = false;
    score = { correct: 0, total: 0 };
    currentQuestion = questionQueue[currentIndex] || null;
    retryMode = false;
  }

  /**
   * initRetry — Khởi tạo chế độ ôn câu sai
   */
  function initRetry() {
    if (wrongItems.length === 0) return false;
    const allItems = DataManager.getAllItems();
    questionQueue = shuffle([...wrongItems]).map(item => buildQuestion(item, allItems));
    currentIndex = 0;
    answered = false;
    score = { correct: 0, total: 0 };
    currentQuestion = questionQueue[currentIndex] || null;
    retryMode = true;
    return true;
  }

  /**
   * getCurrent — Lấy câu hỏi hiện tại
   */
  function getCurrent() {
    return currentQuestion;
  }

  /**
   * answer — Xử lý khi người dùng chọn đáp án
   * Trả về: { isCorrect, correctAnswer }
   */
  function answer(selectedText) {
    if (answered || !currentQuestion) return null;
    answered = true;
    score.total++;

    const isCorrect = selectedText === currentQuestion.correctAnswer;
    if (isCorrect) {
      score.correct++;
    } else {
      // Lưu câu sai vào danh sách (không trùng)
      const existing = wrongItems.find(i => i.id === currentQuestion.item.id);
      if (!existing) wrongItems.push(currentQuestion.item);
    }

    return { isCorrect, correctAnswer: currentQuestion.correctAnswer };
  }

  /**
   * next — Chuyển sang câu hỏi tiếp theo
   * Trả về: true nếu còn câu, false nếu hết
   */
  function next() {
    currentIndex++;
    answered = false;
    if (currentIndex >= questionQueue.length) {
      currentQuestion = null;
      return false; // Hết câu hỏi
    }
    currentQuestion = questionQueue[currentIndex];
    return true;
  }

  /**
   * prev — Quay lại câu trước (chỉ xem lại, không thay đổi điểm)
   */
  function prev() {
    if (currentIndex <= 0) return false;
    currentIndex--;
    currentQuestion = questionQueue[currentIndex];
    answered = true; // Câu đã trả lời rồi, không cho đổi
    return true;
  }

  /**
   * isAnswered — Câu hiện tại đã được trả lời chưa
   */
  function isAnswered() { return answered; }

  return {
    init,
    initRetry,
    getCurrent,
    answer,
    next,
    prev,
    isAnswered,
    getScore:       () => ({ ...score }),
    getProgress:    () => ({ current: currentIndex + 1, total: questionQueue.length }),
    getWrongItems:  () => wrongItems,
    clearWrong:     () => { wrongItems = []; },
    isRetryMode:    () => retryMode,
  };
})();


/* ══════════════════════════════════════════════════════
   4. UI RENDERER — Render giao diện động
══════════════════════════════════════════════════════ */
const UIRenderer = (() => {

  /**
   * renderSidebar — Vẽ danh sách giáo trình + unit trong sidebar
   */
  function renderSidebar() {
    const scroll = document.getElementById('sidebarScroll');
    const groups = DataManager.getGroupedData();

    if (groups.length === 0) {
      scroll.innerHTML = `
        <div style="padding:20px 12px;color:var(--text-muted);font-size:12px;text-align:center">
          <i class="fa-solid fa-bug" style="margin-bottom:6px;font-size:18px;display:block"></i>
          Hình như có lỗi gì mất rồi. Bạn liên hệ với fanpage chúng mình để được hỗ trợ nhé!
        </div>`;
      updateFilteredCount();
      return;
    }

    scroll.innerHTML = groups.map(group => {
      const allActive = DataManager.isBookAllActive(group.book, group.units);
      return `
        <details class="book-group" open>
          <summary>
            <span>${escapeHtml(group.book)}</span>
          </summary>
          <!-- Nút chọn/bỏ chọn tất cả unit của sách -->
          <div class="units-list">
            <div class="select-all-row" onclick="App.toggleBookFilter('${escapeSingleQ(group.book)}', ${JSON.stringify(group.units)})">
              <input type="checkbox" ${allActive ? 'checked' : ''}
                style="accent-color:var(--accent);width:14px;height:14px;pointer-events:none" />
              <span>Tất cả</span>
            </div>
            ${group.units.map(unit => {
              const active = DataManager.isFilterActive(group.book, unit);
              return `
                <label class="unit-chip ${active ? 'checked' : ''}"
                  onclick="App.toggleUnitFilter('${escapeSingleQ(group.book)}', '${escapeSingleQ(unit)}')">
                  <input type="checkbox" ${active ? 'checked' : ''}
                    style="pointer-events:none" />
                  Unit ${escapeHtml(unit)}
                </label>`;
            }).join('')}
          </div>
        </details>`;
    }).join('');

    updateFilteredCount();
  } 

  /**
   * renderQuestion — Vẽ câu hỏi và đáp án lên màn hình
   */
  function renderQuestion(question, isAnswered) {
    // Cập nhật số thứ tự
    const progress = QuizEngine.getProgress();
    document.getElementById('qNumber').textContent = `#${progress.current}`;
    document.getElementById('progressText').textContent = `${progress.current} / ${progress.total}`;
    document.getElementById('progressFill').style.width =
      `${(progress.current / progress.total) * 100}%`;

    // Cập nhật điểm số
    updateScoreDisplay();

    // Reset nút loa
    updatePlayCount();

    // Render 4 đáp án
    const grid = document.getElementById('answersGrid');
    grid.innerHTML = question.options.map((opt, i) => {
      let extraClass = '';
      if (isAnswered) {
        if (opt === question.correctAnswer) extraClass = 'correct';
      }

      return `
        <button class="answer-btn ${extraClass}"
          data-text="${escapeHtml(opt)}"
          onclick="App.selectAnswer(this, '${escapeSingleQ(opt)}')"
          ${isAnswered ? 'disabled' : ''}>
          <span class="answer-badge">${i + 1}</span>
          <span>${escapeHtml(opt)}</span>
        </button>`;
    }).join('');

    // Animation vào
    document.getElementById('questionCard').classList.remove('card-enter');
    void document.getElementById('questionCard').offsetWidth; // reflow
    document.getElementById('questionCard').classList.add('card-enter');
  }

  /**
   * updatePlayCount — Cập nhật hiển thị số lần nghe còn lại
   */
  function updatePlayCount() {
    const remaining = AudioPlayer.getRemaining();
    const el = document.getElementById('playCount');
    const numEl = document.getElementById('playCountNum');
    numEl.textContent = remaining;
    el.className = 'play-count' + (remaining === 1 ? ' danger' : remaining === 2 ? ' warn' : '');

    // Nút loa: disable khi hết lượt
    const btn = document.getElementById('speakBtn');
    btn.disabled = (remaining <= 0);
  }

  /**
   * updateScoreDisplay — Cập nhật điểm số trên màn hình
   */
  function updateScoreDisplay() {
    const s = QuizEngine.getScore();
    document.getElementById('scoreNum').textContent = s.correct;
    document.getElementById('scoreDen').textContent = s.total;
    // Header score
    document.getElementById('scoreCorrect').textContent = s.correct;
    document.getElementById('scoreTotal').textContent = s.total;
    if (s.total > 0) {
      document.getElementById('headerScore').style.display = 'inline-flex';
    }
  }

  /**
   * updateFilteredCount — Cập nhật badge số câu được lọc
   */
  function updateFilteredCount() {
    const count = DataManager.getFilteredCount();
    document.getElementById('filteredCount').textContent = `${count} câu`;
  }

  /**
   * showQuizArea — Hiển thị / ẩn vùng quiz
   */
  function showQuizArea(show) {
    const quiz = document.getElementById('quizArea');
    const empty = document.getElementById('emptyState');
    if (show) {
      quiz.style.display = 'flex';
      empty.style.display = 'none';
    } else {
      quiz.style.display = 'none';
      empty.style.display = 'flex';
    }
  }

  /**
   * showEndScreen — Màn hình kết thúc quiz
   */
  function showEndScreen() {
    const s = QuizEngine.getScore();
    const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    let emoji = '🎉', msg = 'Xuất sắc!';
    if (pct < 60) { emoji = '😅'; msg = 'Cần ôn thêm nhé!'; }
    else if (pct < 80) { emoji = '👍'; msg = 'Khá tốt!'; }

    const main = document.getElementById('mainArea');
    document.getElementById('quizArea').style.display = 'none';

    // Tạo card kết quả
    const endCard = document.createElement('div');
    endCard.className = 'quiz-end-card';
    endCard.id = 'endCard';
    endCard.innerHTML = `
      <div class="quiz-end-emoji">${emoji}</div>
      <div class="quiz-end-title">${msg}</div>
      <div class="quiz-end-sub">
        Bạn đã hoàn thành ${s.total} câu hỏi.<br/>
        Câu sai cần ôn: <strong>${QuizEngine.getWrongItems().length}</strong>
      </div>
      <div class="quiz-end-score">${s.correct}<span> / ${s.total}</span></div>
      <div class="quiz-end-btns">
        <button class="ctrl-btn" onclick="App.startQuiz()">
          <i class="fa-solid fa-rotate-right"></i> Làm lại
        </button>
        ${QuizEngine.getWrongItems().length > 0 ? `
        <button class="ctrl-btn" onclick="App.toggleRetryMode()" style="border-color:var(--accent);color:var(--accent)">
          <i class="fa-solid fa-rotate-left"></i> Ôn câu sai
        </button>` : ''}
      </div>`;
    main.appendChild(endCard);
  }

  /**
   * removeEndCard — Xoá card kết thúc nếu có
   */
  function removeEndCard() {
    const el = document.getElementById('endCard');
    if (el) el.remove();
  }

  /**
   * showOverlay — Hiển thị overlay đúng/sai
   */
  function showOverlay(isCorrect) {
    const overlay = document.getElementById('resultOverlay');
    const emoji   = document.getElementById('overlayEmoji');
    const text    = document.getElementById('overlayText');

    overlay.className = 'result-overlay visible ' + (isCorrect ? 'correct-overlay' : 'wrong-overlay');
    emoji.textContent = isCorrect ? '🎉' : '😭';
    text.textContent  = isCorrect ? 'Chính xác!' : 'Sai rồi!';

    // Tự ẩn sau 900ms
    setTimeout(() => {
      overlay.className = 'result-overlay';
    }, 900);
  }

  /**
   * showToast — Thông báo nổi nhỏ ở đáy
   */
  function showToast(msg) {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // Các hàm tiện ích thoát ký tự
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeSingleQ(str) {
    return String(str).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  return {
    renderSidebar,
    renderQuestion,
    updatePlayCount,
    updateScoreDisplay,
    updateFilteredCount,
    showQuizArea,
    showEndScreen,
    removeEndCard,
    showOverlay,
    showToast,
  };
})();


/* ══════════════════════════════════════════════════════
   5. APP — Controller tổng hợp, khởi động
══════════════════════════════════════════════════════ */
const App = (() => {

  // Timer tự chuyển câu sau khi trả lời
  let autoNextTimer = null;
  // Chế độ ôn câu sai
  let inRetryMode = false;

  /**
   * init — Khởi tạo app khi trang load
   */
  async function init() {
    // Lắng nghe phím tắt
    document.addEventListener('keydown', handleKeyDown);

    // Load dữ liệu từ DB
    const r = await fetch("UnitMetaData.tsv?t=" + Date.now());
    const tsv = await r.text();
    DataManager.loadMetaData(tsv);

    // Render sidebar trống
    UIRenderer.renderSidebar();
  }

  /**
   * handleFileImport — Xử lý import file TSV
   */
  function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const count = DataManager.loadData(e.target.result);
      UIRenderer.renderSidebar();
      UIRenderer.showToast(`✅ Đã import ${count} câu từ file TSV`);
    };
    reader.onerror = () => UIRenderer.showToast('❌ Lỗi khi đọc file');
    reader.readAsText(file, 'UTF-8');

    // Reset input để có thể import lại file cũ
    event.target.value = '';
  }

  /**
   * toggleUnitFilter — Bật/tắt filter theo unit
   */
  async function toggleUnitFilter(book, unit) {
    // Lazy load unit từ bookUnits.url nếu unit chưa từng được load trước đó
    if (!DataManager.isLoaded(book, unit)) {
      await DataManager.lazyLoadUnit(book, unit);
    }

    DataManager.toggleFilter(book, unit);
    UIRenderer.renderSidebar(); // Re-render sidebar với trạng thái mới
  }

  /**
   * toggleBookFilter — Bật/tắt tất cả unit của một giáo trình
   */
  function toggleBookFilter(book, units) {
    const allActive = DataManager.isBookAllActive(book, units);
    DataManager.setBookFilter(book, units, !allActive);
    UIRenderer.renderSidebar();
  }

  /**
   * startQuiz — Khởi động quiz với filter hiện tại
   */
  function startQuiz() {
    const items = DataManager.getFilteredItems();
    if (items.length === 0) {
      UIRenderer.showToast('⚠️ Chưa chọn bài học nào!');
      return;
    }

    // Xoá card kết thúc nếu có
    UIRenderer.removeEndCard();

    // Tắt retry mode
    inRetryMode = false;
    document.getElementById('btnRetryMode').classList.remove('active');
    document.getElementById('mainArea').classList.remove('retry-mode');

    // Reset audio
    AudioPlayer.reset();
    UIRenderer.showQuizArea(true);

    // Khởi tạo quiz engine
    QuizEngine.init(items);

    // Render câu đầu tiên
    const q = QuizEngine.getCurrent();
    if (q) {
      UIRenderer.renderQuestion(q, false);
      // Tự phát âm ngay khi vào câu đầu
      playAudio();
    }
  }

  /**
   * toggleRetryMode — Bật/tắt chế độ ôn câu sai
   */
  function toggleRetryMode() {
    const wrongItems = QuizEngine.getWrongItems();
    if (wrongItems.length === 0) {
      UIRenderer.showToast('🎉 Bạn chưa có câu nào sai!');
      return;
    }

    UIRenderer.removeEndCard();
    inRetryMode = true;

    // Khởi tạo retry mode
    const ok = QuizEngine.initRetry();
    if (!ok) {
      UIRenderer.showToast('⚠️ Không có câu sai để ôn!');
      return;
    }

    // Cập nhật UI
    document.getElementById('btnRetryMode').classList.add('active');
    document.getElementById('mainArea').classList.add('retry-mode');
    AudioPlayer.reset();
    UIRenderer.showQuizArea(true);

    const q = QuizEngine.getCurrent();
    if (q) {
      UIRenderer.renderQuestion(q, false);
      playAudio();
    }

    UIRenderer.showToast(`🔁 Ôn ${wrongItems.length} câu sai`);
  }

  /**
   * playAudio — Phát âm câu tiếng Nhật hiện tại
   */
  function playAudio() {
    const q = QuizEngine.getCurrent();
    if (!q) return;

    const btn = document.getElementById('speakBtn');
    const icon = document.getElementById('speakIcon');

    // Đổi icon sang loading
    icon.className = 'fa-solid fa-spinner fa-spin';
    btn.classList.add('speaking');

    const count = AudioPlayer.speak(q.item.japanese, () => {
      // Sau khi đọc xong, đổi lại icon
      icon.className = 'fa-solid fa-volume-high';
      btn.classList.remove('speaking');
      UIRenderer.updatePlayCount();
    });

    // Nếu đã hết lượt nghe
    if (count === null) {
      icon.className = 'fa-solid fa-volume-xmark';
      btn.classList.remove('speaking');
    }

    UIRenderer.updatePlayCount();
  }

  /**
   * selectAnswer — Xử lý khi người dùng chọn đáp án
   */
  function selectAnswer(btnEl, selectedText) {
    if (QuizEngine.isAnswered()) return; // Đã trả lời rồi, bỏ qua

    const result = QuizEngine.answer(selectedText);
    if (!result) return;

    const { isCorrect, correctAnswer } = result;

    // Highlight đáp án đúng/sai trên tất cả nút
    const allBtns = document.querySelectorAll('.answer-btn');
    allBtns.forEach(btn => {
      btn.disabled = true;
      const txt = btn.dataset.text;
      if (txt === correctAnswer) {
        btn.classList.add('correct');
      } else if (btn === btnEl && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    // Cập nhật điểm số
    UIRenderer.updateScoreDisplay();
    // Cập nhật số câu sai trong sidebar
    updateWrongCount();

    // Hiển thị overlay đúng/sai
    UIRenderer.showOverlay(isCorrect);

    // Tự chuyển câu sau 2 giây
    clearTimeout(autoNextTimer);
    autoNextTimer = setTimeout(() => {
      nextQuestion();
    }, 2000);
  }

  /**
   * nextQuestion — Chuyển sang câu tiếp theo
   */
  function nextQuestion() {
    clearTimeout(autoNextTimer);
    AudioPlayer.reset(); // Reset lượt nghe

    const hasNext = QuizEngine.next();
    if (!hasNext) {
      // Hết câu hỏi → hiển thị kết quả
      UIRenderer.showQuizArea(false);
      UIRenderer.showEndScreen();
      return;
    }

    const q = QuizEngine.getCurrent();
    UIRenderer.renderQuestion(q, false);
    // Tự phát âm khi chuyển câu
    playAudio();
  }

  /**
   * prevQuestion — Quay lại câu trước (chỉ xem, không đổi điểm)
   */
  function prevQuestion() {
    clearTimeout(autoNextTimer);
    AudioPlayer.reset();

    const ok = QuizEngine.prev();
    if (!ok) {
      UIRenderer.showToast('Đây là câu đầu tiên!');
      return;
    }

    const q = QuizEngine.getCurrent();
    UIRenderer.renderQuestion(q, true); // true = đã trả lời
    // Không tự phát âm khi quay lại
  }

  /**
   * handleKeyDown — Xử lý phím tắt
   */
  function handleKeyDown(e) {
    // Phím 1–4: chọn đáp án
    if (['1', '2', '3', '4'].includes(e.key)) {
      const idx = parseInt(e.key) - 1;
      const btns = document.querySelectorAll('.answer-btn');
      if (btns[idx] && !btns[idx].disabled) {
        btns[idx].click();
      }
      return;
    }

    // Space: nghe lại
    if (e.code === 'Space' && !e.target.closest('button')) {
      e.preventDefault();
      playAudio();
      return;
    }

    // ArrowRight / Enter: câu tiếp theo
    if (e.code === 'ArrowRight' || (e.code === 'Enter' && QuizEngine.isAnswered())) {
      if (QuizEngine.isAnswered()) nextQuestion();
      return;
    }

    // ArrowLeft: câu trước
    if (e.code === 'ArrowLeft') {
      prevQuestion();
      return;
    }
  }

  /**
   * updateWrongCount — Cập nhật số câu sai trong sidebar
   */
  function updateWrongCount() {
    document.getElementById('wrongCount').textContent = QuizEngine.getWrongItems().length;
  }

  // Export các hàm cần dùng từ HTML
  return {
    init,
    handleFileImport,
    toggleUnitFilter,
    toggleBookFilter,
    startQuiz,
    toggleRetryMode,
    playAudio,
    selectAnswer,
    nextQuestion,
    prevQuestion,
  };
})();


/* ══════════════════════════════════════════════════════
   KHỞI ĐỘNG — Chạy khi DOM sẵn sàng
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
