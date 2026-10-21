(() => {
  'use strict';

  const STORAGE_KEYS = {
    notes: 'studypilot_notes_v1',
    events: 'studypilot_events_v1',
    tasks: 'studypilot_tasks_v1',
    profile: 'studypilot_profile_v1',
    theme: 'studypilot_theme_v1',
    metrics: 'studypilot_metrics_v1'
  };
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TEXT_CHARS = 120000; // Helps keep localStorage within browser quotas.
  const SAMPLE_NOTE = `DATA STRUCTURES — QUICK NOTES

A data structure is a way to organize and store data so it can be used efficiently.

An array stores elements in contiguous memory locations and lets you access an element by its index.

A linked list stores data in nodes. Each node contains data and a link to the next node. Unlike an array, linked-list nodes do not need to be in contiguous memory.

A stack follows the Last In, First Out (LIFO) principle. The main operations are push, which adds an item, and pop, which removes the top item.

A queue follows the First In, First Out (FIFO) principle. Enqueue adds an item to the rear, while dequeue removes an item from the front.

Linear search checks elements one by one and works even when the data is unsorted. Its worst-case time complexity is O(n).

Binary search repeatedly halves the search range. It requires sorted data and has O(log n) time complexity.

Time complexity describes how an algorithm's running time grows as the input size grows. Space complexity describes how its memory use grows.

A tree is a hierarchical data structure made of nodes and edges. A graph represents relationships using vertices and edges.

Recursion happens when a function calls itself. A recursive solution needs a base case to stop the calls and a recursive case that moves toward that base case.`;

  const DEFAULT_PROFILE = { name: 'Student', email: '' };
  let profile = loadJSON(STORAGE_KEYS.profile, DEFAULT_PROFILE) || { ...DEFAULT_PROFILE };
  let notes = loadJSON(STORAGE_KEYS.notes, []);
  let events = loadJSON(STORAGE_KEYS.events, null);
  let tasks = loadJSON(STORAGE_KEYS.tasks, []);
  let metrics = loadJSON(STORAGE_KEYS.metrics, { quizzesTaken: 0, correctAnswers: 0 });
  let currentView = 'dashboard';
  let globalSearchQuery = '';
  let selectedEventFilter = 'Upcoming';
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let currentQuiz = [];
  let currentQuizTitle = '';
  let currentQuizScore = null;
  let flashcards = [];
  let flashcardIndex = 0;
  let flashcardFlipped = false;
  let lastSummary = '';
  let editingEventId = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const icon = (name, className = 'icon') => `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  // Safe storage helpers: if localStorage is full or disabled, the app still works in memory.
  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from localStorage`, error);
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Could not save ${key} to localStorage`, error);
      return false;
    }
  }
  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `sp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function formatBytes(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  function formatDate(dateInput, options = { month: 'short', day: 'numeric', year: undefined }) {
    const date = new Date(`${dateInput}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(dateInput || '');
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
  function localISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  function dayOffset(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return localISO(date);
  }
  function relativeDate(dateInput) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = new Date(`${dateInput}T00:00:00`);
    const diff = Math.round((date - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} ago`;
    return `In ${diff} days`;
  }
  function showToast(message, kind = 'success') {
    const root = $('#toastRoot');
    const node = document.createElement('div');
    node.className = `toast ${kind === 'error' ? 'error' : ''}`;
    node.innerHTML = `${icon(kind === 'error' ? 'close' : 'check')}<span>${escapeHTML(message)}</span>`;
    root.appendChild(node);
    window.setTimeout(() => node.remove(), 3400);
  }

  // Example reminders are deliberately marked as demo content so no one mistakes them for a real timetable.
  function createDemoEvents() {
    return [
      { id: uid(), title: 'Data Structures Quiz', type: 'Exam', date: dayOffset(3), time: '10:00', notes: 'Example event — replace with your real schedule.', demo: true },
      { id: uid(), title: 'Database Systems Assignment', type: 'Deadline', date: dayOffset(5), time: '23:00', notes: 'Example deadline — replace with your real schedule.', demo: true },
      { id: uid(), title: 'Technical Seminar', type: 'Other', date: dayOffset(8), time: '14:00', notes: 'Example event — replace with your real schedule.', demo: true },
      { id: uid(), title: 'Machine Learning Exam', type: 'Exam', date: dayOffset(13), time: '09:00', notes: 'Example event — replace with your real schedule.', demo: true }
    ];
  }
  if (!Array.isArray(events)) {
    events = createDemoEvents();
    saveJSON(STORAGE_KEYS.events, events);
  }
  if (!Array.isArray(notes)) notes = [];
  if (!Array.isArray(tasks)) tasks = [];
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) metrics = { quizzesTaken: 0, correctAnswers: 0 };
  let chatHistory = loadJSON('studypilot_chat_v1', []);
  if (!Array.isArray(chatHistory)) chatHistory = [];

  function persistState() {
    const notesSaved = saveJSON(STORAGE_KEYS.notes, notes);
    saveJSON(STORAGE_KEYS.events, events);
    saveJSON(STORAGE_KEYS.tasks, tasks);
    saveJSON(STORAGE_KEYS.profile, profile);
    saveJSON(STORAGE_KEYS.metrics, metrics);
    saveJSON('studypilot_chat_v1', chatHistory.slice(-50));
    if (!notesSaved) showToast('Your browser storage is full. Remove large notes or download a backup.', 'error');
    syncProfileUI();
  }
  function syncProfileUI() {
    const name = profile.name || 'Student';
    const initial = name.trim().charAt(0).toUpperCase() || 'S';
    ['#sidebarName', '#topbarName'].forEach(selector => { const node = $(selector); if (node) node.textContent = name; });
    ['#sidebarAvatar', '#topbarAvatar'].forEach(selector => { const node = $(selector); if (node) node.textContent = initial; });
    const count = $('#sidebarNoteCount'); if (count) count.textContent = notes.length;
  }

  function openApp(view = 'dashboard') {
    $('#landingView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    document.body.classList.add('inside-app');
    openView(view);
  }
  function showLanding() {
    $('#appView').classList.add('hidden');
    $('#landingView').classList.remove('hidden');
    $('#floatingChatButton').classList.add('hidden');
    $('#chatDrawer').classList.add('hidden');
    document.body.classList.remove('inside-app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openView(view) {
    currentView = view;
    const titles = { dashboard: 'Dashboard', events: 'Events & reminders', uploads: 'My notes', studyplan: 'Study plan', summarize: 'Summarize notes', quiz: 'Practice quiz', flashcards: 'Flashcards', tutor: 'Ask from notes', settings: 'Settings' };
    $('#breadcrumbCurrent').textContent = titles[view] || 'Dashboard';
    $$('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('#sidebar').classList.remove('mobile-open');
    $('#chatDrawer').classList.add('hidden');
    $('#floatingChatButton').classList.toggle('hidden', view === 'dashboard');
    const root = $('#appContent');
    root.innerHTML = renderView(view);
    syncProfileUI();
    if (view === 'dashboard') bindDashboardDate();
    if (view === 'events') renderCalendar();
    if (view === 'tutor') scrollChatToBottom(root);
    if (view === 'uploads') updateFileInputLabel();
    root.focus({ preventScroll: true });
  }
  function rerenderCurrentView() {
    const scrollTop = window.scrollY;
    openView(currentView);
    window.scrollTo(0, scrollTop);
  }
  function bindDashboardDate() {
    const node = $('#todayLabel');
    if (node) node.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  }

  // Main screen routing: a small single-page app keeps the hackathon setup simple.
  function renderView(view) {
    switch (view) {
      case 'dashboard': return renderDashboard();
      case 'events': return renderEvents();
      case 'uploads': return renderUploads();
      case 'summarize': return renderSummarize();
      case 'quiz': return renderQuizPage();
      case 'flashcards': return renderFlashcards();
      case 'tutor': return renderTutor();
      case 'studyplan': return renderStudyPlan();
      case 'settings': return renderSettings();
      default: return renderDashboard();
    }
  }

  function renderDashboard() {
    const upcoming = getUpcomingEvents().slice(0, 3);
    const taskHTML = upcoming.length ? upcoming.map(event => `
      <div class="task-row"><span class="task-dot ${event.type === 'Deadline' ? 'mint' : event.type === 'Other' ? 'peach' : 'lilac'}"></span><div class="task-copy"><b>${escapeHTML(event.title)}</b><small>${escapeHTML(event.type)} · ${escapeHTML(formatDate(event.date, { month: 'short', day: 'numeric' }))}${event.demo ? ' · demo' : ''}</small></div><span class="task-when">${escapeHTML(relativeDate(event.date))}</span></div>`).join('') : `<div class="empty-inline">${icon('calendar')}No upcoming events yet.<br>Use Events & reminders to add one.</div>`;
    const emptyNote = notes.length === 0;
    return `
      <div class="dashboard-layout">
        <div class="dashboard-main">
          <div class="greeting-row"><div><span class="page-kicker">YOUR STUDY OVERVIEW</span><h1>Hey, ${escapeHTML((profile.name || 'learner').split(' ')[0])} <span aria-hidden="true">👋</span></h1><p>Make a little progress today. What are we learning?</p></div><div class="greeting-date">${icon('calendar')}<span id="todayLabel">Today</span></div></div>
          <div class="action-grid" aria-label="Quick study actions">
            <button class="action-card" data-action="go-view" data-view="uploads"><span class="benefit-icon icon-blue">${icon('upload')}</span><h3>Upload files</h3><p>Add lecture notes and study material.</p></button>
            <button class="action-card" data-action="go-view" data-view="tutor"><span class="benefit-icon icon-purple">${icon('message')}</span><h3>Take help</h3><p>Ask questions from your notes.</p></button>
            <button class="action-card" data-action="go-view" data-view="summarize"><span class="benefit-icon icon-mint">${icon('sparkles')}</span><h3>Summarize</h3><p>Turn long notes into key points.</p></button>
            <button class="action-card" data-action="go-view" data-view="quiz"><span class="benefit-icon icon-peach">${icon('target')}</span><h3>Practice quiz</h3><p>Test your recall with MCQs.</p></button>
          </div>
          ${emptyNote ? `<div class="status-banner" style="margin-bottom:16px">${icon('file')}<div><b>Your notes are the starting point.</b> Upload a PDF, DOCX, TXT, or Markdown file to enable note-based tools. Or use the sample note to preview the workflow. <button class="text-button" data-action="load-sample-note">Load sample notes ${icon('arrow')}</button></div></div>` : ''}
          <div class="dashboard-lower">
            <section class="panel"><div class="panel-heading"><h2>Quick stats</h2><small>In this browser</small></div><div class="stats-grid">
              <div class="stat-card"><span class="stat-icon">${icon('file')}</span><span class="stat-label">Notes uploaded</span><strong class="stat-value">${notes.length}</strong></div>
              <div class="stat-card"><span class="stat-icon" style="color:#8a5be8;background:#f0eaff">${icon('target')}</span><span class="stat-label">Quizzes completed</span><strong class="stat-value">${Number(metrics.quizzesTaken) || 0}</strong></div>
              <div class="stat-card"><span class="stat-icon" style="color:#159b86;background:#e3f8f2">${icon('clock')}</span><span class="stat-label">Planned sessions</span><strong class="stat-value">${tasks.length}</strong></div>
              <div class="stat-card"><span class="stat-icon" style="color:#d98744;background:#fff0e3">${icon('calendar')}</span><span class="stat-label">Upcoming events</span><strong class="stat-value">${getUpcomingEvents().length}</strong></div>
            </div></section>
            <section class="panel"><div class="panel-heading"><h2>Coming up</h2><button class="text-button" data-action="go-view" data-view="events">View all ${icon('arrow')}</button></div><div class="task-list">${taskHTML}</div></section>
          </div>
          <section class="panel" style="margin-top:15px"><div class="panel-heading"><h2>Pick up where you left off</h2><button class="text-button" data-action="go-view" data-view="uploads">View notes ${icon('arrow')}</button></div>${notes.length ? `<div class="file-list">${notes.slice(0,2).map(note => `<div class="file-row"><span class="file-type-icon ${fileTypeClass(note.name)}">${icon('file')}</span><div class="file-details"><b>${escapeHTML(note.name)}</b><small>${escapeHTML(formatBytes(note.bytes || 0))} · ${escapeHTML(formatDate(localISO(new Date(note.uploadedAt || Date.now())), { month:'short', day:'numeric' }))}</small></div><button class="btn btn-ghost btn-sm" data-action="open-note" data-note-id="${escapeHTML(note.id)}">Open note</button></div>`).join('')}</div>` : `<div class="empty-inline">${icon('book')}Your recent notes will appear here after you upload them.</div>`}</section>
        </div>
        ${renderChatWindow('dashboard-chat', 'dashboard')}
      </div>`;
  }

  function renderChatWindow(wrapperClass = 'dashboard-chat', mode = 'dashboard') {
    const context = notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'} available` : 'No notes uploaded yet';
    const messageID = mode === 'drawer' ? 'drawer-chat' : mode === 'tutor' ? 'tutor-chat' : 'main-chat';
    const prompts = ['Explain a difficult concept', 'Summarize my notes', 'Make me a quiz'];
    const intro = chatHistory.length ? '' : `
      <div class="chat-message"><span class="message-avatar">${icon('sparkles')}</span><div><div class="message-bubble"><p>Hi ${escapeHTML((profile.name || 'there').split(' ')[0])}! 👋</p><p>I'm StudyBot, your study companion. Upload your notes, then ask me about the concepts you want to understand.</p></div><div class="message-time">StudyPilot demo assistant</div></div></div>`;
    return `<aside class="${wrapperClass}">
      <div class="chat-header"><span class="bot-avatar">${icon('message')}</span><div class="chat-header-copy"><b>StudyBot</b><small><span class="online-dot"></span> Demo mode · note-aware</small></div>${mode === 'drawer' ? `<button class="chat-header-action" data-action="toggle-chat-drawer" aria-label="Close StudyBot">×</button>` : mode === 'dashboard' ? `<button class="chat-header-action" data-action="minimize-dashboard-chat" aria-label="Scroll chat">–</button>` : ''}</div>
      <div class="chat-context">${icon('book')}<span><b>Knowledge source:</b> ${escapeHTML(context)}</span></div>
      <div class="chat-messages" data-chat-messages="${messageID}" aria-live="polite">${intro}${renderChatHistoryHTML()}</div>
      <div class="chat-quick-prompts">${prompts.map(prompt => `<button type="button" class="quick-prompt" data-action="send-prompt" data-prompt="${escapeHTML(prompt)}">${escapeHTML(prompt)}</button>`).join('')}</div>
      <form class="chat-compose" data-chat-form="${messageID}"><textarea name="message" rows="1" placeholder="Ask a question about your notes..." aria-label="Message StudyBot" required></textarea><button class="chat-send" type="submit" aria-label="Send message">${icon('send')}</button></form>
      <div class="chat-disclaimer">Prototype mode: answers are retrieved from note text, not a hosted AI model.</div>
    </aside>`;
  }
  function renderChatHistoryHTML() {
    return chatHistory.slice(-30).map(message => renderMessageHTML(message)).join('');
  }
  function renderMessageHTML(message) {
    const user = message.role === 'user';
    return `<div class="chat-message ${user ? 'user' : 'assistant'}">${user ? '' : `<span class="message-avatar">${icon('sparkles')}</span>`}<div><div class="message-bubble">${escapeHTML(message.text).replace(/\n/g, '<br>')}</div><div class="message-time">${user ? 'You' : 'StudyBot'}</div></div></div>`;
  }
  function renderChatMessagesEverywhere() {
    $$('[data-chat-messages]').forEach(container => {
      const intro = chatHistory.length ? '' : `<div class="chat-message"><span class="message-avatar">${icon('sparkles')}</span><div><div class="message-bubble"><p>Hi ${escapeHTML((profile.name || 'there').split(' ')[0])}! 👋</p><p>I'm StudyBot, your study companion. Upload your notes, then ask me about the concepts you want to understand.</p></div><div class="message-time">StudyPilot demo assistant</div></div></div>`;
      container.innerHTML = intro + renderChatHistoryHTML();
      container.scrollTop = container.scrollHeight;
    });
  }
  function scrollChatToBottom(root = document) {
    $$('[data-chat-messages]', root).forEach(container => { container.scrollTop = container.scrollHeight; });
  }
  function normalizeWords(text) {
    const stop = new Set(['what','when','where','which','who','whom','whose','why','how','does','do','did','is','are','was','were','the','a','an','and','or','but','for','to','from','in','on','at','of','with','about','my','me','you','your','our','their','this','that','these','those','it','as','be','can','could','would','should','please','explain','tell','give','make','notes','note','based','according','mean','means']);
    return (String(text).toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(word => word.length > 1 && !stop.has(word));
  }
  function getNoteSentences(text) {
    const normalized = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    const parts = normalized.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).filter(part => part.length > 22 && /[a-zA-Z]/.test(part) && !/^[A-Z0-9\s—-]+$/.test(part));
    return [...new Set(parts)].slice(0, 220);
  }
  function rankSentences(text, query, limit = 3) {
    const terms = [...new Set(normalizeWords(query))];
    const sentences = getNoteSentences(text);
    if (!terms.length) return sentences.slice(0, limit);
    return sentences.map((sentence, index) => {
      const lower = sentence.toLowerCase();
      const score = terms.reduce((total, term) => total + (lower.includes(term) ? (term.length > 5 ? 2 : 1) : 0), 0);
      return { sentence, score, index };
    }).filter(item => item.score > 0).sort((a,b) => b.score - a.score || a.index - b.index).slice(0, limit).map(item => item.sentence);
  }
  function makeExtractiveSummary(text, maxSentences = 5) {
    const sentences = getNoteSentences(text);
    if (!sentences.length) return 'There is not enough readable text in this file to summarize.';
    const freq = new Map();
    sentences.forEach(sentence => normalizeWords(sentence).forEach(term => freq.set(term, (freq.get(term) || 0) + 1)));
    const ranked = sentences.map((sentence, index) => {
      const terms = normalizeWords(sentence);
      const score = terms.reduce((sum, term) => sum + (freq.get(term) || 0), 0) / Math.max(terms.length, 1);
      return { sentence, index, score: score + (index === 0 ? .25 : 0) };
    }).sort((a,b) => b.score - a.score || a.index - b.index).slice(0, maxSentences).sort((a,b) => a.index - b.index);
    return ranked.map(item => item.sentence);
  }
  function answerFromNotes(question) {
    if (!notes.length) return 'I do not have any notes to refer to yet. Upload a PDF, DOCX, TXT, or Markdown file first, then ask me a question about its content.';
    const q = question.toLowerCase();
    if (/summari[sz]|key points|main points|overview/.test(q)) {
      const note = notes[0];
      const summary = makeExtractiveSummary(note.text, 5);
      return `Here are key points I can extract from “${note.name}”:\n${summary.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n')}\n\nThis prototype selects important-looking sentences from the uploaded text. A connected AI agent can provide a more natural, explanatory summary.`;
    }
    if (/flash ?cards?/.test(q)) return 'I can prepare revision cards from the notes I can read. Open **Flashcards** in the sidebar, choose a note, and start reviewing.';
    if (/quiz|test me|multiple choice|mcq/.test(q)) return 'Ready to practise? Open **Practice quiz** in the sidebar, choose one of your notes, select a question count, and generate a quiz.';
    if (/study plan|schedule|plan my/.test(q)) return 'Open **Study plan** to add focused study sessions. You can mark each session complete and keep your next task visible on the dashboard.';
    if (/website|websites|resource|resources|learn online/.test(q)) return 'These educational resources may help you go deeper: Khan Academy (https://www.khanacademy.org/), MDN Web Docs (https://developer.mozilla.org/), and GeeksforGeeks (https://www.geeksforgeeks.org/). Check that the chosen resource matches your course and level.';
    const terms = [...new Set(normalizeWords(question))];
    const ranked = [];
    for (const note of notes) {
      const relevant = rankSentences(note.text, question, 3);
      if (relevant.length) {
        const score = relevant.reduce((total, sentence) => total + terms.filter(term => sentence.toLowerCase().includes(term)).length, 0);
        ranked.push({ note, relevant, score });
      }
    }
    ranked.sort((a,b) => b.score - a.score);
    if (!ranked.length) return `I couldn't find a clear match for that question in the readable text of your uploaded notes. Try using a keyword or phrase from the notes, or upload a more text-readable version.\n\nNote: this local prototype retrieves relevant sentences; it does not reason like a full AI model yet.`;
    const best = ranked.slice(0, 2).map(item => `From “${item.note.name}”:\n${item.relevant.map(sentence => `• ${sentence}`).join('\n')}`).join('\n\n');
    return `I found these relevant parts of your notes:\n${best}\n\nI’m quoting matching note text so the demo stays grounded in your material. Connect a hosted AI tutor to explain the ideas more naturally and handle follow-up reasoning.`;
  }
  function sendChatMessage(text) {
    const message = String(text || '').trim();
    if (!message) return;
    chatHistory.push({ role: 'user', text: message, at: Date.now() });
    chatHistory.push({ role: 'assistant', text: answerFromNotes(message), at: Date.now() });
    chatHistory = chatHistory.slice(-50);
    persistState();
    renderChatMessagesEverywhere();
    if (currentView === 'dashboard') {
      // No navigation is required for the basic Q&A flow.
    }
  }

  function renderUploads() {
    const filteredNotes = globalSearchQuery ? notes.filter(note => note.name.toLowerCase().includes(globalSearchQuery.toLowerCase()) || String(note.text || '').toLowerCase().includes(globalSearchQuery.toLowerCase())) : notes;
    const noteList = filteredNotes.length ? filteredNotes.map(note => `
      <div class="file-row"><span class="file-type-icon ${fileTypeClass(note.name)}">${icon('file')}</span><div class="file-details"><b>${escapeHTML(note.name)}</b><small>${escapeHTML(formatBytes(note.bytes || 0))} · Added ${escapeHTML(formatDate(localISO(new Date(note.uploadedAt || Date.now())), { month:'short', day:'numeric', year:'numeric' }))} · ${escapeHTML(note.text ? `${note.text.length.toLocaleString()} readable characters` : 'No readable text')}</small>${note.text ? '<small class="file-status">' + icon('check') + ' Text ready for study tools</small>' : '<small style="color:#c9822d">No text extracted — try another file version.</small>'}</div><div class="file-actions"><button title="Preview note" aria-label="Preview note" data-action="open-note" data-note-id="${escapeHTML(note.id)}">${icon('file')}</button><button title="Delete note" aria-label="Delete note" data-action="delete-note" data-note-id="${escapeHTML(note.id)}">${icon('trash')}</button></div></div>`).join('') : globalSearchQuery ? `<div class="empty-inline">${icon('search')}No notes matched “${escapeHTML(globalSearchQuery)}”. <button class="text-button" data-action="clear-search">Clear search</button></div>` : `<div class="empty-inline">${icon('file')}No notes yet. Add course material above, or try the sample data to preview StudyPilot.</div>`;
    const selectedNote = notes.find(note => note.id === selectedNoteIdFromQuery()) || notes[0];
    return `<div class="page-title-row"><div><span class="page-kicker">YOUR KNOWLEDGE BASE</span><h1>My notes</h1><p>Upload course material and use it across StudyBot, summaries, quizzes, and flashcards.</p></div><button class="btn btn-primary" data-action="trigger-file-picker">${icon('plus')} Upload files</button></div>
      <div class="content-grid">
        <div class="stack">
          <section class="panel"><div class="panel-heading"><h2>Add study material</h2><span class="pill">Private to this browser</span></div><p class="panel-subtitle">Drop your files here. The text is extracted locally for this prototype.</p>
            <div id="mainDropzone" class="dropzone" role="button" tabindex="0" data-action="trigger-file-picker"><span class="dropzone-icon">${icon('upload')}</span><h3>Drag & drop files here</h3><p>or select files from your computer</p><button class="btn btn-primary btn-sm" type="button" data-action="trigger-file-picker">Choose files</button><small>PDF, DOCX, TXT, MD and CSV · Up to 10 MB per file</small></div>
            <input class="file-input" id="fileInputMain" type="file" accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv" multiple>
            <div class="status-banner" style="margin-top:13px">${icon('book')}<div><b>How your notes are used.</b> The local demo extracts readable text in your browser. Scanned PDFs may need OCR; no file is uploaded to an AI service by this prototype.</div></div>
          </section>
          <section class="panel"><div class="panel-heading"><h2>Recent uploads</h2><span class="pill gray">${notes.length} file${notes.length === 1 ? '' : 's'}</span></div><div class="file-list">${noteList}</div></section>
        </div>
        <div class="stack">
          <section class="panel"><div class="panel-heading"><h2>Try StudyPilot</h2></div><p class="panel-subtitle">No class notes ready? Load example text to try the workflow immediately.</p><button class="btn btn-soft btn-block" data-action="load-sample-note">${icon('book')} Load sample data structures notes</button><p class="small muted" style="margin:12px 0 0">The sample is fictional learning content for testing the interface.</p></section>
          <section class="panel"><div class="panel-heading"><h2>What happens next?</h2></div><div class="settings-list"><div class="settings-row"><span class="settings-row-icon">${icon('message')}</span><div class="settings-row-copy"><b>Ask from notes</b><p>Retrieve matching sentences from your uploaded text.</p></div></div><div class="settings-row"><span class="settings-row-icon">${icon('sparkles')}</span><div class="settings-row-copy"><b>Summarize</b><p>Extract key-looking sentences from one note.</p></div></div><div class="settings-row"><span class="settings-row-icon">${icon('target')}</span><div class="settings-row-copy"><b>Practice</b><p>Generate simple cloze-style questions from the notes.</p></div></div></div></section>
          ${selectedNote ? `<section class="panel"><div class="panel-heading"><h2>Latest note</h2><button class="text-button" data-action="open-note" data-note-id="${escapeHTML(selectedNote.id)}">Preview ${icon('arrow')}</button></div><b style="font-size:11px">${escapeHTML(selectedNote.name)}</b><p class="small muted">${escapeHTML((selectedNote.text || '').slice(0,180))}${(selectedNote.text || '').length > 180 ? '…' : ''}</p></section>` : ''}
        </div>
      </div>`;
  }
  function selectedNoteIdFromQuery() { return new URLSearchParams(window.location.search).get('note'); }
  function fileTypeClass(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    return ['txt','md','csv'].includes(ext) ? 'txt' : ext === 'docx' ? 'docx' : 'pdf';
  }
  function updateFileInputLabel() { /* Reserved for status feedback if upload states are expanded later. */ }

  async function extractTextFromFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (file.size > MAX_FILE_BYTES) throw new Error('Please choose a file smaller than 10 MB.');
    if (['txt','md','csv'].includes(extension)) return file.text();
    if (extension === 'pdf' || file.type === 'application/pdf') {
      if (!window.pdfjsLib) throw new Error('PDF reader did not load. Check your internet connection or try a TXT file.');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pageTexts = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        if (pageText.trim()) pageTexts.push(pageText);
      }
      return pageTexts.join('\n\n');
    }
    if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      if (!window.mammoth) throw new Error('DOCX reader did not load. Check your internet connection or try a TXT file.');
      const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value || '';
    }
    throw new Error(`“${file.name}” is not supported. Choose PDF, DOCX, TXT, MD, or CSV.`);
  }
  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      try {
        const text = (await extractTextFromFile(file)).slice(0, MAX_TEXT_CHARS);
        const note = { id: uid(), name: file.name, bytes: file.size, type: file.type, uploadedAt: new Date().toISOString(), text };
        notes.unshift(note);
        added += 1;
        persistState();
        if (!text.trim()) showToast(`${file.name}: no readable text found. Scanned PDFs may require OCR.`, 'error');
      } catch (error) {
        showToast(error.message || `Could not read ${file.name}.`, 'error');
      }
    }
    if (added) {
      persistState();
      showToast(`${added} file${added === 1 ? '' : 's'} added to My notes.`);
      rerenderCurrentView();
    }
  }
  function loadSampleNote() {
    const existing = notes.find(note => note.name === 'Data-Structures-Demo-Notes.txt');
    if (existing) { showToast('Sample notes are already in your library.'); return; }
    notes.unshift({ id: uid(), name: 'Data-Structures-Demo-Notes.txt', bytes: new Blob([SAMPLE_NOTE]).size, type: 'text/plain', uploadedAt: new Date().toISOString(), text: SAMPLE_NOTE });
    persistState();
    showToast('Sample notes added. Try asking StudyBot about stacks or queues.');
    rerenderCurrentView();
  }
  function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  }
  function openNotePreview(id) {
    const note = notes.find(item => item.id === id);
    if (!note) return;
    showModal(`<div class="modal-heading"><div><h2>${escapeHTML(note.name)}</h2><p>${escapeHTML(formatBytes(note.bytes || 0))} · Preview of extracted text</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="note-detail">${escapeHTML(note.text || 'No readable text was extracted from this file.')}</div><div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px"><button class="btn btn-soft" data-action="download-note" data-note-id="${escapeHTML(note.id)}">${icon('download')} Download text</button><button class="btn btn-primary" data-action="go-view" data-view="tutor">Ask StudyBot</button></div>`);
  }

  function noteOptions(selectedId = '') {
    if (!notes.length) return '<option value="">Upload a note first</option>';
    return notes.map(note => `<option value="${escapeHTML(note.id)}" ${note.id === selectedId ? 'selected' : ''}>${escapeHTML(note.name)}</option>`).join('');
  }
  function renderSummarize() {
    const first = notes[0];
    return `<div class="page-title-row"><div><span class="page-kicker">MAKE IT CLEAR</span><h1>Summarize your notes</h1><p>Pull the main ideas into a compact review sheet.</p></div><span class="pill mint">Extractive demo</span></div>
      <div class="content-grid">
        <section class="panel"><div class="panel-heading"><h2>Choose study material</h2></div><p class="panel-subtitle">Pick a note and generate a short extractive summary from its readable text.</p><div class="quiz-config"><div class="field"><label for="summaryNote">Select note</label><select id="summaryNote" ${notes.length ? '' : 'disabled'}>${noteOptions(first?.id || '')}</select></div><div class="field"><label for="summaryLength">Summary length</label><select id="summaryLength"><option value="3">3 key points</option><option value="5" selected>5 key points</option><option value="8">8 key points</option></select></div><button class="btn btn-primary btn-block" data-action="generate-summary" ${notes.length ? '' : 'disabled'}>${icon('sparkles')} Generate summary</button>${!notes.length ? `<div class="empty-inline">${icon('file')}Upload a note before creating a summary.</div><button class="btn btn-soft btn-block" data-action="go-view" data-view="uploads">Go to My notes</button>` : ''}</div></section>
        <section class="panel"><div class="panel-heading"><h2>Your summary</h2><button class="icon-button" data-action="download-summary" aria-label="Download summary" ${lastSummary ? '' : 'disabled'}>${icon('download')}</button></div><div id="summaryResult" class="summary-output">${lastSummary ? renderSummaryHTML(lastSummary) : `<div class="empty-inline">${icon('sparkles')}Your key takeaways will appear here after you generate a summary.</div>`}</div></section>
      </div>`;
  }
  function renderSummaryHTML(summary) {
    const lines = summary.lines || [];
    return `<p><b>${escapeHTML(summary.title || 'Study summary')}</b></p><ul>${lines.map(line => `<li>${escapeHTML(line)}</li>`).join('')}</ul><p class="source-note">Source: ${escapeHTML(summary.source || 'Uploaded notes')}. This prototype selects sentences from your document rather than generating new facts.</p>`;
  }
  function generateSummary() {
    const select = $('#summaryNote');
    const note = notes.find(item => item.id === select?.value) || notes[0];
    if (!note) { showToast('Upload a note first.', 'error'); return; }
    const count = Number($('#summaryLength')?.value || 5);
    lastSummary = { title: note.name.replace(/\.[^.]+$/, '') + ' — key takeaways', lines: makeExtractiveSummary(note.text, count), source: note.name };
    const result = $('#summaryResult'); if (result) result.innerHTML = renderSummaryHTML(lastSummary);
    const downloadBtn = $('[data-action="download-summary"]'); if (downloadBtn) downloadBtn.disabled = false;
    if (!lastSummary.lines.length) showToast('No readable text was found in that note.', 'error'); else showToast('Summary ready. Download it for revision.');
  }

  // Simple cloze questions are generated from note sentences. This is a transparent demo substitute for AI-generated MCQs.
  const STOPWORDS = new Set('about above after again against all also am an and any are as at be because been before being between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves have has using used uses make makes made main key important called follows follows add adds remove removes storing stores data computer'.split(/\s+/));
  function getKeywordCandidates(text) {
    const matches = String(text).match(/\b[A-Za-z][A-Za-z+#-]{2,}\b/g) || [];
    const counts = new Map();
    for (const word of matches) {
      const lower = word.toLowerCase();
      if (STOPWORDS.has(lower) || lower.length < 4 || /^\d+$/.test(lower)) continue;
      const current = counts.get(lower) || { word, count: 0 };
      current.count += 1;
      if (word.length > current.word.length) current.word = word;
      counts.set(lower, current);
    }
    return [...counts.values()].sort((a,b) => b.count - a.count || b.word.length - a.word.length).map(item => item.word);
  }
  function chooseKeyword(sentence, allText) {
    const commonTerms = ['linked list','binary search','linear search','time complexity','space complexity','data structure','recursion','array','stack','queue','tree','graph','algorithm','function','memory','node','push','pop','enqueue','dequeue','LIFO','FIFO'];
    const low = sentence.toLowerCase();
    const foundPhrase = commonTerms.find(term => low.includes(term.toLowerCase()) && term.includes(' '));
    if (foundPhrase) return sentence.slice(sentence.toLowerCase().indexOf(foundPhrase.toLowerCase()), sentence.toLowerCase().indexOf(foundPhrase.toLowerCase()) + foundPhrase.length);
    const foundTerm = commonTerms.find(term => !term.includes(' ') && new RegExp(`\\b${term}\\b`, 'i').test(sentence));
    if (foundTerm) return sentence.match(new RegExp(`\\b${foundTerm}\\b`, 'i'))?.[0] || foundTerm;
    const candidates = (sentence.match(/\b[A-Za-z][A-Za-z+#-]{4,}\b/g) || []).filter(word => !STOPWORDS.has(word.toLowerCase()));
    const fallback = candidates.sort((a,b) => b.length - a.length)[0];
    if (fallback) return fallback;
    return getKeywordCandidates(allText)[0] || '';
  }
  function createQuizFromNote(note, count) {
    const sentences = getNoteSentences(note.text).filter(sentence => sentence.length < 260);
    const allWords = getKeywordCandidates(note.text);
    const built = [];
    const seenTargets = new Set();
    for (const sentence of sentences) {
      const target = chooseKeyword(sentence, note.text);
      if (!target || target.length < 3 || !sentence.toLowerCase().includes(target.toLowerCase())) continue;
      const key = target.toLowerCase();
      if (seenTargets.has(key)) continue;
      // Avoid questions where the target occurs only within a much longer unrelated word.
      const cloze = sentence.replace(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____');
      const distractors = allWords.filter(word => word.toLowerCase() !== key && !cloze.toLowerCase().includes(word.toLowerCase())).slice(0, 20);
      const options = [target, ...distractors.slice(0, 3)];
      while (options.length < 4) options.push(['array','queue','algorithm','memory','function'][options.length % 5]);
      const uniqueOptions = [...new Map(options.map(option => [option.toLowerCase(), option])).values()].slice(0, 4);
      if (uniqueOptions.length < 2) continue;
      // Ensure the correct term is in the option set and remember the source sentence for feedback.
      if (!uniqueOptions.some(option => option.toLowerCase() === key)) uniqueOptions[0] = target;
      const shuffled = uniqueOptions.sort(() => Math.random() - .5);
      built.push({ sentence, target, cloze, options: shuffled, correct: shuffled.findIndex(option => option.toLowerCase() === key), answered: false, selected: null });
      seenTargets.add(key);
      if (built.length >= count) break;
    }
    return built;
  }
  function renderQuizPage() {
    const first = notes[0];
    return `<div class="page-title-row"><div><span class="page-kicker">ACTIVE RECALL</span><h1>Practice quiz</h1><p>Turn note content into short fill-in-the-blank practice questions.</p></div><span class="pill">Self-check</span></div>
      <div class="content-grid equal"><section class="panel"><div class="panel-heading"><h2>Build your quiz</h2></div><p class="panel-subtitle">Questions are constructed from phrases in your selected note. A connected AI tutor can generate more natural MCQs later.</p><div class="quiz-config"><div class="field"><label for="quizNote">Select note</label><select id="quizNote" ${notes.length ? '' : 'disabled'}>${noteOptions(first?.id || '')}</select></div><div class="field"><label>Number of questions</label><div class="segmented-options">${[5,10,15,20].map(n => `<button class="${n === 5 ? 'selected' : ''}" data-action="select-quiz-count" data-count="${n}" type="button">${n}</button>`).join('')}</div><input id="quizCount" type="hidden" value="5"></div><button class="btn btn-primary btn-block" data-action="make-quiz" ${notes.length ? '' : 'disabled'}>${icon('target')} Generate quiz</button>${!notes.length ? `<button class="btn btn-soft btn-block" data-action="go-view" data-view="uploads">Upload notes first</button>` : ''}</div></section><section class="panel"><div class="panel-heading"><h2>Practice area</h2><span id="quizStatus" class="pill gray">Not started</span></div><div id="quizResult">${currentQuiz.length ? renderQuizHTML() : `<div class="empty-inline">${icon('target')}Your questions will appear here.<br>Choose a note and press Generate quiz.</div>`}</div></section></div>`;
  }
  function renderQuizHTML() {
    if (!currentQuiz.length) return `<div class="empty-inline">No suitable sentences were found. Try a note with more readable text.</div>`;
    const answered = currentQuiz.filter(q => q.answered).length;
    const correct = currentQuiz.filter(q => q.answered && q.selected === q.correct).length;
    const header = currentQuizScore !== null ? `<div class="quiz-result"><b>Quiz complete: ${correct}/${currentQuiz.length}</b><br>Review the feedback below, then try again with another note.</div>` : `<div class="quiz-result">${answered} of ${currentQuiz.length} answered · Read the sentence carefully and choose the missing term.</div>`;
    return `${header}${currentQuiz.map((question,index) => `<div class="quiz-question"><h3>${index + 1}. Complete the note: “${escapeHTML(question.cloze)}”</h3><div class="quiz-options">${question.options.map((option,optIndex) => `<button class="quiz-option ${question.answered && optIndex === question.correct ? 'correct' : question.answered && optIndex === question.selected ? 'wrong' : ''}" data-action="quiz-option" data-q-index="${index}" data-option="${optIndex}" ${question.answered ? 'disabled' : ''}><span class="option-letter">${String.fromCharCode(65 + optIndex)}</span><span>${escapeHTML(option)}</span></button>`).join('')}</div>${question.answered ? `<div class="quiz-feedback">${question.selected === question.correct ? 'You matched the note.' : `The note uses “${escapeHTML(question.target)}”.`} Source sentence: ${escapeHTML(question.sentence)}</div>` : ''}</div>`).join('')}${currentQuizScore !== null ? `<button class="btn btn-primary" data-action="retake-quiz">Try another quiz</button>` : ''}`;
  }
  function makeQuiz() {
    const note = notes.find(item => item.id === $('#quizNote')?.value) || notes[0];
    if (!note) { showToast('Upload a note first.', 'error'); return; }
    const count = Number($('#quizCount')?.value || 5);
    currentQuiz = createQuizFromNote(note, count);
    currentQuizTitle = note.name;
    currentQuizScore = null;
    if (!currentQuiz.length) showToast('Could not make a quiz from the readable text in this note.', 'error');
    const result = $('#quizResult'); if (result) result.innerHTML = renderQuizHTML();
    const status = $('#quizStatus'); if (status) status.textContent = currentQuiz.length ? 'In progress' : 'No questions';
  }
  function answerQuizQuestion(qIndex, optionIndex) {
    const question = currentQuiz[qIndex];
    if (!question || question.answered) return;
    question.answered = true; question.selected = optionIndex;
    const answered = currentQuiz.filter(q => q.answered).length;
    if (answered === currentQuiz.length) {
      currentQuizScore = currentQuiz.filter(q => q.selected === q.correct).length;
      metrics.quizzesTaken = (Number(metrics.quizzesTaken) || 0) + 1;
      metrics.correctAnswers = (Number(metrics.correctAnswers) || 0) + currentQuizScore;
      persistState();
      const status = $('#quizStatus'); if (status) status.textContent = `${currentQuizScore}/${currentQuiz.length} correct`;
    }
    const result = $('#quizResult'); if (result) result.innerHTML = renderQuizHTML();
    if (answered === currentQuiz.length) showToast(`Quiz complete: ${currentQuizScore}/${currentQuiz.length} correct.`);
  }

  function createFlashcardsFromNote(note) {
    const sentences = getNoteSentences(note.text);
    const result = [];
    const seen = new Set();
    for (const sentence of sentences) {
      const target = chooseKeyword(sentence, note.text);
      if (!target || seen.has(target.toLowerCase())) continue;
      seen.add(target.toLowerCase());
      result.push({ front: `What do your notes say about “${target}”?`, back: sentence, term: target });
      if (result.length >= 20) break;
    }
    return result;
  }
  function renderFlashcards() {
    const note = notes[0];
    const active = flashcards[flashcardIndex];
    return `<div class="page-title-row"><div><span class="page-kicker">SPACED REVIEW</span><h1>Flashcards</h1><p>Practice retrieving ideas from your notes one prompt at a time.</p></div><span class="pill">Tap to flip</span></div>
      <div class="content-grid equal"><section class="panel"><div class="panel-heading"><h2>Choose your material</h2></div><div class="quiz-config"><div class="field"><label for="flashcardNote">Select note</label><select id="flashcardNote" ${notes.length ? '' : 'disabled'}>${noteOptions(note?.id || '')}</select></div><button class="btn btn-primary btn-block" data-action="make-flashcards" ${notes.length ? '' : 'disabled'}>${icon('layers')} Build flashcards</button>${!notes.length ? `<button class="btn btn-soft btn-block" data-action="go-view" data-view="uploads">Upload notes first</button>` : ''}<div class="status-banner">${icon('sparkles')}<div>Try to answer out loud before flipping the card. The demo cards quote or paraphrase only by choosing source sentences from your notes.</div></div></div></section>
      <section class="panel"><div class="panel-heading"><h2>Review deck</h2><span class="pill gray">${flashcards.length ? `${flashcards.length} cards` : 'No deck yet'}</span></div>${active ? `<div class="flashcard-stage"><button class="flashcard" data-action="flip-card" aria-label="Flip flashcard"><span class="flashcard-label">${flashcardFlipped ? 'Answer' : 'Question'} · ${flashcardIndex + 1}</span><h2>${escapeHTML(flashcardFlipped ? active.back : active.front)}</h2><p>${flashcardFlipped ? 'Tap to see the question again' : 'Think of your answer, then tap to reveal'}</p></button></div><div class="flashcard-nav"><button class="btn btn-soft btn-sm" data-action="flashcard-prev" ${flashcardIndex === 0 ? 'disabled' : ''}>← Previous</button><span>${flashcardIndex + 1} / ${flashcards.length}</span><button class="btn btn-primary btn-sm" data-action="flashcard-next" ${flashcardIndex === flashcards.length - 1 ? 'disabled' : ''}>Next →</button></div>` : `<div class="empty-inline">${icon('layers')}Create a deck from one of your notes to begin.</div>`}</section></div>`;
  }
  function makeFlashcards() {
    const note = notes.find(item => item.id === $('#flashcardNote')?.value) || notes[0];
    if (!note) { showToast('Upload a note first.', 'error'); return; }
    flashcards = createFlashcardsFromNote(note); flashcardIndex = 0; flashcardFlipped = false;
    if (!flashcards.length) showToast('Could not build cards from this note.', 'error');
    rerenderCurrentView();
  }

  function renderTutor() {
    return `<div class="page-title-row"><div><span class="page-kicker">ASK, EXPLORE, UNDERSTAND</span><h1>Ask from notes</h1><p>Ask a specific question and StudyBot will find matching text in your uploaded material.</p></div><button class="btn btn-soft" data-action="go-view" data-view="uploads">${icon('upload')} Manage notes</button></div>
      <div class="tutor-layout"><div>${renderChatWindow('dashboard-chat tutor-full','tutor')}</div><aside class="tutor-context"><div class="tutor-context-card"><h3>${icon('book')} Knowledge source</h3><p>${notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'} available. Answers are retrieved from your locally extracted text.` : 'No notes loaded. Upload study material so StudyBot has something to refer to.'}</p><button class="btn btn-primary btn-sm" style="margin-top:12px" data-action="go-view" data-view="uploads">${icon('upload')} ${notes.length ? 'Manage notes' : 'Upload your first note'}</button></div><div class="panel" style="margin-top:12px"><div class="panel-heading"><h3>Try asking</h3></div><button class="tutor-shortcut" data-action="send-prompt" data-prompt="Explain the difference between a stack and a queue">${icon('message')} Stack vs. queue</button><button class="tutor-shortcut" data-action="send-prompt" data-prompt="Summarize my notes">${icon('sparkles')} Summarize the notes</button><button class="tutor-shortcut" data-action="send-prompt" data-prompt="What does time complexity mean?">${icon('target')} Time complexity</button><button class="tutor-shortcut" data-action="send-prompt" data-prompt="Suggest websites to learn this topic">${icon('book')} Study resources</button></div><div class="status-banner warning" style="margin-top:12px">${icon('settings')}<div><b>AI integration point</b><br>This screen uses keyword retrieval. Add your no-code provider's official chat widget for full natural-language explanations.</div></div></aside></div>`;
  }

  function getUpcomingEvents() {
    const today = localISO(new Date());
    return events.filter(event => event.date >= today).sort((a,b) => `${a.date} ${a.time || '23:59'}`.localeCompare(`${b.date} ${b.time || '23:59'}`));
  }
  function renderEvents() {
    const filters = ['Upcoming','Exams','Deadlines','Others'];
    const baseEvents = selectedEventFilter === 'Upcoming' ? getUpcomingEvents() : events.filter(event => event.type === ({ Exams: 'Exam', Deadlines: 'Deadline', Others: 'Other' }[selectedEventFilter]));
    const eventHTML = baseEvents.length ? baseEvents.map(event => {
      const className = event.type === 'Exam' ? 'exam' : event.type === 'Deadline' ? 'deadline' : 'other';
      const tagClass = event.type === 'Exam' ? 'pink' : event.type === 'Deadline' ? 'mint' : 'gray';
      return `<article class="event-card"><span class="event-icon ${className}">${icon(event.type === 'Deadline' ? 'file' : event.type === 'Other' ? 'calendar' : 'target')}</span><div class="event-card-copy"><h3>${escapeHTML(event.title)}</h3><p>${escapeHTML(event.type)} · ${event.demo ? 'Example event' : 'Your event'}</p><small>${escapeHTML(formatDate(event.date, { weekday:'short', month:'short', day:'numeric', year:'numeric' }))} · ${escapeHTML(event.time || 'Time not set')}</small></div><span class="pill ${tagClass}">${escapeHTML(relativeDate(event.date))}</span><div class="event-actions"><button data-action="edit-event" data-event-id="${escapeHTML(event.id)}" aria-label="Edit event">${icon('file')}</button><button data-action="delete-event" data-event-id="${escapeHTML(event.id)}" aria-label="Delete event">${icon('trash')}</button></div></article>`;
    }).join('') : `<div class="empty-inline">${icon('calendar')}No events match this view. Add an exam, deadline, or reminder to get started.</div>`;
    return `<div class="page-title-row"><div><span class="page-kicker">STAY ONE STEP AHEAD</span><h1>Events & reminders</h1><p>Keep exams, deadlines, and campus events in one place.</p><p class="small muted" style="margin-top:5px">Example events are included for the demo — edit or delete them.</p></div><button class="btn btn-primary" data-action="add-event">${icon('plus')} Add event</button></div>
      <div class="events-layout"><section class="panel"><div class="tabs" role="tablist">${filters.map(filter => `<button class="tab-button ${filter === selectedEventFilter ? 'active' : ''}" role="tab" aria-selected="${filter === selectedEventFilter}" data-action="filter-events" data-filter="${filter}">${filter}</button>`).join('')}</div><div class="event-list">${eventHTML}</div></section><div class="stack"><section class="panel calendar-widget"><div class="calendar-heading"><h3 id="calendarTitle">Month</h3><div class="calendar-controls"><button data-action="calendar-prev" aria-label="Previous month">‹</button><button data-action="calendar-next" aria-label="Next month">›</button></div></div><div id="calendarGrid" class="calendar-grid"></div></section><div class="calendar-tip">${icon('sparkles')}<div><b>Quick tip</b><p>Add a little buffer before deadlines so you have time to review and ask for help.</p></div></div></div></div>`;
  }
  function renderCalendar() {
    const grid = $('#calendarGrid'); if (!grid) return;
    const title = $('#calendarTitle');
    if (title) title.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarMonth);
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousDays = new Date(year, month, 0).getDate();
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const eventDates = new Set(events.map(event => event.date));
    const today = localISO(new Date());
    let html = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      let dateNum, dateObj, outside = false;
      if (i < firstDay) { dateNum = previousDays - firstDay + i + 1; dateObj = new Date(year, month - 1, dateNum); outside = true; }
      else if (i >= firstDay + daysInMonth) { dateNum = i - (firstDay + daysInMonth) + 1; dateObj = new Date(year, month + 1, dateNum); outside = true; }
      else { dateNum = i - firstDay + 1; dateObj = new Date(year, month, dateNum); }
      const dateISO = localISO(dateObj);
      html += `<button class="calendar-day ${outside ? 'outside' : ''} ${dateISO === today ? 'today' : ''} ${eventDates.has(dateISO) ? 'has-event' : ''}" data-action="calendar-day" data-date="${dateISO}" aria-label="${escapeHTML(dateISO)}${eventDates.has(dateISO) ? ', has event' : ''}">${dateNum}</button>`;
    }
    grid.innerHTML = html;
  }
  function showEventModal(eventId = null, presetDate = null) {
    editingEventId = eventId;
    const event = events.find(item => item.id === eventId) || { title: '', type: 'Exam', date: presetDate || dayOffset(1), time: '10:00', notes: '' };
    const isEdit = Boolean(eventId);
    showModal(`<div class="modal-heading"><div><h2>${isEdit ? 'Edit event' : 'Add an event'}</h2><p>Keep your exams and deadlines visible.</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div>
      <form id="eventForm" class="modal-form"><div class="field"><label for="eventTitle">Event name</label><input id="eventTitle" name="title" value="${escapeHTML(event.title)}" placeholder="e.g. Data Structures quiz" maxlength="90" required></div><div class="form-row"><div class="field"><label for="eventType">Category</label><select id="eventType" name="type"><option ${event.type === 'Exam' ? 'selected' : ''}>Exam</option><option ${event.type === 'Deadline' ? 'selected' : ''}>Deadline</option><option ${event.type === 'Other' ? 'selected' : ''}>Other</option></select></div><div class="field"><label for="eventDate">Date</label><input id="eventDate" name="date" type="date" value="${escapeHTML(event.date)}" required></div></div><div class="field"><label for="eventTime">Time</label><input id="eventTime" name="time" type="time" value="${escapeHTML(event.time || '')}"></div><div class="field"><label for="eventNotes">Notes (optional)</label><textarea id="eventNotes" name="notes" placeholder="Location, chapter, or preparation reminder">${escapeHTML(event.notes || '')}</textarea></div><button class="btn btn-primary btn-block" type="submit">${isEdit ? 'Save changes' : 'Add event'}</button></form>`);
  }
  function saveEventFromForm(form) {
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    if (!title) { showToast('Add an event name.', 'error'); return; }
    const event = { id: editingEventId || uid(), title, type: String(data.get('type') || 'Other'), date: String(data.get('date') || dayOffset(1)), time: String(data.get('time') || ''), notes: String(data.get('notes') || ''), demo: false };
    if (editingEventId) events = events.map(item => item.id === editingEventId ? event : item);
    else events.push(event);
    persistState(); closeModal(); rerenderCurrentView(); showToast(editingEventId ? 'Event updated.' : 'Event added.'); editingEventId = null;
  }

  function renderStudyPlan() {
    const taskHTML = tasks.length ? tasks.map(task => `<div class="plan-task ${task.done ? 'done' : ''}"><button class="plan-check" data-action="toggle-task" data-task-id="${escapeHTML(task.id)}" aria-label="Mark ${escapeHTML(task.title)} ${task.done ? 'not complete' : 'complete'}">${icon('check')}</button><div class="plan-task-copy"><span class="plan-task-name">${escapeHTML(task.title)}</span><span class="plan-task-meta">${escapeHTML(task.subject || 'Study session')} · ${escapeHTML(task.date ? formatDate(task.date, { month:'short', day:'numeric' }) : 'No date')} · ${escapeHTML(task.duration || '30 min')}</span></div><button class="file-actions" style="border:0;background:transparent;color:#9aa5b8" data-action="delete-task" data-task-id="${escapeHTML(task.id)}" aria-label="Delete study session">${icon('trash')}</button></div>`).join('') : `<div class="empty-inline">${icon('target')}Your study sessions will appear here.<br>Start with one focused task, not a perfect timetable.</div>`;
    const done = tasks.filter(task => task.done).length;
    return `<div class="page-title-row"><div><span class="page-kicker">PLAN SMALL, SHOW UP</span><h1>Study plan</h1><p>Make time for what matters. You can edit or remove sessions anytime.</p></div><span class="pill mint">${done}/${tasks.length} complete</span></div>
      <div class="content-grid"><section class="panel"><div class="panel-heading"><h2>Your sessions</h2><span class="pill gray">${tasks.length} planned</span></div><div class="study-plan-list">${taskHTML}</div></section>
      <section class="panel"><div class="panel-heading"><h2>Add a study session</h2></div><p class="panel-subtitle">Keep the first plan simple enough to follow.</p><form id="taskForm" class="quiz-config"><div class="field"><label for="taskTitle">What will you study?</label><input id="taskTitle" name="title" placeholder="e.g. Revise stacks and queues" maxlength="100" required></div><div class="field"><label for="taskSubject">Course or subject</label><input id="taskSubject" name="subject" placeholder="e.g. Data Structures"></div><div class="form-row"><div class="field"><label for="taskDate">Date</label><input id="taskDate" name="date" type="date" value="${dayOffset(0)}"></div><div class="field"><label for="taskDuration">Duration</label><select id="taskDuration" name="duration"><option>15 min</option><option selected>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option></select></div></div><button class="btn btn-primary btn-block" type="submit">${icon('plus')} Add session</button></form></section></div>`;
  }
  function renderSettings() {
    const isDark = document.body.classList.contains('dark-theme');
    return `<div class="page-title-row"><div><span class="page-kicker">MAKE IT YOURS</span><h1>Settings</h1><p>Manage your demo profile, local data, and chatbot integration.</p></div></div>
      <div class="content-grid"><div class="stack"><section class="panel"><div class="panel-heading"><h2>Profile</h2><span class="pill gray">Demo profile</span></div><form id="profileForm" class="quiz-config"><div class="field"><label for="profileName">Display name</label><input id="profileName" name="name" value="${escapeHTML(profile.name || '')}" maxlength="60" required></div><div class="field"><label for="profileEmail">Email (optional)</label><input id="profileEmail" name="email" type="email" value="${escapeHTML(profile.email || '')}" placeholder="student@example.com"></div><button class="btn btn-primary" type="submit">Save profile</button></form><p class="small muted" style="margin:12px 0 0">This is not a secure login system. Profile details are saved only in this browser.</p></section>
      <section class="panel"><div class="panel-heading"><h2>Appearance</h2></div><div class="settings-row"><span class="settings-row-icon">${icon(isDark ? 'moon' : 'sun')}</span><div class="settings-row-copy"><b>Dark theme</b><p>Switch the workspace to a darker palette.</p></div><input type="checkbox" class="toggle-switch" data-action="toggle-theme" aria-label="Toggle dark theme" ${isDark ? 'checked' : ''}></div></section>
      <section class="panel"><div class="panel-heading"><h2>Local data</h2></div><div class="settings-row"><span class="settings-row-icon">${icon('download')}</span><div class="settings-row-copy"><b>Export notes as text</b><p>Download readable text for all notes currently stored in this browser.</p></div><button class="btn btn-soft btn-sm" data-action="export-notes">Export</button></div><div class="settings-row"><span class="settings-row-icon" style="color:#d8566b;background:#fff0f2">${icon('trash')}</span><div class="settings-row-copy"><b>Clear demo data</b><p>Remove notes, events, plans, profile, and chat history from this browser.</p></div><button class="btn btn-ghost btn-sm" data-action="clear-data">Clear data</button></div></section></div>
      <div class="stack"><section class="panel"><div class="panel-heading"><h2>AI assistant connection</h2><span class="pill peach">Not connected</span></div><div class="status-banner warning">${icon('settings')}<div><b>Current mode: local prototype</b><br>The built-in assistant retrieves matching sentences. It does not use a hosted language model or send your files to a provider.</div></div><div class="settings-list" style="margin-top:9px"><div class="settings-row"><span class="settings-row-icon">${icon('message')}</span><div class="settings-row-copy"><b>1. Create your agent</b><p>Build the StudyPilot tutor in your chosen no-code platform and configure its note-grounded instructions.</p></div></div><div class="settings-row"><span class="settings-row-icon">${icon('file')}</span><div class="settings-row-copy"><b>2. Enable file uploads</b><p>Turn on PDF/DOCX attachments in the provider's widget settings so students can send their own files.</p></div></div><div class="settings-row"><span class="settings-row-icon">${icon('upload')}</span><div class="settings-row-copy"><b>3. Embed the widget</b><p>Paste the provider's official embed code into the integration placeholder near the bottom of index.html.</p></div></div></div><a class="text-button" href="https://www.autohive.com/" target="_blank" rel="noopener noreferrer">Explore Autohive ${icon('arrow')}</a></section><section class="panel"><div class="panel-heading"><h2>About this build</h2></div><p class="panel-subtitle">StudyPilot is a front-end hackathon prototype built with HTML, CSS and vanilla JavaScript. Notes are parsed and stored locally in your browser. There is no server-side database or real authentication included.</p><p class="small muted">When a real AI provider is connected, review its data privacy, storage, and file-retention settings before using real student records.</p></section></div></div>`;
  }

  function showModal(markup) {
    $('#modalRoot').innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal-card" role="dialog" aria-modal="true">${markup}</section></div>`;
    const first = $('#modalRoot input, #modalRoot button, #modalRoot select'); if (first) first.focus({ preventScroll: true });
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  function openLoginModal() {
    showModal(`<div class="modal-heading"><div><span class="brand-mark" style="display:inline-grid;vertical-align:middle;margin-right:8px">${icon('cap')}</span><h2 style="display:inline-block;vertical-align:middle">Welcome to StudyPilot</h2><p style="margin-top:10px">This hackathon build uses a local demo profile.</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><form id="loginForm" class="modal-form"><div class="field"><label for="loginName">What should we call you?</label><input id="loginName" name="name" value="${escapeHTML(profile.name || '')}" maxlength="60" placeholder="Your name" required></div><div class="field"><label for="loginEmail">Email (optional)</label><input id="loginEmail" name="email" value="${escapeHTML(profile.email || '')}" type="email" placeholder="you@example.com"></div><button type="submit" class="btn btn-primary btn-block">Continue to my workspace ${icon('arrow')}</button></form><div class="modal-footer">Demo only — this does not create an online account.</div>`);
  }
 async function handleProfileForm(form, isLogin = false) {
  const data = new FormData(form);

  profile = {
    name: String(data.get('name') || 'Student').trim() || 'Student',
    email: String(data.get('email') || '').trim()
  };

  const webhookURL = 'https://innocoreproject.app.n8n.cloud/webhook/d8044e9e-235b-4bd5-bb4c-6966bb445db8';

  try {
    const response = await fetch(webhookURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profile)
    });

    if (!response.ok) {
      throw new Error('Submission failed');
    }

    showToast('Your details were saved!');
  } catch (error) {
    showToast('Could not save details to Google Sheets.', 'error');
  }

  persistState();
  closeModal();

  if (isLogin) openApp('dashboard');
  else rerenderCurrentView();
}

  // UI actions use data-action attributes so controls remain easy to inspect/edit in HTML.
  document.addEventListener('click', event => {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    switch (action) {
      case 'show-landing': showLanding(); break;
      case 'clear-search': globalSearchQuery = ''; const searchInput = $('#globalSearch'); if (searchInput) { searchInput.value = ''; searchInput.title = ''; } rerenderCurrentView(); break;
      case 'open-app': openApp('dashboard'); break;
      case 'open-login': openLoginModal(); break;
      case 'back-landing': if (window.confirm('Exit the StudyPilot demo and return to the landing page? Your browser-saved data will stay available.')) showLanding(); break;
      case 'go-view': {
        if ($('#modalRoot').innerHTML.trim()) closeModal();
        const view = actionNode.dataset.view || 'dashboard';
        if ($('#appView').classList.contains('hidden')) openApp(view); else openView(view);
        break;
      }
      case 'scroll-features': event.preventDefault(); $('#features').scrollIntoView({ behavior: 'smooth' }); break;
      case 'scroll-about': event.preventDefault(); $('#about').scrollIntoView({ behavior: 'smooth' }); break;
      case 'watch-demo': event.preventDefault(); $('#features').scrollIntoView({ behavior: 'smooth' }); showToast('Start with a sample note, then try summaries, quizzes, and Ask from notes.'); break;
      case 'toggle-landing-nav': $('.landing-nav').classList.toggle('open'); break;
      case 'toggle-sidebar': $('#sidebar').classList.toggle('mobile-open'); break;
      case 'trigger-file-picker': event.stopPropagation(); {
        const input = $('#fileInputMain');
        if (input) input.click();
        else { openView('uploads'); window.setTimeout(() => $('#fileInputMain')?.click(), 50); }
        break;
      }
      case 'open-upload': openView('uploads'); window.setTimeout(() => $('#fileInputMain')?.click(), 50); break;
      case 'load-sample-note': loadSampleNote(); break;
      case 'open-note': openNotePreview(actionNode.dataset.noteId); break;
      case 'delete-note': {
        const note = notes.find(item => item.id === actionNode.dataset.noteId);
        if (note && window.confirm(`Delete “${note.name}” from this browser?`)) {
          notes = notes.filter(item => item.id !== note.id); persistState(); rerenderCurrentView(); showToast('Note deleted.');
        }
        break;
      }
      case 'download-note': {
        const note = notes.find(item => item.id === actionNode.dataset.noteId);
        if (note) downloadText(note.name.replace(/\.[^.]+$/, '') + '-extracted.txt', note.text || 'No readable text was extracted.');
        break;
      }
      case 'generate-summary': generateSummary(); break;
      case 'download-summary': if (lastSummary) downloadText('studypilot-summary.txt', `${lastSummary.title}\n\n${lastSummary.lines.map((line,index) => `${index + 1}. ${line}`).join('\n')}\n\nSource: ${lastSummary.source}\nGenerated by the StudyPilot local prototype.`); break;
      case 'select-quiz-count': {
        $$('.segmented-options button').forEach(button => button.classList.toggle('selected', button === actionNode));
        const countInput = $('#quizCount'); if (countInput) countInput.value = actionNode.dataset.count;
        break;
      }
      case 'make-quiz': makeQuiz(); break;
      case 'quiz-option': answerQuizQuestion(Number(actionNode.dataset.qIndex), Number(actionNode.dataset.option)); break;
      case 'retake-quiz': currentQuiz = []; currentQuizScore = null; rerenderCurrentView(); break;
      case 'make-flashcards': makeFlashcards(); break;
      case 'flip-card': flashcardFlipped = !flashcardFlipped; rerenderCurrentView(); break;
      case 'flashcard-prev': flashcardIndex = Math.max(0, flashcardIndex - 1); flashcardFlipped = false; rerenderCurrentView(); break;
      case 'flashcard-next': flashcardIndex = Math.min(flashcards.length - 1, flashcardIndex + 1); flashcardFlipped = false; rerenderCurrentView(); break;
      case 'filter-events': selectedEventFilter = actionNode.dataset.filter || 'Upcoming'; rerenderCurrentView(); break;
      case 'calendar-prev': calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); break;
      case 'calendar-next': calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); break;
      case 'calendar-day': showEventModal(null, actionNode.dataset.date); break;
      case 'add-event': showEventModal(); break;
      case 'edit-event': showEventModal(actionNode.dataset.eventId); break;
      case 'delete-event': {
        const eventItem = events.find(item => item.id === actionNode.dataset.eventId);
        if (eventItem && window.confirm(`Delete “${eventItem.title}”?`)) { events = events.filter(item => item.id !== eventItem.id); persistState(); rerenderCurrentView(); showToast('Event removed.'); }
        break;
      }
      case 'toggle-task': {
        tasks = tasks.map(task => task.id === actionNode.dataset.taskId ? { ...task, done: !task.done } : task); persistState(); rerenderCurrentView(); break;
      }
      case 'delete-task': {
        if (window.confirm('Delete this study session?')) { tasks = tasks.filter(task => task.id !== actionNode.dataset.taskId); persistState(); rerenderCurrentView(); showToast('Study session removed.'); }
        break;
      }
      case 'toggle-chat-drawer': $('#chatDrawer').classList.toggle('hidden'); if (!$('#chatDrawer').classList.contains('hidden')) { $('#chatDrawer').innerHTML = renderChatWindow('drawer-chat-panel','drawer'); scrollChatToBottom($('#chatDrawer')); $('#chatDrawer textarea')?.focus(); } break;
      case 'send-prompt': sendChatMessage(actionNode.dataset.prompt || ''); if (currentView !== 'dashboard' && actionNode.closest('#chatDrawer')) scrollChatToBottom($('#chatDrawer')); break;
      case 'minimize-dashboard-chat': showToast('StudyBot stays here while you work.'); break;
      case 'show-notifications': showToast(events.length ? `You have ${getUpcomingEvents().length} upcoming event(s).` : 'No reminders yet. Add an event to get started.'); break;
      case 'toggle-theme': toggleTheme(Boolean(actionNode.checked)); break;
      case 'export-notes': downloadText('studypilot-notes-export.txt', notes.map(note => `# ${note.name}\n\n${note.text || '[No readable text extracted]'}\n`).join('\n---\n\n')); showToast('Notes export prepared.'); break;
      case 'clear-data': {
        if (window.confirm('Clear all StudyPilot demo data stored in this browser? This cannot be undone.')) {
          notes = []; events = []; tasks = []; chatHistory = []; metrics = { quizzesTaken: 0, correctAnswers: 0 }; profile = { ...DEFAULT_PROFILE };
          Object.values(STORAGE_KEYS).forEach(key => { try { localStorage.removeItem(key); } catch (error) { /* storage may be disabled */ } });
          try { localStorage.removeItem('studypilot_chat_v1'); } catch (error) { /* storage may be disabled */ }
          persistState(); rerenderCurrentView(); showToast('Local demo data cleared.');
        }
        break;
      }
      case 'close-modal': closeModal(); break;
      case 'backdrop-close': if (event.target === actionNode) closeModal(); break;
      default: break;
    }
  });

  // File inputs, drag-and-drop, chat sends, and form submissions.
  document.addEventListener('change', async event => {
    if (event.target.id === 'fileInputMain') {
      await handleFiles(event.target.files);
      event.target.value = '';
    }
    if (event.target.matches('[data-action="toggle-theme"]')) toggleTheme(event.target.checked);
  });
  document.addEventListener('dragover', event => {
    const zone = event.target.closest('#mainDropzone');
    if (zone) { event.preventDefault(); zone.classList.add('dragover'); }
  });
  document.addEventListener('dragleave', event => {
    const zone = event.target.closest('#mainDropzone');
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('dragover');
  });
  document.addEventListener('drop', async event => {
    const zone = event.target.closest('#mainDropzone');
    if (!zone) return;
    event.preventDefault(); zone.classList.remove('dragover');
    await handleFiles(event.dataTransfer.files);
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('#mainDropzone') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); $('#fileInputMain')?.click(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#globalSearch')?.focus(); }
    if (event.target.id === 'globalSearch' && event.key === 'Enter') { event.preventDefault(); globalSearchQuery = event.target.value.trim(); openView('uploads'); }
    if (event.key === 'Escape') closeModal();
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('[data-chat-form]')) {
      event.preventDefault(); const textarea = $('textarea[name="message"]', form); const message = textarea.value.trim();
      if (message) { sendChatMessage(message); textarea.value = ''; autoSizeTextarea(textarea); }
      return;
    }
    if (form.id === 'eventForm') { event.preventDefault(); saveEventFromForm(form); return; }
    if (form.id === 'taskForm') {
      event.preventDefault(); const data = new FormData(form); const title = String(data.get('title') || '').trim();
      if (!title) return;
      tasks.unshift({ id: uid(), title, subject: String(data.get('subject') || '').trim(), date: String(data.get('date') || dayOffset(0)), duration: String(data.get('duration') || '30 min'), done: false });
      persistState(); rerenderCurrentView(); showToast('Study session added to your plan.'); return;
    }
    if (form.id === 'profileForm') { event.preventDefault(); handleProfileForm(form, false); return; }
    if (form.id === 'loginForm') { event.preventDefault(); handleProfileForm(form, true); return; }
  });
  document.addEventListener('input', event => {
    if (event.target.matches('.chat-compose textarea')) autoSizeTextarea(event.target);
    if (event.target.id === 'globalSearch') handleGlobalSearch(event.target.value);
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('.chat-compose textarea') && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); event.target.closest('form')?.requestSubmit();
    }
  });
  function autoSizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 90)}px`;
  }
  function toggleTheme(enabled) {
    document.body.classList.toggle('dark-theme', enabled);
    try { localStorage.setItem(STORAGE_KEYS.theme, enabled ? 'dark' : 'light'); } catch (error) { /* optional preference */ }
    if (currentView === 'settings') rerenderCurrentView();
  }
  function handleGlobalSearch(query) {
    const clean = query.trim();
    globalSearchQuery = clean;
    if (!clean) return;
    // Enter opens the notes view and highlights the matching file list by filtering in place.
    if (eventKeySearchTimeout) window.clearTimeout(eventKeySearchTimeout);
    eventKeySearchTimeout = window.setTimeout(() => {
      const input = $('#globalSearch');
      if (input && input.value.trim() === clean && clean.length > 2) {
        const matches = notes.filter(note => note.name.toLowerCase().includes(clean.toLowerCase()) || String(note.text || '').toLowerCase().includes(clean.toLowerCase()));
        input.title = matches.length ? `${matches.length} matching note(s)` : 'No matching notes found';
      }
    }, 200);
  }
  let eventKeySearchTimeout = null;

  // Keep demo state visible after reload; the user can enter the workspace without authentication.
  try { if (localStorage.getItem(STORAGE_KEYS.theme) === 'dark') document.body.classList.add('dark-theme'); } catch (error) { /* optional preference */ }
  syncProfileUI();
})();
