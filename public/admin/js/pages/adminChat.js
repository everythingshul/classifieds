let chatTab = 'conversations';
let chatSelectedId = null;

async function renderChatPage() {
  const root = document.getElementById('adminContent');
  root.innerHTML = `
    <h1>Chesky Chat</h1>
    <div class="tabs">
      <button data-tab="conversations" class="${chatTab === 'conversations' ? 'active' : ''}">Conversations</button>
      <button data-tab="teach" class="${chatTab === 'teach' ? 'active' : ''}">Teach Chesky</button>
    </div>
    <div id="chatTabBody"></div>
  `;
  root.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => { chatTab = btn.dataset.tab; renderChatPage(); }));
  if (chatTab === 'conversations') await renderChatConversationsTab();
  else await renderChatTeachTab();
}

async function renderChatConversationsTab() {
  const body = document.getElementById('chatTabBody');
  const { conversations } = await AdminApi.chatConversations();
  body.innerHTML = `
    <div class="chat-layout">
      <div class="admin-card chat-list">
        ${conversations.length ? conversations.map((c) => `
          <div class="chat-row ${c.id === chatSelectedId ? 'active' : ''}" data-id="${c.id}">
            <div class="chat-row-top">
              <span class="chat-row-name">${escapeHtml(c.name || c.email)}</span>
              ${c.unread ? '<span class="pill pill-danger">new</span>' : ''}
            </div>
            <div class="chat-row-last">${escapeHtml(c.last || '')}</div>
            <div class="chat-row-meta">${formatDate(c.updatedAt)} &middot; ${c.status}</div>
          </div>`).join('') : '<p class="hint" style="padding:16px">No conversations yet.</p>'}
      </div>
      <div id="chatDetailPanel" class="admin-card">
        <p class="hint">Select a conversation to view it.</p>
      </div>
    </div>
  `;
  body.querySelectorAll('.chat-row').forEach((row) => {
    row.addEventListener('click', () => { chatSelectedId = row.dataset.id; renderChatConversationsTab(); loadChatDetail(row.dataset.id); });
  });
  if (chatSelectedId) await loadChatDetail(chatSelectedId);
}

