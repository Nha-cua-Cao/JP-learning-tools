/* =====================================================
   script.js — Logic ứng dụng Luyện Đọc Tiếng Nhật
   Vanilla JS ES6+, không dùng thư viện bên ngoài
   ===================================================== */

'use strict';

/* ─── CẤU HÌNH ─────────────────────────────────────── */
const TSV_PATH = 'MetaData.tsv';
const LS_KEY_COMPLETED = 'jpReading_completed';

/* ─── DỮ LIỆU MẪU (fallback khi không fetch được file) ─ */
const SAMPLE_TSV = `STT\tJSON_Name\tTitle\tLevel
1\tSampleReading1.json\t集中できない\tN4
2\tSampleReading2.json\t日本の旅行\tN2
3\tSampleReading3.json\t私の家族\tN3
4\tSampleReading4.json\t好きな食べ物\tN4`;

const SAMPLE_JSON = {
  "title": "集中できない",
  "content": "勉強の途中で、「ちょっとだけ」と思ってスマホを開いたら、そのまま数時間もSNSを見てしまったことはありませんか？",
  "content_html": "<p>勉強の<ruby>途中<rt>とちゅう</rt></ruby>で、「ちょっとだけ」と思ってスマホを<ruby>開<rt>ひら</rt></ruby>いたら、そのまま<ruby>数時間<rt>すうじかん</rt></ruby>もSNSを見てしまったことはありませんか？最近、このような「スマホ<ruby>依存<rt>いぞん</rt></ruby>」に<ruby>悩<rt>なや</rt></ruby>んでいる学生が多くなっています。スマホはとても<ruby>便利<rt>べんり</rt></ruby>ですが、使いすぎると<ruby>大切<rt>たいせつ</rt></ruby>な時間がなくなってしまいます。それだけではありません。<ruby>夜遅<rt>よるおそ</rt></ruby>くまで<ruby>画面<rt>がめん</rt></ruby>を見ていると、<ruby>眠<rt>ねむ</rt></ruby>れなくなったり、次の日に<ruby>頭<rt>あたま</rt></ruby>が<ruby>痛<rt>いた</rt></ruby>くなったりするかもしれません。<ruby>楽<rt>たの</rt></ruby>しい<ruby>生活<rt>せいかつ</rt></ruby>を<ruby>送<rt>おく</rt></ruby>るために、ルールを<ruby>決<rt>き</rt></ruby>めるといいでしょう。例えば、「勉強中はスマホを別の<ruby>部屋<rt>へや</rt></ruby>に<ruby>置<rt>お</rt></ruby>く」や「<ruby>寝<rt>ね</rt></ruby>る1時間前からは使わない」などです。最初は<ruby>難<rt>むずか</rt></ruby>しいですが、少しずつ<ruby>慣<rt>な</rt></ruby>れていけば、勉強に<ruby>集中<rt>しゅうちゅう</rt></ruby>できる時間がきっと増えるはずです。</p>",
  "questions": [
    {
      "id": "q1_1",
      "question_text": "この文章で筆者が一番伝えたいことは何ですか。",
      "options": [
        { "key": "A", "text": "スマホを別の部屋に置いたら、誰でもすぐに勉強ができるようになるということ。" },
        { "key": "B", "text": "スマホはとても便利なので、勉強に使うほうがいいということ。" },
        { "key": "C", "text": "勉強中にスマホを見てしまうのは、自分だけではないということ。" },
        { "key": "D", "text": "スマホの使い方を自分で決めて、生活を良くしたほうがいいということ。" }
      ],
      "correct_answer": "D",
      "explanation": "Tác giả khuyên người đọc nên đặt ra các quy tắc sử dụng điện thoại (ルールを決める) như để điện thoại ở phòng khác khi học hoặc không dùng trước khi ngủ để có cuộc sống tốt hơn và tập trung học tập hơn."
    },
    {
      "id": "q1_2",
      "question_text": "文章の内容と合っているものはどれですか。",
      "options": [
        { "key": "A", "text": "寝る直前までスマホを見ると、よく眠れるようになる。" },
        { "key": "B", "text": "スマホを使いすぎると、体の調子が悪くなる可能性がある。" },
        { "key": "C", "text": "勉強の途中でスマホを見るのは、時間が短ければ問題ない。" },
        { "key": "D", "text": "スマホ依存にならないために、スマホを捨てなければならない。" }
      ],
      "correct_answer": "B",
      "explanation": "Bài viết có đề cập rằng nhìn màn hình điện thoại muộn có thể gây mất ngủ hoặc đau đầu vào ngày hôm sau, tức là ảnh hưởng xấu đến sức khỏe/tình trạng cơ thể."
    }
  ]
};

