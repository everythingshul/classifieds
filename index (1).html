function renderLoginPage() {
  document.getElementById('adminContent').innerHTML = `
    <div class="login-wrap admin-card">
      <h2 style="margin-top:0">Admin Login</h2>
      <form id="loginForm">
        <div class="form-row"><label>Email</label><input type="email" id="email" required></div>
        <div class="form-row"><label>Password</label><input type="password" id="password" required></div>
        <div id="loginError" class="error-list" style="display:none"></div>
        <button class="btn" type="submit" style="width:100%">Log In</button>
      </form>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { token } = await AdminApi.login(document.getElementById('email').value, document.getElementById('password').value);
      AdminApi.setToken(token);
      window.location.hash = '#/dashboard';
      AdminRouter.resolve();
    } catch (err) {
      const box = document.getElementById('loginError');
      box.style.display = 'block';
      box.textContent = err.message;
    }
  });
}
