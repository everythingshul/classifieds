function renderTermsPage() {
  document.getElementById('app').innerHTML = `
    <div class="container" style="padding:30px 0 60px;max-width:820px">
      <h1 data-i18n="terms">Terms &amp; Conditions</h1>
      <p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <h3>1. Acceptance of Terms</h3>
      <p>By accessing or using this website (the "Site") to browse, post, respond to, or otherwise interact with classifieds or simcha announcements, you agree to be bound by these Terms &amp; Conditions. If you do not agree, do not use the Site.</p>

      <h3>2. User-Generated Content</h3>
      <p>All listings, descriptions, images, contact information, and other content ("Content") are submitted by users and third parties, not by the Site operator. We do not create, verify, endorse, guarantee, or take responsibility for the accuracy, legality, safety, or quality of any Content, item, service, job, property, or simcha announcement posted.</p>

      <h3>3. No Liability</h3>
      <p>The Site is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied. To the fullest extent permitted by law, the Site operator, its owners, employees, and affiliates disclaim all liability for any direct, indirect, incidental, special, consequential, or punitive damages arising out of or related to: (a) your use of or inability to use the Site; (b) any transaction, communication, meeting, or dealing between users arising from a listing; (c) any Content posted by any user; (d) any loss of data, profits, goodwill, or other intangible losses; or (e) any conduct of any third party on or off the Site. You use the Site, contact other users, and engage in any transaction entirely at your own risk.</p>

      <h3>4. No Employment, Sale, or Agency Relationship</h3>
      <p>The Site is a venue only. We are not a party to any job offer, sale, rental, service agreement, or other arrangement made between users. We do not perform background checks, verify credentials, appraise items, or inspect properties.</p>

      <h3>5. Content Standards &amp; Moderation</h3>
      <p>We reserve the right, but not the obligation, to review, approve, reject, edit, or remove any Content or listing at any time, for any reason, without notice, including but not limited to listings containing images of identifiable people, prohibited items, fraudulent claims, or content that violates these Terms.</p>

      <h3>6. Indemnification</h3>
      <p>You agree to indemnify and hold harmless the Site operator from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of your use of the Site, your Content, or your violation of these Terms.</p>

      <h3>7. Payments</h3>
      <p>Listing fees, boosts, featured placement, and other paid add-ons are processed via a third-party payment processor. See our <a href="/refund-policy">Refund Policy</a> for details on refunds.</p>

      <h3>8. Reporting</h3>
      <p>Users may report listings believed to violate these Terms or applicable law. We review reports at our discretion and are under no obligation to take any particular action.</p>

      <h3>9. Changes</h3>
      <p>We may modify these Terms at any time. Continued use of the Site after changes constitutes acceptance of the updated Terms.</p>

      <h3>10. Contact</h3>
      <p>Questions about these Terms may be directed to the Site administrator.</p>
    </div>`;
  I18N.apply();
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
}
