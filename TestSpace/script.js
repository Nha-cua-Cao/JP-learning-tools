/* =========================================================
   CẤU TRÚC DỮ LIỆU & BIẾN TOÀN CỤC
========================================================= */
let allData = [];            // Toàn bộ dữ liệu từ TSV
let filteredData = [];       // Dữ liệu sau khi lọc (Book, Unit)
let questionQueue = [];      // Hàng đợi các câu hỏi hiện tại (đã shuffle)
let wrongQuestions = [];     // Lưu các câu trả lời sai trong session

let currentQuestion = null;
let currentCorrectAnswerText = "";
let playCount = 0;
const MAX_PLAYS = 3;

let scoreCorrect = 0;
let totalAnswered = 0;
let autoNextTimeout = null;

// Khởi tạo giọng đọc (SpeechSynthesis)
let jpVoice = null;
window.speechSynthesis.onvoiceschanged = () => {
  const voices = window.speechSynthesis.getVoices();
  // Ưu tiên tìm giọng Nhật
  jpVoice = voices.find(v => v.lang.includes('ja') || v.lang.includes('JP')) || voices[0];
};

/* =========================================================
   DOM ELEMENTS
========================================================= */
const fileInput = document.getElementById('fileInput');
const btnImport = document.getElementById('btnImport');
const sidebarList = document.getElementById('sidebarList');
const emptyState = document.getElementById('emptyState');
const quizContainer = document.getElementById('quizContainer');

const btnSpeak = document.getElementById('btnSpeak');
const playCountText = document.getElementById('playCountText');
const answersGrid = document.getElementById('answersGrid');
const btnNext = document.getElementById('btnNext');

const quizProgress = document.getElementById('quizProgress');
const quizScore = document.getElementById('quizScore');
const btnRetry = document.getElementById('btnRetry');
const resultOverlay = document.getElementById('resultOverlay');
const overlayContent = document.getElementById('overlayContent');

/* =========================================================
   SỰ KIỆN: IMPORT & PARSE TSV
========================================================= */
btnImport.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    parseTSV(text);
  };
  reader.readAsText(file);
});

// Hàm Parse TSV
function parseTSV(tsvText) {
  const lines = tsvText.split('\n').filter(line => line.trim() !== '');
  allData = [];
  
  // Bỏ qua dòng header (nếu dòng đầu tiên chứa chữ "STT")
  let startIndex = lines[0].toLowerCase().includes('stt') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(c => c.trim());
    if (cols.length >= 6) {
      allData.push({
        stt: cols[0],
        jp: cols[1],
        jpSyn: cols[2],
        vi: cols[3],
        unit: cols[4],
        book: cols[5],
        id: i // Gắn ID nội bộ để dễ tìm
      });
    }
  }

  if (allData.length > 0) {
    buildSidebar();
    applyFilters(); // Bắt đầu load dữ liệu
  } else {
    alert("File TSV không đúng định dạng hoặc trống!");
  }
}

