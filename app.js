(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v2';
  const SESSION_KEY = 'megaprep-session-v1';
  const CURRICULUM = window.MEGAPREP_CURRICULUM || {};
  const defaultState = {
    exams: [],
    questions: [],
    students: [],
    attempts: [],
    devices: [],
    credentials: { adminPassword: 'admin1234', admins: [], students: [] },
    settings: {
      darkMode: false,
      printConfig: {
        headerTitle: 'MegaPrep Examination',
        instructions: 'Answer all questions carefully.',
        numberPrefix: '',
        columns: '1',
        showAnswers: false,
        showExplanation: false,
      },
    },
  };

  const state = loadState();
  let analyticsChart;
  let accuracyChart;
  let questionMode = 'mcq';
  let mcqImageData = '';
  let cqImageData = '';
  let selectedQuestionExamId = '';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindThemeToggle();
    bindExportImport();
    ensureCurrentDevice();
    renderGlobalMeta();
    switch (document.body.dataset.page) {
      case 'dashboard': initDashboard(); break;
      case 'create-exam': initCreateExamPage(); break;
      case 'question-bank': initQuestionBankPage(); break;
      case 'handle-exams': initHandleExamsPage(); break;
      case 'students': initStudentsPage(); break;
      case 'analytics': initAnalyticsPage(); break;
      case 'devices': initDevicesPage(); break;
      case 'passwords': initPasswordsPage(); break;
      default: break;
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? mergeState(JSON.parse(raw)) : structuredClone(defaultState);
    } catch {
      return structuredClone(defaultState);
    }
  }

  function mergeState(saved) {
    return {
      ...structuredClone(defaultState),
      ...saved,
      credentials: { ...structuredClone(defaultState).credentials, ...(saved.credentials || {}) },
      settings: {
        ...structuredClone(defaultState).settings,
        ...(saved.settings || {}),
        printConfig: { ...structuredClone(defaultState).settings.printConfig, ...(saved.settings?.printConfig || {}) },
      },
    };
  }

  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
  function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`; }

  function showToast(message, type = 'success') {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 250);
    }, 2600);
  }

  function bindThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    applyTheme();
    toggle.addEventListener('click', () => {
      state.settings.darkMode = !state.settings.darkMode;
      saveState();
      applyTheme();
      showToast(state.settings.darkMode ? 'Dark mode enabled.' : 'Light mode enabled.');
    });
  }

  function applyTheme() { document.body.classList.toggle('theme-dark', !!state.settings.darkMode); }

  function bindExportImport() {
    const exportBtn = document.getElementById('exportDataBtn');
    const importInput = document.getElementById('importDataFile');
    if (exportBtn) exportBtn.addEventListener('click', exportWorkspace);
    if (importInput) importInput.addEventListener('change', importWorkspace);
  }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'megaprep-cms-data.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Workspace exported.');
  }

  async function importWorkspace(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const incoming = mergeState(JSON.parse(await file.text()));
      Object.assign(state, incoming);
      saveState();
      window.location.reload();
    } catch {
      showToast('Failed to import workspace.', 'error');
    }
    event.target.value = '';
  }

  function ensureCurrentDevice() {
    const session = getSession();
    if (!session?.deviceId) return;
    const existing = state.devices.find((device) => device.id === session.deviceId);
    if (existing) existing.lastActive = new Date().toISOString();
    else state.devices.unshift({ id: session.deviceId, label: session.label || 'Browser Session', browser: navigator.userAgent, role: session.role, lastActive: new Date().toISOString() });
    saveState();
  }

  function renderGlobalMeta() {
    const sessionBadge = document.getElementById('sessionBadge');
    const storageBadge = document.getElementById('storageBadge');
    const session = getSession();
    if (sessionBadge) sessionBadge.textContent = session ? `${session.role} session active` : 'No active admin session';
    if (storageBadge) storageBadge.textContent = `${state.exams.length} exams · ${state.questions.length} questions · ${state.students.length} students`;
  }

  function initDashboard() {
    renderGlobalMeta();
  }

  function initCreateExamPage() {
    bindCurriculumSelectors({ level: 'examLevel', group: 'examGroup', subject: 'examSubject' }, true);
    document.getElementById('addSectionBtn').addEventListener('click', () => document.getElementById('sectionList').appendChild(createSectionRow()));
    resetSectionList();
    const form = document.getElementById('examForm');
    form.addEventListener('submit', handleExamSubmit);
    const editId = new URLSearchParams(window.location.search).get('examId');
    if (editId) loadExamIntoForm(editId);
    renderExamSummary();
  }

  function bindCurriculumSelectors(ids, syncCourse = false) {
    const level = document.getElementById(ids.level);
    const group = document.getElementById(ids.group);
    const subject = document.getElementById(ids.subject);
    const topic = ids.topic ? document.getElementById(ids.topic) : null;
    if (!level || !group || !subject) return;

    const renderGroups = () => {
      level.innerHTML = Object.keys(CURRICULUM).map((key) => `<option value="${key}">${key}</option>`).join('');
      updateGroups();
    };

    const updateGroups = () => {
      const groups = Object.keys(CURRICULUM[level.value] || {});
      group.innerHTML = groups.map((key) => `<option value="${key}">${key}</option>`).join('');
      updateSubjects();
    };

    const updateSubjects = () => {
      const subjects = Object.keys(CURRICULUM[level.value]?.[group.value] || {});
      subject.innerHTML = subjects.map((key) => `<option value="${key}">${key}</option>`).join('');
      updateTopics();
      if (syncCourse && document.getElementById('examCourse')) document.getElementById('examCourse').value = `${level.value} ${subject.value}`;
    };

    const updateTopics = () => {
      if (!topic) return;
      const topics = CURRICULUM[level.value]?.[group.value]?.[subject.value] || [];
      topic.innerHTML = topics.map((item) => `<option value="${item}">${item}</option>`).join('');
    };

    level.addEventListener('change', updateGroups);
    group.addEventListener('change', updateSubjects);
    subject.addEventListener('change', updateTopics);
    renderGroups();
  }

  function createSectionRow(section = {}) {
    const row = document.createElement('div');
    row.className = 'section-row';
    row.dataset.id = section.id || uid('section');
    row.innerHTML = `<input data-field="name" type="text" placeholder="Section name" value="${escapeAttr(section.name || '')}" /><input data-field="marks" type="number" min="1" placeholder="Marks per question" value="${escapeAttr(section.marksPerQuestion || '')}" /><button type="button" class="icon-button">Remove</button>`;
    row.querySelector('.icon-button').addEventListener('click', () => row.remove());
    return row;
  }

  function resetSectionList(sections = [{}]) {
    const list = document.getElementById('sectionList');
    if (!list) return;
    list.innerHTML = '';
    sections.forEach((section) => list.appendChild(createSectionRow(section)));
  }

  function handleExamSubmit(event) {
    event.preventDefault();
    const sections = [...document.querySelectorAll('.section-row')].map((row) => ({ id: row.dataset.id, name: row.querySelector('[data-field="name"]').value.trim(), marksPerQuestion: Number(row.querySelector('[data-field="marks"]').value || 0) })).filter((item) => item.name);
    const id = document.getElementById('examId').value || uid('exam');
    const existing = state.exams.find((exam) => exam.id === id);
    const exam = {
      id,
      level: document.getElementById('examLevel').value,
      group: document.getElementById('examGroup').value,
      subject: document.getElementById('examSubject').value,
      course: document.getElementById('examCourse').value.trim(),
      examNumber: document.getElementById('examNumber').value.trim(),
      title: document.getElementById('examTitle').value.trim(),
      duration: Number(document.getElementById('examDuration').value),
      fullMarks: Number(document.getElementById('examMarks').value),
      examType: document.getElementById('examType').value,
      examDate: document.getElementById('examDate').value,
      startTime: document.getElementById('examStartTime').value,
      endTime: document.getElementById('examEndTime').value,
      sections,
      questionIds: existing?.questionIds || [],
      published: existing?.published || false,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    upsert(state.exams, exam);
    saveState();
    event.target.reset();
    document.getElementById('examId').value = '';
    resetSectionList();
    bindCurriculumSelectors({ level: 'examLevel', group: 'examGroup', subject: 'examSubject' }, true);
    renderExamSummary();
    showToast('Exam saved.');
  }

  function loadExamIntoForm(id) {
    const exam = state.exams.find((item) => item.id === id);
    if (!exam) return;
    document.getElementById('examId').value = exam.id;
    bindCurriculumSelectors({ level: 'examLevel', group: 'examGroup', subject: 'examSubject' }, true);
    document.getElementById('examLevel').value = exam.level || 'SSC';
    document.getElementById('examLevel').dispatchEvent(new Event('change'));
    document.getElementById('examGroup').value = exam.group || document.getElementById('examGroup').value;
    document.getElementById('examGroup').dispatchEvent(new Event('change'));
    document.getElementById('examSubject').value = exam.subject || document.getElementById('examSubject').value;
    document.getElementById('examCourse').value = exam.course;
    document.getElementById('examNumber').value = exam.examNumber;
    document.getElementById('examTitle').value = exam.title;
    document.getElementById('examDuration').value = exam.duration;
    document.getElementById('examMarks').value = exam.fullMarks;
    document.getElementById('examType').value = exam.examType;
    document.getElementById('examDate').value = exam.examDate;
    document.getElementById('examStartTime').value = exam.startTime;
    document.getElementById('examEndTime').value = exam.endTime;
    resetSectionList(exam.sections?.length ? exam.sections : [{}]);
  }

  function renderExamSummary() {
    const target = document.getElementById('examSummaryList');
    if (!target) return;
    if (!state.exams.length) return target.innerHTML = emptyState('No exams created yet.');
    target.innerHTML = state.exams.map((exam) => `<article class="entity-card"><div><h4>${escapeHtml(exam.title)}</h4><p>${escapeHtml(exam.level)} · ${escapeHtml(exam.subject)} · ${escapeHtml(exam.examDate)}</p></div><a class="toolbar-button" href="create-exam.html?examId=${exam.id}">Edit</a></article>`).join('');
  }

  function initQuestionBankPage() {
    bindCurriculumSelectors({ level: 'qbLevel', group: 'qbGroup', subject: 'qbSubject', topic: 'qbTopic' });
    bindQuestionExamTarget();
    document.getElementById('questionModeTabs').addEventListener('click', switchQuestionMode);
    document.getElementById('addOptionBtn').addEventListener('click', () => { document.getElementById('optionList').appendChild(createOptionRow()); updateOptionIndexes(); updateQuestionPreview(); });
    document.getElementById('addSubQuestionBtn').addEventListener('click', () => { document.getElementById('subQuestionList').appendChild(createSubQuestionRow()); updateQuestionPreview(); });
    document.getElementById('generatePromptBtn').addEventListener('click', generateCurriculumPrompt);
    document.getElementById('applyPromptBtn').addEventListener('click', applyPromptToEditor);
    document.getElementById('mcqForm').addEventListener('submit', saveMCQ);
    document.getElementById('cqForm').addEventListener('submit', saveCQ);
    document.getElementById('importJsonBtn').addEventListener('click', importQuestionsFromJson);
    document.getElementById('jsonImportFile').addEventListener('change', async (e) => { const file = e.target.files?.[0]; if (file) document.getElementById('jsonImportText').value = await file.text(); });
    document.getElementById('mcqImage').addEventListener('change', async (e) => { mcqImageData = await readFileAsDataUrl(e.target.files?.[0]); updateQuestionPreview(); });
    document.getElementById('cqImage').addEventListener('change', async (e) => { cqImageData = await readFileAsDataUrl(e.target.files?.[0]); updateQuestionPreview(); });
    ['mcqQuestion', 'mcqExplanation', 'cqStimulus'].forEach((id) => document.getElementById(id).addEventListener('input', updateQuestionPreview));
    resetOptions();
    resetSubQuestions();
    renderQuestions();
    updateQuestionPreview();
  }

  function switchQuestionMode(event) {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    questionMode = button.dataset.mode;
    document.querySelectorAll('.segmented-control__btn').forEach((item) => item.classList.toggle('is-active', item === button));
    document.querySelectorAll('.mode-panel').forEach((panel) => {
      const active = questionMode === 'json' ? panel.id === 'jsonImportPanel' : panel.id === `${questionMode}Form`;
      panel.classList.toggle('is-active', active);
    });
    updateQuestionPreview();
  }

  function generateCurriculumPrompt() {
    const payload = {
      level: document.getElementById('qbLevel').value,
      group: document.getElementById('qbGroup').value,
      subject: document.getElementById('qbSubject').value,
      topic: document.getElementById('qbTopic').value,
      questionType: document.getElementById('promptQuestionType').value,
      difficulty: document.getElementById('promptDifficulty').value,
      instruction: 'Generate curriculum-aligned exam question using Bangladesh board standard.',
    };
    document.getElementById('jsonPromptText').value = JSON.stringify(payload, null, 2);
    showToast('Curriculum prompt generated.');
  }

  function applyPromptToEditor() {
    const raw = document.getElementById('jsonPromptText').value.trim();
    if (!raw) return showToast('Add a prompt or JSON first.', 'error');
    try {
      const payload = JSON.parse(raw);
      const type = (payload.questionType || payload.type || 'MCQ').toUpperCase();
      if (type === 'CQ') {
        questionMode = 'cq';
        document.querySelector('[data-mode="cq"]').click();
        document.getElementById('cqStimulus').value = payload.stimulus || `${payload.subject || document.getElementById('qbSubject').value} - ${payload.topic || document.getElementById('qbTopic').value}`;
      } else {
        questionMode = 'mcq';
        document.querySelector('[data-mode="mcq"]').click();
        document.getElementById('mcqQuestion').value = payload.question || `Create a ${payload.difficulty || 'Medium'} ${payload.subject || document.getElementById('qbSubject').value} question from ${payload.topic || document.getElementById('qbTopic').value}.`;
        document.getElementById('mcqExplanation').value = payload.explanation || '';
        if (Array.isArray(payload.options)) fillOptions(payload.options, payload.correct ?? 0);
      }
      updateQuestionPreview();
      showToast('Prompt applied to editor.');
    } catch {
      document.querySelector('[data-mode="mcq"]').click();
      document.getElementById('mcqQuestion').value = raw;
      updateQuestionPreview();
      showToast('Prompt text applied as question draft.');
    }
  }

  function saveMCQ(event) {
    event.preventDefault();
    const options = [...document.querySelectorAll('.option-row')].map((row) => ({ text: row.querySelector('.option-row__text').value.trim(), correct: row.querySelector('.option-row__correct').checked })).filter((item) => item.text);
    const correct = options.findIndex((item) => item.correct);
    if (!options.length || correct < 0) return showToast('Add options and select the correct answer.', 'error');
    const question = { id: uid('question'), type: 'mcq', level: document.getElementById('qbLevel').value, group: document.getElementById('qbGroup').value, subject: document.getElementById('qbSubject').value, topic: document.getElementById('qbTopic').value, section: document.getElementById('qbTopic').value, question: document.getElementById('mcqQuestion').value.trim(), options: options.map((item) => item.text), correct, explanation: document.getElementById('mcqExplanation').value.trim(), image: mcqImageData, createdAt: new Date().toISOString() };
    state.questions.unshift(question);
    linkQuestionToSelectedExam(question.id);
    saveState();
    event.target.reset();
    mcqImageData = '';
    bindCurriculumSelectors({ level: 'qbLevel', group: 'qbGroup', subject: 'qbSubject', topic: 'qbTopic' });
    resetOptions();
    renderQuestions();
    updateQuestionPreview();
    showToast(selectedQuestionExamId ? 'MCQ saved and linked to selected exam.' : 'MCQ saved.');
  }

  function saveCQ(event) {
    event.preventDefault();
    const subQuestions = [...document.querySelectorAll('.sub-question-row')].map((row) => ({ label: row.querySelector('.sub-question-row__label').value.trim(), prompt: row.querySelector('.sub-question-row__prompt').value.trim(), answer: row.querySelector('.sub-question-row__answer').value.trim() })).filter((item) => item.prompt);
    const question = { id: uid('question'), type: 'cq', level: document.getElementById('qbLevel').value, group: document.getElementById('qbGroup').value, subject: document.getElementById('qbSubject').value, topic: document.getElementById('qbTopic').value, section: document.getElementById('qbTopic').value, stimulus: document.getElementById('cqStimulus').value.trim(), subQuestions, image: cqImageData, createdAt: new Date().toISOString() };
    state.questions.unshift(question);
    linkQuestionToSelectedExam(question.id);
    saveState();
    event.target.reset();
    cqImageData = '';
    bindCurriculumSelectors({ level: 'qbLevel', group: 'qbGroup', subject: 'qbSubject', topic: 'qbTopic' });
    resetSubQuestions();
    renderQuestions();
    updateQuestionPreview();
    showToast(selectedQuestionExamId ? 'CQ saved and linked to selected exam.' : 'CQ saved.');
  }

  function importQuestionsFromJson() {
    const message = document.getElementById('jsonImportMessage');
    const raw = document.getElementById('jsonImportText').value.trim();
    if (!raw) {
      message.textContent = 'Paste JSON first.';
      return showToast('Please paste JSON before importing.', 'error');
    }

    try {
      const payload = parseJsonImportPayload(raw);
      const defaults = {
        level: document.getElementById('qbLevel').value,
        group: document.getElementById('qbGroup').value,
        subject: document.getElementById('qbSubject').value,
        topic: document.getElementById('qbTopic').value,
      };
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.questions)
          ? payload.questions
          : payload.question
            ? [payload.question]
            : payload.questions === undefined && typeof payload === 'object'
              ? [payload]
              : [];
      if (!items.length) throw new Error('No valid question payload found.');

      const summary = { imported: 0, skipped: 0 };
      items.forEach((question) => {
        const normalized = normalizeImportedQuestion(question, defaults);
        if (!normalized) {
          summary.skipped += 1;
          return;
        }
        state.questions.unshift(normalized);
        linkQuestionToSelectedExam(normalized.id);
        summary.imported += 1;
      });

      if (!summary.imported) throw new Error('No valid question entries.');
      saveState();
      renderQuestions();
      message.textContent = `Imported ${summary.imported} question(s)${summary.skipped ? `, skipped ${summary.skipped}.` : '.'}`;
      showToast(`JSON import complete (${summary.imported} added).`);
    } catch (error) {
      message.textContent = error?.message || 'Invalid JSON format.';
      showToast('JSON validation failed.', 'error');
    }
  }

  function parseJsonImportPayload(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      const cleaned = raw
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    }
  }

  function bindQuestionExamTarget() {
    const select = document.getElementById('qbExamTarget');
    if (!select) return;
    const current = selectedQuestionExamId;
    const options = ['<option value="">Only save in Question Bank</option>'].concat(
      state.exams.map((exam) => `<option value="${exam.id}">${escapeHtml(exam.title)} · ${escapeHtml(exam.subject || '')}</option>`),
    );
    select.innerHTML = options.join('');
    if (state.exams.some((exam) => exam.id === current)) select.value = current;
    select.addEventListener('change', () => { selectedQuestionExamId = select.value; });
    selectedQuestionExamId = select.value;
  }

  function linkQuestionToSelectedExam(questionId) {
    if (!selectedQuestionExamId) return;
    const exam = findExam(selectedQuestionExamId);
    if (!exam) return;
    exam.questionIds = [...new Set([...(exam.questionIds || []), questionId])];
  }

  function normalizeImportedQuestion(question, defaults) {
    if (!question || typeof question !== 'object') return null;
    const type = String(question.type || (question.stimulus ? 'cq' : 'mcq')).toLowerCase();
    if (type === 'cq') {
      const subQuestions = Array.isArray(question.subQuestions) ? question.subQuestions.filter((item) => item && (item.prompt || item.answer || item.label)) : [];
      const stimulus = String(question.stimulus || question.question || '').trim();
      if (!stimulus && !subQuestions.length) return null;
      return {
        id: uid('question'),
        type: 'cq',
        level: question.level || defaults.level,
        group: question.group || defaults.group,
        subject: question.subject || defaults.subject,
        topic: question.topic || defaults.topic,
        section: question.section || question.topic || defaults.topic,
        stimulus,
        subQuestions: subQuestions.map((item, index) => ({
          label: String(item.label || String.fromCharCode(65 + index)).trim(),
          prompt: String(item.prompt || '').trim(),
          answer: String(item.answer || '').trim(),
        })),
        image: question.image || '',
        createdAt: new Date().toISOString(),
      };
    }

    const options = Array.isArray(question.options)
      ? question.options.map((option) => (typeof option === 'string' ? option : option?.text || '')).map((option) => String(option).trim()).filter(Boolean)
      : [];
    const text = String(question.question || question.stem || '').trim();
    if (!text || !options.length) return null;
    const correct = normalizeCorrectIndex(question.correct, question.answer, options);
    return {
      id: uid('question'),
      type: 'mcq',
      level: question.level || defaults.level,
      group: question.group || defaults.group,
      subject: question.subject || defaults.subject,
      topic: question.topic || defaults.topic,
      section: question.section || question.topic || defaults.topic,
      question: text,
      options,
      correct,
      explanation: String(question.explanation || '').trim(),
      image: question.image || '',
      createdAt: new Date().toISOString(),
    };
  }

  function normalizeCorrectIndex(correct, answer, options) {
    if (Number.isInteger(correct) && correct >= 0 && correct < options.length) return correct;
    const raw = String(answer || '').trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) {
      const idx = Number(raw) - 1;
      if (idx >= 0 && idx < options.length) return idx;
    }
    const code = raw.toUpperCase().charCodeAt(0) - 65;
    if (code >= 0 && code < options.length) return code;
    const byText = options.findIndex((option) => option.toLowerCase() === raw.toLowerCase());
    return byText >= 0 ? byText : 0;
  }

  function createOptionRow(option = {}) {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `<span class="option-row__index"></span><input class="option-row__text" type="text" placeholder="Option text" value="${escapeAttr(option.text || '')}" /><label class="option-row__flag"><input class="option-row__correct" type="radio" name="correctOption" ${option.correct ? 'checked' : ''} /> Correct</label><button type="button" class="icon-button">Remove</button>`;
    row.querySelector('.icon-button').addEventListener('click', () => { row.remove(); updateOptionIndexes(); updateQuestionPreview(); });
    row.querySelectorAll('input').forEach((el) => el.addEventListener('input', updateQuestionPreview));
    return row;
  }

  function resetOptions() { const list = document.getElementById('optionList'); if (!list) return; list.innerHTML = ''; for (let i = 0; i < 4; i += 1) list.appendChild(createOptionRow()); updateOptionIndexes(); }
  function fillOptions(options, correctIndex) { const list = document.getElementById('optionList'); list.innerHTML = ''; options.forEach((text, index) => list.appendChild(createOptionRow({ text, correct: index === correctIndex }))); updateOptionIndexes(); }
  function updateOptionIndexes() { document.querySelectorAll('.option-row').forEach((row, i) => row.querySelector('.option-row__index').textContent = String.fromCharCode(65 + i)); }
  function createSubQuestionRow(item = {}) { const row = document.createElement('div'); row.className = 'sub-question-row'; row.innerHTML = `<input class="sub-question-row__label" type="text" placeholder="Label" value="${escapeAttr(item.label || '')}" /><textarea class="sub-question-row__prompt" rows="2" placeholder="Sub question">${escapeHtml(item.prompt || '')}</textarea><textarea class="sub-question-row__answer" rows="2" placeholder="Answer">${escapeHtml(item.answer || '')}</textarea><button type="button" class="icon-button">Remove</button>`; row.querySelector('.icon-button').addEventListener('click', () => { row.remove(); updateQuestionPreview(); }); row.querySelectorAll('input,textarea').forEach((el) => el.addEventListener('input', updateQuestionPreview)); return row; }
  function resetSubQuestions() { const list = document.getElementById('subQuestionList'); if (!list) return; list.innerHTML = ''; ['A', 'B'].forEach((label) => list.appendChild(createSubQuestionRow({ label }))); }

  function updateQuestionPreview() {
    const preview = document.getElementById('questionPreview');
    if (!preview) return;
    if (questionMode === 'cq') {
      const subs = [...document.querySelectorAll('.sub-question-row')].map((row) => `<div class="preview-sub"><strong>${escapeHtml(row.querySelector('.sub-question-row__label').value || 'A')}.</strong> ${escapeHtml(row.querySelector('.sub-question-row__prompt').value || '')}</div>`).join('');
      preview.innerHTML = `<div class="preview-block"><h4>${escapeHtml(document.getElementById('cqStimulus').value || 'Stimulus preview')}</h4>${cqImageData ? `<img class="preview-image" src="${cqImageData}" alt="Stimulus" />` : ''}${subs || '<p>Add sub questions to preview.</p>'}</div>`;
    } else if (questionMode === 'json') {
      preview.innerHTML = '<div class="preview-block"><p>Imported questions will appear in the saved list.</p></div>';
    } else {
      const options = [...document.querySelectorAll('.option-row')].map((row, index) => row.querySelector('.option-row__text').value.trim() ? `<li>${String.fromCharCode(65 + index)}. ${escapeHtml(row.querySelector('.option-row__text').value)}</li>` : '').join('');
      preview.innerHTML = `<div class="preview-block"><h4>${escapeHtml(document.getElementById('mcqQuestion').value || 'Question preview')}</h4>${mcqImageData ? `<img class="preview-image" src="${mcqImageData}" alt="Question" />` : ''}<ol>${options || '<li>Add options to preview.</li>'}</ol><p>${escapeHtml(document.getElementById('mcqExplanation').value || '')}</p></div>`;
    }
    queueTypeset();
  }

  function renderQuestions() {
    const target = document.getElementById('questionList');
    if (!target) return;
    if (!state.questions.length) return target.innerHTML = emptyState('No questions created yet.');
    target.innerHTML = state.questions.map((question) => `<article class="entity-card entity-card--stacked"><div class="entity-card__head"><div><h4>${escapeHtml((question.type || 'mcq').toUpperCase())} · ${escapeHtml(question.subject || '')}</h4><p>${escapeHtml(question.question || question.stimulus || 'Question')}</p></div><button class="toolbar-button toolbar-button--danger" data-delete-question="${question.id}">Delete</button></div><p class="muted-copy">${escapeHtml(question.level || '')} · ${escapeHtml(question.group || '')} · ${escapeHtml(question.topic || '')}</p></article>`).join('');
    target.querySelectorAll('[data-delete-question]').forEach((button) => button.addEventListener('click', () => {
      state.questions = state.questions.filter((item) => item.id !== button.dataset.deleteQuestion);
      state.exams.forEach((exam) => exam.questionIds = exam.questionIds.filter((id) => id !== button.dataset.deleteQuestion));
      saveState();
      renderQuestions();
      showToast('Question deleted.');
    }));
  }

  function initHandleExamsPage() {
    bindCurriculumFilterSelectors({ level: 'examFilterLevel', group: 'examFilterGroup', subject: 'examFilterSubject', topic: 'examFilterTopic' });
    bindExamFilters();
    bindPrintConfig();
    renderExamManager();
  }

  function bindCurriculumFilterSelectors(ids) {
    const level = document.getElementById(ids.level);
    const group = document.getElementById(ids.group);
    const subject = document.getElementById(ids.subject);
    const topic = document.getElementById(ids.topic);
    if (!level || !group || !subject || !topic) return;

    const withAll = (items) => ['<option value="">All</option>'].concat(items.map((item) => `<option value="${item}">${item}</option>`)).join('');
    const renderGroups = () => {
      level.innerHTML = withAll(Object.keys(CURRICULUM));
      updateGroups();
    };
    const updateGroups = () => {
      const groups = level.value ? Object.keys(CURRICULUM[level.value] || {}) : [...new Set(Object.values(CURRICULUM).flatMap((item) => Object.keys(item || {})))];
      group.innerHTML = withAll(groups);
      updateSubjects();
    };
    const updateSubjects = () => {
      let subjects = [];
      if (level.value && group.value) subjects = Object.keys(CURRICULUM[level.value]?.[group.value] || {});
      else if (level.value) subjects = [...new Set(Object.values(CURRICULUM[level.value] || {}).flatMap((item) => Object.keys(item || {})))];
      else subjects = [...new Set(Object.values(CURRICULUM).flatMap((lvl) => Object.values(lvl || {}).flatMap((grp) => Object.keys(grp || {}))))];
      subject.innerHTML = withAll(subjects);
      updateTopics();
    };
    const updateTopics = () => {
      let topics = [];
      if (level.value && group.value && subject.value) topics = CURRICULUM[level.value]?.[group.value]?.[subject.value] || [];
      else if (level.value && group.value) topics = [...new Set(Object.values(CURRICULUM[level.value]?.[group.value] || {}).flat())];
      else topics = [...new Set(Object.values(CURRICULUM).flatMap((lvl) => Object.values(lvl || {}).flatMap((grp) => Object.values(grp || {}).flat())))];
      topic.innerHTML = withAll(topics);
    };

    level.addEventListener('change', updateGroups);
    group.addEventListener('change', updateSubjects);
    subject.addEventListener('change', updateTopics);
    renderGroups();
  }

  function bindExamFilters() {
    ['examFilterLevel', 'examFilterGroup', 'examFilterSubject', 'examFilterTopic'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', renderExamManager);
    });
  }

  function bindPrintConfig() {
    const config = state.settings.printConfig;
    ['printHeaderTitle', 'printInstructions', 'printNumberPrefix', 'printColumns'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.replace('print', '');
      const map = { HeaderTitle: 'headerTitle', Instructions: 'instructions', NumberPrefix: 'numberPrefix', Columns: 'columns' };
      el.value = config[map[key]];
      el.addEventListener('input', () => { config[map[key]] = el.value; saveState(); renderPrintPreviewMeta(); });
    });
    ['printShowAnswers', 'printShowExplanation'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id === 'printShowAnswers' ? 'showAnswers' : 'showExplanation';
      el.checked = !!config[key];
      el.addEventListener('change', () => { config[key] = el.checked; saveState(); renderPrintPreviewMeta(); });
    });
    renderPrintPreviewMeta();
  }

  function renderPrintPreviewMeta() {
    const preview = document.getElementById('printPreviewMeta');
    if (!preview) return;
    const config = state.settings.printConfig;
    preview.innerHTML = `<div class="preview-block"><h4>${escapeHtml(config.headerTitle)}</h4><p>${escapeHtml(config.instructions)}</p><p>Numbering: 1, 2, 3... · Columns: ${escapeHtml(config.columns)} · Answers: ${config.showAnswers ? 'Yes' : 'No'} · Explanation: ${config.showExplanation ? 'Yes' : 'No'}</p></div>`;
  }

  function renderExamManager() {
    const target = document.getElementById('examManagerList');
    if (!target) return;
    if (!state.exams.length) return target.innerHTML = emptyState('No exams available.');
    const filters = getQuestionFilters();
    target.innerHTML = state.exams.map((exam) => {
      const filteredQuestions = state.questions.filter((question) => {
        if (exam.subject && question.subject && question.subject !== exam.subject) return false;
        if (filters.level && question.level !== filters.level) return false;
        if (filters.group && question.group !== filters.group) return false;
        if (filters.subject && question.subject !== filters.subject) return false;
        if (filters.topic && question.topic !== filters.topic) return false;
        return true;
      });
      return `<article class="entity-card entity-card--stacked"><div class="entity-card__head"><div><h4>${escapeHtml(exam.title)}</h4><p>${escapeHtml(exam.level)} · ${escapeHtml(exam.subject)} · ${exam.questionIds.length} Questions</p></div><span class="status-pill ${exam.published ? 'is-live' : ''}">${exam.published ? 'Published' : 'Draft'}</span></div><div class="assignment-box"><label>Assign questions</label><div class="assignment-list">${filteredQuestions.length ? filteredQuestions.map((question) => `<label class="assignment-item"><input type="checkbox" data-exam-id="${exam.id}" data-question-id="${question.id}" ${exam.questionIds.includes(question.id) ? 'checked' : ''} /><span>${escapeHtml((question.type || 'mcq').toUpperCase())} · ${escapeHtml(question.topic || question.section || 'Topic')} · ${escapeHtml(question.question || question.stimulus || 'Question')}</span></label>`).join('') : '<p class="muted-copy">No matching questions found for current filter.</p>'}</div></div><div class="entity-actions"><a class="toolbar-button" href="create-exam.html?examId=${exam.id}">Edit</a><button class="toolbar-button" data-publish-exam="${exam.id}">${exam.published ? 'Unpublish' : 'Publish'}</button><button class="toolbar-button" data-download-exam="${exam.id}">Download</button><button class="toolbar-button" data-print-exam="${exam.id}">Print</button><button class="toolbar-button toolbar-button--danger" data-delete-exam="${exam.id}">Delete</button></div></article>`;
    }).join('');
    target.querySelectorAll('[data-publish-exam]').forEach((button) => button.addEventListener('click', () => { const exam = findExam(button.dataset.publishExam); exam.published = !exam.published; saveState(); renderExamManager(); }));
    target.querySelectorAll('[data-delete-exam]').forEach((button) => button.addEventListener('click', () => { state.exams = state.exams.filter((item) => item.id !== button.dataset.deleteExam); state.attempts = state.attempts.filter((attempt) => attempt.examId !== button.dataset.deleteExam); saveState(); renderExamManager(); showToast('Exam deleted.'); }));
    target.querySelectorAll('[data-download-exam]').forEach((button) => button.addEventListener('click', () => downloadExamPaper(button.dataset.downloadExam)));
    target.querySelectorAll('[data-print-exam]').forEach((button) => button.addEventListener('click', () => printExamPaper(button.dataset.printExam)));
    target.querySelectorAll('input[data-exam-id]').forEach((checkbox) => checkbox.addEventListener('change', () => {
      const exam = findExam(checkbox.dataset.examId);
      exam.questionIds = checkbox.checked ? [...new Set([...exam.questionIds, checkbox.dataset.questionId])] : exam.questionIds.filter((id) => id !== checkbox.dataset.questionId);
      saveState();
      renderExamManager();
      showToast('Exam question mapping updated.');
    }));
  }

  function getQuestionFilters() {
    const read = (id) => document.getElementById(id)?.value || '';
    return {
      level: read('examFilterLevel'),
      group: read('examFilterGroup'),
      subject: read('examFilterSubject'),
      topic: read('examFilterTopic'),
    };
  }

  function buildExamPaperHtml(examId) {
    const exam = findExam(examId);
    const config = state.settings.printConfig;
    const questions = exam.questionIds.map((id) => state.questions.find((question) => question.id === id)).filter(Boolean);
    const list = questions.map((question, index) => {
      const number = `${index + 1}`;
      const title = latexToPlainText(question.question || question.stimulus || '');
      const body = question.type === 'cq'
        ? (question.subQuestions || []).map((item) => `<div><strong>${escapeHtml(item.label || '')}.</strong> ${escapeHtml(latexToPlainText(item.prompt || ''))}${config.showAnswers ? `<div class="answer-block"><strong>Answer:</strong> ${escapeHtml(latexToPlainText(item.answer || ''))}</div>` : ''}</div>`).join('')
        : `<ul class="option-list">${(question.options || []).map((option, optionIndex) => `<li><span class="option-label">${String.fromCharCode(65 + optionIndex)}.</span> <span>${escapeHtml(latexToPlainText(option))}</span></li>`).join('')}</ul>${config.showAnswers ? `<p class="answer-block"><strong>Answer:</strong> ${String.fromCharCode(65 + (question.correct || 0))}. ${escapeHtml(latexToPlainText((question.options || [])[question.correct] || ''))}</p>` : ''}`;
      const explanation = config.showExplanation && question.explanation ? `<p class="explanation-block"><strong>Explanation:</strong> ${escapeHtml(latexToPlainText(question.explanation))}</p>` : '';
      return `<article class="print-question"><h3>${number}. ${escapeHtml(title)}</h3>${body}${explanation}</article>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(exam.title)}</title><style>body{font-family:Arial,sans-serif;background:#fff;padding:36px;color:#111}.paper{max-width:960px;margin:0 auto}h1,h2,h3{margin:0}h1{text-align:center;font-size:30px;margin-bottom:6px}h2{text-align:center;font-size:22px;margin-bottom:12px}.paper-meta{text-align:center;font-size:14px;color:#444;margin-bottom:24px}.instructions{border:1px solid #d6d6d6;background:#f8fafc;padding:10px 12px;border-radius:8px;text-align:center;margin:0 0 18px 0}.question-grid{column-count:${config.columns};column-gap:28px}.print-question{break-inside:avoid;page-break-inside:avoid;padding:0 0 18px;margin:0 0 18px;border-bottom:1px solid #ddd}h3{font-size:18px;line-height:1.45;margin-bottom:10px}.option-list{list-style:none;padding-left:0;margin:8px 0}.option-list li{display:flex;gap:8px;margin:5px 0}.option-label{min-width:20px;font-weight:700}.answer-block,.explanation-block{margin-top:8px}</style></head><body><div class="paper"><h1>${escapeHtml(latexToPlainText(config.headerTitle))}</h1><h2>${escapeHtml(latexToPlainText(exam.title))}</h2><p class="paper-meta">${escapeHtml(latexToPlainText(exam.subject))} · ${escapeHtml(exam.examDate)} · ${escapeHtml(exam.examType)}</p><p class="instructions">${escapeHtml(latexToPlainText(config.instructions))}</p><div class="question-grid">${list || '<p>No questions assigned.</p>'}</div></div></body></html>`;
  }

  function latexToPlainText(text) {
    return String(text || '')
      .replace(/\\\((.*?)\\\)/g, '$1')
      .replace(/\\\[(.*?)\\\]/g, '$1')
      .replace(/\$\$(.*?)\$\$/g, '$1')
      .replace(/\$(.*?)\$/g, '$1')
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
      .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
      .replace(/\\times/g, 'x')
      .replace(/\\cdot/g, '.')
      .replace(/\\leq/g, '<=')
      .replace(/\\geq/g, '>=')
      .replace(/\\neq/g, '!=')
      .replace(/\\%/g, '%')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function downloadExamPaper(examId) {
    const exam = findExam(examId);
    const blob = new Blob([buildExamPaperHtml(examId)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exam.title.replace(/\s+/g, '-').toLowerCase() || 'exam-paper'}.html`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exam paper downloaded.');
  }

  function printExamPaper(examId) {
    const win = window.open('', '_blank', 'width=980,height=720');
    win.document.write(buildExamPaperHtml(examId));
    win.document.close();
    win.focus();
    win.print();
  }

  function findExam(id) { return state.exams.find((item) => item.id === id); }

  function initStudentsPage() {
    document.getElementById('studentForm').addEventListener('submit', saveStudent);
    document.getElementById('studentCsvFile').addEventListener('change', async (e) => { const file = e.target.files?.[0]; if (file) document.getElementById('studentCsvText').value = await file.text(); });
    document.getElementById('importStudentsBtn').addEventListener('click', importStudents);
    renderStudents();
  }

  function saveStudent(event) {
    event.preventDefault();
    state.students.unshift({ id: uid('student'), name: document.getElementById('studentName').value.trim(), studentId: document.getElementById('studentStudentId').value.trim(), email: document.getElementById('studentEmail').value.trim(), course: document.getElementById('studentCourse').value.trim(), active: true, createdAt: new Date().toISOString() });
    saveState();
    event.target.reset();
    renderStudents();
    showToast('Student created.');
  }

  function importStudents() {
    const rows = parseCSVRows(document.getElementById('studentCsvText').value);
    rows.forEach((row) => { if (row.name || row.studentId) state.students.unshift({ id: uid('student'), name: row.name || '', studentId: row.studentId || '', email: row.email || '', course: row.course || '', active: true, createdAt: new Date().toISOString() }); });
    saveState();
    renderStudents();
    showToast('Students imported from CSV.');
  }

  function renderStudents() {
    const target = document.getElementById('studentList');
    if (!target) return;
    if (!state.students.length) return target.innerHTML = emptyState('No students added yet.');
    target.innerHTML = state.students.map((student) => `<article class="entity-card entity-card--stacked"><div class="entity-card__head"><div><h4>${escapeHtml(student.name)}</h4><p>${escapeHtml(student.studentId)} · ${escapeHtml(student.email)} · ${escapeHtml(student.course || 'No course')}</p></div><span class="status-pill ${student.active ? 'is-live' : ''}">${student.active ? 'Active' : 'Inactive'}</span></div><div class="entity-actions"><button class="toolbar-button" data-toggle-student="${student.id}">${student.active ? 'Deactivate' : 'Activate'}</button><button class="toolbar-button toolbar-button--danger" data-delete-student="${student.id}">Delete</button></div></article>`).join('');
    target.querySelectorAll('[data-toggle-student]').forEach((button) => button.addEventListener('click', () => { const student = state.students.find((item) => item.id === button.dataset.toggleStudent); student.active = !student.active; saveState(); renderStudents(); }));
    target.querySelectorAll('[data-delete-student]').forEach((button) => button.addEventListener('click', () => { state.students = state.students.filter((item) => item.id !== button.dataset.deleteStudent); saveState(); renderStudents(); }));
  }

  function initAnalyticsPage() {
    document.getElementById('attemptForm').addEventListener('submit', saveAttempt);
    populateAttemptSelectors();
    renderAnalytics();
  }

  function populateAttemptSelectors() {
    const exam = document.getElementById('attemptExam');
    const student = document.getElementById('attemptStudent');
    if (!exam || !student) return;
    exam.innerHTML = state.exams.length ? state.exams.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('') : '<option value="">No exams</option>';
    student.innerHTML = state.students.length ? state.students.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">No students</option>';
  }

  function saveAttempt(event) {
    event.preventDefault();
    state.attempts.unshift({ id: uid('attempt'), examId: document.getElementById('attemptExam').value, studentId: document.getElementById('attemptStudent').value, score: Number(document.getElementById('attemptScore').value || 0), total: Number(document.getElementById('attemptTotal').value || 0), correctIds: parseCommaList(document.getElementById('attemptCorrectIds').value), incorrectIds: parseCommaList(document.getElementById('attemptIncorrectIds').value), createdAt: new Date().toISOString() });
    saveState();
    event.target.reset();
    populateAttemptSelectors();
    renderAnalytics();
    showToast('Attempt saved.');
  }

  function renderAnalytics() {
    const summary = document.getElementById('analyticsSummary');
    if (!summary) return;
    const average = state.attempts.length ? (state.attempts.reduce((sum, item) => sum + ((item.score / (item.total || 1)) * 100), 0) / state.attempts.length).toFixed(1) : '0.0';
    summary.innerHTML = `<article class="summary-card"><span>Exam Attempts</span><strong>${state.attempts.length}</strong></article><article class="summary-card"><span>Average Score</span><strong>${average}%</strong></article><article class="summary-card"><span>Questions</span><strong>${state.questions.length}</strong></article><article class="summary-card"><span>Students</span><strong>${state.students.length}</strong></article>`;
    if (!window.Chart) return;
    analyticsChart?.destroy(); accuracyChart?.destroy();
    analyticsChart = new Chart(document.getElementById('analyticsChart'), { type: 'bar', data: { labels: ['MCQ Exams', 'CQ Exams', 'Published', 'Draft'], datasets: [{ label: 'Exams', data: [state.exams.filter((e) => e.examType === 'MCQ').length, state.exams.filter((e) => e.examType === 'CQ').length, state.exams.filter((e) => e.published).length, state.exams.filter((e) => !e.published).length], backgroundColor: ['#4f89ff', '#13b6aa', '#22b55f', '#94a3b8'] }] }, options: { responsive: true, maintainAspectRatio: false } });
    const accuracy = {};
    state.attempts.forEach((attempt) => { attempt.correctIds.forEach((id) => { accuracy[id] = accuracy[id] || { correct: 0, total: 0 }; accuracy[id].correct += 1; accuracy[id].total += 1; }); attempt.incorrectIds.forEach((id) => { accuracy[id] = accuracy[id] || { correct: 0, total: 0 }; accuracy[id].total += 1; }); });
    const labels = Object.keys(accuracy).slice(0, 6);
    accuracyChart = new Chart(document.getElementById('accuracyChart'), { type: 'line', data: { labels: labels.length ? labels : ['No data'], datasets: [{ label: 'Accuracy %', data: labels.length ? labels.map((id) => Math.round((accuracy[id].correct / accuracy[id].total) * 100)) : [0], borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.15)', tension: 0.35, fill: true }] }, options: { responsive: true, maintainAspectRatio: false } });
  }

  function initDevicesPage() { renderDevices(); }
  function renderDevices() {
    const target = document.getElementById('deviceList');
    if (!target) return;
    if (!state.devices.length) return target.innerHTML = emptyState('No session devices recorded.');
    const session = getSession();
    target.innerHTML = state.devices.map((device) => `<article class="entity-card"><div><h4>${escapeHtml(device.label)}</h4><p>${escapeHtml(device.role || 'guest')} · ${new Date(device.lastActive).toLocaleString()}</p></div><button class="toolbar-button ${session?.deviceId === device.id ? 'toolbar-button--danger' : ''}" data-force-device="${device.id}">Force Logout</button></article>`).join('');
    target.querySelectorAll('[data-force-device]').forEach((button) => button.addEventListener('click', () => { state.devices = state.devices.filter((item) => item.id !== button.dataset.forceDevice); if (getSession()?.deviceId === button.dataset.forceDevice) localStorage.removeItem(SESSION_KEY); saveState(); renderDevices(); showToast('Device removed.'); }));
  }

  function initPasswordsPage() {
    document.getElementById('passwordForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const current = document.getElementById('currentPassword').value;
      const next = document.getElementById('newPassword').value;
      const confirm = document.getElementById('confirmPassword').value;
      if (current !== state.credentials.adminPassword) return showToast('Current password incorrect.', 'error');
      if (!next || next !== confirm) return showToast('Password confirmation failed.', 'error');
      state.credentials.adminPassword = next; saveState(); event.target.reset(); showToast('Password updated.');
    });
  }

  function parseCommaList(value) { return value.split(',').map((item) => item.trim()).filter(Boolean); }
  function parseCSVRows(text) { const lines = text.trim().split(/\r?\n/).filter(Boolean); if (!lines.length) return []; const header = lines[0].split(',').map((item) => item.trim()); return lines.slice(1).map((line) => { const values = line.split(',').map((item) => item.trim()); return Object.fromEntries(header.map((key, index) => [key, values[index] || ''])); }); }
  function upsert(collection, item) { const index = collection.findIndex((entry) => entry.id === item.id); if (index === -1) collection.unshift(item); else collection[index] = { ...collection[index], ...item }; }
  function readFileAsDataUrl(file) { if (!file) return Promise.resolve(''); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
  function queueTypeset() { if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise(); }
  function emptyState(message) { return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`; }
  function escapeHtml(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function escapeAttr(value = '') { return escapeHtml(value); }
})();
