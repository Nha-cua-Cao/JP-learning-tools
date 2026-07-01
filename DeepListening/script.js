/* =====================================================
   script.js — Logic ứng dụng Luyện Nghe Tiếng Nhật
   Vanilla JS ES6+, không dùng thư viện bên ngoài
   ===================================================== */

'use strict';

/* ─── CẤU HÌNH ─────────────────────────────────────── */
const TSV_PATH = 'MetaData.tsv';
const LS_KEY_COMPLETED = 'jpListening_completed';

/* ─── TRẠNG THÁI ỨNG DỤNG ──────────────────────────── */
const state = {
  lessons:      [],    // [{ stt, jsonName, title, level }] từ TSV
  activeLesson: null,  // Bài đang được chọn
  currentData:  null,  // Dữ liệu JSON bài nghe hiện tại
  isExamMode:   false, // false = Luyện tập | true = Kiểm tra
  userAnswers:  {},    // { [questionId]: keyChọn }
  submitted:    false, // Đã nộp bài chưa (chế độ Kiểm tra)
};

/* ═══════════════════════════════════════════════════════
   TIỆN ÍCH: LOCALSTORAGE
   ═══════════════════════════════════════════════════════ */

function getCompleted() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY_COMPLETED)) || [];
  }
  catch {
    return [];
  }
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
    const parts = lines[i].split('\t');
    if (parts.length >= 3) {
      lessons.push({
        stt:      parseInt(parts[0]) || i,
        jsonName: parts[1],
        title:    parts[2],
        level:    parts[3] || 'N4',
      });
    }
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
    const level = lesson.level || 'N4';
    if (!map.has(level)) map.set(level, []);
    map.get(level).push(lesson);
  }
  return new Map(
    [...map.entries()].sort((a, b) => {
      return ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]);
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
    group.innerHTML = `
      <div class="level-heading">
        <span>${level}</span>
        <span class="level-badge-tag">${items.length}</span>
      </div>
    `;

    items.forEach(lesson => {
      const li = document.createElement('div');
      li.className = 'lesson-item';
      if (isCompleted(lesson.jsonName)) li.classList.add('completed');
      li.setAttribute('data-json', lesson.jsonName);
      li.innerHTML = `
        <div class="lesson-check"></div>
        <span class="lesson-text">${lesson.title}</span>
      `;
      li.onclick = () => onLessonClick(lesson);
      group.appendChild(li);
    });

    nav.appendChild(group);
  }
}

function updateSidebarActive(jsonName) {
  document.querySelectorAll('.lesson-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-json') === jsonName);
  });
}

function updateSidebarCompleted(jsonName) {
  const item = document.querySelector(`.lesson-item[data-json="${jsonName}"]`);
  if (item) item.classList.add('completed');
}

/* ═══════════════════════════════════════════════════════
   RENDER: LOADING SKELETON
   ═══════════════════════════════════════════════════════ */

function showLoadingState() {
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('listening-area').style.display = 'none';
  document.getElementById('loading-loader').style.display = 'auto';
}