/* ─── TRẠNG THÁI ỨNG DỤNG ──────────────────────────── */
const state = {
  lessons:      [],    // [{ stt, jsonName, title, level }] từ TSV
  activeLesson: null,  // Bài đang được chọn
  currentData:  null,  // Dữ liệu JSON bài đọc hiện tại
  isExamMode:   false, // false = Luyện tập | true = Kiểm tra
  userAnswers:  {},    // { [questionId]: keyChọn }
  submitted:    false, // Đã nộp bài chưa (chế độ Kiểm tra)
};

/* ═══════════════════════════════════════════════════════
   TIỆN ÍCH: LOCALSTORAGE
   ═══════════════════════════════════════════════════════ */

function getCompleted() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_COMPLETED) || '[]'); }
  catch { return []; }
}

function markCompleted(jsonName) {
  const list = getCompleted();
  if (!list.includes(jsonName)) {
    list.push(jsonName);
    localStorage.setItem(LS_KEY_COMPLETED, JSON.stringify(list));
  }
}

function isCompleted(jsonName) {
  return getCompleted().includes(jsonName);
}

/* ═══════════════════════════════════════════════════════
   TIỆN ÍCH: PARSE TSV
   ═══════════════════════════════════════════════════════ */

function parseTSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lessons = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].includes('\t')
      ? lines[i].split('\t')
      : lines[i].split(/\s{2,}/);

    if (cols.length < 4) continue;
    lessons.push({
      stt:      cols[0].trim(),
      jsonName: cols[1].trim(),
      title:    cols[2].trim(),
      level:    cols[3].trim(),
    });
  }
  return lessons;
}

/* ═══════════════════════════════════════════════════════
   TIỆN ÍCH: NHÓM THEO CẤP ĐỘ
   ═══════════════════════════════════════════════════════ */

