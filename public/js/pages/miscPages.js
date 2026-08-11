// Standalone single-purpose pages (bookmarks, contact form, legal) grouped
// into one file - each is small enough that a dedicated file per page isn't
// worth the extra file count.

async function renderBookmarksPage() {
  const grouped = Bookmarks.grouped();
  const [classifieds, listings, simchas] = await Promise.all([
    grouped.classified.length ? Api.postsByIds(grouped.classified) : { posts: [] },
    grouped.listing.length ? Api.postsByIds(grouped.listing) : { posts: [] },
    grouped.simcha.length ? Api.postsByIds(grouped.simcha) : { posts: [] },
  ]);
  const posts = [...classifieds.posts, ...listings.posts, ...simchas.posts];

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header"><h1 data-i18n="nav_bookmarks">Bookmarks</h1></div>
      ${renderGrid(posts)}
    </div>
  `;
  I18N.apply();
  setPageTitle('Bookmarks');
}

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

function renderTermsPage() {
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding:30px 0 60px;max-width:820px">
      <h1 data-i18n="terms">Terms &amp; Conditions</h1>
      <p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <h3>1. Acceptance of Terms</h3>
      <p>By accessing or using this website (the "Site") to browse, post, respond to, or otherwise interact with classifieds, listings, simcha announcements, editorials, or comments, you agree to be bound by these Terms &amp; Conditions. If you do not agree, do not use the Site.</p>

      <h3>2. User-Generated Content</h3>
      <p>All listings, descriptions, images, contact information, editorials, comments, and other content ("Content") are submitted by users and third parties, not by the Site operator. We do not create, verify, endorse, guarantee, or take responsibility for the accuracy, legality, safety, or quality of any Content, item, service, job, property, simcha announcement, editorial, or comment posted. Opinions expressed in editorials and comments are those of their individual authors alone and do not represent the views of the Site operator.</p>

      <h3>3. No Liability</h3>
      <p>The Site is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied. To the fullest extent permitted by law, the Site operator, its owners, employees, and affiliates disclaim all liability for any direct, indirect, incidental, special, consequential, or punitive damages arising out of or related to: (a) your use of or inability to use the Site; (b) any transaction, communication, meeting, or dealing between users arising from a listing; (c) any Content posted by any user, including editorials and comments; (d) any loss of data, profits, goodwill, or other intangible losses; or (e) any conduct of any third party on or off the Site. You use the Site, contact other users, and engage in any transaction entirely at your own risk.</p>

      <h3>4. No Employment, Sale, or Agency Relationship</h3>
      <p>The Site is a venue only. We are not a party to any job offer, sale, rental, service agreement, or other arrangement made between users. We do not perform background checks, verify credentials, appraise items, or inspect properties.</p>

      <h3>5. Content Standards &amp; Moderation</h3>
      <p>We reserve the right, but not the obligation, to review, approve, reject, edit, or remove any Content or listing at any time, for any reason, without notice, including but not limited to listings containing images of identifiable people, prohibited items, fraudulent claims, or content that violates these Terms.</p>

      <h3>6. Editorials &amp; Comments</h3>
      <p>Editorials are free, community-submitted opinion pieces and articles. All editorials require our approval before publishing, and we may decline to publish any submission for any reason. A pen name you choose is displayed publicly alongside your editorial in place of your name; your legal name, email address, and phone number are collected for our internal records only and are never displayed publicly. By submitting an editorial (including any photos or video links included with it), you grant the Site a non-exclusive, royalty-free license to publish, display, and distribute that content on the Site. You are solely responsible for ensuring you have the rights to any content you submit, including photos and videos.</p>
      <p>Comments on editorials likewise require approval before appearing publicly and require a pen name and email address. We may reject, remove, or edit any comment at our discretion, including after it has been approved and published.</p>

      <h3>7. Indemnification</h3>
      <p>You agree to indemnify and hold harmless the Site operator from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of your use of the Site, your Content, or your violation of these Terms.</p>

      <h3>8. Payments</h3>
      <p>Listing fees, boosts, featured placement, and other paid add-ons are processed via a third-party payment processor. Editorials are free to submit and publish. See our <a href="/refund-policy">Refund Policy</a> for details on refunds.</p>

      <h3>9. Reporting</h3>
      <p>Users may report listings believed to violate these Terms or applicable law. We review reports at our discretion and are under no obligation to take any particular action.</p>

      <h3>10. Changes</h3>
      <p>We may modify these Terms at any time. Continued use of the Site after changes constitutes acceptance of the updated Terms.</p>

      <h3>11. Contact</h3>
      <p>Questions about these Terms may be directed to the Site administrator.</p>
    </div>`;
  I18N.apply();
  setPageTitle('Terms & Conditions');
}

function renderRefundPolicyPage() {
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding:30px 0 60px;max-width:820px">
      <h1 data-i18n="refund_policy">Refund Policy</h1>
      <p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <h3>General Policy</h3>
      <p>All fees paid for listings, listing durations, boosts, featured/striking placement, and oversized post add-ons are <strong>non-refundable</strong> once a listing has been published or a paid enhancement has been applied, except as required by applicable law or at our sole discretion.</p>

      <h3>Rejected or Removed Listings</h3>
      <p>If a listing is rejected during moderation before going live, you may request a full refund by contacting the Site administrator. If a listing is removed after going live due to a violation of our Terms &amp; Conditions, no refund will be issued.</p>

      <h3>Boosts &amp; Featured Placement</h3>
      <p>Boost and featured/striking fees are charged for the service of moving a listing to the top or highlighting it at the time of purchase. Because this service is rendered immediately, these fees are non-refundable.</p>

      <h3>Duplicate or Erroneous Charges</h3>
      <p>If you believe you were charged in error or charged more than once for the same listing, contact the Site administrator with your invoice number and payment details for review.</p>

      <h3>How to Request a Refund</h3>
      <p>Email the Site administrator with your invoice number, the email address used to post, and the reason for your request. Approved refunds are issued to the original payment method within a reasonable time.</p>
    </div>`;
  I18N.apply();
  setPageTitle('Refund Policy');
}