/* =========================================================
   RENDER SIDEBAR & FILTER
========================================================= */
function buildSidebar() {
  sidebarList.innerHTML = '';
  // Gom nhóm dữ liệu theo Giáo trình -> Unit
  const books = [...new Set(allData.map(item => item.book))];

  books.forEach(book => {
    const details = document.createElement('details');
    details.className = 'book-group';
    details.open = true; // Mở sẵn mặc định

    const summary = document.createElement('summary');
    summary.textContent = book;
    details.appendChild(summary);

    const unitsList = document.createElement('div');
    unitsList.className = 'units-list';

    // Lấy các Unit thuộc Book này
    const unitsInBook = [...new Set(allData.filter(d => d.book === book).map(d => d.unit))];
    // Sắp xếp Unit theo số
    unitsInBook.sort((a, b) => parseInt(a) - parseInt(b));

    unitsInBook.forEach(unit => {
      const label = document.createElement('label');
      label.className = 'unit-chip checked'; // Check mặc định
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = `${book}|${unit}`;
      checkbox.checked = true;
      checkbox.addEventListener('change', (e) => {
        if(e.target.checked) label.classList.add('checked');
        else label.classList.remove('checked');
        applyFilters();
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(`Unit ${unit}`));
      unitsList.appendChild(label);
    });

    details.appendChild(unitsList);
    sidebarList.appendChild(details);
  });
}

// Cập nhật mảng dữ liệu hiện tại dựa trên checkbox
function applyFilters() {
  const checkedBoxes = Array.from(sidebarList.querySelectorAll('input[type="checkbox"]:checked'));
  const activeFilters = checkedBoxes.map(cb => cb.value); // Định dạng: "Book|Unit"

  filteredData = allData.filter(item => {
    return activeFilters.includes(`${item.book}|${item.unit}`);
  });

  resetQuizState();
  if (filteredData.length > 0) {
    startQuiz(filteredData);
  } else {
    showEmptyState();
  }
}

/* =========================================================
   LOGIC QUIZ CHÍNH
========================================================= */
function resetQuizState() {
  scoreCorrect = 0;
  totalAnswered = 0;
  wrongQuestions = [];
  updateScoreUI();
  btnRetry.innerHTML = `<i class="fa-solid fa-star"></i> Ôn câu sai (0)`;
  clearTimeout(autoNextTimeout);
}

function showEmptyState() {
  emptyState.style.display = 'flex';
  quizContainer.style.display = 'none';
}

function startQuiz(dataArray) {
  emptyState.style.display = 'none';
  quizContainer.style.display = 'flex';
  
  // Clone và Trộn mảng câu hỏi
  questionQueue = shuffleArray([...dataArray]);
  
  // Bắt đầu câu đầu tiên
  loadNextQuestion();
}

function loadNextQuestion() {
  if (questionQueue.length === 0) {
    alert(`Hoàn thành! Bạn đúng ${scoreCorrect}/${totalAnswered} câu.`);
    return showEmptyState();
  }

  currentQuestion = questionQueue.shift();
  playCount = 0;
  btnNext.style.display = 'none';
  
  updateProgressUI();

  // Reset Nút loa
  btnSpeak.disabled = false;
  btnSpeak.classList.remove('playing');
  playCountText.textContent = `Còn ${MAX_PLAYS} lần nghe`;

  generateAnswers();
  
  // Tự động phát âm thanh khi chuyển câu (nếu muốn)
  // playAudio(); 
}

// Sinh đáp án: 1 Đúng, 3 Sai
function generateAnswers() {
  // Random chọn loại đáp án là Tiếng Nhật (Synonym) hay Tiếng Việt (50/50)
  // Nếu câu Nhật đồng nghĩa rỗng thì ép sang Tiếng Việt
  let isTargetVietnamese = Math.random() > 0.5;
  if (!currentQuestion.jpSyn || currentQuestion.jpSyn.trim() === '') {
    isTargetVietnamese = true; 
  }

  currentCorrectAnswerText = isTargetVietnamese ? currentQuestion.vi : currentQuestion.jpSyn;

  // Lấy 3 đáp án sai dựa trên độ tương đồng (Distractors)
  const distractors = getDistractors(currentQuestion, isTargetVietnamese);

  // Gộp đúng + sai và trộn lên
  const options = [currentCorrectAnswerText, ...distractors];
  const shuffledOptions = shuffleArray(options);

  // Render ra UI
  answersGrid.innerHTML = '';
  shuffledOptions.forEach((optionText, index) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = optionText;
    
    // Gắn phím tắt 1-4
    btn.setAttribute('data-key', (index + 1).toString());

    btn.onclick = () => handleAnswerSelected(btn, optionText);
    answersGrid.appendChild(btn);
  });
}

/* =========================================================
   THUẬT TOÁN: TÌM ĐÁP ÁN SAI (SIMILARITY)
========================================================= */
function getDistractors(correctItem, isVietnamese) {
  // Tập hợp các mục để chọn (loại bỏ câu hiện tại)
  const pool = filteredData.filter(d => d.id !== correctItem.id);
  
  // Tính điểm tương đồng của câu mục tiêu đối với tất cả câu trong pool
  const targetStr = isVietnamese ? correctItem.vi : correctItem.jpSyn;
  
  const scoredPool = pool.map(item => {
    const compareStr = isVietnamese ? item.vi : (item.jpSyn || item.jp);
    return {
      text: compareStr,
      score: stringSimilarity(targetStr, compareStr)
    };
  });

  // Sort giảm dần theo điểm tương đồng (Càng giống càng dễ nhầm)
  scoredPool.sort((a, b) => b.score - a.score);

  // Lấy 3 câu giống nhất (để làm khó user)
  // Tránh lấy trùng lặp string (nếu database có các câu giống hệt nhau)
  const distractors = [];
  const usedTexts = new Set([targetStr]);

  for (let item of scoredPool) {
    if (distractors.length >= 3) break;
    if (!usedTexts.has(item.text) && item.text.trim() !== "") {
      distractors.push(item.text);
      usedTexts.add(item.text);
    }
  }

  // Fallback: nếu database quá ít, bổ sung ngẫu nhiên từ AllData
  while (distractors.length < 3) {
    const randomItem = allData[Math.floor(Math.random() * allData.length)];
    const text = isVietnamese ? randomItem.vi : (randomItem.jpSyn || randomItem.jp);
    if (!usedTexts.has(text) && text.trim() !== "") {
      distractors.push(text);
      usedTexts.add(text);
    }
  }

  return distractors;
}

// Thuật toán Jaccard Similarity đơn giản (tính tỷ lệ ký tự chung)
function stringSimilarity(str1, str2) {
  if(!str1 || !str2) return 0;
  const s1 = new Set(str1.toLowerCase().split(''));
  const s2 = new Set(str2.toLowerCase().split(''));
  let match = 0;
  s1.forEach(char => {
    if (s2.has(char)) match++;
  });
  return match / Math.max(s1.size, s2.size);
}

/* =========================================================
   XỬ LÝ AUDIO (WEB SPEECH API)
========================================================= */
btnSpeak.addEventListener('click', playAudio);

