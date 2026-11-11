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
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:640px">
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
  // jlistings.co.uk (and any other .co.uk domain this app serves) gets an
  // England & Wales governing-law clause and the UK-consumer-law carve-outs
  // below; every other domain keeps the US/New York version. Same page,
  // same content everywhere else - just these couple of sections differ.
  const isUk = /\.co\.uk$/i.test(location.hostname);
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:820px">
      <h1 data-i18n="terms">Terms &amp; Conditions</h1>
      <p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <h3>1. Acceptance of Terms</h3>
      <p>By accessing or using this website (the "Site") to browse, post, respond to, or otherwise interact with classifieds, listings, simcha announcements, editorials, or comments, you agree to be bound by these Terms &amp; Conditions. If you do not agree, do not use the Site.</p>

      <h3>2. User-Generated Content</h3>
      <p>All listings, descriptions, images, contact information, editorials, comments, and other content ("Content") are submitted by users and third parties, not by the Site operator. We do not create, verify, endorse, guarantee, or take responsibility for the accuracy, legality, safety, or quality of any Content, item, service, job, property, simcha announcement, editorial, or comment posted. Opinions expressed in editorials and comments are those of their individual authors alone and do not represent the views of the Site operator.</p>

      <h3>3. No Liability</h3>
      <p>The Site is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied. To the fullest extent permitted by law, the Site operator, its owners, employees, and affiliates disclaim all liability for any direct, indirect, incidental, special, consequential, or punitive damages arising out of or related to: (a) your use of or inability to use the Site; (b) any transaction, communication, meeting, or dealing between users arising from a listing; (c) any Content posted by any user, including editorials and comments; (d) any loss of data, profits, goodwill, or other intangible losses; or (e) any conduct of any third party on or off the Site. You use the Site, contact other users, and engage in any transaction entirely at your own risk.</p>
      <p>Nothing in these Terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, or for any other liability which cannot be excluded or limited under applicable law. If you are using the Site as a consumer, nothing in these Terms affects your other statutory rights.</p>

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
      <p>Listing fees, boosts, featured placement, and other paid add-ons are processed via a third-party payment processor, in the currency shown to you at checkout for the domain you're posting on. Editorials are free to submit and publish. See our <a href="/refund-policy">Refund Policy</a> for details on refunds.</p>
      ${isUk ? `<p>If you are a consumer in the UK, these paid add-ons are digital services that we begin supplying immediately once your payment is confirmed (for example, a boost or featured placement takes effect right away). By completing payment, you expressly request that we start immediately and acknowledge that, once we have done so, you lose the right to cancel under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. This does not affect your other statutory rights, including your rights under the Consumer Rights Act 2015 where a service is not performed with reasonable care and skill.</p>` : ''}

      <h3>9. Reporting</h3>
      <p>Users may report listings believed to violate these Terms or applicable law. We review reports at our discretion and are under no obligation to take any particular action.</p>

      <h3>10. Changes</h3>
      <p>We may modify these Terms at any time. Continued use of the Site after changes constitutes acceptance of the updated Terms.</p>

      <h3>11. Governing Law &amp; Jurisdiction</h3>
      ${isUk
        ? `<p>These Terms, and any dispute or claim arising out of or in connection with them or the Site (including non-contractual disputes or claims), are governed by and construed in accordance with the law of England and Wales. The courts of England and Wales will have exclusive jurisdiction, except that if you are a consumer resident elsewhere in the UK, mandatory local consumer-protection law may also give you rights in your own country of residence.</p>`
        : `<p>These Terms, and any dispute or claim arising out of or in connection with them or the Site, are governed by and construed in accordance with the laws of the State of New York, without regard to its conflict-of-laws principles, and you agree to the exclusive jurisdiction of the state and federal courts located in New York for any such dispute.</p>`}

      <h3>12. Contact</h3>
      <p>Questions about these Terms may be directed to the Site administrator via our <a href="/contact">Contact Us</a> page.</p>
    </div>`;
  I18N.apply();
  setPageTitle('Terms & Conditions');
}

function renderRefundPolicyPage() {
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:820px">
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

function renderPrivacyPolicyPage() {
  const isUk = /\.co\.uk$/i.test(location.hostname);
  const siteName = escapeHtml(window.SITE_CONFIG?.siteName || 'JListings');
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:820px">
      <h1 data-i18n="privacy_policy">Privacy Policy</h1>
      <p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <h3>1. Who This Covers</h3>
      <p>This Privacy Policy explains what personal information ${siteName} (the "Site") collects when you browse, post, respond to a listing, chat with Chesky, or otherwise use the Site, and what we do with it. Questions about this policy or a request concerning your information can be sent via our <a href="/contact">Contact Us</a> page.</p>

      <h3>2. Information We Collect</h3>
      <p><strong>When you post a classified, listing, or simcha announcement:</strong> your name, email address, and phone number (so we and, where you choose to show it, other users can reach you), the contact details and images you choose to include in the listing itself, and your location as you enter or select it.</p>
      <p><strong>When you pay for a listing, boost, or other add-on:</strong> payment is handled entirely by Stripe, our payment processor - we never see or store your card number. We keep a record of the amount, currency, invoice number, and Stripe's own transaction reference.</p>
      <p><strong>When you contact us, report a listing, or request to boost/feature a post:</strong> whatever you submit in that form - typically your name, email, and message or reason.</p>
      <p><strong>When you chat with Chesky (our AI assistant) or hand off to a real person:</strong> the messages and, if you send one, the voice note and its transcript; if you start a conversation with our team, also your name and email.</p>
      <p><strong>When you submit an editorial or comment:</strong> the pen name you choose (shown publicly on the Site) plus your real name, email, and phone number, which are kept for our internal records only and are never displayed publicly.</p>
      <p><strong>When you subscribe to email updates:</strong> your email address and the categories you choose to follow.</p>
      <p><strong>Automatically, as you browse:</strong> an anonymous identifier stored in your browser's local storage (not a cookie) used only to tell a unique visit from a recurring one, plus which pages and listings you view or click. This is never tied to your name unless you separately give it to us (e.g. by posting or messaging us), and it is not shared with or sold to anyone outside the Site.</p>

      <h3>3. How We Use It</h3>
      <p>To publish and manage the listings, editorials, and comments you submit; to let other users and our team contact you where you've chosen to be reachable; to process payments and send receipts/invoices; to operate Chesky and route conversations to our team when you ask to talk to one; to send the email updates and digests you've asked for; to moderate content against our <a href="/terms">Terms &amp; Conditions</a>; and to understand overall Site usage so we can keep it running well.</p>

      <h3>4. Who We Share It With</h3>
      <p>We don't sell personal information. We share it only with the service providers that help us run the Site, each only for that purpose: <strong>Stripe</strong> (payments), <strong>Anthropic</strong> (powers Chesky's text replies), <strong>OpenAI</strong> (transcribes Chesky voice notes), <strong>Google</strong> (location autocomplete, where enabled), our email delivery provider, and our hosting provider. Contact information you include directly in a public listing is, by design, visible to anyone who views that listing. We may also disclose information if required by law or to protect the Site, our users, or the public from fraud or harm.</p>

      <h3>5. Cookies &amp; Tracking</h3>
      <p>The Site does not use advertising or third-party tracking cookies. The anonymous visitor identifier described above lives in your browser's local storage rather than a cookie; clearing your browser's site data, or browsing in a private/incognito window, removes it and starts a fresh one next time.</p>

      <h3>6. Data Retention</h3>
      <p>We keep listing, payment, and message records for as long as needed to run the Site, satisfy tax/accounting obligations, and resolve disputes, after which they're deleted or anonymized. Chesky conversations and voice notes are kept to improve replies and resolve support issues and are not retained indefinitely for inactive conversations.</p>

      <h3>7. Children</h3>
      <p>The Site is not directed at children, and we do not knowingly collect personal information from anyone under 16. If you believe a child has provided us information, contact us and we'll remove it.</p>

      ${isUk ? `
      <h3>8. Your Rights (UK GDPR)</h3>
      <p>If you are in the UK, you have the right to ask us for access to, correction of, deletion of, or a copy of your personal information, to object to or restrict certain processing, and to withdraw consent where processing relies on it. Where we process your information to perform a contract with you (e.g. your listing or payment) or for our legitimate interests (e.g. running and securing the Site), you can ask us to stop subject to those interests. To exercise any of these rights, use our <a href="/contact">Contact Us</a> page. If you're not satisfied with our response, you can complain to the UK Information Commissioner's Office (ICO) at ico.org.uk.</p>

      <h3>9. Changes</h3>
      <p>We may update this Privacy Policy from time to time; continued use of the Site after a change means you accept the updated policy.</p>
      ` : `
      <h3>8. Your Choices &amp; Rights</h3>
      <p>Depending on where you live, you may have rights to access, correct, or delete the personal information we hold about you, or to object to certain uses of it. To ask us about, update, or remove your information, use our <a href="/contact">Contact Us</a> page - we'll do our best to help regardless of where you're located.</p>

      <h3>9. Changes</h3>
      <p>We may update this Privacy Policy from time to time; continued use of the Site after a change means you accept the updated policy.</p>
      `}
    </div>`;
  I18N.apply();
  setPageTitle('Privacy Policy');
}