function groupByLevel(lessons) {
  const ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];
  const map = new Map();
  for (const lesson of lessons) {
    if (!map.has(lesson.level)) map.set(lesson.level, []);
    map.get(lesson.level).push(lesson);
  }
  return new Map(
    [...map.entries()].sort((a, b) => {
      const ia = ORDER.indexOf(a[0]);
      const ib = ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
  );
}

/* ═══════════════════════════════════════════════════════
   RENDER: SIDEBAR
   ═══════════════════════════════════════════════════════ */

function renderSidebar(lessons) {
  const nav     = document.getElementById('sidebar-nav');
  const loading = document.getElementById('sidebar-loading');

  loading.hidden = true;
  nav.hidden     = false;
  nav.innerHTML  = '';

  const grouped = groupByLevel(lessons);

  for (const [level, items] of grouped) {
    const group = document.createElement('div');
    group.className = 'level-group';

    const heading = document.createElement('div');
    heading.className = 'level-heading';
    heading.innerHTML = `Cấp độ <span class="level-badge-tag">${level}</span>`;
    group.appendChild(heading);

    for (const lesson of items) {
      const item = document.createElement('div');
      item.className    = 'lesson-item';
      item.dataset.json = lesson.jsonName;
      if (isCompleted(lesson.jsonName)) item.classList.add('completed');
      item.innerHTML = `
        <span class="lesson-check"></span>
        <span class="lesson-title">${lesson.title}</span>
      `;
      item.addEventListener('click', () => onLessonClick(lesson));
      group.appendChild(item);
    }
    nav.appendChild(group);
  }
}

function updateSidebarActive(jsonName) {
  document.querySelectorAll('.lesson-item').forEach(el => {
    el.classList.toggle('active', el.dataset.json === jsonName);
  });
}

function updateSidebarCompleted(jsonName) {
  const item = document.querySelector(`.lesson-item[data-json="${jsonName}"]`);
  if (item) item.classList.add('completed');
}

/* ═══════════════════════════════════════════════════════
   RENDER: LOADING SKELETON
   ─────────────────────────────────────────────────────
   NGUYÊN NHÂN LỖI CŨ: showLoadingState() dùng innerHTML
   để ghi đè #reading-area, phá hủy toàn bộ cấu trúc DOM
   bên trong (reading-title, reading-body, questions-section…).
   Khi renderReading() chạy sau, getElementById() trả về null.

   CÁCH SỬA: Skeleton nằm trong div #reading-loader riêng biệt.
   showLoadingState() chỉ toggle hidden, KHÔNG động vào DOM
   của #reading-area. Cấu trúc HTML bên trong luôn được bảo toàn.
   ═══════════════════════════════════════════════════════ */

function showLoadingState() {
  document.getElementById('welcome-screen').style.display = 'flex';
  // Ẩn reading-area (giữ nguyên DOM bên trong, không xóa)
  document.getElementById('reading-area').style.display = 'none';
  // Hiện skeleton loader độc lập
  document.getElementById('reading-loader').style.display = 'auto';
}

function hideLoadingState() {
  document.getElementById('reading-loader').style.display = 'none';
  document.getElementById('reading-area').style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════
   RENDER: BÀI ĐỌC & CÂU HỎI
   ═══════════════════════════════════════════════════════ */

function renderReading(data, lesson) {
  // Điền thông tin tiêu đề và badge cấp độ
  document.getElementById('reading-level-badge').textContent = lesson.level;
  document.getElementById('reading-title').textContent       = data.title || lesson.title;

  // Ưu tiên content_html để hiển thị Furigana (thẻ <ruby>)
  document.getElementById('reading-body').innerHTML =
    data.content_html || `<p>${data.content}</p>`;

  // Reset trạng thái và render câu hỏi
  state.userAnswers = {};
  state.submitted   = false;
  renderQuestions(data.questions);

  // Ẩn thông tin welcome-screen nếu đang hiển thị
  document.getElementById('welcome-screen').style.display = 'none';

  // Ẩn/hiện nút Nộp bài và kết quả tuỳ chế độ
  document.getElementById('submit-bar').style.display     = state.isExamMode ? 'flex' : 'none';
  document.getElementById('result-summary').style.display = 'none';;

  // Bỏ skeleton, hiện reading-area
  hideLoadingState();

  // Cuộn lên đầu vùng nội dung
  document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuestions(questions) {
  const section = document.getElementById('questions-section');
  section.innerHTML = '';

  if (!questions || questions.length === 0) {
    section.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem;margin-top:8px;">Bài đọc này chưa có câu hỏi.</p>';
    return;
  }
  questions.forEach((q, idx) => section.appendChild(buildQuestionCard(q, idx)));
}

function buildQuestionCard(question, idx) {
  const card = document.createElement('div');
  card.className = 'card question-card';
  card.id        = `card-${question.id}`;
  card.innerHTML = `
    <div class="question-number">Câu ${idx + 1}</div>
    <div class="question-text">${question.question_text}</div>
    <div class="options-list"  id="options-${question.id}"></div>
    <div class="feedback-area" id="feedback-${question.id}"></div>
  `;

  const list = card.querySelector(`#options-${question.id}`);

  // 1. Tạo một bản sao và xáo trộn mảng options (Fisher-Yates Shuffle)
  const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5); 
  // Lưu ý: Cách dùng .sort() ở trên đơn giản nhưng nếu muốn ngẫu nhiên tuyệt đối, 
  // bạn nên dùng thuật toán Fisher-Yates chuẩn.

  shuffledOptions.forEach((opt, index) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      
      // Giữ nguyên opt.key trong dataset để logic check đáp án không bị thay đổi
      btn.dataset.key = opt.key;

      // 2. Chuyển index (0, 1, 2, 3) thành (A, B, C, D)
      // 65 là mã ASCII của chữ 'A'
      const label = String.fromCharCode(65 + index);

      btn.innerHTML = `
          <span class="option-key">${label}</span>
          <span class="option-text">${opt.text}</span>
      `;

      btn.addEventListener('click', () => onOptionClick(question, opt.key, card));
      list.appendChild(btn);
  });

  return card;
}

/* ═══════════════════════════════════════════════════════
   TƯƠNG TÁC: CHỌN ĐÁP ÁN
   ═══════════════════════════════════════════════════════ */

function onOptionClick(question, selectedKey, card) {
  if (state.submitted) return;
  if (!state.isExamMode && state.userAnswers[question.id]) return; // Luyện tập: không chọn lại

  state.userAnswers[question.id] = selectedKey;

  if (state.isExamMode) {
    highlightSelectedOption(card, selectedKey);
    updateSubmitButtonState();
  } else {
    revealAnswer(question, selectedKey, card);
    checkLessonCompleted();
  }
}

function highlightSelectedOption(card, selectedKey) {
  card.querySelectorAll('.option-btn').forEach(btn => {
    const sel = btn.dataset.key === selectedKey;
    btn.style.borderColor = sel ? 'var(--coral)'      : '';
    btn.style.background  = sel ? 'var(--coral-light)' : '';
    btn.style.color       = sel ? 'var(--coral-dark)'  : '';
  });
}

function revealAnswer(question, selectedKey, card, forceShow = false) {
  const isCorrect = selectedKey === question.correct_answer;

  card.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled          = true;
    btn.style.borderColor = '';
    btn.style.background  = '';
    btn.style.color       = '';

    if (btn.dataset.key === question.correct_answer) {
      btn.classList.add('correct');
    } else if (btn.dataset.key === selectedKey && !isCorrect) {
      btn.classList.add('wrong');
    }
  });

  const feedbackArea = card.querySelector(`#feedback-${question.id}`);
  feedbackArea.innerHTML = '';

  // Nhãn Đúng / Sai (chế độ Luyện tập hoặc sau khi nộp bài)
  if (!state.isExamMode || forceShow) {
    const label = document.createElement('div');
    label.className   = `quick-result ${isCorrect ? 'correct' : 'wrong'}`;
    label.textContent = isCorrect ? '✓ Chính xác!' : '✗ Chưa đúng';
    feedbackArea.appendChild(label);
  }

  // Hộp giải thích
  if (question.explanation) {
    const box = document.createElement('div');
    box.className = 'explanation-box';
    box.innerHTML = `
      <span class="explanation-icon">💡</span>
      <div class="explanation-text">${question.explanation}</div>
    `;
    feedbackArea.appendChild(box);
  }
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: NỘP BÀI (CHẾ ĐỘ KIỂM TRA)
   ═══════════════════════════════════════════════════════ */