function playAudio() {
  if (playCount >= MAX_PLAYS) return;

  window.speechSynthesis.cancel(); // Tắt audio cũ đang phát dở
  
  const utterance = new SpeechSynthesisUtterance(currentQuestion.jp);
  if (jpVoice) utterance.voice = jpVoice;
  utterance.rate = 0.9; // Đọc chậm một xíu cho dễ nghe

  // UI Updates
  btnSpeak.classList.add('playing');
  utterance.onend = () => {
    btnSpeak.classList.remove('playing');
  };

  window.speechSynthesis.speak(utterance);
  
  playCount++;
  playCountText.textContent = `Còn ${MAX_PLAYS - playCount} lần nghe`;

  if (playCount >= MAX_PLAYS) {
    btnSpeak.disabled = true;
  }
}

/* =========================================================
   XỬ LÝ CHỌN ĐÁP ÁN
========================================================= */
function handleAnswerSelected(selectedBtn, selectedText) {
  // Block tất cả các nút
  const allBtns = document.querySelectorAll('.answer-btn');
  allBtns.forEach(b => b.disabled = true);
  btnSpeak.disabled = true; 

  totalAnswered++;
  const isCorrect = (selectedText === currentCorrectAnswerText);

  if (isCorrect) {
    scoreCorrect++;
    selectedBtn.classList.add('correct');
    showOverlay(true);
  } else {
    selectedBtn.classList.add('wrong');
    // Highlight nút đúng
    allBtns.forEach(b => {
      if (b.textContent === currentCorrectAnswerText) {
        b.classList.add('correct');
      }
    });
    // Lưu vào danh sách sai
    if (!wrongQuestions.some(q => q.id === currentQuestion.id)) {
      wrongQuestions.push(currentQuestion);
      btnRetry.innerHTML = `<i class="fa-solid fa-star"></i> Ôn câu sai (${wrongQuestions.length})`;
    }
    showOverlay(false);
  }

  updateScoreUI();
  btnNext.style.display = 'flex';

  // Auto chuyển câu sau 2 giây
  autoNextTimeout = setTimeout(() => {
    loadNextQuestion();
  }, 2000);
}

// Nút chuyển câu thủ công
btnNext.addEventListener('click', () => {
  clearTimeout(autoNextTimeout);
  loadNextQuestion();
});

/* =========================================================
   ANIMATION & UI HELPERS
========================================================= */
function showOverlay(isCorrect) {
  resultOverlay.className = 'fullscreen-overlay show';
  
  if (isCorrect) {
    resultOverlay.classList.add('overlay-correct');
    overlayContent.innerHTML = '🎉';
  } else {
    resultOverlay.classList.add('overlay-wrong');
    overlayContent.innerHTML = '😭';
  }

  // Tự ẩn sau 1s
  setTimeout(() => {
    resultOverlay.className = 'fullscreen-overlay';
  }, 1000);
}

function updateScoreUI() {
  quizScore.textContent = `Điểm: ${scoreCorrect}/${totalAnswered}`;
}

function updateProgressUI() {
  // Tính toán câu số mấy dựa trên queue
  const currentNum = totalAnswered + 1;
  const totalNum = totalAnswered + 1 + questionQueue.length;
  quizProgress.textContent = `Câu ${currentNum}/${totalNum}`;
}

// Trộn mảng ngẫu nhiên (Fisher-Yates)
function shuffleArray(array) {
  let curId = array.length;
  while (0 !== curId) {
    let randId = Math.floor(Math.random() * curId);
    curId -= 1;
    let tmp = array[curId];
    array[curId] = array[randId];
    array[randId] = tmp;
  }
  return array;
}

/* =========================================================
   RETRY MODE (ÔN TẬP CÂU SAI)
========================================================= */
btnRetry.addEventListener('click', () => {
  if (wrongQuestions.length === 0) {
    alert("Bạn chưa làm sai câu nào cả! Giỏi quá!");
    return;
  }
  
  // Lấy các câu sai đưa vào bài test mới
  alert(`Bắt đầu ôn lại ${wrongQuestions.length} câu đã sai nhé.`);
  
  // Bỏ check tất cả sidebar
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Start với mảng câu sai
  startQuiz([...wrongQuestions]);
  wrongQuestions = []; // Reset danh sách sai
  btnRetry.innerHTML = `<i class="fa-solid fa-star"></i> Ôn câu sai (0)`;
});

/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */
document.addEventListener('keydown', (e) => {
  // Không nhận phím nếu Quiz chưa hiện
  if (quizContainer.style.display === 'none') return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (!btnSpeak.disabled) playAudio();
  } else if (e.key === 'ArrowRight') {
    if (btnNext.style.display !== 'none') {
      clearTimeout(autoNextTimeout);
      loadNextQuestion();
    }
  } else if (['1','2','3','4'].includes(e.key)) {
    // Kích hoạt nút đáp án
    const btns = document.querySelectorAll('.answer-btn');
    const idx = parseInt(e.key) - 1;
    if (btns[idx] && !btns[idx].disabled) {
      btns[idx].click();
    }
  }
});