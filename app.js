(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v1';
  const SESSION_KEY = 'megaprep-session-v1';

  const defaultState = {
    exams: [],
    questions: [],
    students: [],
    attempts: [],
    devices: [],
    credentials: {
      adminPassword: 'admin1234',
      admins: [],
      students: [],
    },
    settings: { darkMode: false },
  };

  const state = loadState();
  let analyticsChart;
  let accuracyChart;
  let questionMode = 'mcq';
  let mcqImageData = '';
  let cqImageData = '';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    ensureCurrentDevice();
    bindModuleTriggers();
    bindThemeToggle();
    bindExportImport();
    bindExamModule();
    bindQuestionBank();
    bindStudentsModule();
    bindAnalyticsModule();
    bindPasswordModule();
    renderSessionMeta();
    renderAll();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      return mergeState(JSON.parse(raw));
    } catch {
      return structuredClone(defaultState);
    }
  }

  function mergeState(saved) {
    return {
      ...structuredClone(defaultState),
      ...saved,
      credentials: { ...structuredClone(defaultState).credentials, ...(saved.credentials || {}) },
      settings: { ...structuredClone(defaultState).settings, ...(saved.settings || {}) },
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
  }

  function showToast(message, type = 'success') {
    const stack = document.getElementById('toastStack');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.classList.add('is-visible'), 10);
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 250);
    }, 2600);
  }

  function queueTypeset() {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }

  function bindModuleTriggers() {
    document.querySelectorAll('.module-trigger').forEach((button) => {
      button.addEventListener('click', () => activateModule(button.dataset.module));
    });
    activateModule('create-exam');
  }

  function activateModule(name) {
    document.querySelectorAll('.module-panel').forEach((panel) => {
      panel.classList.toggle('is-active', panel.id === `module-${name}`);
    });
    const titleMap = {
      'create-exam': 'Create Exam',
      'question-bank': 'Question Bank',
      'handle-exams': 'Handle Exams',
      students: 'Students',
      analytics: 'Analytics',
      devices: 'Devices & Sessions',
      passwords: 'Password Management',
    };
    document.getElementById('workspaceTitle').textContent = titleMap[name] || 'Workspace';
    document.querySelectorAll('.module-trigger').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.module === name);
    });
  }

  function bindThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    const applyTheme = () => document.body.classList.toggle('theme-dark', !!state.settings.darkMode);
    applyTheme();
    toggle.addEventListener('click', () => {
      state.settings.darkMode = !state.settings.darkMode;
      saveState();
      applyTheme();
      showToast(state.settings.darkMode ? 'Dark mode enabled.' : 'Light mode enabled.');
    });
  }

  function bindExportImport() {
    document.getElementById('exportDataBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'megaprep-cms-data.json';
      link.click();
      URL.revokeObjectURL(url);
      showToast('Workspace data exported.');
    });

    document.getElementById('importDataFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const imported = mergeState(JSON.parse(await file.text()));
        Object.assign(state, imported);
        saveState();
        renderAll();
        showToast('Workspace data imported.');
      } catch {
        showToast('Could not import workspace data.', 'error');
      }
      event.target.value = '';
    });
  }

  function bindExamModule() {
    document.getElementById('addSectionBtn').addEventListener('click', () => {
      document.getElementById('sectionList').appendChild(createSectionRow());
    });

    document.getElementById('examForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const sections = [...document.querySelectorAll('.section-row')].map((row) => ({
        id: row.dataset.id,
        name: row.querySelector('[data-field="name"]').value.trim(),
        marksPerQuestion: Number(row.querySelector('[data-field="marks"]').value || 0),
      })).filter((section) => section.name);

      const exam = {
        id: document.getElementById('examId').value || uid('exam'),
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
        published: false,
        questionIds: getExistingExam(document.getElementById('examId').value)?.questionIds || [],
        createdAt: new Date().toISOString(),
      };

      upsert(state.exams, exam);
      saveState();
      event.target.reset();
      document.getElementById('examId').value = '';
      resetSectionList();
      renderExams();
      populateAnalyticsSelectors();
      showToast('Exam saved successfully.');
    });

    resetSectionList();
  }

  function getExistingExam(id) {
    return state.exams.find((exam) => exam.id === id);
  }

  function createSectionRow(section = {}) {
    const row = document.createElement('div');
    row.className = 'section-row';
    row.dataset.id = section.id || uid('section');
    row.innerHTML = `
      <input data-field="name" type="text" placeholder="Section name" value="${escapeAttr(section.name || '')}" />
      <input data-field="marks" type="number" min="1" placeholder="Marks per question" value="${escapeAttr(section.marksPerQuestion || '')}" />
      <button type="button" class="icon-button">Remove</button>
    `;
    row.querySelector('.icon-button').addEventListener('click', () => row.remove());
    return row;
  }

  function resetSectionList(sections = [{}]) {
    const list = document.getElementById('sectionList');
    list.innerHTML = '';
    sections.forEach((section) => list.appendChild(createSectionRow(section)));
  }

  function renderExams() {
    const summary = document.getElementById('examSummaryList');
    const manager = document.getElementById('examManagerList');
    if (!state.exams.length) {
      summary.innerHTML = manager.innerHTML = emptyState('No exams created yet.');
      return;
    }

    summary.innerHTML = state.exams.map((exam) => `
      <article class="entity-card">
        <div>
          <h4>${escapeHtml(exam.title)}</h4>
          <p>${escapeHtml(exam.course)} · ${escapeHtml(exam.examType)} · ${escapeHtml(exam.examDate || 'No date')}</p>
        </div>
        <span class="status-pill ${exam.published ? 'is-live' : ''}">${exam.published ? 'Published' : 'Draft'}</span>
      </article>
    `).join('');

    manager.innerHTML = state.exams.map((exam) => `
      <article class="entity-card entity-card--stacked">
        <div class="entity-card__head">
          <div>
            <h4>${escapeHtml(exam.title)}</h4>
            <p>${escapeHtml(exam.course)} · ${escapeHtml(exam.examNumber)} · ${exam.questionIds.length} Questions</p>
          </div>
          <span class="status-pill ${exam.published ? 'is-live' : ''}">${exam.published ? 'Published' : 'Draft'}</span>
        </div>
        <div class="assignment-box">
          <label>Assign questions</label>
          <div class="assignment-list">
            ${state.questions.length ? state.questions.map((question) => `
              <label class="assignment-item">
                <input type="checkbox" data-exam-id="${exam.id}" data-question-id="${question.id}" ${exam.questionIds.includes(question.id) ? 'checked' : ''} />
                <span>${escapeHtml(question.type.toUpperCase())} · ${escapeHtml(question.section || 'General')} · ${escapeHtml(question.question || question.stimulus || 'Question')}</span>
              </label>
            `).join('') : '<p class="muted-copy">Create questions first.</p>'}
          </div>
        </div>
        <div class="entity-actions">
          <button class="toolbar-button" data-action="edit-exam" data-id="${exam.id}">Edit</button>
          <button class="toolbar-button" data-action="toggle-publish" data-id="${exam.id}">${exam.published ? 'Unpublish' : 'Publish'}</button>
          <button class="toolbar-button toolbar-button--danger" data-action="delete-exam" data-id="${exam.id}">Delete</button>
        </div>
      </article>
    `).join('');

    manager.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', handleExamAction));
    manager.querySelectorAll('input[type="checkbox"][data-exam-id]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const exam = state.exams.find((item) => item.id === checkbox.dataset.examId);
        if (!exam) return;
        exam.questionIds = checkbox.checked
          ? [...new Set([...exam.questionIds, checkbox.dataset.questionId])]
          : exam.questionIds.filter((id) => id !== checkbox.dataset.questionId);
        saveState();
        renderExams();
        showToast('Exam question mapping updated.');
      });
    });
  }

  function handleExamAction(event) {
    const { action, id } = event.currentTarget.dataset;
    const exam = state.exams.find((item) => item.id === id);
    if (!exam) return;

    if (action === 'edit-exam') {
      activateModule('create-exam');
      document.getElementById('examId').value = exam.id;
      document.getElementById('examCourse').value = exam.course;
      document.getElementById('examNumber').value = exam.examNumber;
      document.getElementById('examTitle').value = exam.title;
      document.getElementById('examDuration').value = exam.duration;
      document.getElementById('examMarks').value = exam.fullMarks;
      document.getElementById('examType').value = exam.examType;
      document.getElementById('examDate').value = exam.examDate;
      document.getElementById('examStartTime').value = exam.startTime;
      document.getElementById('examEndTime').value = exam.endTime;
      resetSectionList(exam.sections.length ? exam.sections : [{}]);
      showToast('Exam loaded for editing.');
    }

    if (action === 'toggle-publish') {
      exam.published = !exam.published;
      saveState();
      renderExams();
      showToast(exam.published ? 'Exam published.' : 'Exam unpublished.');
    }

    if (action === 'delete-exam') {
      state.exams = state.exams.filter((item) => item.id !== id);
      state.attempts = state.attempts.filter((attempt) => attempt.examId !== id);
      saveState();
      renderAll();
      showToast('Exam deleted.');
    }
  }

  function bindQuestionBank() {
    document.getElementById('questionModeTabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-mode]');
      if (!button) return;
      questionMode = button.dataset.mode;
      document.querySelectorAll('.segmented-control__btn').forEach((item) => item.classList.toggle('is-active', item === button));
      document.querySelectorAll('.mode-panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.id === `${questionMode}Form` || panel.id === 'jsonImportPanel' && questionMode === 'json');
      });
      updateQuestionPreview();
    });

    document.getElementById('addOptionBtn').addEventListener('click', () => {
      document.getElementById('optionList').appendChild(createOptionRow());
      updateOptionIndexes();
      updateQuestionPreview();
    });

    document.getElementById('addSubQuestionBtn').addEventListener('click', () => {
      document.getElementById('subQuestionList').appendChild(createSubQuestionRow());
      updateQuestionPreview();
    });

    resetOptions();
    resetSubQuestions();

    ['mcqQuestion', 'mcqExplanation', 'mcqSection', 'cqStimulus', 'cqSection'].forEach((id) => {
      document.getElementById(id).addEventListener('input', updateQuestionPreview);
    });

    document.getElementById('mcqImage').addEventListener('change', async (event) => {
      mcqImageData = await readFileAsDataUrl(event.target.files?.[0]);
      updateQuestionPreview();
    });

    document.getElementById('cqImage').addEventListener('change', async (event) => {
      cqImageData = await readFileAsDataUrl(event.target.files?.[0]);
      updateQuestionPreview();
    });

    document.getElementById('mcqForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const options = [...document.querySelectorAll('.option-row')].map((row) => ({
        text: row.querySelector('.option-row__text').value.trim(),
        correct: row.querySelector('.option-row__correct').checked,
      })).filter((option) => option.text);
      const correctIndex = options.findIndex((option) => option.correct);
      if (!options.length || correctIndex < 0) {
        return showToast('Add options and choose a correct answer.', 'error');
      }
      state.questions.unshift({
        id: uid('question'),
        type: 'mcq',
        course: document.getElementById('mcqCourse').value.trim(),
        section: document.getElementById('mcqSection').value.trim(),
        question: document.getElementById('mcqQuestion').value.trim(),
        options: options.map((option) => option.text),
        correct: correctIndex,
        explanation: document.getElementById('mcqExplanation').value.trim(),
        tags: parseCSV(document.getElementById('mcqTags').value),
        difficulty: document.getElementById('mcqDifficulty').value,
        image: mcqImageData,
        createdAt: new Date().toISOString(),
      });
      saveState();
      event.target.reset();
      mcqImageData = '';
      resetOptions();
      renderAll();
      showToast('MCQ added to question bank.');
    });

    document.getElementById('cqForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const subQuestions = [...document.querySelectorAll('.sub-question-row')].map((row) => ({
        label: row.querySelector('.sub-question-row__label').value.trim(),
        prompt: row.querySelector('.sub-question-row__prompt').value.trim(),
        answer: row.querySelector('.sub-question-row__answer').value.trim(),
      })).filter((item) => item.prompt);
      state.questions.unshift({
        id: uid('question'),
        type: 'cq',
        course: document.getElementById('cqCourse').value.trim(),
        section: document.getElementById('cqSection').value.trim(),
        stimulus: document.getElementById('cqStimulus').value.trim(),
        subQuestions,
        image: cqImageData,
        createdAt: new Date().toISOString(),
      });
      saveState();
      event.target.reset();
      cqImageData = '';
      resetSubQuestions();
      renderAll();
      showToast('CQ added to question bank.');
    });

    document.getElementById('jsonImportFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      document.getElementById('jsonImportText').value = await file.text();
    });

    document.getElementById('importJsonBtn').addEventListener('click', () => {
      try {
        const payload = JSON.parse(document.getElementById('jsonImportText').value);
        if (!Array.isArray(payload.questions)) throw new Error();
        payload.questions.forEach((question) => {
          if (!question.question || !Array.isArray(question.options) || typeof question.correct !== 'number') throw new Error();
          state.questions.unshift({
            id: uid('question'),
            type: question.type || 'mcq',
            course: question.course || '',
            section: question.section || '',
            question: question.question,
            options: question.options,
            correct: question.correct,
            explanation: question.explanation || '',
            tags: question.tags || [],
            difficulty: question.difficulty || 'Medium',
            image: question.image || '',
            createdAt: new Date().toISOString(),
          });
        });
        document.getElementById('jsonImportMessage').textContent = 'Questions imported successfully.';
        saveState();
        renderAll();
        showToast('JSON import complete.');
      } catch {
        document.getElementById('jsonImportMessage').textContent = 'Invalid JSON format. Please verify the structure.';
        showToast('JSON validation failed.', 'error');
      }
    });

    updateQuestionPreview();
  }

  function createOptionRow(option = {}) {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
      <span class="option-row__index"></span>
      <input class="option-row__text" type="text" placeholder="Option text" value="${escapeAttr(option.text || '')}" />
      <label class="option-row__flag"><input class="option-row__correct" type="radio" name="correctOption" ${option.correct ? 'checked' : ''} /> Correct</label>
      <button type="button" class="icon-button">Remove</button>
    `;
    row.querySelector('.icon-button').addEventListener('click', () => {
      row.remove();
      updateOptionIndexes();
      updateQuestionPreview();
    });
    row.querySelectorAll('input').forEach((input) => input.addEventListener('input', updateQuestionPreview));
    return row;
  }

  function createSubQuestionRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'sub-question-row';
    row.innerHTML = `
      <input class="sub-question-row__label" type="text" placeholder="Label (A, B, C)" value="${escapeAttr(item.label || '')}" />
      <textarea class="sub-question-row__prompt" rows="2" placeholder="Sub question prompt">${escapeHtml(item.prompt || '')}</textarea>
      <textarea class="sub-question-row__answer" rows="2" placeholder="Answer">${escapeHtml(item.answer || '')}</textarea>
      <button type="button" class="icon-button">Remove</button>
    `;
    row.querySelector('.icon-button').addEventListener('click', () => {
      row.remove();
      updateQuestionPreview();
    });
    row.querySelectorAll('input, textarea').forEach((input) => input.addEventListener('input', updateQuestionPreview));
    return row;
  }

  function updateOptionIndexes() {
    document.querySelectorAll('.option-row').forEach((row, index) => {
      row.querySelector('.option-row__index').textContent = String.fromCharCode(65 + index);
    });
  }

  function resetOptions() {
    const list = document.getElementById('optionList');
    list.innerHTML = '';
    for (let i = 0; i < 4; i += 1) list.appendChild(createOptionRow());
    updateOptionIndexes();
  }

  function resetSubQuestions() {
    const list = document.getElementById('subQuestionList');
    list.innerHTML = '';
    ['A', 'B'].forEach((label) => list.appendChild(createSubQuestionRow({ label })));
  }

  function updateQuestionPreview() {
    const preview = document.getElementById('questionPreview');
    if (questionMode === 'mcq') {
      const options = [...document.querySelectorAll('.option-row')].map((row, index) => {
        const text = row.querySelector('.option-row__text').value.trim();
        if (!text) return '';
        return `<li>${String.fromCharCode(65 + index)}. ${escapeHtml(text)}</li>`;
      }).filter(Boolean).join('');
      preview.innerHTML = `
        <div class="preview-block">
          <h4>${escapeHtml(document.getElementById('mcqQuestion').value || 'Question preview')}</h4>
          ${mcqImageData ? `<img src="${mcqImageData}" alt="Question preview" class="preview-image" />` : ''}
          <ol>${options || '<li>Add options to preview.</li>'}</ol>
          <p>${escapeHtml(document.getElementById('mcqExplanation').value || '')}</p>
        </div>
      `;
    } else if (questionMode === 'cq') {
      const subs = [...document.querySelectorAll('.sub-question-row')].map((row) => {
        const label = row.querySelector('.sub-question-row__label').value.trim() || 'A';
        const prompt = row.querySelector('.sub-question-row__prompt').value.trim();
        const answer = row.querySelector('.sub-question-row__answer').value.trim();
        if (!prompt) return '';
        return `<div class="preview-sub"><strong>${escapeHtml(label)}.</strong> ${escapeHtml(prompt)}<div class="muted-copy">${escapeHtml(answer)}</div></div>`;
      }).join('');
      preview.innerHTML = `
        <div class="preview-block">
          <h4>${escapeHtml(document.getElementById('cqStimulus').value || 'Stimulus preview')}</h4>
          ${cqImageData ? `<img src="${cqImageData}" alt="Stimulus preview" class="preview-image" />` : ''}
          ${subs || '<p>Add sub questions to preview.</p>'}
        </div>
      `;
    } else {
      preview.innerHTML = '<div class="preview-block"><p>JSON imported questions will appear in the saved list.</p></div>';
    }
    queueTypeset();
  }

  function renderQuestions() {
    const list = document.getElementById('questionList');
    if (!state.questions.length) {
      list.innerHTML = emptyState('No questions created yet.');
      return;
    }
    list.innerHTML = state.questions.map((question) => `
      <article class="entity-card entity-card--stacked">
        <div class="entity-card__head">
          <div>
            <h4>${escapeHtml(question.type.toUpperCase())} · ${escapeHtml(question.section || 'General')}</h4>
            <p>${escapeHtml(question.question || question.stimulus || 'Question')}</p>
          </div>
          <button class="toolbar-button toolbar-button--danger" data-delete-question="${question.id}">Delete</button>
        </div>
        ${question.type === 'mcq' ? `<p class="muted-copy">Options: ${question.options.map(escapeHtml).join(' | ')}</p>` : `<p class="muted-copy">Sub questions: ${(question.subQuestions || []).length}</p>`}
      </article>
    `).join('');
    list.querySelectorAll('[data-delete-question]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.deleteQuestion;
        state.questions = state.questions.filter((question) => question.id !== id);
        state.exams.forEach((exam) => { exam.questionIds = exam.questionIds.filter((questionId) => questionId !== id); });
        saveState();
        renderAll();
        showToast('Question removed.');
      });
    });
  }

  function bindStudentsModule() {
    document.getElementById('studentForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const student = {
        id: uid('student'),
        name: document.getElementById('studentName').value.trim(),
        studentId: document.getElementById('studentStudentId').value.trim(),
        email: document.getElementById('studentEmail').value.trim(),
        course: document.getElementById('studentCourse').value.trim(),
        active: true,
        createdAt: new Date().toISOString(),
      };
      state.students.unshift(student);
      saveState();
      event.target.reset();
      renderStudents();
      populateAnalyticsSelectors();
      showToast('Student created.');
    });

    document.getElementById('studentCsvFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (file) document.getElementById('studentCsvText').value = await file.text();
    });

    document.getElementById('importStudentsBtn').addEventListener('click', () => {
      const rows = parseCSVRows(document.getElementById('studentCsvText').value);
      rows.forEach((row) => {
        if (!row.name && !row.studentId) return;
        state.students.unshift({ id: uid('student'), name: row.name || '', studentId: row.studentId || '', email: row.email || '', course: row.course || '', active: true, createdAt: new Date().toISOString() });
      });
      saveState();
      renderStudents();
      populateAnalyticsSelectors();
      showToast('CSV students imported.');
    });
  }

  function renderStudents() {
    const list = document.getElementById('studentList');
    if (!state.students.length) {
      list.innerHTML = emptyState('No students added yet.');
      return;
    }
    list.innerHTML = state.students.map((student) => `
      <article class="entity-card entity-card--stacked">
        <div class="entity-card__head">
          <div>
            <h4>${escapeHtml(student.name)}</h4>
            <p>${escapeHtml(student.studentId)} · ${escapeHtml(student.email || 'No email')} · ${escapeHtml(student.course || 'No course')}</p>
          </div>
          <span class="status-pill ${student.active ? 'is-live' : ''}">${student.active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="entity-actions">
          <button class="toolbar-button" data-toggle-student="${student.id}">${student.active ? 'Deactivate' : 'Activate'}</button>
          <button class="toolbar-button toolbar-button--danger" data-delete-student="${student.id}">Delete</button>
        </div>
      </article>
    `).join('');
    list.querySelectorAll('[data-toggle-student]').forEach((button) => button.addEventListener('click', () => {
      const student = state.students.find((item) => item.id === button.dataset.toggleStudent);
      if (!student) return;
      student.active = !student.active;
      saveState();
      renderStudents();
      renderAnalytics();
    }));
    list.querySelectorAll('[data-delete-student]').forEach((button) => button.addEventListener('click', () => {
      state.students = state.students.filter((item) => item.id !== button.dataset.deleteStudent);
      saveState();
      renderStudents();
      populateAnalyticsSelectors();
    }));
  }

  function bindAnalyticsModule() {
    document.getElementById('attemptForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const attempt = {
        id: uid('attempt'),
        examId: document.getElementById('attemptExam').value,
        studentId: document.getElementById('attemptStudent').value,
        score: Number(document.getElementById('attemptScore').value || 0),
        total: Number(document.getElementById('attemptTotal').value || 0),
        correctIds: parseCSV(document.getElementById('attemptCorrectIds').value),
        incorrectIds: parseCSV(document.getElementById('attemptIncorrectIds').value),
        createdAt: new Date().toISOString(),
      };
      state.attempts.unshift(attempt);
      saveState();
      event.target.reset();
      renderAnalytics();
      showToast('Attempt saved.');
    });
    populateAnalyticsSelectors();
  }

  function populateAnalyticsSelectors() {
    const examSelect = document.getElementById('attemptExam');
    const studentSelect = document.getElementById('attemptStudent');
    examSelect.innerHTML = state.exams.length ? state.exams.map((exam) => `<option value="${exam.id}">${escapeHtml(exam.title)}</option>`).join('') : '<option value="">No exams</option>';
    studentSelect.innerHTML = state.students.length ? state.students.map((student) => `<option value="${student.id}">${escapeHtml(student.name)}</option>`).join('') : '<option value="">No students</option>';
  }

  function renderAnalytics() {
    const attempts = state.attempts;
    const averageScore = attempts.length ? (attempts.reduce((sum, item) => sum + ((item.score / (item.total || 1)) * 100), 0) / attempts.length).toFixed(1) : '0.0';
    const questionAccuracy = {};
    attempts.forEach((attempt) => {
      attempt.correctIds.forEach((id) => {
        questionAccuracy[id] = questionAccuracy[id] || { correct: 0, total: 0 };
        questionAccuracy[id].correct += 1;
        questionAccuracy[id].total += 1;
      });
      attempt.incorrectIds.forEach((id) => {
        questionAccuracy[id] = questionAccuracy[id] || { correct: 0, total: 0 };
        questionAccuracy[id].total += 1;
      });
    });

    document.getElementById('analyticsSummary').innerHTML = `
      <article class="summary-card"><span>Exam Attempts</span><strong>${attempts.length}</strong></article>
      <article class="summary-card"><span>Average Score</span><strong>${averageScore}%</strong></article>
      <article class="summary-card"><span>Students</span><strong>${state.students.length}</strong></article>
      <article class="summary-card"><span>Questions</span><strong>${state.questions.length}</strong></article>
    `;

    const typeCounts = ['MCQ', 'CQ'].map((type) => state.exams.filter((exam) => exam.examType === type).length);
    analyticsChart?.destroy();
    accuracyChart?.destroy();

    const analyticsCanvas = document.getElementById('analyticsChart');
    analyticsChart = new Chart(analyticsCanvas, {
      type: 'bar',
      data: {
        labels: ['MCQ Exams', 'CQ Exams', 'Published', 'Draft'],
        datasets: [{ label: 'Exams', data: [typeCounts[0], typeCounts[1], state.exams.filter((exam) => exam.published).length, state.exams.filter((exam) => !exam.published).length], backgroundColor: ['#4f89ff', '#13b6aa', '#22b55f', '#94a3b8'] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });

    const accuracyLabels = Object.keys(questionAccuracy).slice(0, 6);
    accuracyChart = new Chart(document.getElementById('accuracyChart'), {
      type: 'line',
      data: {
        labels: accuracyLabels.length ? accuracyLabels : ['No data'],
        datasets: [{ label: 'Accuracy %', data: accuracyLabels.length ? accuracyLabels.map((key) => Math.round((questionAccuracy[key].correct / questionAccuracy[key].total) * 100)) : [0], borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.15)', tension: 0.35, fill: true }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function renderDevices() {
    const list = document.getElementById('deviceList');
    if (!state.devices.length) {
      list.innerHTML = emptyState('No session devices recorded.');
      return;
    }
    const session = getSession();
    list.innerHTML = state.devices.map((device) => `
      <article class="entity-card">
        <div>
          <h4>${escapeHtml(device.label)}</h4>
          <p>${escapeHtml(device.browser)} · ${escapeHtml(device.role || 'guest')} · ${new Date(device.lastActive).toLocaleString()}</p>
        </div>
        <button class="toolbar-button ${session?.deviceId === device.id ? 'toolbar-button--danger' : ''}" data-force-device="${device.id}">Force Logout</button>
      </article>
    `).join('');
    list.querySelectorAll('[data-force-device]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.forceDevice;
      state.devices = state.devices.filter((device) => device.id !== id);
      if (getSession()?.deviceId === id) localStorage.removeItem(SESSION_KEY);
      saveState();
      renderSessionMeta();
      renderDevices();
      showToast('Device session removed.');
    }));
  }

  function bindPasswordModule() {
    document.getElementById('passwordForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const current = document.getElementById('currentPassword').value;
      const next = document.getElementById('newPassword').value;
      const confirm = document.getElementById('confirmPassword').value;
      if (current !== state.credentials.adminPassword) return showToast('Current password is incorrect.', 'error');
      if (!next || next !== confirm) return showToast('New passwords do not match.', 'error');
      state.credentials.adminPassword = next;
      saveState();
      event.target.reset();
      showToast('Admin password updated.');
    });
  }

  function ensureCurrentDevice() {
    const session = getSession();
    if (!session?.deviceId) return;
    let device = state.devices.find((item) => item.id === session.deviceId);
    if (!device) {
      device = {
        id: session.deviceId,
        label: session.label || 'Current Device',
        browser: navigator.userAgent,
        role: session.role,
        lastActive: new Date().toISOString(),
      };
      state.devices.unshift(device);
      saveState();
    } else {
      device.lastActive = new Date().toISOString();
      saveState();
    }
  }

  function renderSessionMeta() {
    const session = getSession();
    document.getElementById('sessionBadge').textContent = session ? `${session.role} session active` : 'No active admin session';
    document.getElementById('storageBadge').textContent = `${state.exams.length} exams · ${state.questions.length} questions · ${state.students.length} students`;
  }

  function renderAll() {
    renderSessionMeta();
    renderExams();
    renderQuestions();
    renderStudents();
    renderAnalytics();
    renderDevices();
    populateAnalyticsSelectors();
    queueTypeset();
  }

  function readFileAsDataUrl(file) {
    if (!file) return Promise.resolve('');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function parseCSV(text) {
    return text.split(',').map((item) => item.trim()).filter(Boolean);
  }

  function parseCSVRows(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].split(',').map((item) => item.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((item) => item.trim());
      return Object.fromEntries(header.map((key, index) => [key, values[index] || '']));
    });
  }

  function upsert(collection, item) {
    const index = collection.findIndex((entry) => entry.id === item.id);
    if (index === -1) collection.unshift(item);
    else collection[index] = { ...collection[index], ...item };
  }

  function emptyState(message) {
    return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value = '') {
    return escapeHtml(value);
  }
})();