function renderPricingPage() {
  const cfg = window.SITE_CONFIG || {};
  const isGbp = cfg.currency === 'gbp';

  // Mirrors the post wizard's own per-row preview (see postWizard.js's
  // siteAmount()): shows £ where the admin has configured a GBP price for
  // this exact row, $ otherwise. The actual charge at checkout time is
  // always resolved authoritatively server-side.
  function priceFor(row) {
    if (row.price_cents === 0) return 'Free';
    if (isGbp && row.price_cents_gbp !== null && row.price_cents_gbp !== undefined) return formatCents(row.price_cents_gbp, 'gbp');
    return formatCents(row.price_cents);
  }

  function groupByCategory(tiers) {
    const map = new Map();
    tiers.forEach((t) => {
      const key = t.category || 'All categories';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return [...map.entries()];
  }

  function tiersHtml(tiers) {
    if (!tiers.length) return '<p class="hint">No pricing tiers configured yet.</p>';
    return groupByCategory(tiers).map(([cat, list]) => `
      <div class="pricing-group">
        <h4 class="pricing-group-title">${escapeHtml(cat)}</h4>
        <div class="pricing-options">
          ${list.map((t) => `
            <div class="pricing-option ${t.price_cents === 0 ? 'is-free' : ''}">
              <div class="pricing-option-price">${priceFor(t)}</div>
              <div class="pricing-option-name">${escapeHtml(t.name)}</div>
              <div class="pricing-option-duration">${t.duration_days} day${t.duration_days === 1 ? '' : 's'}</div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  function addonsHtml(addons) {
    const items = Object.entries(addons || {}).filter(([, a]) => a);
    if (!items.length) return '';
    return `
      <ul class="pricing-addon-list">
        ${items.map(([key, a]) => `<li><span>${escapeHtml(a.config?.label || key)}</span><span>${priceFor(a)}</span></li>`).join('')}
      </ul>`;
  }

  const tiers = cfg.pricingTiers || [];
  const classifiedTiers = tiers.filter((t) => (t.post_type || 'classified') === 'classified');
  const listingTiers = tiers.filter((t) => t.post_type === 'listing');
  const simchaTiers = tiers.filter((t) => t.post_type === 'simcha');

  document.getElementById('app').innerHTML = `
    <div class="container" style="padding-top:30px;padding-bottom:60px;max-width:900px">
      <div class="page-header"><h1>Pricing</h1></div>
      <p class="hint" style="margin-bottom:26px">Simple, transparent pricing for every way to post. Lost &amp; Found is always free.${isGbp ? ' Prices shown in £ where configured.' : ''}</p>

      <section class="pricing-section">
        <div class="pricing-section-head"><h2>Classifieds</h2><a href="/post">Post a Classified &rarr;</a></div>
        ${tiersHtml(classifiedTiers)}
        ${addonsHtml(cfg.addons?.classified)}
      </section>

      <section class="pricing-section">
        <div class="pricing-section-head"><h2>Listings</h2><a href="/post">Post a Listing &rarr;</a></div>
        ${tiersHtml(listingTiers)}
        ${addonsHtml(cfg.addons?.listing)}
      </section>

      <section class="pricing-section">
        <div class="pricing-section-head"><h2>Simchas</h2><a href="/post">Share a Simcha &rarr;</a></div>
        ${tiersHtml(simchaTiers)}
      </section>

      <p class="hint" style="margin-top:10px">See our <a href="/refund-policy">Refund Policy</a> for details on cancellations and refunds.</p>
    </div>`;
  I18N.apply();
  setPageTitle('Pricing');
}
