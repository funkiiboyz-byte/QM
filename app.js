(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v2';
  const SESSION_KEY = 'megaprep-session-v1';
  const OPENAI_KEY_STORAGE = 'megaprep-openai-key-v1';
  const OPENAI_MODEL_STORAGE = 'megaprep-openai-model-v1';
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
        examCode: 'EXAM-001',
        classLabel: 'Class 12',
        instructions: 'Answer all questions carefully.',
        durationLabel: '3 Hours',
        marksLabel: '100',
        headerTheme: 'classic',
        numberPrefix: '',
        columns: '1',
        setCount: 4,
        setLabelStyle: 'alphabet',
        showAnswers: false,
        showExplanation: false,
        shuffleQuestions: true,
        shuffleOptions: true,
        includeAnswerSheet: true,
        compactMode: true,
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
  let editingQuestionId = '';
  let selectedManageExamId = '';

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
      case 'result-analyse': initResultAnalysePage(); break;
      case 'student-profile': initStudentProfilePage(); break;
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
    document.getElementById('openChatGptBtn').addEventListener('click', openChatGptWithPrompt);
    document.getElementById('generateWithAiBtn').addEventListener('click', generateWithChatGptApi);
    document.getElementById('mcqForm').addEventListener('submit', saveMCQ);
    document.getElementById('cqForm').addEventListener('submit', saveCQ);
    document.getElementById('importJsonBtn').addEventListener('click', importQuestionsFromJson);
    document.getElementById('jsonImportText').addEventListener('input', updateQuestionPreview);
    document.getElementById('jsonImportFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        document.getElementById('jsonImportText').value = await file.text();
        updateQuestionPreview();
      }
    });
    document.getElementById('mcqImage').addEventListener('change', async (e) => { mcqImageData = await readFileAsDataUrl(e.target.files?.[0]); updateQuestionPreview(); });
    document.getElementById('cqImage').addEventListener('change', async (e) => { cqImageData = await readFileAsDataUrl(e.target.files?.[0]); updateQuestionPreview(); });
    ['mcqQuestion', 'mcqExplanation', 'cqStimulus'].forEach((id) => document.getElementById(id).addEventListener('input', updateQuestionPreview));
    const keyInput = document.getElementById('openaiApiKey');
    const modelInput = document.getElementById('openaiModel');
    if (keyInput) {
      keyInput.value = localStorage.getItem(OPENAI_KEY_STORAGE) || '';
      keyInput.addEventListener('change', () => localStorage.setItem(OPENAI_KEY_STORAGE, keyInput.value.trim()));
    }
    if (modelInput) {
      modelInput.value = localStorage.getItem(OPENAI_MODEL_STORAGE) || modelInput.value || 'gpt-4.1-mini';
      modelInput.addEventListener('change', () => localStorage.setItem(OPENAI_MODEL_STORAGE, modelInput.value.trim() || 'gpt-4.1-mini'));
    }
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
    };
    document.getElementById('jsonPromptText').value = `You are generating question JSON for direct import.\nReturn ONLY valid JSON (no markdown, no explanation, no code block).\nUse this exact schema:\n{\n  "questions": [\n    {\n      "type": "mcq",\n      "level": "${payload.level}",\n      "group": "${payload.group}",\n      "subject": "${payload.subject}",\n      "topic": "${payload.topic}",\n      "question": "Write one ${payload.difficulty} difficulty question",\n      "options": ["Option A", "Option B", "Option C", "Option D"],\n      "answer": "A",\n      "explanation": "Short explanation"\n    }\n  ]\n}\nIf questionType is CQ then return:\n{\n  "questions": [\n    {\n      "type": "cq",\n      "level": "${payload.level}",\n      "group": "${payload.group}",\n      "subject": "${payload.subject}",\n      "topic": "${payload.topic}",\n      "stimulus": "Passage or stem",\n      "subQuestions": [\n        { "label": "A", "prompt": "Question part A", "answer": "Answer A" },\n        { "label": "B", "prompt": "Question part B", "answer": "Answer B" }\n      ]\n    }\n  ]\n}`;
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

  async function openChatGptWithPrompt() {
    const promptArea = document.getElementById('jsonPromptText');
    if (!promptArea) return;
    if (!promptArea.value.trim()) generateCurriculumPrompt();
    const prompt = promptArea.value.trim();
    if (!prompt) return showToast('Generate prompt first.', 'error');
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('Prompt copied. Paste it in ChatGPT to generate question JSON.');
    } catch {
      showToast('Prompt ready. Copy manually and paste in ChatGPT.', 'error');
    }
    window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
  }

  async function generateWithChatGptApi() {
    const promptArea = document.getElementById('jsonPromptText');
    const keyInput = document.getElementById('openaiApiKey');
    const modelInput = document.getElementById('openaiModel');
    if (!promptArea || !keyInput) return;
    if (!promptArea.value.trim()) generateCurriculumPrompt();
    const prompt = promptArea.value.trim();
    const apiKey = keyInput.value.trim();
    const selectedModel = (modelInput?.value || localStorage.getItem(OPENAI_MODEL_STORAGE) || 'gpt-4.1-mini').trim();
    if (!apiKey) return showToast('Add OpenAI API key first.', 'error');
    localStorage.setItem(OPENAI_KEY_STORAGE, apiKey);
    localStorage.setItem(OPENAI_MODEL_STORAGE, selectedModel);
    try {
      const content = await requestOpenAiJson({ apiKey, prompt, model: selectedModel });
      if (!content) throw new Error('Empty response from OpenAI.');
      document.getElementById('jsonImportText').value = content;
      document.querySelector('[data-mode="json"]')?.click();
      updateQuestionPreview();
      showToast('JSON generated. Review preview, then click Import Questions.');
    } catch (error) {
      showToast(error?.message || 'AI generation failed.', 'error');
    }
  }

  async function requestOpenAiJson({ apiKey, prompt, model }) {
    const tryResponsesApi = async () => {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: 'Return only valid JSON. No markdown.' }] },
            { role: 'user', content: [{ type: 'input_text', text: prompt }] },
          ],
          text: { format: { type: 'json_object' } },
        }),
      });
      if (!response.ok) throw await createOpenAiHttpError(response);
      const data = await response.json();
      const textFromOutput = Array.isArray(data?.output)
        ? data.output.flatMap((item) => item?.content || []).find((entry) => entry?.type === 'output_text')?.text
        : '';
      return data?.output_text || textFromOutput || '';
    };

    try {
      return await tryResponsesApi();
    } catch (error) {
      const fallbackSafe = /404|unknown endpoint|not found/i.test(error?.message || '');
      if (!fallbackSafe) throw error;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Return only valid JSON. No markdown.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!response.ok) throw await createOpenAiHttpError(response);
      const data = await response.json();
      return data?.choices?.[0]?.message?.content?.trim() || '';
    }
  }

  async function createOpenAiHttpError(response) {
    let details = '';
    try {
      const payload = await response.json();
      details = payload?.error?.message || '';
    } catch {
      details = await response.text();
    }
    return new Error(details ? `OpenAI error ${response.status}: ${details}` : `OpenAI request failed (${response.status}).`);
  }

  function saveMCQ(event) {
    event.preventDefault();
    const options = [...document.querySelectorAll('.option-row')].map((row) => ({ text: row.querySelector('.option-row__text').value.trim(), correct: row.querySelector('.option-row__correct').checked })).filter((item) => item.text);
    const correct = options.findIndex((item) => item.correct);
    if (!options.length || correct < 0) return showToast('Add options and select the correct answer.', 'error');
    const existing = editingQuestionId ? state.questions.find((item) => item.id === editingQuestionId) : null;
    const question = {
      id: existing?.id || uid('question'),
      type: 'mcq',
      level: document.getElementById('qbLevel').value,
      group: document.getElementById('qbGroup').value,
      subject: document.getElementById('qbSubject').value,
      topic: document.getElementById('qbTopic').value,
      section: document.getElementById('qbTopic').value,
      question: document.getElementById('mcqQuestion').value.trim(),
      options: options.map((item) => item.text),
      correct,
      explanation: document.getElementById('mcqExplanation').value.trim(),
      image: mcqImageData,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsert(state.questions, question);
    if (!existing) linkQuestionToSelectedExam(question.id);
    saveState();
    event.target.reset();
    mcqImageData = '';
    clearQuestionEditingState();
    bindCurriculumSelectors({ level: 'qbLevel', group: 'qbGroup', subject: 'qbSubject', topic: 'qbTopic' });
    resetOptions();
    renderQuestions();
    updateQuestionPreview();
    showToast(existing ? 'MCQ updated.' : (selectedQuestionExamId ? 'MCQ saved and linked to selected exam.' : 'MCQ saved.'));
  }

  function saveCQ(event) {
    event.preventDefault();
    const subQuestions = [...document.querySelectorAll('.sub-question-row')].map((row) => ({ label: row.querySelector('.sub-question-row__label').value.trim(), prompt: row.querySelector('.sub-question-row__prompt').value.trim(), answer: row.querySelector('.sub-question-row__answer').value.trim() })).filter((item) => item.prompt);
    const existing = editingQuestionId ? state.questions.find((item) => item.id === editingQuestionId) : null;
    const question = {
      id: existing?.id || uid('question'),
      type: 'cq',
      level: document.getElementById('qbLevel').value,
      group: document.getElementById('qbGroup').value,
      subject: document.getElementById('qbSubject').value,
      topic: document.getElementById('qbTopic').value,
      section: document.getElementById('qbTopic').value,
      stimulus: document.getElementById('cqStimulus').value.trim(),
      subQuestions,
      image: cqImageData,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsert(state.questions, question);
    if (!existing) linkQuestionToSelectedExam(question.id);
    saveState();
    event.target.reset();
    cqImageData = '';
    clearQuestionEditingState();
    bindCurriculumSelectors({ level: 'qbLevel', group: 'qbGroup', subject: 'qbSubject', topic: 'qbTopic' });
    resetSubQuestions();
    renderQuestions();
    updateQuestionPreview();
    showToast(existing ? 'CQ updated.' : (selectedQuestionExamId ? 'CQ saved and linked to selected exam.' : 'CQ saved.'));
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
          : Array.isArray(payload.data?.questions)
            ? payload.data.questions
            : Array.isArray(payload.result?.questions)
              ? payload.result.questions
              : Array.isArray(payload.output)
                ? payload.output
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
      clearQuestionEditingState();
      renderQuestions();
      updateQuestionPreview();
      message.textContent = `Imported ${summary.imported} question(s)${summary.skipped ? `, skipped ${summary.skipped}.` : '.'}`;
      showToast(`JSON import complete (${summary.imported} added).`);
    } catch (error) {
      message.textContent = error?.message || 'Invalid JSON format.';
      showToast('JSON validation failed.', 'error');
    }
  }

  function parseJsonImportPayload(raw) {
    const normalizeUnsafeBackslashes = (text) => String(text || '').replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    const normalizeEscapedLayout = (text) => String(text || '').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const unwrap = (value) => {
      if (value && typeof value === 'object' && typeof value.response === 'string') return value.response.trim();
      if (value && typeof value === 'object' && typeof value.output_text === 'string') return value.output_text.trim();
      return value;
    };
    const parseFromString = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        const cleaned = text
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/i, '')
          .trim()
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .replace(/,\s*([}\]])/g, '$1');
        const normalizedLayout = normalizeEscapedLayout(cleaned);
        try {
          return JSON.parse(normalizedLayout);
        } catch {
          if (normalizedLayout.startsWith('"') && normalizedLayout.endsWith('"')) {
            try {
              const decoded = JSON.parse(normalizedLayout);
              if (typeof decoded === 'string') return parseFromString(decoded);
            } catch {
              // continue with fallback parsing below
            }
          }
          const normalized = normalizeUnsafeBackslashes(normalizedLayout);
          try {
            return JSON.parse(normalized);
          } catch {
            const startObject = normalized.indexOf('{');
            const startArray = normalized.indexOf('[');
            const start = startArray >= 0 && (startArray < startObject || startObject < 0) ? startArray : startObject;
            const end = Math.max(normalized.lastIndexOf('}'), normalized.lastIndexOf(']'));
            if (start >= 0 && end > start) return JSON.parse(normalized.slice(start, end + 1));
            throw new Error('Invalid JSON format.');
          }
        }
      }
    };

    try {
      return unwrap(parseFromString(raw));
    } catch {
      const parsed = parseFromString(raw);
      const unwrapped = unwrap(parsed);
      if (typeof unwrapped === 'string') return parseFromString(unwrapped);
      return unwrapped;
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
      : [question.optionA, question.optionB, question.optionC, question.optionD].map((option) => String(option || '').trim()).filter(Boolean);
    const finalOptions = options.length
      ? options
      : [];
    const text = String(question.question || question.stem || '').trim();
    if (!text || !finalOptions.length) return null;
    const correct = normalizeCorrectIndex(question.correct, question.answer, finalOptions);
    return {
      id: uid('question'),
      type: 'mcq',
      level: question.level || defaults.level,
      group: question.group || defaults.group,
      subject: question.subject || defaults.subject,
      topic: question.topic || defaults.topic,
      section: question.section || question.topic || defaults.topic,
      question: text,
      options: finalOptions,
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
      const subs = [...document.querySelectorAll('.sub-question-row')].map((row) => `<div class="preview-sub"><strong>${escapeHtml(row.querySelector('.sub-question-row__label').value || 'A')}.</strong> ${formatMathForDisplay(row.querySelector('.sub-question-row__prompt').value || '')}</div>`).join('');
      preview.innerHTML = `<div class="preview-block"><h4>${formatMathForDisplay(document.getElementById('cqStimulus').value || 'Stimulus preview')}</h4>${cqImageData ? `<img class="preview-image" src="${cqImageData}" alt="Stimulus" />` : ''}${subs || '<p>Add sub questions to preview.</p>'}</div>`;
    } else if (questionMode === 'json') {
      const jsonPreview = buildJsonPreviewMarkup(document.getElementById('jsonImportText')?.value || '');
      preview.innerHTML = jsonPreview;
    } else {
      const options = [...document.querySelectorAll('.option-row')].map((row, index) => row.querySelector('.option-row__text').value.trim() ? `<li>${String.fromCharCode(65 + index)}. ${formatMathForDisplay(row.querySelector('.option-row__text').value)}</li>` : '').join('');
      preview.innerHTML = `<div class="preview-block"><h4>${formatMathForDisplay(document.getElementById('mcqQuestion').value || 'Question preview')}</h4>${mcqImageData ? `<img class="preview-image" src="${mcqImageData}" alt="Question" />` : ''}<ol>${options || '<li>Add options to preview.</li>'}</ol><p>${formatMathForDisplay(document.getElementById('mcqExplanation').value || '')}</p></div>`;
    }
    queueTypeset();
  }

  function renderQuestions() {
    const target = document.getElementById('questionList');
    if (!target) return;
    if (!state.questions.length) return target.innerHTML = emptyState('No questions created yet.');
    target.innerHTML = state.questions.map((question) => `<article class="entity-card entity-card--stacked"><div class="entity-card__head"><div><h4>${escapeHtml((question.type || 'mcq').toUpperCase())} · ${escapeHtml(question.subject || '')}</h4><p>${formatMathForDisplay(question.question || question.stimulus || 'Question')}</p></div><div class="entity-actions"><button class="toolbar-button" data-edit-question="${question.id}">Edit</button><button class="toolbar-button toolbar-button--danger" data-delete-question="${question.id}">Delete</button></div></div><p class="muted-copy">${escapeHtml(question.level || '')} · ${escapeHtml(question.group || '')} · ${escapeHtml(question.topic || '')}</p></article>`).join('');
    target.querySelectorAll('[data-edit-question]').forEach((button) => button.addEventListener('click', () => startQuestionEdit(button.dataset.editQuestion)));
    target.querySelectorAll('[data-delete-question]').forEach((button) => button.addEventListener('click', () => {
      state.questions = state.questions.filter((item) => item.id !== button.dataset.deleteQuestion);
      state.exams.forEach((exam) => exam.questionIds = exam.questionIds.filter((id) => id !== button.dataset.deleteQuestion));
      saveState();
      if (editingQuestionId === button.dataset.deleteQuestion) clearQuestionEditingState();
      renderQuestions();
      updateQuestionPreview();
      showToast('Question deleted.');
    }));
  }

  function clearQuestionEditingState() {
    editingQuestionId = '';
    const mcqSubmit = document.querySelector('#mcqForm .submit-button');
    const cqSubmit = document.querySelector('#cqForm .submit-button');
    if (mcqSubmit) mcqSubmit.textContent = 'Save MCQ';
    if (cqSubmit) cqSubmit.textContent = 'Save CQ';
  }

  function startQuestionEdit(questionId) {
    const question = state.questions.find((item) => item.id === questionId);
    if (!question) return;
    editingQuestionId = question.id;
    bindCurriculumSelectors({ level: 'qbLevel', group: 'qbGroup', subject: 'qbSubject', topic: 'qbTopic' });
    document.getElementById('qbLevel').value = question.level || document.getElementById('qbLevel').value;
    document.getElementById('qbLevel').dispatchEvent(new Event('change'));
    document.getElementById('qbGroup').value = question.group || document.getElementById('qbGroup').value;
    document.getElementById('qbGroup').dispatchEvent(new Event('change'));
    document.getElementById('qbSubject').value = question.subject || document.getElementById('qbSubject').value;
    document.getElementById('qbSubject').dispatchEvent(new Event('change'));
    document.getElementById('qbTopic').value = question.topic || document.getElementById('qbTopic').value;

    if ((question.type || 'mcq') === 'cq') {
      document.querySelector('[data-mode="cq"]').click();
      document.getElementById('cqStimulus').value = question.stimulus || '';
      cqImageData = question.image || '';
      const list = document.getElementById('subQuestionList');
      list.innerHTML = '';
      (question.subQuestions?.length ? question.subQuestions : [{ label: 'A' }, { label: 'B' }]).forEach((item) => list.appendChild(createSubQuestionRow(item)));
      const cqSubmit = document.querySelector('#cqForm .submit-button');
      if (cqSubmit) cqSubmit.textContent = 'Update CQ';
    } else {
      document.querySelector('[data-mode="mcq"]').click();
      document.getElementById('mcqQuestion').value = question.question || '';
      document.getElementById('mcqExplanation').value = question.explanation || '';
      mcqImageData = question.image || '';
      fillOptions(question.options || [], question.correct ?? 0);
      const mcqSubmit = document.querySelector('#mcqForm .submit-button');
      if (mcqSubmit) mcqSubmit.textContent = 'Update MCQ';
    }
    showToast('Question loaded for editing.');
    updateQuestionPreview();
  }

  function buildJsonPreviewMarkup(raw) {
    if (!String(raw || '').trim()) {
      return '<div class="preview-block"><p>Paste JSON to preview questions and answers before import.</p></div>';
    }
    try {
      const payload = parseJsonImportPayload(raw);
      const defaults = {
        level: document.getElementById('qbLevel')?.value || '',
        group: document.getElementById('qbGroup')?.value || '',
        subject: document.getElementById('qbSubject')?.value || '',
        topic: document.getElementById('qbTopic')?.value || '',
      };
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.questions)
          ? payload.questions
          : Array.isArray(payload.data?.questions)
            ? payload.data.questions
            : Array.isArray(payload.result?.questions)
              ? payload.result.questions
              : Array.isArray(payload.output)
                ? payload.output
                : payload.question
                  ? [payload.question]
                  : payload.questions === undefined && typeof payload === 'object'
                    ? [payload]
                    : [];
      if (!items.length) return '<div class="preview-block"><p>No valid questions found in JSON.</p></div>';
      const normalized = items.map((item) => normalizeImportedQuestion(item, defaults)).filter(Boolean);
      if (!normalized.length) return '<div class="preview-block"><p>Could not build preview from provided JSON.</p></div>';
      const blocks = normalized.map((question, index) => {
        if (question.type === 'cq') {
          const subs = (question.subQuestions || []).map((sub) => `<li><strong>${escapeHtml(sub.label || '')}.</strong> ${formatMathForDisplay(sub.prompt || '')}<br/><span class="muted-copy">Answer: ${formatMathForDisplay(sub.answer || '')}</span></li>`).join('');
          return `<div class="preview-sub"><strong>Q${index + 1}. ${formatMathForDisplay(question.stimulus || '')}</strong>${question.image ? `<img class="preview-image" src="${question.image}" alt="CQ" />` : ''}<ul>${subs || '<li>No sub-questions found.</li>'}</ul></div>`;
        }
        const options = (question.options || []).map((option, optionIndex) => {
          const isCorrect = optionIndex === question.correct;
          return `<li>${String.fromCharCode(65 + optionIndex)}. ${formatMathForDisplay(option)}${isCorrect ? ' <strong>(Correct)</strong>' : ''}</li>`;
        }).join('');
        return `<div class="preview-sub"><strong>Q${index + 1}. ${formatMathForDisplay(question.question || '')}</strong>${question.image ? `<img class="preview-image" src="${question.image}" alt="MCQ" />` : ''}<ol>${options || '<li>No options found.</li>'}</ol>${question.explanation ? `<p><strong>Explanation:</strong> ${formatMathForDisplay(question.explanation)}</p>` : ''}</div>`;
      }).join('');
      return `<div class="preview-block"><p>JSON Preview (${normalized.length} question${normalized.length > 1 ? 's' : ''})</p>${blocks}</div>`;
    } catch (error) {
      return `<div class="preview-block"><p>Invalid JSON: ${escapeHtml(error?.message || 'Could not parse payload')}</p></div>`;
    }
  }

  function initHandleExamsPage() {
    selectedManageExamId = new URLSearchParams(window.location.search).get('examId') || '';
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
    ['printHeaderTitle', 'printExamCode', 'printClassLabel', 'printInstructions', 'printDurationLabel', 'printMarksLabel', 'printHeaderTheme', 'printNumberPrefix', 'printColumns', 'printSetCount', 'printSetLabelStyle'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = id.replace('print', '');
      const map = {
        HeaderTitle: 'headerTitle',
        ExamCode: 'examCode',
        ClassLabel: 'classLabel',
        Instructions: 'instructions',
        DurationLabel: 'durationLabel',
        MarksLabel: 'marksLabel',
        HeaderTheme: 'headerTheme',
        NumberPrefix: 'numberPrefix',
        Columns: 'columns',
        SetCount: 'setCount',
        SetLabelStyle: 'setLabelStyle',
      };
      el.value = config[map[key]];
      el.addEventListener('input', () => {
        config[map[key]] = map[key] === 'setCount' ? Number(el.value || 1) : el.value;
        saveState();
        renderPrintPreviewMeta();
      });
    });
    ['printShowAnswers', 'printShowExplanation', 'printShuffleQuestions', 'printShuffleOptions', 'printAnswerSheet', 'printCompactMode'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const keyMap = {
        printShowAnswers: 'showAnswers',
        printShowExplanation: 'showExplanation',
        printShuffleQuestions: 'shuffleQuestions',
        printShuffleOptions: 'shuffleOptions',
        printAnswerSheet: 'includeAnswerSheet',
        printCompactMode: 'compactMode',
      };
      const key = keyMap[id];
      el.checked = !!config[key];
      el.addEventListener('change', () => { config[key] = el.checked; saveState(); renderPrintPreviewMeta(); });
    });
    renderPrintPreviewMeta();
  }

  function renderPrintPreviewMeta() {
    const preview = document.getElementById('printPreviewMeta');
    if (!preview) return;
    const config = state.settings.printConfig;
    preview.innerHTML = `<div class="preview-block"><h4>${escapeHtml(config.headerTitle)}</h4><p>Code: ${escapeHtml(config.examCode || 'N/A')} · ${escapeHtml(config.classLabel || '')}</p><p>Time: ${escapeHtml(config.durationLabel || '')} · Marks: ${escapeHtml(config.marksLabel || '')}</p><p>Theme: ${escapeHtml(config.headerTheme || 'classic')}</p><p>Sets: ${escapeHtml(String(config.setCount || 1))} · Shuffle Q: ${config.shuffleQuestions ? 'Yes' : 'No'} · Shuffle Opt: ${config.shuffleOptions ? 'Yes' : 'No'}</p><p>Answer Sheet: ${config.includeAnswerSheet ? 'On' : 'Off'} · Columns: ${escapeHtml(config.columns)} · Compact: ${config.compactMode ? 'On' : 'Off'}</p></div>`;
  }

  function renderExamManager() {
    const target = document.getElementById('examManagerList');
    const filterForm = document.getElementById('questionFilterForm');
    if (!target) return;
    if (!state.exams.length) return target.innerHTML = emptyState('No exams available.');
    const scopedExams = selectedManageExamId ? state.exams.filter((exam) => exam.id === selectedManageExamId) : state.exams;
    if (!scopedExams.length) {
      if (filterForm) filterForm.style.display = '';
      target.innerHTML = `<div class="preview-block"><p>Selected exam was not found.</p><a class="toolbar-button" href="handle-exams.html">Back to exam list</a></div>`;
      return;
    }

    if (!selectedManageExamId) {
      if (filterForm) filterForm.style.display = 'none';
      target.innerHTML = scopedExams.map((exam) => `<article class="entity-card"><div><h4>${escapeHtml(exam.title)}</h4><p>${escapeHtml(exam.level)} · ${escapeHtml(exam.subject)} · ${exam.questionIds.length} Questions</p></div><a class="toolbar-button" href="handle-exams.html?examId=${exam.id}">Manage</a></article>`).join('');
      return;
    }

    if (filterForm) filterForm.style.display = '';
    const filters = getQuestionFilters();
    target.innerHTML = scopedExams.map((exam) => {
      const filteredQuestions = state.questions.filter((question) => {
        if (exam.subject && question.subject && question.subject !== exam.subject) return false;
        if (filters.level && question.level !== filters.level) return false;
        if (filters.group && question.group !== filters.group) return false;
        if (filters.subject && question.subject !== filters.subject) return false;
        if (filters.topic && question.topic !== filters.topic) return false;
        return true;
      });
      return `<article class="entity-card entity-card--stacked"><div class="entity-card__head"><div><h4>${escapeHtml(exam.title)}</h4><p>${escapeHtml(exam.level)} · ${escapeHtml(exam.subject)} · ${exam.questionIds.length} Questions</p></div><span class="status-pill ${exam.published ? 'is-live' : ''}">${exam.published ? 'Published' : 'Draft'}</span></div><div class="entity-actions"><a class="toolbar-button" href="handle-exams.html">Back to exam list</a></div><div class="assignment-box"><label>Assign questions</label><div class="assignment-list">${filteredQuestions.length ? filteredQuestions.map((question) => `<label class="assignment-item"><input type="checkbox" data-exam-id="${exam.id}" data-question-id="${question.id}" ${exam.questionIds.includes(question.id) ? 'checked' : ''} /><span>${escapeHtml((question.type || 'mcq').toUpperCase())} · ${escapeHtml(question.topic || question.section || 'Topic')} · ${escapeHtml(question.question || question.stimulus || 'Question')}</span></label>`).join('') : '<p class="muted-copy">No matching questions found for current filter.</p>'}</div></div></article>`;
    }).join('');
    renderPrintFormatActions(scopedExams[0] || null);
    target.querySelectorAll('[data-publish-exam]').forEach((button) => button.addEventListener('click', () => {
      const exam = findExam(button.dataset.publishExam);
      if (!exam) return showToast('Exam not found.', 'error');
      exam.published = !exam.published;
      if (exam.published) {
        exam.publishedAt = new Date().toISOString();
        exam.publishedSnapshot = {
          config: structuredClone(state.settings.printConfig),
          questions: (exam.questionIds || []).map((id) => state.questions.find((question) => question.id === id)).filter(Boolean).map((question) => ({
            ...question,
            options: [...(question.options || [])],
            subQuestions: (question.subQuestions || []).map((item) => ({ ...item })),
          })),
        };
      } else {
        delete exam.publishedAt;
        delete exam.publishedSnapshot;
      }
      saveState();
      renderExamManager();
    }));
    target.querySelectorAll('input[data-exam-id]').forEach((checkbox) => checkbox.addEventListener('change', () => {
      const exam = findExam(checkbox.dataset.examId);
      if (!exam) return showToast('Exam not found.', 'error');
      exam.questionIds = checkbox.checked ? [...new Set([...exam.questionIds, checkbox.dataset.questionId])] : exam.questionIds.filter((id) => id !== checkbox.dataset.questionId);
      saveState();
      renderExamManager();
      showToast('Exam question mapping updated.');
    }));
  }

  function renderPrintFormatActions(exam) {
    const holder = document.getElementById('printFormatActions');
    if (!holder) return;
    if (!exam) {
      holder.innerHTML = '<p class="muted-copy">Select an exam to use Edit/Publish/Download/Print actions.</p>';
      return;
    }
    holder.innerHTML = `<a class="toolbar-button" href="create-exam.html?examId=${exam.id}">Edit</a><button class="toolbar-button" data-sidebar-publish="${exam.id}">${exam.published ? 'Unpublish' : 'Publish'}</button><button class="toolbar-button" data-sidebar-download="${exam.id}">Download</button><button class="toolbar-button" data-sidebar-print="${exam.id}">Print</button><button class="toolbar-button" data-sidebar-print-omr="${exam.id}">Print OMR</button><a class="toolbar-button" href="result-analyse.html?examId=${exam.id}">Result Analyse</a><button class="toolbar-button toolbar-button--danger" data-sidebar-delete="${exam.id}">Delete</button>`;
    holder.querySelector('[data-sidebar-publish]')?.addEventListener('click', () => {
      const item = findExam(exam.id);
      if (!item) return showToast('Exam not found.', 'error');
      item.published = !item.published;
      if (item.published) {
        item.publishedAt = new Date().toISOString();
        item.publishedSnapshot = {
          config: structuredClone(state.settings.printConfig),
          questions: (item.questionIds || []).map((id) => state.questions.find((question) => question.id === id)).filter(Boolean).map((question) => ({
            ...question,
            options: [...(question.options || [])],
            subQuestions: (question.subQuestions || []).map((sub) => ({ ...sub })),
          })),
        };
      } else {
        delete item.publishedAt;
        delete item.publishedSnapshot;
      }
      saveState();
      renderExamManager();
    });
    holder.querySelector('[data-sidebar-delete]')?.addEventListener('click', () => {
      state.exams = state.exams.filter((item) => item.id !== exam.id);
      state.attempts = state.attempts.filter((attempt) => attempt.examId !== exam.id);
      saveState();
      if (selectedManageExamId === exam.id) window.location.href = 'handle-exams.html';
      else renderExamManager();
      showToast('Exam deleted.');
    });
    holder.querySelector('[data-sidebar-download]')?.addEventListener('click', () => downloadExamPaper(exam.id));
    holder.querySelector('[data-sidebar-print]')?.addEventListener('click', () => printExamPaper(exam.id));
    holder.querySelector('[data-sidebar-print-omr]')?.addEventListener('click', () => printOmrSheet(exam.id));
  }

  function renderResultAnalyzer(exam) {
    const panel = document.getElementById('resultAnalyzerPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `<h4>Result Analyse · ${escapeHtml(exam.title)}</h4><p class="muted-copy">Student list XLSX columns: <code>roll_number, student_name, class, phone_number</code>. তারপর একসাথে OMR image upload করে batch result process করুন।</p><label class="toolbar-button toolbar-button--file">Upload Student List XLSX<input id="studentListXlsxFile" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden /></label><label class="toolbar-button toolbar-button--file">Upload Filled OMR Images<input id="omrImageBatchFile" type="file" accept="image/*" multiple hidden /></label><div class="entity-actions"><button id="processOmrImageBatchBtn" type="button" class="submit-button">Process OMR Images</button><button id="exportResultXlsxBtn" type="button" class="toolbar-button">Export Result XLSX</button></div><div id="resultBatchOutput"></div>`;
    panel.querySelector('#processOmrImageBatchBtn')?.addEventListener('click', () => processOmrImageBatch(exam.id));
    panel.querySelector('#exportResultXlsxBtn')?.addEventListener('click', exportLatestResultWorkbook);
  }

  async function processOmrImageBatch(examId) {
    const panel = document.getElementById('resultAnalyzerPanel');
    if (!panel) return;
    const studentFile = panel.querySelector('#studentListXlsxFile')?.files?.[0];
    const imageFiles = [...(panel.querySelector('#omrImageBatchFile')?.files || [])];
    const output = panel.querySelector('#resultBatchOutput');
    if (!studentFile || !imageFiles.length) {
      if (output) output.innerHTML = '<p class="muted-copy">Student XLSX এবং OMR image batch দুটোই upload করুন।</p>';
      return;
    }
    if (output) output.innerHTML = '<p class="muted-copy">Processing OMR images... please wait.</p>';
    const students = await readStudentListFromXlsx(studentFile);
    const exam = findExam(examId);
    if (!exam) {
      if (output) output.innerHTML = '<p class="muted-copy">Exam not found.</p>';
      return;
    }
    const answerKey = deriveStaticAnswerKey(exam);
    const detected = [];
    for (const file of imageFiles) {
      const omr = await detectOmrFromImage(file, answerKey.length);
      const student = students.get(omr.roll) || {};
      const result = evaluateDetectedAnswers(answerKey, omr.answers);
      detected.push({
        roll: omr.roll || '',
        student_name: student.student_name || '',
        class: student.class || '',
        phone_number: student.phone_number || '',
        correct: result.correct,
        wrong: result.wrong,
        not_answered: result.notAnswered,
        total: result.total,
        score: result.correct,
        percent: result.total ? ((result.correct / result.total) * 100).toFixed(2) : '0.00',
      });
    }
    detected.sort((a, b) => (b.score - a.score) || (a.wrong - b.wrong) || a.roll.localeCompare(b.roll));
    detected.forEach((row, index) => { row.merit_position = index + 1; });
    window.__latestOmrBatchResult = detected;
    if (!output) return;
    output.innerHTML = detected.length
      ? `<div class="table-wrap"><table><thead><tr><th>Merit</th><th>Roll</th><th>Name</th><th>Class</th><th>Phone</th><th>Correct</th><th>Wrong</th><th>Not Answered</th><th>Total</th><th>Percent</th></tr></thead><tbody>${detected.map((item) => `<tr><td>${item.merit_position}</td><td>${escapeHtml(item.roll)}</td><td>${escapeHtml(item.student_name)}</td><td>${escapeHtml(item.class)}</td><td>${escapeHtml(item.phone_number)}</td><td>${item.correct}</td><td>${item.wrong}</td><td>${item.not_answered}</td><td>${item.total}</td><td>${item.percent}%</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted-copy">No valid OMR detected.</p>';
  }

  function deriveStaticAnswerKey(exam) {
    const snapshot = exam.published && exam.publishedSnapshot ? exam.publishedSnapshot : null;
    const questions = snapshot?.questions
      ? snapshot.questions
      : (exam.questionIds || []).map((id) => state.questions.find((question) => question.id === id)).filter(Boolean);
    return questions.map((question) => {
      if (question.type !== 'mcq') return 'CQ';
      return String.fromCharCode(65 + (Number(question.correct) || 0));
    });
  }

  async function readStudentListFromXlsx(file) {
    const XLSX = await ensureXlsxLib();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const map = new Map();
    rows.forEach((row) => {
      const roll = String(row.roll_number || row.roll || row.Roll || '').trim();
      if (!roll) return;
      map.set(roll, {
        student_name: String(row.student_name || row.name || row.StudentName || '').trim(),
        class: String(row.class || row.Class || '').trim(),
        institute: String(row.institute || row.Institute || '').trim(),
        phone_number: String(row.phone_number || row.phone || row.Phone || '').trim(),
      });
    });
    return map;
  }

  async function ensureXlsxLib() {
    if (window.XLSX) return window.XLSX;
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    return window.XLSX;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function detectOmrFromImage(file, questionCount) {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = 2480;
    canvas.height = 3508;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    const full = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const bubbleFillScore = (cx, cy, innerRadius = 6, outerRadius = 11) => {
      let innerDark = 0;
      let innerCount = 0;
      let ringDark = 0;
      let ringCount = 0;
      for (let y = -outerRadius; y <= outerRadius; y += 1) {
        for (let x = -outerRadius; x <= outerRadius; x += 1) {
          const px = Math.floor(cx + x);
          const py = Math.floor(cy + y);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
          const dist2 = x * x + y * y;
          if (dist2 > outerRadius * outerRadius) continue;
          const idx = (py * canvas.width + px) * 4;
          const gray = (full[idx] + full[idx + 1] + full[idx + 2]) / 3;
          const dark = 255 - gray;
          if (dist2 <= innerRadius * innerRadius) {
            innerDark += dark;
            innerCount += 1;
          } else {
            ringDark += dark;
            ringCount += 1;
          }
        }
      }
      const innerAvg = innerCount ? innerDark / innerCount : 0;
      const ringAvg = ringCount ? ringDark / ringCount : 0;
      return innerAvg - (ringAvg * 0.65);
    };
    const detectColumnDigits = (startX, startY, columns, rowGap, colGap) => {
      const digits = [];
      for (let col = 0; col < columns; col += 1) {
        const x = startX + col * colGap;
        let best = -1;
        let bestScore = -1;
        for (let digit = 0; digit < 10; digit += 1) {
          const y = startY + digit * rowGap;
          const score = bubbleFillScore(x, y, 5, 9);
          if (score > bestScore) {
            bestScore = score;
            best = digit;
          }
        }
        digits.push(bestScore > 16 ? String(best) : '');
      }
      return digits.join('').replace(/\s+/g, '');
    };
    const roll = detectColumnDigits(1800, 980, 6, 24, 36);
    const answers = [];
    const startX = 285;
    const startY = 980;
    const rowGap = 30;
    const colGap = 560;
    const optionGap = 72;
    const colSize = Math.ceil(questionCount / 3);
    for (let col = 0; col < 3; col += 1) {
      for (let row = 0; row < colSize; row += 1) {
        const idx = col * colSize + row;
        if (idx >= questionCount) break;
        const baseY = startY + row * rowGap;
        const baseX = startX + col * colGap;
        const labels = ['A', 'B', 'C', 'D'];
        let bestLabel = '';
        let bestScore = -1;
        labels.forEach((label, optionIndex) => {
          const score = bubbleFillScore(baseX + optionIndex * optionGap, baseY, 5, 9);
          if (score > bestScore) {
            bestScore = score;
            bestLabel = label;
          }
        });
        answers.push(bestScore > 14 ? bestLabel : '');
      }
    }
    return { roll, answers };
  }

  function evaluateDetectedAnswers(answerKey, markedAnswers) {
    let correct = 0;
    let wrong = 0;
    let notAnswered = 0;
    let total = 0;
    answerKey.forEach((key, idx) => {
      if (key === 'CQ') return;
      total += 1;
      const marked = markedAnswers[idx] || '';
      if (!marked) notAnswered += 1;
      else if (marked === key) correct += 1;
      else wrong += 1;
    });
    return { correct, wrong, notAnswered, total };
  }

  async function exportLatestResultWorkbook() {
    const rows = window.__latestOmrBatchResult || [];
    if (!rows.length) return showToast('Process result first, then export.', 'error');
    const XLSX = await ensureXlsxLib();
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Results');
    XLSX.writeFile(book, 'omr-result-batch.xlsx');
  }

  function initResultAnalysePage() {
    const examSelect = document.getElementById('resultExamSelect');
    const processBtn = document.getElementById('processOmrResultBtn');
    const exportBtn = document.getElementById('exportOmrResultBtn');
    const output = document.getElementById('resultAnalyseOutput');
    const fileInput = document.getElementById('resultOmrImages');
    const preview = document.getElementById('resultOmrPreview');
    if (!examSelect || !processBtn || !exportBtn || !output || !fileInput || !preview) return;
    const params = new URLSearchParams(window.location.search);
    const preselected = params.get('examId') || '';
    examSelect.innerHTML = state.exams.length
      ? state.exams.map((exam) => `<option value="${exam.id}" ${exam.id === preselected ? 'selected' : ''}>${escapeHtml(exam.title)} (${escapeHtml(exam.subject || '')})</option>`).join('')
      : '<option value="">No exam found</option>';
    processBtn.addEventListener('click', async () => {
      const examId = examSelect.value;
      const files = [...fileInput.files];
      if (!examId || !files.length) {
        output.innerHTML = '<p class="muted-copy">Exam select করুন এবং OMR images upload করুন।</p>';
        return;
      }
      output.innerHTML = '<p class="muted-copy">Processing OMR images...</p>';
      const rows = await analyseOmrBatchForExam(examId, files);
      window.__latestOmrBatchResult = rows;
      output.innerHTML = renderClassWiseResultTable(rows);
    });
    exportBtn.addEventListener('click', exportLatestResultWorkbook);
    fileInput.addEventListener('change', () => renderOmrUploadPreview(fileInput.files, preview));
  }

  function renderOmrUploadPreview(files, target) {
    const list = [...(files || [])];
    if (!list.length) {
      target.innerHTML = '<p class="muted-copy">No OMR image selected yet.</p>';
      return;
    }
    target.innerHTML = `<div class="omr-preview-grid">${list.map((file, index) => {
      const url = URL.createObjectURL(file);
      return `<article class="entity-card entity-card--stacked"><div><h4>OMR ${index + 1}</h4><p class="muted-copy">${escapeHtml(file.name)}</p></div><img src="${url}" alt="OMR preview ${index + 1}" style="width:100%;max-height:220px;object-fit:contain;border:1px solid #d8dee9;border-radius:12px;background:#fff;" /></article>`;
    }).join('')}</div>`;
  }

  async function analyseOmrBatchForExam(examId, imageFiles) {
    const exam = findExam(examId);
    if (!exam) return [];
    const answerKey = deriveStaticAnswerKey(exam);
    const studentMap = buildStudentRollMap();
    const rows = [];
    for (const file of imageFiles) {
      const detected = await detectOmrFromImage(file, answerKey.length);
      const student = studentMap.get(detected.roll) || {};
      const evaluated = evaluateDetectedAnswers(answerKey, detected.answers);
      rows.push({
        roll: detected.roll || '',
        student_name: student.name || '',
        class: student.className || student.course || 'Unknown',
        institute: student.institute || '',
        phone_number: student.phone || '',
        correct: evaluated.correct,
        wrong: evaluated.wrong,
        not_answered: evaluated.notAnswered,
        total: evaluated.total,
        score: evaluated.correct,
      });
    }
    rows.sort((a, b) => (a.class || '').localeCompare(b.class || '') || (b.score - a.score) || (a.wrong - b.wrong) || a.roll.localeCompare(b.roll));
    let currentClass = '';
    let pos = 0;
    rows.forEach((row) => {
      if (row.class !== currentClass) { currentClass = row.class; pos = 0; }
      pos += 1;
      row.merit_position = pos;
      row.percent = row.total ? ((row.correct / row.total) * 100).toFixed(2) : '0.00';
    });
    return rows;
  }

  function buildStudentRollMap() {
    const map = new Map();
    state.students.forEach((student) => {
      const roll = String(student.rollNumber || student.studentId || '').trim();
      if (roll) map.set(roll, student);
    });
    return map;
  }

  function renderClassWiseResultTable(rows) {
    if (!rows.length) return '<p class="muted-copy">No OMR result generated.</p>';
    const grouped = rows.reduce((acc, row) => {
      const key = row.class || 'Unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
    return Object.entries(grouped).map(([className, items]) => `<h4>Class: ${escapeHtml(className)}</h4><div class="table-wrap"><table><thead><tr><th>Merit</th><th>Roll</th><th>Name</th><th>Institute</th><th>Phone</th><th>Correct</th><th>Wrong</th><th>Not Answered</th><th>Total</th><th>%</th></tr></thead><tbody>${items.map((item) => `<tr><td>${item.merit_position}</td><td>${escapeHtml(item.roll)}</td><td>${escapeHtml(item.student_name)}</td><td>${escapeHtml(item.institute)}</td><td>${escapeHtml(item.phone_number)}</td><td>${item.correct}</td><td>${item.wrong}</td><td>${item.not_answered}</td><td>${item.total}</td><td>${item.percent}</td></tr>`).join('')}</tbody></table></div>`).join('');
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
    if (!exam) {
      return '<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Exam Not Found</title></head><body><p>Exam not found.</p></body></html>';
    }
    const snapshot = exam.published && exam.publishedSnapshot ? exam.publishedSnapshot : null;
    const config = snapshot?.config ? mergePrintConfig(snapshot.config) : state.settings.printConfig;
    const questions = snapshot?.questions
      ? snapshot.questions.map((question) => ({ ...question, options: [...(question.options || [])], subQuestions: (question.subQuestions || []).map((item) => ({ ...item })) }))
      : exam.questionIds.map((id) => state.questions.find((question) => question.id === id)).filter(Boolean);
    const safeSetCount = Math.max(1, Math.min(10, Number(config.setCount || 1)));
    const setMarkup = [];
    const answerSheets = [];
    const headerTheme = String(config.headerTheme || 'classic');
    const compactClass = config.compactMode ? 'compact-mode' : '';

    for (let setIndex = 0; setIndex < safeSetCount; setIndex += 1) {
      const { setQuestions, answerKey } = buildQuestionSet(questions, config);
      const setLabel = config.setLabelStyle === 'numeric' ? `Set ${setIndex + 1}` : `Set ${String.fromCharCode(65 + setIndex)}`;
      const list = setQuestions.map((question, index) => {
        const number = `${index + 1}`;
        const title = question.question || question.stimulus || '';
        const body = question.type === 'cq'
          ? (question.subQuestions || []).map((item) => `<div><strong>${escapeHtml(item.label || '')}.</strong> ${formatMathForDisplay(item.prompt || '')}${config.showAnswers ? `<div class="answer-block"><strong>Answer:</strong> ${formatMathForDisplay(item.answer || '')}</div>` : ''}</div>`).join('')
          : `<ul class="option-list option-list--grid">${(question.options || []).map((option, optionIndex) => `<li><span class="option-label">${String.fromCharCode(65 + optionIndex)}.</span> <span>${formatMathForDisplay(option)}</span></li>`).join('')}</ul>${config.showAnswers ? `<p class="answer-block"><strong>Answer:</strong> ${String.fromCharCode(65 + (question.correct || 0))}. ${formatMathForDisplay((question.options || [])[question.correct] || '')}</p>` : ''}`;
        const explanation = config.showExplanation && question.explanation ? `<p class="explanation-block"><strong>Explanation:</strong> ${formatMathForDisplay(question.explanation)}</p>` : '';
        return `<article class="print-question"><h3>${number}. ${formatMathForDisplay(title)}</h3>${body}${explanation}</article>`;
      }).join('');

      setMarkup.push(`<section class="paper set-paper"><div class="board-head board-head--${escapeAttr(headerTheme)}"><h1>${formatMathForDisplay(config.headerTitle)}</h1><h2>${formatMathForDisplay(exam.title)}</h2><div class="board-meta"><span><strong>Set:</strong> ${escapeHtml(setLabel)}</span><span><strong>Code:</strong> ${formatMathForDisplay(config.examCode || 'N/A')}</span><span><strong>Class:</strong> ${formatMathForDisplay(config.classLabel || 'N/A')}</span></div><div class="board-meta board-meta--top"><span><strong>Time:</strong> ${formatMathForDisplay(config.durationLabel || exam.duration || 'N/A')}</span><span><strong>Full Marks:</strong> ${formatMathForDisplay(config.marksLabel || exam.fullMarks || 'N/A')}</span></div><p class="paper-meta">${formatMathForDisplay(exam.subject)} · ${escapeHtml(exam.examDate)} · ${escapeHtml(exam.examType)}</p><p class="instructions">${formatMathForDisplay(config.instructions)}</p></div><div class="question-grid">${list || '<p>No questions assigned.</p>'}</div></section>`);

      if (config.includeAnswerSheet) {
        const omrRows = answerKey.map((item, idx) => {
          const mcq = item !== 'CQ';
          const bubble = (label) => `<span class="omr-bubble ${mcq && item === label ? 'is-correct' : ''}">${label}</span>`;
          return `<div class="omr-row"><span class="omr-qno">${idx + 1}</span><div class="omr-bubbles">${bubble('A')}${bubble('B')}${bubble('C')}${bubble('D')}</div></div>`;
        }).join('');
        answerSheets.push(`<section class="paper answer-sheet"><h2>OMR Sheet - ${escapeHtml(setLabel)}</h2><p class="muted-copy">Fill bubbles according to question numbers.</p><div class="omr-grid">${omrRows}</div></section>`);
      }
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(exam.title)}</title><style>@page{margin:10mm}body{font-family:'Kalpurush','Noto Sans Bengali',Arial,sans-serif;background:#fff;padding:12px;color:#111}.paper{max-width:980px;margin:0 auto 14px auto;padding:12px 14px;border:1px solid #d6dbe3;border-radius:10px;break-inside:avoid-page}.set-paper{page-break-before:always}.set-paper:first-of-type{page-break-before:auto}h1,h2,h3{margin:0}.board-head{text-align:center;border:1px solid #d6dbe3;border-radius:10px;padding:10px 8px;margin-bottom:10px}.board-head--modern{background:linear-gradient(140deg,rgba(148,163,184,.12),transparent 65%)}.board-head--minimal{border-width:0 0 2px 0;border-radius:0;padding:6px 0}.board-head--classic{background:#f8fbff}h1{font-size:24px;margin-bottom:3px}h2{font-size:18px;margin-bottom:6px}.board-meta{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:12px;margin-bottom:4px}.board-meta--top{font-size:13px;margin:6px 0}.paper-meta{text-align:center;font-size:12px;color:#444;margin:0 0 8px 0}.instructions{border:1px solid #d6d6d6;background:#f8fafc;padding:6px 8px;border-radius:8px;text-align:center;margin:0 0 10px 0;font-size:12px}.question-grid{display:grid;grid-template-columns:repeat(${Math.max(1, Number(config.columns || 1))},minmax(0,1fr));gap:8px 14px;align-items:start}.print-question{break-inside:avoid;page-break-inside:avoid;padding:0 0 6px;margin:0 0 6px;border-bottom:1px solid #ddd}h3{font-size:14px;line-height:1.28;margin-bottom:4px}.option-list{list-style:none;padding-left:0;margin:4px 0}.option-list li{display:flex;gap:6px;margin:2px 0;font-size:13px}.option-list--grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 14px}.option-list--grid li{margin:0}.option-label{min-width:16px;font-weight:700}.answer-block,.explanation-block{margin-top:4px;font-size:12px}.omr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin-top:10px}.omr-row{display:flex;align-items:center;gap:10px}.omr-qno{min-width:28px;font-weight:700}.omr-bubbles{display:flex;gap:8px}.omr-bubble{width:20px;height:20px;border:1px solid #444;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px}.omr-bubble.is-correct{background:#dbeafe;border-color:#1d4ed8}.math-frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1;font-size:.92em;margin:0 .08em}.math-frac__num{border-bottom:1px solid currentColor;padding:0 .18em .05em}.math-frac__den{padding:.05em .18em 0}.compact-mode .paper{padding:10px 12px}.compact-mode h1{font-size:20px}.compact-mode h2{font-size:16px}.compact-mode .question-grid{gap:6px 10px}.compact-mode .print-question{margin:0 0 4px;padding:0 0 4px}.compact-mode h3{font-size:13px;margin-bottom:3px}.compact-mode .option-list li{margin:1px 0;font-size:12px}.compact-mode .option-list--grid{gap:1px 10px}.compact-mode .option-list--grid li{margin:0}.compact-mode .board-meta{font-size:11px}.compact-mode .instructions{font-size:11px;padding:5px 7px}.compact-mode .omr-bubble{width:18px;height:18px;font-size:10px}@media print{body{padding:0}.set-paper,.answer-sheet{page-break-after:always}.set-paper:last-of-type,.answer-sheet:last-of-type{page-break-after:auto}}</style></head><body class="${compactClass}">${setMarkup.join('')}${answerSheets.join('')}</body></html>`;
  }

  function mergePrintConfig(config = {}) {
    return { ...structuredClone(defaultState).settings.printConfig, ...config };
  }

  function buildQuestionSet(sourceQuestions, config) {
    let setQuestions = sourceQuestions.map((question) => ({ ...question, options: [...(question.options || [])], subQuestions: question.subQuestions ? question.subQuestions.map((item) => ({ ...item })) : [] }));
    if (config.shuffleQuestions) setQuestions = shuffleArray(setQuestions);
    const answerKey = [];
    setQuestions = setQuestions.map((question) => {
      if (question.type !== 'mcq') {
        answerKey.push('CQ');
        return question;
      }
      if (config.shuffleOptions && question.options?.length) {
        const zipped = question.options.map((option, idx) => ({ option, idx }));
        const shuffled = shuffleArray(zipped);
        const newCorrect = shuffled.findIndex((item) => item.idx === question.correct);
        const next = { ...question, options: shuffled.map((item) => item.option), correct: newCorrect >= 0 ? newCorrect : 0 };
        answerKey.push(String.fromCharCode(65 + next.correct));
        return next;
      }
      answerKey.push(String.fromCharCode(65 + (question.correct || 0)));
      return question;
    });
    return { setQuestions, answerKey };
  }

  function shuffleArray(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
    if (!exam) return showToast('Exam not found.', 'error');
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
    if (!findExam(examId)) return showToast('Exam not found.', 'error');
    const win = window.open('', '_blank', 'width=980,height=720');
    if (!win) return showToast('Popup blocked by browser.', 'error');
    win.document.write(buildExamPaperHtml(examId));
    win.document.close();
    win.focus();
    win.print();
  }

  function buildOmrSheetHtml(examId) {
    const exam = findExam(examId);
    if (!exam) return '<!DOCTYPE html><html><head><meta charset="utf-8" /><title>OMR Not Found</title></head><body><p>Exam not found.</p></body></html>';
    const snapshot = exam.published && exam.publishedSnapshot ? exam.publishedSnapshot : null;
    const config = snapshot?.config ? mergePrintConfig(snapshot.config) : state.settings.printConfig;
    const questions = snapshot?.questions
      ? snapshot.questions.map((question) => ({ ...question, options: [...(question.options || [])], subQuestions: (question.subQuestions || []).map((item) => ({ ...item })) }))
      : exam.questionIds.map((id) => state.questions.find((question) => question.id === id)).filter(Boolean);
    const safeSetCount = Math.max(1, Math.min(10, Number(config.setCount || 1)));
    const pages = [];
    const buildDigitColumns = (digits, name) => {
      const columns = Array.from({ length: digits }, (_, colIndex) => {
        const bubbles = Array.from({ length: 10 }, (_, digit) => `<span class="digit-bubble">${digit}</span>`).join('');
        return `<div class="digit-col"><div class="digit-col__write"></div>${bubbles}</div>`;
      }).join('');
      return `<div class="digit-card"><div class="digit-card__title">${name}</div><div class="digit-card__hint">উপরে ঘরে সংখ্যা লিখুন, পরে নিচে একই সংখ্যা ভরাট করুন</div><div class="digit-cols">${columns}</div></div>`;
    };
    for (let setIndex = 0; setIndex < safeSetCount; setIndex += 1) {
      const { answerKey } = buildQuestionSet(questions, config);
      const setLabel = config.setLabelStyle === 'numeric' ? `${setIndex + 1}` : String.fromCharCode(65 + setIndex);
      const densityClass = answerKey.length > 80 ? 'is-dense-3' : (answerKey.length > 50 ? 'is-dense-2' : (answerKey.length > 30 ? 'is-dense-1' : ''));
      const colSize = Math.ceil(answerKey.length / 3);
      const questionRows = `<div class="omr-columns">${Array.from({ length: 3 }, (_, col) => {
        const columnRows = Array.from({ length: colSize }, (_, row) => {
          const idx = col * colSize + row;
          if (idx >= answerKey.length) return '';
          return `<div class="omr-q-row"><span class="qno">${idx + 1}.</span><div class="bubble-group"><span>A</span><span>B</span><span>C</span><span>D</span></div></div>`;
        }).join('');
        return `<div class="omr-col">${columnRows}</div>`;
      }).join('')}</div>`;
      pages.push(`<section class="omr-page ${densityClass}"><header class="board-head board-head--${escapeAttr(config.headerTheme || 'classic')}"><h1>${formatMathForDisplay(config.headerTitle)}</h1><h2>${formatMathForDisplay(exam.title)}</h2><div class="board-meta"><span><strong>Set:</strong> ${escapeHtml(setLabel)}</span><span><strong>Class:</strong> ${formatMathForDisplay(config.classLabel || 'N/A')}</span><span><strong>Exam Code:</strong> ${formatMathForDisplay(config.examCode || 'N/A')}</span></div><p class="paper-meta">${formatMathForDisplay(exam.subject)} · ${escapeHtml(exam.examDate)} · ${escapeHtml(exam.examType)}</p></header><div class="omr-warning">উত্তরপত্রে নির্দিষ্ট স্থান ব্যতীত অন্য কোথাও লেখা যাবে না</div><div class="omr-layout"><div class="omr-left"><div class="omr-table-head"><span>প্রশ্ন নম্বর</span><span>উত্তর</span></div><div class="omr-question-grid">${questionRows || '<p>No assigned question found.</p>'}</div></div><div class="omr-right"><div class="id-grid">${buildDigitColumns(6, 'রোল নম্বর')}${buildDigitColumns(8, 'রেজিস্ট্রেশন নম্বর')}</div><div class="set-code-box"><div class="digit-card"><div class="digit-card__title">সেট কোড</div><div class="set-bubbles"><span class="set-bubble ${setLabel === 'A' || setLabel === '1' ? 'is-active' : ''}">A</span><span class="set-bubble ${setLabel === 'B' || setLabel === '2' ? 'is-active' : ''}">B</span><span class="set-bubble ${setLabel === 'C' || setLabel === '3' ? 'is-active' : ''}">C</span><span class="set-bubble ${setLabel === 'D' || setLabel === '4' ? 'is-active' : ''}">D</span></div></div></div><div class="name-card"><div><strong>শিক্ষার্থীর নাম</strong></div><div class="line"></div><div><strong>ফোন নম্বর</strong></div><div class="line"></div><div><strong>শিক্ষার্থীর স্বাক্ষর</strong></div><div class="line"></div></div></div></div><div class="omr-note"><strong>নির্দেশাবলী:</strong> কালো বল পয়েন্ট কলম দিয়ে বৃত্ত সম্পূর্ণ ভরাট করুন।</div></section>`);
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(exam.title)} OMR</title><style>@page{size:A4 portrait;margin:6mm}body{font-family:'Kalpurush','Noto Sans Bengali',Arial,sans-serif;color:#111;padding:8px;background:#fff}.omr-page{width:198mm;height:285mm;max-width:198mm;margin:0 auto 8px auto;border:2px solid #111;padding:8px 10px;box-sizing:border-box;page-break-after:always;page-break-inside:avoid;break-inside:avoid;overflow:hidden}.omr-page:last-child{page-break-after:auto}.board-head{text-align:center;border:1px solid #d6dbe3;border-radius:10px;padding:10px 8px;margin-bottom:10px}.board-head--modern{background:linear-gradient(140deg,rgba(148,163,184,.12),transparent 65%)}.board-head--minimal{border-width:0 0 2px 0;border-radius:0;padding:6px 0}.board-head--classic{background:#f8fbff}.board-head h1{margin:0;font-size:24px}.board-head h2{margin:2px 0 6px 0;font-size:18px}.board-meta{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:12px;margin-bottom:4px}.paper-meta{text-align:center;font-size:12px;color:#444;margin:0}.omr-warning{text-align:center;border:2px solid #111;background:#fff0fb;color:#861657;font-weight:700;font-size:13px;padding:6px;margin:10px 0}.omr-layout{display:grid;grid-template-columns:1.5fr 1fr;gap:12px}.omr-left{border:1px solid #e879c4;padding:8px;background:#fff9fd}.omr-table-head{display:grid;grid-template-columns:88px 1fr;font-weight:700;font-size:13px;background:#ffd6f1;border:1px solid #e879c4;padding:4px 6px;margin-bottom:6px}.omr-question-grid{display:block}.omr-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 8px}.omr-col{display:grid;gap:4px}.omr-q-row{display:flex;align-items:center;gap:8px;border:1px solid #f3b0dc;background:#fff;padding:2px 3px}.qno{min-width:22px;font-weight:700}.bubble-group{display:flex;gap:5px}.bubble-group span{width:14px;height:14px;border:1px solid #c02686;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:8px;color:#9d174d}.omr-right{display:flex;flex-direction:column;gap:8px}.id-grid{display:grid;grid-template-columns:1fr;gap:8px}.digit-card{border:1px solid #e879c4;background:#fff9fd;padding:6px}.digit-card__title{font-weight:700;font-size:12px;text-align:center;margin-bottom:2px}.digit-card__hint{text-align:center;font-size:10px;color:#7a1e4f;margin-bottom:4px}.digit-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(24px,1fr));gap:4px}.digit-col{display:flex;flex-direction:column;align-items:center;gap:2px}.digit-col__write{width:17px;height:17px;border:1px solid #7a1e4f;background:#fff}.digit-bubble{width:17px;height:17px;border:1px solid #c02686;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#9d174d}.set-code-box .set-bubbles{display:flex;justify-content:center;gap:8px;padding:2px 0}.set-bubble{width:20px;height:20px;border:1px solid #c02686;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#9d174d}.set-bubble.is-active{background:#c02686;color:#fff}.name-card{border:1px solid #e879c4;background:#fff;padding:8px;display:grid;grid-template-columns:1fr;gap:6px;font-size:12px}.line{border-bottom:1px solid #444;height:16px}.omr-note{margin-top:8px;font-size:12px;border-top:1px dashed #999;padding-top:6px}.omr-page.is-dense-1 .omr-columns{gap:4px 6px}.omr-page.is-dense-2 .bubble-group span{width:14px;height:14px;font-size:8px}.omr-page.is-dense-2 .qno{min-width:16px;font-size:10px}.omr-page.is-dense-3 .omr-layout{grid-template-columns:1.7fr 1fr;gap:8px}.omr-page.is-dense-3 .omr-columns{gap:3px 5px}.omr-page.is-dense-3 .omr-q-row{gap:3px;padding:1px 2px}.omr-page.is-dense-3 .bubble-group{gap:2px}.omr-page.is-dense-3 .bubble-group span{width:12px;height:12px;font-size:7px}.omr-page.is-dense-3 .qno{min-width:12px;font-size:9px}.omr-page.is-dense-3 .board-head h1{font-size:18px}.omr-page.is-dense-3 .board-head h2{font-size:13px}@media print{body{padding:0}}</style></head><body>${pages.join('')}</body></html>`;
  }

  function printOmrSheet(examId) {
    if (!findExam(examId)) return showToast('Exam not found.', 'error');
    const win = window.open('', '_blank', 'width=980,height=720');
    if (!win) return showToast('Popup blocked by browser.', 'error');
    win.document.write(buildOmrSheetHtml(examId));
    win.document.close();
    win.focus();
    win.print();
  }

  function findExam(id) { return state.exams.find((item) => item.id === id); }

  function initStudentsPage() {
    document.getElementById('studentForm').addEventListener('submit', saveStudent);
    document.getElementById('studentCsvFile').addEventListener('change', async (e) => { const file = e.target.files?.[0]; if (file) document.getElementById('studentCsvText').value = await file.text(); });
    document.getElementById('importStudentsBtn').addEventListener('click', importStudents);
    document.getElementById('importStudentsXlsxBtn')?.addEventListener('click', importStudentsFromXlsx);
    document.getElementById('studentSearch')?.addEventListener('input', () => renderStudents());
    document.getElementById('studentClassFilter')?.addEventListener('change', () => renderStudents());
    document.getElementById('exportStudentsAllBtn')?.addEventListener('click', () => exportStudentsSheet());
    document.getElementById('exportStudentsClassBtn')?.addEventListener('click', () => exportStudentsSheet(document.getElementById('studentClassFilter')?.value || ''));
    renderStudents();
  }

  function saveStudent(event) {
    event.preventDefault();
    state.students.unshift({
      id: uid('student'),
      name: document.getElementById('studentName').value.trim(),
      rollNumber: document.getElementById('studentRollNumber').value.trim(),
      className: document.getElementById('studentClass').value.trim(),
      institute: document.getElementById('studentInstitute').value.trim(),
      phone: document.getElementById('studentPhone').value.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    });
    saveState();
    event.target.reset();
    renderStudents();
    showToast('Student created.');
  }

  function importStudents() {
    const rows = parseCSVRows(document.getElementById('studentCsvText').value);
    rows.forEach((row) => {
      const roll = row.roll_number || row.roll || row.studentid || row.studentId || '';
      if (!(row.student_name || row.name || roll)) return;
      state.students.unshift({
        id: uid('student'),
        name: row.student_name || row.name || '',
        rollNumber: roll,
        className: row.class || row.course || '',
        institute: row.institute || '',
        phone: row.phone_number || row.phone || '',
        active: true,
        createdAt: new Date().toISOString(),
      });
    });
    saveState();
    renderStudents();
    showToast('Students imported from CSV.');
  }

  async function importStudentsFromXlsx() {
    const file = document.getElementById('studentXlsxFile')?.files?.[0];
    if (!file) return showToast('Upload an XLSX file first.', 'error');
    const students = await readStudentListFromXlsx(file);
    students.forEach((row, roll) => {
      state.students.unshift({
        id: uid('student'),
        name: row.student_name || '',
        rollNumber: roll,
        className: row.class || '',
        institute: row.institute || '',
        phone: row.phone_number || '',
        active: true,
        createdAt: new Date().toISOString(),
      });
    });
    saveState();
    renderStudents();
    showToast('Students imported from XLSX.');
  }

  function renderStudents() {
    const target = document.getElementById('studentList');
    const counter = document.getElementById('studentClassCount');
    if (!target) return;
    if (!state.students.length) return target.innerHTML = emptyState('No students added yet.');
    const query = (document.getElementById('studentSearch')?.value || '').trim().toLowerCase();
    const classFilter = document.getElementById('studentClassFilter')?.value || '';
    const filtered = state.students.filter((student) => {
      if (classFilter && (student.className || student.course || '') !== classFilter) return false;
      if (!query) return true;
      return [student.name, student.rollNumber, student.phone, student.className, student.institute].some((item) => String(item || '').toLowerCase().includes(query));
    });
    if (!filtered.length) {
      target.innerHTML = emptyState('No student matched your search.');
      if (counter) counter.textContent = 'No student in current filter.';
      return;
    }
    const grouped = filtered.reduce((acc, student) => {
      const key = student.className || student.course || 'Unassigned';
      if (!acc[key]) acc[key] = [];
      acc[key].push(student);
      return acc;
    }, {});
    if (counter) counter.textContent = Object.entries(grouped).map(([name, list]) => `${name}: ${list.length}`).join(' | ');
    target.innerHTML = Object.entries(grouped).map(([className, items]) => `<section class="preview-surface preview-surface--small"><h4>Class: ${escapeHtml(className)}</h4>${items.map((student) => `<article class="entity-card entity-card--stacked"><div class="entity-card__head"><div><h4>${escapeHtml(student.name)}</h4><p>Roll: ${escapeHtml(student.rollNumber || student.studentId || '')} · ${escapeHtml(student.institute || '')} · ${escapeHtml(student.phone || student.email || '')}</p></div><span class="status-pill ${student.active ? 'is-live' : ''}">${student.active ? 'Active' : 'Inactive'}</span></div><div class="entity-actions"><a class="toolbar-button" href="student-profile.html?studentId=${student.id}">View Profile</a><button class="toolbar-button" data-toggle-student="${student.id}">${student.active ? 'Deactivate' : 'Activate'}</button><button class="toolbar-button toolbar-button--danger" data-delete-student="${student.id}">Delete</button></div></article>`).join('')}</section>`).join('');
    target.querySelectorAll('[data-toggle-student]').forEach((button) => button.addEventListener('click', () => { const student = state.students.find((item) => item.id === button.dataset.toggleStudent); student.active = !student.active; saveState(); renderStudents(); }));
    target.querySelectorAll('[data-delete-student]').forEach((button) => button.addEventListener('click', () => { state.students = state.students.filter((item) => item.id !== button.dataset.deleteStudent); saveState(); renderStudents(); }));
    target.querySelectorAll('[data-view-student]').forEach((card) => card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      renderStudentProfile(card.dataset.viewStudent);
    }));
    if (profile && !profile.innerHTML.trim()) profile.innerHTML = '<p class="muted-copy">Select a student to see profile and exam results.</p>';
  }

  function renderStudentProfile(studentId) {
    const target = document.getElementById('studentProfile');
    if (!target) return;
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return target.innerHTML = '<p class="muted-copy">Student not found.</p>';
    const attempts = state.attempts.filter((attempt) => attempt.studentId === studentId);
    const rows = attempts.map((attempt) => {
      const exam = findExam(attempt.examId);
      const pct = attempt.total ? ((attempt.score / attempt.total) * 100).toFixed(2) : '0.00';
      return `<tr><td>${escapeHtml(exam?.title || attempt.examId)}</td><td>${attempt.score}/${attempt.total}</td><td>${pct}%</td><td>${new Date(attempt.createdAt).toLocaleDateString()}</td></tr>`;
    }).join('');
    target.innerHTML = `<h4>${escapeHtml(student.name)} · Profile</h4><p>Roll: ${escapeHtml(student.rollNumber || '')} · Class: ${escapeHtml(student.className || '')} · Phone: ${escapeHtml(student.phone || '')}</p><div class="table-wrap"><table><thead><tr><th>Exam</th><th>Score</th><th>Percent</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No exam result yet.</td></tr>'}</tbody></table></div>`;
  }

  function buildStudentProfileMarkup(studentId) {
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return '<p class="muted-copy">Student not found.</p>';
    const attempts = state.attempts.filter((attempt) => attempt.studentId === studentId);
    const rows = attempts.map((attempt) => {
      const exam = findExam(attempt.examId);
      const pct = attempt.total ? ((attempt.score / attempt.total) * 100).toFixed(2) : '0.00';
      return `<tr><td>${escapeHtml(exam?.title || attempt.examId)}</td><td>${attempt.score}/${attempt.total}</td><td>${pct}%</td><td>${new Date(attempt.createdAt).toLocaleDateString()}</td></tr>`;
    }).join('');
    return `<div class="result-card"><h2>MegaPrep · Student Result Card</h2><p><strong>Name:</strong> ${escapeHtml(student.name)} | <strong>Roll:</strong> ${escapeHtml(student.rollNumber || '')} | <strong>Class:</strong> ${escapeHtml(student.className || '')}</p><p><strong>Institute:</strong> ${escapeHtml(student.institute || '')} | <strong>Phone:</strong> ${escapeHtml(student.phone || '')}</p><div class="table-wrap"><table><thead><tr><th>Exam</th><th>Score</th><th>Percent</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No exam result yet.</td></tr>'}</tbody></table></div></div>`;
  }

  function initStudentProfilePage() {
    const target = document.getElementById('studentProfilePage');
    const printBtn = document.getElementById('printStudentMarksheetBtn');
    if (!target || !printBtn) return;
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('studentId') || '';
    target.innerHTML = buildStudentProfileMarkup(studentId);
    printBtn.addEventListener('click', () => {
      const win = window.open('', '_blank', 'width=1000,height=800');
      if (!win) return showToast('Popup blocked by browser.', 'error');
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Marksheet</title><link rel="stylesheet" href="styles.css"></head><body>${buildStudentProfileMarkup(studentId)}</body></html>`);
      win.document.close();
      win.print();
    });
  }

  async function exportStudentsSheet(className = '') {
    const XLSX = await ensureXlsxLib();
    const rows = state.students
      .filter((student) => !className || (student.className || student.course || '') === className)
      .map((student) => ({
        roll_number: student.rollNumber || '',
        student_name: student.name || '',
        class: student.className || student.course || '',
        institute: student.institute || '',
        phone_number: student.phone || '',
      }));
    if (!rows.length) return showToast('No student found for export.', 'error');
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, className || 'All Students');
    XLSX.writeFile(book, className ? `${className.replace(/\s+/g, '-').toLowerCase()}-students.xlsx` : 'all-students.xlsx');
  }

  function buildStudentProfileMarkup(studentId) {
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return '<p class="muted-copy">Student not found.</p>';
    const attempts = state.attempts.filter((attempt) => attempt.studentId === studentId);
    const rows = attempts.map((attempt) => {
      const exam = findExam(attempt.examId);
      const pct = attempt.total ? ((attempt.score / attempt.total) * 100).toFixed(2) : '0.00';
      return `<tr><td>${escapeHtml(exam?.title || attempt.examId)}</td><td>${attempt.score}/${attempt.total}</td><td>${pct}%</td><td>${new Date(attempt.createdAt).toLocaleDateString()}</td></tr>`;
    }).join('');
    const totalExams = attempts.length;
    const avgPercent = attempts.length ? (attempts.reduce((sum, item) => sum + ((item.total ? item.score / item.total : 0) * 100), 0) / attempts.length).toFixed(2) : '0.00';
    return `<section class="result-card marksheet-onepage"><header class="result-card__head"><h1>MegaPrep Result Card</h1><p>Professional Academic Transcript</p></header><div class="result-card__meta"><div><strong>Student Name</strong><span>${escapeHtml(student.name)}</span></div><div><strong>Roll Number</strong><span>${escapeHtml(student.rollNumber || '')}</span></div><div><strong>Class</strong><span>${escapeHtml(student.className || '')}</span></div><div><strong>Institute</strong><span>${escapeHtml(student.institute || '')}</span></div><div><strong>Phone</strong><span>${escapeHtml(student.phone || '')}</span></div></div><div class="result-card__stats"><article><strong>${totalExams}</strong><span>Total Exams</span></article><article><strong>${avgPercent}%</strong><span>Average %</span></article></div><div class="table-wrap"><table><thead><tr><th>Exam</th><th>Score</th><th>Percent</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No exam result yet.</td></tr>'}</tbody></table></div></section>`;
  }

  function initStudentProfilePage() {
    const target = document.getElementById('studentProfilePage');
    const printBtn = document.getElementById('printStudentMarksheetBtn');
    if (!target || !printBtn) return;
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('studentId') || '';
    target.innerHTML = buildStudentProfileMarkup(studentId);
    printBtn.addEventListener('click', () => {
      const win = window.open('', '_blank', 'width=1000,height=800');
      if (!win) return showToast('Popup blocked by browser.', 'error');
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Marksheet</title><link rel="stylesheet" href="styles.css"></head><body>${buildStudentProfileMarkup(studentId)}</body></html>`);
      win.document.close();
      win.print();
    });
  }

  async function exportStudentsSheet(className = '') {
    const XLSX = await ensureXlsxLib();
    const rows = state.students
      .filter((student) => !className || (student.className || student.course || '') === className)
      .map((student) => ({
        roll_number: student.rollNumber || '',
        student_name: student.name || '',
        class: student.className || student.course || '',
        institute: student.institute || '',
        phone_number: student.phone || '',
      }));
    if (!rows.length) return showToast('No student found for export.', 'error');
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, className || 'All Students');
    XLSX.writeFile(book, className ? `${className.replace(/\s+/g, '-').toLowerCase()}-students.xlsx` : 'all-students.xlsx');
  }

  function buildStudentProfileMarkup(studentId) {
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return '<p class="muted-copy">Student not found.</p>';
    const attempts = state.attempts.filter((attempt) => attempt.studentId === studentId);
    const rows = attempts.map((attempt) => {
      const exam = findExam(attempt.examId);
      const highest = state.attempts
        .filter((item) => item.examId === attempt.examId)
        .reduce((max, item) => Math.max(max, Number(item.score || 0)), 0);
      const pct = attempt.total ? ((attempt.score / attempt.total) * 100).toFixed(2) : '0.00';
      return `<tr><td>${new Date(attempt.createdAt).toLocaleDateString()}</td><td>${escapeHtml(exam?.title || attempt.examId)}</td><td>${attempt.total}</td><td>${attempt.score}</td><td>${highest}</td><td>${pct}%</td></tr>`;
    }).join('');
    const totalExams = attempts.length;
    const avgPercent = attempts.length ? (attempts.reduce((sum, item) => sum + ((item.total ? item.score / item.total : 0) * 100), 0) / attempts.length).toFixed(2) : '0.00';
    return `<section class="result-card marksheet-onepage"><header class="result-card__head"><h1>MegaPrep Result Card</h1><p>Professional Academic Transcript</p></header><div class="result-card__meta"><div><strong>Student Name</strong><span>${escapeHtml(student.name)}</span></div><div><strong>Roll Number</strong><span>${escapeHtml(student.rollNumber || '')}</span></div><div><strong>Class</strong><span>${escapeHtml(student.className || '')}</span></div><div><strong>Institute</strong><span>${escapeHtml(student.institute || '')}</span></div><div><strong>Phone</strong><span>${escapeHtml(student.phone || '')}</span></div></div><div class="result-card__stats"><article><strong>${totalExams}</strong><span>Total Exams</span></article><article><strong>${avgPercent}%</strong><span>Average %</span></article></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Exam Name</th><th>Full Marks</th><th>Obtained Mark</th><th>Highest Mark</th><th>Percentage</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No exam result yet.</td></tr>'}</tbody></table></div></section>`;
  }

  function initStudentProfilePage() {
    const target = document.getElementById('studentProfilePage');
    const printBtn = document.getElementById('printStudentMarksheetBtn');
    if (!target || !printBtn) return;
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('studentId') || '';
    target.innerHTML = buildStudentProfileMarkup(studentId);
    printBtn.addEventListener('click', () => {
      const win = window.open('', '_blank', 'width=1000,height=800');
      if (!win) return showToast('Popup blocked by browser.', 'error');
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Marksheet</title><link rel="stylesheet" href="styles.css"></head><body>${buildStudentProfileMarkup(studentId)}</body></html>`);
      win.document.close();
      win.print();
    });
  }

  async function exportStudentsSheet(className = '') {
    const XLSX = await ensureXlsxLib();
    const rows = state.students
      .filter((student) => !className || (student.className || student.course || '') === className)
      .map((student) => ({
        roll_number: student.rollNumber || '',
        student_name: student.name || '',
        class: student.className || student.course || '',
        institute: student.institute || '',
        phone_number: student.phone || '',
      }));
    if (!rows.length) return showToast('No student found for export.', 'error');
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, className || 'All Students');
    XLSX.writeFile(book, className ? `${className.replace(/\s+/g, '-').toLowerCase()}-students.xlsx` : 'all-students.xlsx');
  }

  function buildStudentProfileMarkup(studentId) {
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return '<p class="muted-copy">Student not found.</p>';
    const attempts = state.attempts.filter((attempt) => attempt.studentId === studentId);
    const rows = attempts.map((attempt) => {
      const exam = findExam(attempt.examId);
      const highest = state.attempts
        .filter((item) => item.examId === attempt.examId)
        .reduce((max, item) => Math.max(max, Number(item.score || 0)), 0);
      const pct = attempt.total ? ((attempt.score / attempt.total) * 100).toFixed(2) : '0.00';
      return `<tr><td>${new Date(attempt.createdAt).toLocaleDateString()}</td><td>${escapeHtml(exam?.title || attempt.examId)}</td><td>${attempt.total}</td><td>${attempt.score}</td><td>${highest}</td><td>${pct}%</td></tr>`;
    }).join('');
    const totalExams = attempts.length;
    const avgPercent = attempts.length ? (attempts.reduce((sum, item) => sum + ((item.total ? item.score / item.total : 0) * 100), 0) / attempts.length).toFixed(2) : '0.00';
    return `<section class="result-card marksheet-onepage"><header class="result-card__head"><h1>MegaPrep Result Card</h1><p>Academic Transcript</p></header><div class="result-card__meta"><div><strong>Student Name</strong><span>${escapeHtml(student.name)}</span></div><div><strong>Roll Number</strong><span>${escapeHtml(student.rollNumber || '')}</span></div><div><strong>Class</strong><span>${escapeHtml(student.className || '')}</span></div><div><strong>Institute</strong><span>${escapeHtml(student.institute || '')}</span></div><div><strong>Phone</strong><span>${escapeHtml(student.phone || '')}</span></div></div><div class="result-card__stats"><article><strong>${totalExams}</strong><span>Total Exams</span></article><article><strong>${avgPercent}%</strong><span>Average %</span></article></div><div class="table-wrap"><table class="result-table"><thead><tr><th>Date</th><th>Exam Name</th><th>Full Marks</th><th>Obtained Mark</th><th>Highest Mark</th><th>Percentage</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No exam result yet.</td></tr>'}</tbody></table></div></section>`;
  }

  function initStudentProfilePage() {
    const target = document.getElementById('studentProfilePage');
    const printBtn = document.getElementById('printStudentMarksheetBtn');
    if (!target || !printBtn) return;
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('studentId') || '';
    target.innerHTML = buildStudentProfileMarkup(studentId);
    printBtn.addEventListener('click', async () => {
      const win = window.open('', '_blank', 'width=1000,height=800');
      if (!win) return showToast('Popup blocked by browser.', 'error');
      let cssText = '';
      try {
        cssText = await fetch('styles.css').then((res) => res.text());
      } catch {
        cssText = '';
      }
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Marksheet</title><style>${cssText}</style></head><body>${buildStudentProfileMarkup(studentId)}</body></html>`);
      win.document.close();
      win.print();
    });
  }

  async function exportStudentsSheet(className = '') {
    const XLSX = await ensureXlsxLib();
    const rows = state.students
      .filter((student) => !className || (student.className || student.course || '') === className)
      .map((student) => ({
        roll_number: student.rollNumber || '',
        student_name: student.name || '',
        class: student.className || student.course || '',
        institute: student.institute || '',
        phone_number: student.phone || '',
      }));
    if (!rows.length) return showToast('No student found for export.', 'error');
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, className || 'All Students');
    XLSX.writeFile(book, className ? `${className.replace(/\s+/g, '-').toLowerCase()}-students.xlsx` : 'all-students.xlsx');
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
    /**
 * A utility to strip LaTeX commands and convert to plain text.
 * Note: This handles common formatting and math symbols.
 */
const latexToText = (latex) => {
  let text = latex;

  // 1. Handle escaped characters (e.g., \{ -> {, \& -> &)
  text = text.replace(/\\([&%$#_{}])/g, '$1');

  // 2. Remove comments
  text = text.replace(/%.*$/gm, '');

  // 3. Remove common environments (begin/end blocks)
  text = text.replace(/\\begin\{.*?\}/g, '');
  text = text.replace(/\\end\{.*?\}/g, '');

  // 4. Convert specific math symbols/commands to readable equivalents
  const replacements = [
    { regex: /\\alpha/g, subst: 'α' },
    { regex: /\\beta/g, subst: 'β' },
    { regex: /\\gamma/g, subst: 'γ' },
    { regex: /\\infty/g, subst: '∞' },
    { regex: /\\pm/g, subst: '±' },
    { regex: /\\neq/g, subst: '≠' },
    { regex: /\\approx/g, subst: '≈' },
    { regex: /\\times/g, subst: '×' },
    { regex: /\\div/g, subst: '÷' },
    { regex: /\\rightarrow/g, subst: '→' }
  ];

  replacements.forEach(item => {
    text = text.replace(item.regex, item.subst);
  });

  // 5. Remove formatting commands but keep the content: \textbf{Hello} -> Hello
  // This uses a non-greedy match for the content inside braces
  text = text.replace(/\\[a-zA-Z]+\{(.*?)\}/g, '$1');

  // 6. Handle subscripts (_) and superscripts (^)
  text = text.replace(/\^\{(.*?)\}/g, '^($1)');
  text = text.replace(/_\{(.*?)\}/g, '_($1)');

  // 7. Strip remaining backslashes and lone commands
  text = text.replace(/\\[a-zA-Z]+/g, '');

  // 8. Clean up whitespace
  return text.trim().replace(/\s\s+/g, ' ');
};

// --- Example Usage ---
const sampleLatex = `
\\section{Introduction}
The formula for the area of a circle is $A = \\pi r^2$. 
\\textbf{Note:} If the radius is \\infty, the area is also \\infty.
`;

console.log("--- Original LaTeX ---");
console.log(sampleLatex);
console.log("\n--- Plain Text Output ---");
console.log(latexToText(sampleLatex));
  }

  function parseCommaList(value) { return value.split(',').map((item) => item.trim()).filter(Boolean); }
  function parseCSVRows(text) { const lines = text.trim().split(/\r?\n/).filter(Boolean); if (!lines.length) return []; const header = lines[0].split(',').map((item) => item.trim()); return lines.slice(1).map((line) => { const values = line.split(',').map((item) => item.trim()); return Object.fromEntries(header.map((key, index) => [key, values[index] || ''])); }); }
  function upsert(collection, item) { const index = collection.findIndex((entry) => entry.id === item.id); if (index === -1) collection.unshift(item); else collection[index] = { ...collection[index], ...item }; }
  function readFileAsDataUrl(file) { if (!file) return Promise.resolve(''); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
  function queueTypeset() { if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise(); }
  function formatMathForDisplay(text) {
    const normalized = escapeHtml(latexToPlainText(text))
      .replace(/\|/g, '')
      .replace(/\*/g, ' × ')
      .replace(/\s*=\s*/g, ' = ')
      .replace(/\s+/g, ' ')
      .replace(/\b([a-zA-Z])(\d+)\b/g, '$1^$2')
      .trim();
    return normalized
      .replace(/sqrt\(([^)]+)\)/g, '√$1')
      .replace(/([A-Za-z0-9)\]])\s*\^\s*\(([^)]+)\)/g, '$1<sup>$2</sup>')
      .replace(/([A-Za-z0-9)\]])\s*_\s*\(([^)]+)\)/g, '$1<sub>$2</sub>')
      .replace(/([A-Za-z0-9)\]])\s*\^\s*([A-Za-z0-9+\-./]+)/g, '$1<sup>$2</sup>')
      .replace(/([A-Za-z0-9)\]])\s*_\s*([A-Za-z0-9+\-./]+)/g, '$1<sub>$2</sub>')
      .replace(/(?<![\w>])([A-Za-z0-9.+\-]+)\s*\/\s*([A-Za-z0-9.+\-]+)(?![\w<])/g, '<span class="math-frac"><span class="math-frac__num">$1</span><span class="math-frac__den">$2</span></span>');
  }
  function emptyState(message) { return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`; }
  function escapeHtml(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function escapeAttr(value = '') { return escapeHtml(value); }
})();