function hideLoadingState() {
  document.getElementById('loading-loader').style.display = 'none';
  document.getElementById('listening-area').style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════
   RENDER: BÀI NGHE & CÂU HỎI
   ═══════════════════════════════════════════════════════ */

function renderListening(data, lesson) {
  // Điền thông tin tiêu đề và badge cấp độ
  document.getElementById('listening-level-badge').textContent = lesson.level;
  document.getElementById('listening-title').textContent = data.title || lesson.title;

  // Thiết lập iframe với link âm thanh
  const audioIframe = document.getElementById('audio-iframe');
  if (data.link) {
    audioIframe.src = data.link;
  }

  // Reset trạng thái và render câu hỏi
  state.userAnswers = {};
  state.submitted   = false;
  renderQuestions(data.questions);

  // Ẩn thông tin welcome-screen nếu đang hiển thị
  document.getElementById('welcome-screen').style.display = 'none';

  // Ẩn/hiện nút Nộp bài và kết quả tuỳ chế độ
  document.getElementById('submit-bar').style.display = state.isExamMode ? 'flex' : 'none';
  document.getElementById('result-summary').style.display = 'none';

  // Script section luôn hiển thị, nhưng content ẩn và badge khóa
  const scriptSection = document.getElementById('script-section');
  scriptSection.style.display = 'flex';
  
  const scriptContent = document.getElementById('script-content');
  scriptContent.classList.remove('visible');
  
  const scriptLockBadge = document.getElementById('script-lock-badge');
  scriptLockBadge.classList.remove('unlocked');
  scriptLockBadge.textContent = '🔒 Mở khóa khi hoàn thành';

  // Hiển thị dữ liệu script
  if (data.script) {
    scriptContent.textContent = data.script;
  }

  // Bỏ skeleton, hiện listening-area
  hideLoadingState();

  // Cuộn lên đầu vùng nội dung
  document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuestions(questions) {
  const section = document.getElementById('questions-section');
  section.innerHTML = '';

  if (!questions || questions.length === 0) {
    section.innerHTML = '<p class="no-questions">Không có câu hỏi cho bài này.</p>';
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
    <div class="options-list" id="options-${question.id}"></div>
    <div class="feedback-area" id="feedback-${question.id}"></div>
  `;

  const list = card.querySelector(`#options-${question.id}`);

  // Xáo trộn các tùy chọn nhưng luôn hiển thị A, B, C, D theo thứ tự
  const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);

  shuffledOptions.forEach((opt, index) => {
    const displayKey = String.fromCharCode(65 + index); // A, B, C, D based on position
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.setAttribute('data-actual-key', opt.key); // Lưu key thật để xử lý
    btn.innerHTML = `
      <span class="option-key">${displayKey}</span>
      <span class="option-text">${opt.text}</span>
    `;
    btn.onclick = () => onOptionClick(question, opt.key, card);
    list.appendChild(btn);
  });

  return card;
}

/* ═══════════════════════════════════════════════════════
   TƯƠNG TÁC: CHỌN ĐÁP ÁN
   ═══════════════════════════════════════════════════════ */

function onOptionClick(question, selectedKey, card) {
  if (state.submitted) return;
  if (!state.isExamMode && state.userAnswers[question.id]) return;

  state.userAnswers[question.id] = selectedKey;

  if (state.isExamMode) {
    highlightSelectedOption(card, selectedKey);
  } else {
    revealAnswer(question, selectedKey, card);
    checkLessonCompleted();
  }
}

function highlightSelectedOption(card, selectedKey) {
  card.querySelectorAll('.option-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-actual-key') === selectedKey);
  });
}