function updateSubmitButtonState() {
  const total    = state.currentData?.questions?.length || 0;
  const answered = Object.keys(state.userAnswers).length;
  const btn = document.getElementById('submit-btn');
  if (btn) btn.disabled = answered < total;
}

function handleSubmitExam() {
  if (!state.currentData) return;
  state.submitted = true;

  const questions = state.currentData.questions;
  let correctCount = 0;

  questions.forEach(q => {
    const card   = document.getElementById(`card-${q.id}`);
    const answer = state.userAnswers[q.id] || null;

    if (answer) {
      if (answer === q.correct_answer) correctCount++;
      revealAnswer(q, answer, card, true);
    } else {
      // Câu bỏ qua: chỉ tô đáp án đúng
      card.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.key === q.correct_answer) btn.classList.add('correct');
      });
    }
  });

  showResultSummary(correctCount, questions.length);
  document.getElementById('submit-bar').hidden = true;

  // Luôn đánh dấu hoàn thành khi đã nộp bài
  markCompleted(state.activeLesson.jsonName);
  updateSidebarCompleted(state.activeLesson.jsonName);
}

function showResultSummary(correct, total) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('result-icon').textContent    = pct === 100 ? '🎉' : pct >= 60 ? '👍' : '📚';
  document.getElementById('result-score').textContent   = `${correct} / ${total} câu đúng (${pct}%)`;
  document.getElementById('result-message').textContent =
    pct === 100 ? 'Xuất sắc! Bạn đã trả lời đúng tất cả các câu.' :
    pct >= 60   ? 'Tốt lắm! Hãy xem lại các câu sai để củng cố kiến thức.' :
                  'Cần cố gắng thêm nhé! Đọc lại bài và thử lại.';

  const summary = document.getElementById('result-summary');
  summary.style.display = 'flex';
  summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: ĐÁNH DẤU HOÀN THÀNH (CHẾ ĐỘ LUYỆN TẬP)
   ═══════════════════════════════════════════════════════ */