async function loadChatDetail(id) {
  const panel = document.getElementById('chatDetailPanel');
  const conv = await AdminApi.chatConversation(id);
  panel.innerHTML = `
    <div class="chat-detail-head">
      <div>
        <h3>${escapeHtml(conv.name || conv.email)}</h3>
        <p class="hint chat-detail-sub">${escapeHtml(conv.email)}${conv.page ? ` &middot; ${escapeHtml(conv.page)}` : ''}</p>
      </div>
      <div class="chat-detail-actions">
        <button class="btn btn-sm btn-ghost" id="chatToggleStatusBtn">${conv.status === 'closed' ? 'Reopen' : 'Close'}</button>
        <button class="btn btn-sm btn-ghost" id="chatDeleteBtn" style="color:var(--danger)">Delete</button>
      </div>
    </div>
    <div class="chat-log">
      ${conv.messages.map((m) => `
        <div class="chat-bubble-row from-${m.from}">
          <div class="chat-bubble-col">
            <div class="chat-bubble-who">${m.from === 'admin' ? 'You' : m.from === 'bot' ? 'Chesky' : (conv.name || 'Visitor')} &middot; ${formatDate(m.ts)}</div>
            <div class="chat-bubble">${m.voice ? `<audio controls src="${escapeHtml(m.voice.url)}"></audio>` : ''}${m.text ? escapeHtml(m.text).replace(/\n/g, '<br>') : ''}</div>
          </div>
        </div>
      `).join('') || '<p class="hint">No messages.</p>'}
    </div>
    <form id="chatReplyForm">
      <div class="form-row"><textarea name="text" rows="3" placeholder="Type a reply..." required></textarea></div>
      <label class="hint" style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
        <input type="checkbox" id="chatAlsoTeach"> Also teach Chesky this answer
      </label>
      <div id="chatTeachFields" style="display:none;margin-bottom:10px">
        <div class="form-row"><label>Question this answers</label><input name="teachQ" placeholder="e.g. How do I boost my post?"></div>
      </div>
      <button class="btn btn-sm" type="submit">Send reply</button>
    </form>
  `;
  document.getElementById('chatToggleStatusBtn').addEventListener('click', async () => {
    await AdminApi.chatSetStatus(id, conv.status === 'closed' ? 'open' : 'closed');
    loadChatDetail(id);
  });
  document.getElementById('chatDeleteBtn').addEventListener('click', async () => {
    if (!confirm('Delete this conversation permanently?')) return;
    await AdminApi.deleteChatConversation(id);
    chatSelectedId = null;
    renderChatConversationsTab();
  });
  document.getElementById('chatAlsoTeach').addEventListener('change', (e) => {
    document.getElementById('chatTeachFields').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('chatReplyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const also = document.getElementById('chatAlsoTeach').checked;
    const teach = also && fd.teachQ ? { q: fd.teachQ, a: fd.text } : undefined;
    try {
      await AdminApi.chatReply(id, fd.text, teach);
      toast('Reply sent');
      loadChatDetail(id);
      renderChatConversationsTab();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function teachFormHtml(entry) {
  return `
    <form id="teachForm">
      <input type="hidden" name="id" value="${entry?.id || ''}">
      <input type="hidden" name="dropKey" value="${escapeHtml(entry?.dropKey || '')}">
      <div class="form-row"><label>Question(s) that trigger this answer <span class="hint">(one per line)</span></label>
        <textarea name="qs" rows="3" required>${escapeHtml((entry?.questions || []).join('\n'))}</textarea></div>
      <div class="form-row"><label>Answer</label><textarea name="r" rows="4" required>${escapeHtml(entry?.answer || '')}</textarea></div>
      <button class="btn btn-sm" type="submit">${entry?.id ? 'Save' : 'Teach Chesky'}</button>
    </form>
  `;
}

function wireTeachForm(onDone) {
  document.getElementById('teachForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const qs = fd.qs.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      await AdminApi.chatTeach({ id: fd.id || undefined, qs, r: fd.r, drop: fd.dropKey ? [fd.dropKey] : [] });
      Modal.close();
      toast('Chesky learned it');
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function renderChatTeachTab() {
  const body = document.getElementById('chatTabBody');
  const { unanswered, learned, stats } = await AdminApi.chatLearn();
  body.innerHTML = `
    <div class="admin-card">
      <h3>Couldn't answer (${unanswered.length})</h3>
      <p class="hint">Questions visitors asked that Chesky declined or got thumbed down on - teach the real answer and it won't miss that one again.</p>
      ${unanswered.length ? unanswered.map((u) => `
        <div class="chat-teach-row">
          <div>
            <div class="chat-teach-q">${escapeHtml(u.question)}</div>
            <div class="chat-teach-sub">missed ${u.miss} &middot; thumbs down ${u.down} &middot; last ${formatDate(u.lastAt)}</div>
          </div>
          <div class="chat-teach-actions">
            <button class="btn btn-sm teach-unanswered-btn" data-key="${escapeHtml(u.key)}" data-q="${escapeHtml(u.question)}">Teach</button>
            <button class="btn btn-sm btn-ghost dismiss-unanswered-btn" data-key="${escapeHtml(u.key)}">Dismiss</button>
          </div>
        </div>
      `).join('') : '<p class="hint">Nothing waiting.</p>'}
    </div>

    <div class="admin-card">
      <div class="chat-card-head">
        <h3>What Chesky knows (${learned.length})</h3>
        <button class="btn btn-sm" id="teachNewBtn">+ Teach new answer</button>
      </div>
      ${learned.length ? learned.map((l) => `
        <div class="chat-teach-row">
          <div>
            <div class="chat-teach-chips">${l.questions.map((q) => `<span class="pill pill-blue">${escapeHtml(q)}</span>`).join('')}</div>
            <div class="chat-teach-q">${escapeHtml(l.answer)}</div>
            <div class="chat-teach-sub">&#128077; ${stats[l.id]?.up || 0} &middot; &#128078; ${stats[l.id]?.down || 0}</div>
          </div>
          <div class="chat-teach-actions">
            <button class="btn btn-sm btn-ghost edit-learned-btn" data-id="${l.id}">Edit</button>
            <button class="btn btn-sm btn-ghost forget-learned-btn" data-id="${l.id}" style="color:var(--danger)">Delete</button>
          </div>
        </div>
      `).join('') : '<p class="hint">Nothing taught yet.</p>'}
    </div>
  `;

  body.querySelectorAll('.teach-unanswered-btn').forEach((btn) => btn.addEventListener('click', () => {
    Modal.open('Teach Chesky', teachFormHtml({ questions: [btn.dataset.q], dropKey: btn.dataset.key }));
    wireTeachForm(renderChatTeachTab);
  }));
  body.querySelectorAll('.dismiss-unanswered-btn').forEach((btn) => btn.addEventListener('click', async () => {
    await AdminApi.chatDismissUnanswered(btn.dataset.key);
    renderChatTeachTab();
  }));
  document.getElementById('teachNewBtn').addEventListener('click', () => {
    Modal.open('Teach Chesky', teachFormHtml());
    wireTeachForm(renderChatTeachTab);
  });
  body.querySelectorAll('.edit-learned-btn').forEach((btn) => btn.addEventListener('click', () => {
    const entry = learned.find((l) => l.id === btn.dataset.id);
    Modal.open('Edit taught answer', teachFormHtml(entry));
    wireTeachForm(renderChatTeachTab);
  }));
  body.querySelectorAll('.forget-learned-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Delete this taught answer?')) return;
    await AdminApi.chatForget(btn.dataset.id);
    renderChatTeachTab();
  }));
}