function revealAnswer(question, selectedKey, card, forceShow = false) {
  const isCorrect = selectedKey === question.correct_answer;
  const optionBtns = card.querySelectorAll('.option-btn');

  optionBtns.forEach(btn => {
    const actualKey = btn.getAttribute('data-actual-key');
    
    if (actualKey === question.correct_answer) {
      btn.classList.add('correct');
      btn.disabled = true;
    } else if (actualKey === selectedKey && !isCorrect) {
      btn.classList.add('wrong');
      btn.disabled = true;
    } else {
      btn.disabled = true;
    }
  });

  // Hiển thị giải thích
  const feedbackArea = card.querySelector(`#feedback-${question.id}`);
  if (feedbackArea) {
    feedbackArea.innerHTML = `
      <div class="explanation-box">
        <span class="explanation-icon">${isCorrect ? '✓' : '✗'}</span>
        <div class="explanation-text">
          <strong>${isCorrect ? 'Chính xác!' : 'Sai rồi!'}</strong>
          <p>${question.explanation}</p>
        </div>
      </div>
    `;
  }
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: NỘP BÀI (CHẾ ĐỘ KIỂM TRA)
   ═══════════════════════════════════════════════════════ */

function updateSubmitButtonState() {
  const totalQuestions = state.currentData.questions.length;
  const answered = Object.keys(state.userAnswers).length;
  const btn = document.getElementById('submit-btn');
  btn.disabled = answered < totalQuestions;
}

function handleSubmitExam() {
  state.submitted = true;

  let correct = 0;
  const questions = state.currentData.questions;

  questions.forEach(question => {
    const card = document.getElementById(`card-${question.id}`);
    const selectedKey = state.userAnswers[question.id];
    const isCorrect = selectedKey === question.correct_answer;

    if (isCorrect) correct++;
    revealAnswer(question, selectedKey, card, true);
  });

  const total = questions.length;
  showResultSummary(correct, total);

  // Hiển thị script sau khi nộp bài
  const scriptContent = document.getElementById('script-content');
  scriptContent.classList.add('visible');
  
  const scriptLockBadge = document.getElementById('script-lock-badge');
  scriptLockBadge.classList.add('unlocked');
  scriptLockBadge.textContent = '✓ Mở khóa';

  // Đánh dấu hoàn thành
  markCompleted(state.activeLesson.jsonName);
  updateSidebarCompleted(state.activeLesson.jsonName);

  // Cuộn xuống để xem kết quả
  setTimeout(() => {
    document.getElementById('main-content').scrollTo({
      top: document.getElementById('result-summary').offsetTop - 100,
      behavior: 'smooth'
    });
  }, 300);
}

function showResultSummary(correct, total) {
  const percentage = Math.round((correct / total) * 100);
  const resultDiv = document.getElementById('result-summary');
  const icon = percentage >= 70 ? '🎉' : '📚';
  const message = percentage >= 70 ? 'Tuyệt vời!' : 'Hãy thử lại!';

  resultDiv.querySelector('#result-icon').textContent = icon;
  resultDiv.querySelector('#result-score').textContent = `${correct}/${total} (${percentage}%)`;
  resultDiv.querySelector('#result-message').textContent = message;
  resultDiv.style.display = 'block';
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: ĐÁNH DẤU HOÀN THÀNH (CHẾ ĐỘ LUYỆN TẬP)
   ═══════════════════════════════════════════════════════ */

function checkLessonCompleted() {
  const totalQuestions = state.currentData.questions.length;
  const answered = Object.keys(state.userAnswers).length;

  if (answered === totalQuestions) {
    // Hiển thị script content
    const scriptContent = document.getElementById('script-content');
    scriptContent.classList.add('visible');
    
    // Cập nhật lock badge
    const scriptLockBadge = document.getElementById('script-lock-badge');
    scriptLockBadge.classList.add('unlocked');
    scriptLockBadge.textContent = '✓ Mở khóa';

    // Đánh dấu hoàn thành
    markCompleted(state.activeLesson.jsonName);
    updateSidebarCompleted(state.activeLesson.jsonName);
  }
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: CLICK CHỌN BÀI NGHE
   ═══════════════════════════════════════════════════════ */

async function onLessonClick(lesson) {
  state.activeLesson = lesson;
  updateSidebarActive(lesson.jsonName);
  showLoadingState();

  const data = await fetchJSON(lesson.jsonName);
  if (data) {
    state.currentData = data;
    renderListening(data, lesson);
  } else {
    alert('Không thể tải bài nghe. Vui lòng thử lại.');
    showLoadingState();
  }
}

async function fetchJSON(jsonName) {
  try {
    const response = await fetch(jsonName);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   XỬ LÝ: CHUYỂN CHẾ ĐỘ LUYỆN TẬP / KIỂM TRA
   ═══════════════════════════════════════════════════════ */

function onModeToggle(evt) {
  state.isExamMode = evt.target.checked;
  document.body.classList.toggle('exam-mode', state.isExamMode);

  if (state.currentData) {
    state.userAnswers = {};
    state.submitted = false;
    renderListening(state.currentData, state.activeLesson);
  }
}

/* ═══════════════════════════════════════════════════════
   NẠP DỮ LIỆU BAN ĐẦU: METADATA.TSV
   ═══════════════════════════════════════════════════════ */

async function loadMetadata() {
  try {
    const response = await fetch(TSV_PATH);
    const text = await response.text();
    state.lessons = parseTSV(text);
    renderSidebar(state.lessons);
  } catch (error) {
    console.error('Metadata load error:', error);
  }
}

/* ═══════════════════════════════════════════════════════
   KHỞI ĐỘNG ỨNG DỤNG
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mode-toggle').addEventListener('change', onModeToggle);
  loadMetadata();
});