function checkLessonCompleted() {
  if (!state.currentData || !state.activeLesson) return;
  const questions = state.currentData.questions;
  if (!questions?.length) return;

  // Đánh dấu hoàn thành khi người dùng đã trả lời tất cả câu
  const allAnswered = questions.every(q => state.userAnswers[q.id]);
  if (allAnswered) {
    markCompleted(state.activeLesson.jsonName);
    updateSidebarCompleted(state.activeLesson.jsonName);
  }
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: CLICK CHỌN BÀI ĐỌC
   ═══════════════════════════════════════════════════════ */

async function onLessonClick(lesson) {
  if (state.activeLesson?.jsonName === lesson.jsonName) return;

  state.activeLesson = lesson;
  updateSidebarActive(lesson.jsonName);
  showLoadingState(); // Hiện skeleton, ẩn reading-area (KHÔNG xóa DOM bên trong)

  try {
    const data = await fetchJSON(lesson.jsonName);
    state.currentData = data;
    renderReading(data, lesson);
  } catch {
    // Fallback: luôn có nội dung để hiển thị
    state.currentData = SAMPLE_JSON;
    renderReading(SAMPLE_JSON, lesson);
  }
}

async function fetchJSON(jsonName) {
  const res = await fetch(jsonName);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: CHUYỂN CHẾ ĐỘ LUYỆN TẬP / KIỂM TRA
   ═══════════════════════════════════════════════════════ */

function onModeToggle(evt) {
  state.isExamMode = evt.target.checked;
  document.body.classList.toggle('exam-mode', state.isExamMode);

  if (state.currentData && state.activeLesson) {
    showLoadingState();
    renderReading(state.currentData, state.activeLesson);
  }
}

/* ═══════════════════════════════════════════════════════
   NẠP DỮ LIỆU BAN ĐẦU: METADATA.TSV
   ═══════════════════════════════════════════════════════ */

async function loadMetadata() {
  try {
    const res = await fetch(TSV_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    state.lessons = parseTSV(text);
  } catch {
    console.warn('Không fetch được MetaData.tsv — dùng dữ liệu mẫu.');
    state.lessons = parseTSV(SAMPLE_TSV);
  }
  renderSidebar(state.lessons);
}

/* ═══════════════════════════════════════════════════════
   KHỞI ĐỘNG ỨNG DỤNG
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mode-toggle').addEventListener('change', onModeToggle);
  loadMetadata();
});
