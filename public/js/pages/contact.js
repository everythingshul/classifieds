function renderContactPage() {
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding:30px 0 60px;max-width:640px">
      <div class="page-header"><h1>Contact Us</h1></div>
      <p class="hint">Questions, feedback, or an issue with a listing? Send us a message and we'll get back to you.</p>
      <form id="contactForm" class="form-card">
        <div class="form-cols">
          <div class="form-row"><label>Name <span class="hint">(optional)</span></label><input type="text" id="c_name"></div>
          <div class="form-row"><label>Email</label><input type="email" id="c_email" required></div>
        </div>
        <div class="form-row"><label>Subject <span class="hint">(optional)</span></label><input type="text" id="c_subject"></div>
        <div class="form-row"><label>Message</label><textarea id="c_message" rows="6" required></textarea></div>
        <div id="contactError" class="error-list" style="display:none"></div>
        <div id="contactSuccess" style="display:none"><p class="hint" style="color:var(--success)">Thanks - your message has been sent. We'll be in touch soon.</p></div>
        <button class="btn" type="submit" id="contactSubmitBtn">Send Message</button>
      </form>
    </div>`;
  I18N.apply();
  setPageTitle('Contact Us');

  document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('contactSubmitBtn');
    const errBox = document.getElementById('contactError');
    const successBox = document.getElementById('contactSuccess');
    errBox.style.display = 'none';
    successBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await Api.contact({
        name: document.getElementById('c_name').value.trim(),
        email: document.getElementById('c_email').value.trim(),
        subject: document.getElementById('c_subject').value.trim(),
        message: document.getElementById('c_message').value.trim(),
      });
      document.getElementById('contactForm').reset();
      successBox.style.display = 'block';
    } catch (e2) {
      errBox.style.display = 'block';
      errBox.innerHTML = `<ul>${(e2.data?.details || [e2.message]).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Message';
    }
  });
}
