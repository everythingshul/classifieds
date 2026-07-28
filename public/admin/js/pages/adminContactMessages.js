let _cmShowArchived = false;

async function renderContactMessagesPage() {
  const root = document.getElementById('adminContent');
  const { messages } = await AdminApi.contactMessages();
  const visible = messages.filter((m) => (_cmShowArchived ? true : !m.archived));

  root.innerHTML = `
    <h1>Contact Messages</h1>
    <div class="admin-card">
      <label style="display:inline-flex;align-items:center;gap:6px;margin-bottom:12px">
        <input type="checkbox" id="showArchived" ${_cmShowArchived ? 'checked' : ''}> Show archived / replied messages
      </label>
      ${visible.length ? visible.map((m) => renderMessageCard(m)).join('') : '<p class="hint">No messages here.</p>'}
    </div>
  `;

  document.getElementById('showArchived').addEventListener('change', (e) => {
    _cmShowArchived = e.target.checked;
    renderContactMessagesPage();
  });

  document.querySelectorAll('.cm-card').forEach((card) => {
    const id = card.dataset.id;
    const m = messages.find((x) => String(x.id) === id);

    card.querySelector('.cm-archive-toggle')?.addEventListener('click', async () => {
      await AdminApi.archiveContactMessage(id, !m.archived);
      renderContactMessagesPage();
    });
    card.querySelector('.cm-delete')?.addEventListener('click', async () => {
      if (!confirm('Permanently delete this message?')) return;
      await AdminApi.deleteContactMessage(id);
      renderContactMessagesPage();
    });
    const replyBtn = card.querySelector('.cm-reply-btn');
    const replyBox = card.querySelector('.cm-reply-box');
    if (replyBtn) replyBtn.addEventListener('click', () => {
      replyBox.style.display = replyBox.style.display === 'none' ? 'block' : 'none';
    });
    const sendBtn = card.querySelector('.cm-reply-send');
    if (sendBtn) sendBtn.addEventListener('click', async () => {
      const textarea = card.querySelector('.cm-reply-text');
      const text = textarea.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        await AdminApi.replyContactMessage(id, text);
        toast('Reply sent');
        renderContactMessagesPage();
      } catch (e) {
        alert(`Failed to send: ${e.message}`);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Reply';
      }
    });
  });
}

function renderMessageCard(m) {
  return `
    <div class="cm-card" data-id="${m.id}" style="border:1px solid var(--border);padding:12px;margin-bottom:10px;${m.archived ? 'opacity:.7' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div>
          <b>${escapeHtml(m.name || '(no name)')}</b> &lt;${escapeHtml(m.email)}&gt;
          ${m.subject ? ` — <span>${escapeHtml(m.subject)}</span>` : ''}
        </div>
        <span class="hint">${formatDate(m.created_at)}</span>
      </div>
      <p style="white-space:pre-wrap;margin:8px 0">${escapeHtml(m.message)}</p>
      ${m.reply_text ? `
        <div style="background:#f4f6f8;padding:8px 10px;margin:8px 0;border-left:3px solid var(--cta)">
          <div class="hint">Your reply (${formatDate(m.replied_at)}):</div>
          <p style="white-space:pre-wrap;margin:4px 0 0">${escapeHtml(m.reply_text)}</p>
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-sm cm-reply-btn" type="button">Reply</button>
        <button class="btn btn-sm btn-outline cm-archive-toggle" type="button">${m.archived ? 'Unarchive' : 'Archive'}</button>
        <button class="btn btn-sm btn-danger cm-delete" type="button">Delete</button>
      </div>
      <div class="cm-reply-box" style="display:none;margin-top:10px">
        <textarea class="cm-reply-text" rows="4" style="width:100%" placeholder="Type your reply…">${m.reply_text ? escapeHtml(m.reply_text) : ''}</textarea>
        <button class="btn btn-sm btn-gold cm-reply-send" type="button" style="margin-top:6px">Send Reply</button>
      </div>
    </div>
  `;
}
