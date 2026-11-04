let chatTab = 'conversations';
let chatSelectedId = null;

async function renderChatPage() {
  const root = document.getElementById('adminContent');
  root.innerHTML = `
    <h1>Chesky Chat</h1>
    <div class="tabs" style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn btn-sm ${chatTab === 'conversations' ? '' : 'btn-outline'}" id="chatTabConv">Conversations</button>
      <button class="btn btn-sm ${chatTab === 'teach' ? '' : 'btn-outline'}" id="chatTabTeach">Teach Chesky</button>
    </div>
    <div id="chatTabBody"></div>
  `;
  document.getElementById('chatTabConv').addEventListener('click', () => { chatTab = 'conversations'; renderChatPage(); });
  document.getElementById('chatTabTeach').addEventListener('click', () => { chatTab = 'teach'; renderChatPage(); });
  if (chatTab === 'conversations') await renderChatConversationsTab();
  else await renderChatTeachTab();
}

async function renderChatConversationsTab() {
  const body = document.getElementById('chatTabBody');
  const { conversations } = await AdminApi.chatConversations();
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:16px;align-items:start">
      <div class="admin-card" style="padding:0;max-height:70vh;overflow-y:auto">
        ${conversations.length ? conversations.map((c) => `
          <div class="chat-conv-row" data-id="${c.id}" style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;${c.id === chatSelectedId ? 'background:#f6f4ee' : ''}">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <strong style="font-size:.9rem">${escapeHtml(c.name || c.email)}</strong>
              ${c.unread ? '<span class="tag" style="background:#fbe4e4;color:var(--danger)">new</span>' : ''}
            </div>
            <div class="hint" style="margin:2px 0">${escapeHtml(c.last || '')}</div>
            <div class="hint" style="font-size:.72rem">${formatDate(c.updatedAt)} &middot; ${c.status}</div>
          </div>`).join('') : '<p class="hint" style="padding:14px">No conversations yet.</p>'}
      </div>
      <div id="chatDetailPanel" class="admin-card">
        <p class="hint">Select a conversation to view it.</p>
      </div>
    </div>
  `;
  body.querySelectorAll('.chat-conv-row').forEach((row) => {
    row.addEventListener('click', () => { chatSelectedId = row.dataset.id; renderChatConversationsTab(); loadChatDetail(row.dataset.id); });
  });
  if (chatSelectedId) await loadChatDetail(chatSelectedId);
}

async function loadChatDetail(id) {
  const panel = document.getElementById('chatDetailPanel');
  const conv = await AdminApi.chatConversation(id);
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
      <div>
        <h3 style="margin:0">${escapeHtml(conv.name || conv.email)}</h3>
        <p class="hint" style="margin:2px 0">${escapeHtml(conv.email)}${conv.page ? ` &middot; ${escapeHtml(conv.page)}` : ''}</p>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-outline" id="chatToggleStatusBtn">${conv.status === 'closed' ? 'Reopen' : 'Close'}</button>
        <button class="btn btn-sm btn-outline" id="chatDeleteBtn" style="color:var(--danger)">Delete</button>
      </div>
    </div>
    <div class="chat-log" style="max-height:40vh;overflow-y:auto;margin:14px 0;padding:10px;background:#faf8f4;border:1px solid var(--border)">
      ${conv.messages.map((m) => `
        <div style="margin-bottom:10px;text-align:${m.from === 'admin' ? 'right' : 'left'}">
          <div class="hint" style="font-size:.72rem">${m.from === 'admin' ? 'You' : m.from === 'bot' ? 'Chesky' : (conv.name || 'Visitor')} &middot; ${formatDate(m.ts)}</div>
          <div style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:10px;background:${m.from === 'admin' ? '#1f3b57' : '#fff'};color:${m.from === 'admin' ? '#fff' : '#1f2a33'};border:1px solid var(--border);text-align:left">
            ${m.voice ? `<audio controls src="${escapeHtml(m.voice.url)}" style="max-width:220px"></audio>` : escapeHtml(m.text || '').replace(/\n/g, '<br>')}
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
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Couldn't answer (${unanswered.length})</h3>
      </div>
      <p class="hint">Questions visitors asked that Chesky declined or got thumbed down on - teach the real answer and it won't miss that one again.</p>
      ${unanswered.length ? unanswered.map((u) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div>${escapeHtml(u.question)}</div>
            <div class="hint" style="font-size:.72rem">missed ${u.miss} &middot; thumbs down ${u.down} &middot; last ${formatDate(u.lastAt)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-sm teach-unanswered-btn" data-key="${escapeHtml(u.key)}" data-q="${escapeHtml(u.question)}">Teach</button>
            <button class="btn btn-sm btn-outline dismiss-unanswered-btn" data-key="${escapeHtml(u.key)}">Dismiss</button>
          </div>
        </div>
      `).join('') : '<p class="hint">Nothing waiting.</p>'}
    </div>

    <div class="admin-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">What Chesky knows (${learned.length})</h3>
        <button class="btn btn-sm" id="teachNewBtn">+ Teach new answer</button>
      </div>
      ${learned.length ? learned.map((l) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <div>
              <div>${l.questions.map((q) => `<span class="tag" style="margin-right:4px">${escapeHtml(q)}</span>`).join('')}</div>
              <div style="margin-top:4px">${escapeHtml(l.answer)}</div>
              <div class="hint" style="font-size:.72rem">&#128077; ${stats[l.id]?.up || 0} &middot; &#128078; ${stats[l.id]?.down || 0}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-sm btn-outline edit-learned-btn" data-id="${l.id}">Edit</button>
              <button class="btn btn-sm btn-outline forget-learned-btn" data-id="${l.id}" style="color:var(--danger)">Delete</button>
            </div>
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
