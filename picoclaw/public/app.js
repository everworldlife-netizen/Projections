/* ============================================
   COMMAND CENTER - Frontend Application
   ============================================ */

(function () {
  'use strict';

  // ---- State ----
  const state = {
    ws: null,
    sessionId: null,
    connected: false,
    typing: false,
    currentView: 'chat',
    reconnectAttempts: 0,
    maxReconnect: 10,
    searchMode: false,
    reasonMode: false,
  };

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebar-toggle'),
    chatMessages: $('#chat-messages'),
    welcomeScreen: $('#welcome-screen'),
    chatInput: $('#chat-input'),
    btnSend: $('#btn-send'),
    btnVoice: $('#btn-voice'),
    btnNewChat: $('#btn-new-chat'),
    btnSearch: $('#btn-search'),
    btnReason: $('#btn-reason'),
    typingIndicator: $('#typing-indicator'),
    modelSelector: $('#model-selector'),
    modelDropdown: $('#model-dropdown'),
    modelName: $('#model-name'),
    sessionList: $('#session-list'),
    statusDot: $('.status-dot'),
    statusText: $('.status-text'),
    memoryContent: $('#memory-content'),
    providerList: $('#provider-list'),
    channelStatus: $('#channel-status'),
    settingTemp: $('#setting-temp'),
    settingTokens: $('#setting-tokens'),
    tempValue: $('#temp-value'),
    tokensValue: $('#tokens-value'),
  };

  // ---- WebSocket ----

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws/chat`;
    state.ws = new WebSocket(url);

    state.ws.onopen = () => {
      state.connected = true;
      state.reconnectAttempts = 0;
      setStatus('online');
      // Init session
      state.ws.send(JSON.stringify({
        type: 'init',
        session_id: state.sessionId,
      }));
    };

    state.ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      handleWSMessage(data);
    };

    state.ws.onclose = () => {
      state.connected = false;
      setStatus('offline');
      scheduleReconnect();
    };

    state.ws.onerror = () => {
      state.connected = false;
      setStatus('error');
    };
  }

  function scheduleReconnect() {
    if (state.reconnectAttempts >= state.maxReconnect) return;
    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
    state.reconnectAttempts++;
    setTimeout(connectWS, delay);
  }

  function handleWSMessage(data) {
    switch (data.type) {
      case 'session':
        state.sessionId = data.session_id;
        break;

      case 'history':
        renderHistory(data.messages);
        break;

      case 'ack':
        state.sessionId = data.session_id;
        break;

      case 'typing':
        setTyping(data.active);
        break;

      case 'response':
        setTyping(false);
        appendMessage('assistant', data.content);
        refreshSessions();
        break;

      case 'error':
        setTyping(false);
        appendMessage('assistant', data.content);
        break;
    }
  }

  function sendMessage(text) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!text.trim()) return;

    // Prepend mode prefixes
    let finalText = text;
    if (state.searchMode) {
      finalText = `[Search the web] ${text}`;
      toggleSearchMode(false);
    }
    if (state.reasonMode) {
      finalText = `[Think step by step and reason carefully] ${text}`;
      toggleReasonMode(false);
    }

    appendMessage('user', text);
    hideWelcome();

    state.ws.send(JSON.stringify({
      type: 'message',
      content: finalText,
    }));

    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    dom.btnSend.disabled = true;
  }

  // ---- Rendering ----

  function appendMessage(role, content) {
    // Remove welcome screen on first message
    hideWelcome();

    const msg = document.createElement('div');
    msg.className = `message ${role}`;

    const avatarSVG = role === 'user'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>';

    const senderName = role === 'user' ? 'You' : 'Assistant';

    msg.innerHTML = `
      <div class="message-avatar">${avatarSVG}</div>
      <div class="message-body">
        <div class="message-sender">${senderName}</div>
        <div class="message-content">${formatMarkdown(content)}</div>
      </div>
    `;

    dom.chatMessages.appendChild(msg);
    scrollToBottom();
  }

  function renderHistory(messages) {
    // Clear existing messages but keep welcome
    const existing = dom.chatMessages.querySelectorAll('.message');
    existing.forEach((m) => m.remove());

    if (!messages || messages.length === 0) {
      showWelcome();
      return;
    }

    hideWelcome();
    messages.forEach((m) => {
      if (m.role === 'user' || m.role === 'assistant') {
        appendMessage(m.role, m.content);
      }
    });
  }

  function hideWelcome() {
    if (dom.welcomeScreen) dom.welcomeScreen.style.display = 'none';
  }

  function showWelcome() {
    if (dom.welcomeScreen) dom.welcomeScreen.style.display = '';
  }

  function setTyping(active) {
    state.typing = active;
    dom.typingIndicator.classList.toggle('hidden', !active);
    if (active) scrollToBottom();
  }

  function setStatus(status) {
    dom.statusDot.className = 'status-dot';
    if (status === 'online') {
      dom.statusDot.classList.add('online');
      dom.statusText.textContent = 'Connected';
    } else if (status === 'error') {
      dom.statusDot.classList.add('error');
      dom.statusText.textContent = 'Connection error';
    } else {
      dom.statusText.textContent = 'Reconnecting...';
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    });
  }

  // ---- Markdown (simple) ----

  function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*(<(?:pre|ul|ol|h[2-4]|blockquote))/g, '$1');
    html = html.replace(/(<\/(?:pre|ul|ol|h[2-4]|blockquote)>)\s*<\/p>/g, '$1');

    return html;
  }

  function escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
  }

  // ---- Sessions ----

  async function refreshSessions() {
    try {
      const resp = await fetch('/api/sessions');
      const sessions = await resp.json();
      renderSessionList(sessions);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }

  function renderSessionList(sessions) {
    dom.sessionList.innerHTML = '';
    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = `session-item${s.id === state.sessionId ? ' active' : ''}`;
      item.innerHTML = `
        <span class="session-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
        <button class="session-delete" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      item.querySelector('.session-title').addEventListener('click', () => {
        switchSession(s.id);
      });

      item.querySelector('.session-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });

      dom.sessionList.appendChild(item);
    });
  }

  function switchSession(sessionId) {
    state.sessionId = sessionId;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'init', session_id: sessionId }));
    }
    switchView('chat');
    refreshSessions();
  }

  async function deleteSession(sessionId) {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (sessionId === state.sessionId) {
        newChat();
      }
      refreshSessions();
    } catch (e) {
      console.error('Delete session failed:', e);
    }
  }

  function newChat() {
    state.sessionId = null;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'reset' }));
    }
    // Clear messages
    const msgs = dom.chatMessages.querySelectorAll('.message');
    msgs.forEach((m) => m.remove());
    showWelcome();
    switchView('chat');
    refreshSessions();
  }

  // ---- Views ----

  function switchView(view) {
    state.currentView = view;
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
    $$('.nav-item').forEach((n) => n.classList.remove('active'));
    const navBtn = $(`.nav-item[data-view="${view}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Load view-specific data
    if (view === 'memory') loadMemory();
    if (view === 'settings') loadSettings();
  }

  // ---- Model selector ----

  function toggleModelDropdown() {
    const isHidden = dom.modelDropdown.classList.contains('hidden');
    dom.modelDropdown.classList.toggle('hidden');
    dom.modelSelector.classList.toggle('open', isHidden);
  }

  function selectModel(provider, model) {
    dom.modelName.textContent = model;
    dom.modelDropdown.classList.add('hidden');
    dom.modelSelector.classList.remove('open');

    // Mark active
    $$('.dropdown-item').forEach((item) => {
      item.classList.toggle(
        'active',
        item.dataset.provider === provider && item.dataset.model === model
      );
    });
  }

  // ---- Search / Reason modes ----

  function toggleSearchMode(force) {
    state.searchMode = force !== undefined ? force : !state.searchMode;
    dom.btnSearch.classList.toggle('active', state.searchMode);
    if (state.searchMode) {
      state.reasonMode = false;
      dom.btnReason.classList.remove('active');
    }
  }

  function toggleReasonMode(force) {
    state.reasonMode = force !== undefined ? force : !state.reasonMode;
    dom.btnReason.classList.toggle('active', state.reasonMode);
    if (state.reasonMode) {
      state.searchMode = false;
      dom.btnSearch.classList.remove('active');
    }
  }

  // ---- Memory ----

  async function loadMemory() {
    try {
      const resp = await fetch('/api/memory');
      const data = await resp.json();
      dom.memoryContent.textContent = data.content || 'No memories stored yet.';
    } catch (e) {
      dom.memoryContent.textContent = 'Failed to load memory.';
    }
  }

  // ---- Settings ----

  async function loadSettings() {
    try {
      // Providers
      const providers = await (await fetch('/api/config/providers')).json();
      dom.providerList.innerHTML = '';
      providers.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'provider-item';
        el.innerHTML = `
          <span class="provider-name">${p.name}</span>
          ${p.model ? `<span style="color:var(--text-tertiary);font-size:12px">${p.model}</span>` : ''}
          <span class="provider-status ${p.configured ? 'configured' : 'missing'}">
            ${p.configured ? 'Active' : 'Not set'}
          </span>
        `;
        dom.providerList.appendChild(el);
      });

      // Status
      const status = await (await fetch('/api/status')).json();
      dom.channelStatus.innerHTML = '';
      Object.entries(status.channels).forEach(([name, enabled]) => {
        const el = document.createElement('div');
        el.className = 'channel-item';
        el.innerHTML = `
          <span class="channel-dot ${enabled ? 'on' : 'off'}"></span>
          <span class="channel-name">${name}</span>
          <span style="color:var(--text-tertiary);font-size:12px">${enabled ? 'Connected' : 'Disabled'}</span>
        `;
        dom.channelStatus.appendChild(el);
      });
    } catch (e) {
      console.error('Settings load failed:', e);
    }
  }

  // ---- Voice input ----

  let mediaRecorder = null;
  let audioChunks = [];

  function toggleVoice() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      dom.btnVoice.classList.remove('recording');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      dom.btnVoice.classList.add('recording');

      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        dom.btnVoice.classList.remove('recording');

        // For now, we'll use the browser's speech recognition as a fallback
        // since voice transcription requires server-side Groq/Whisper
        appendMessage('assistant', 'Voice input recorded. Server-side transcription via Groq Whisper is available when configured.');
      };

      mediaRecorder.start();

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 30000);
    }).catch(() => {
      // Fallback: Use Web Speech API
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        dom.btnVoice.classList.add('recording');

        recognition.onresult = (event) => {
          const text = event.results[0][0].transcript;
          dom.chatInput.value = text;
          dom.btnSend.disabled = !text.trim();
          autoResize(dom.chatInput);
        };

        recognition.onend = () => {
          dom.btnVoice.classList.remove('recording');
        };

        recognition.onerror = () => {
          dom.btnVoice.classList.remove('recording');
        };

        recognition.start();
      }
    });
  }

  // ---- Auto resize textarea ----

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  // ---- Mobile sidebar ----

  let overlay = null;

  function toggleSidebar() {
    dom.sidebar.classList.toggle('open');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.addEventListener('click', toggleSidebar);
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active', dom.sidebar.classList.contains('open'));
  }

  // ---- Event listeners ----

  function init() {
    // Connect WebSocket
    connectWS();

    // Load sessions
    refreshSessions();

    // Send message
    dom.btnSend.addEventListener('click', () => {
      sendMessage(dom.chatInput.value);
    });

    // Enter to send (Shift+Enter for newline)
    dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (dom.chatInput.value.trim()) {
          sendMessage(dom.chatInput.value);
        }
      }
    });

    // Enable/disable send button
    dom.chatInput.addEventListener('input', () => {
      dom.btnSend.disabled = !dom.chatInput.value.trim();
      autoResize(dom.chatInput);
    });

    // New chat
    dom.btnNewChat.addEventListener('click', newChat);

    // Nav items
    $$('.nav-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
      });
    });

    // Model selector
    dom.modelSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModelDropdown();
    });

    $$('.dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        selectModel(item.dataset.provider, item.dataset.model);
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      dom.modelDropdown.classList.add('hidden');
      dom.modelSelector.classList.remove('open');
    });

    dom.modelDropdown.addEventListener('click', (e) => e.stopPropagation());

    // Quick actions
    $$('.quick-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        dom.chatInput.value = prompt + ' ';
        dom.chatInput.focus();
        dom.btnSend.disabled = false;
        autoResize(dom.chatInput);
      });
    });

    // Template cards
    $$('.template-card').forEach((card) => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        dom.chatInput.value = prompt + ' ';
        switchView('chat');
        dom.chatInput.focus();
        dom.btnSend.disabled = false;
        autoResize(dom.chatInput);
      });
    });

    // Search / Reason buttons
    dom.btnSearch.addEventListener('click', () => toggleSearchMode());
    dom.btnReason.addEventListener('click', () => toggleReasonMode());

    // Voice
    dom.btnVoice.addEventListener('click', toggleVoice);

    // Sidebar toggle (mobile)
    dom.sidebarToggle.addEventListener('click', toggleSidebar);

    // Settings sliders
    dom.settingTemp.addEventListener('input', () => {
      dom.tempValue.textContent = dom.settingTemp.value;
    });

    dom.settingTokens.addEventListener('input', () => {
      dom.tokensValue.textContent = dom.settingTokens.value;
    });

    // Memory refresh
    $('#btn-refresh-memory').addEventListener('click', loadMemory);

    // Clear all sessions
    $('#btn-clear-all').addEventListener('click', async () => {
      if (!confirm('Delete all chat history?')) return;
      try {
        const sessions = await (await fetch('/api/sessions')).json();
        for (const s of sessions) {
          await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
        }
        newChat();
      } catch (e) {
        console.error('Clear failed:', e);
      }
    });

    // Fullscreen
    $('#btn-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });

    // Focus input on load
    dom.chatInput.focus();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
