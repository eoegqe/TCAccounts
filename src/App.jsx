import { useState } from "react";

function Brand() {
  return (
    <a className="brand" href="/" aria-label="TC Accounts home">
      <span className="brand-mark">TC</span>
      <span className="brand-name">TC Accounts</span>
    </a>
  );
}

function Field({ label, type = "text", placeholder, value, onChange, autoComplete }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
      />
    </label>
  );
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");

  const isRegister = mode === "register";

  function switchMode(nextMode) {
    setMode(nextMode);
    setNotice("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    setNotice("The interface is ready, but account creation and sign-in are not connected to a secure backend yet.");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <a className="top-link" href="https://creations.theegget.com">Theegget Creations <span aria-hidden="true">↗</span></a>
      </header>

      <main className="main-content">
        <section className="intro">
          <div className="eyebrow"><span className="status-dot" /> THEEGGET CREATIONS</div>
          <h1>One account.<br /><span>Everywhere TC.</span></h1>
          <p>Your TC Account gives you one identity to use across participating Theegget Creations products and services.</p>
          <div className="benefits">
            <div><span className="benefit-icon">01</span><span><strong>Your account, your way</strong><small>Create your account directly with TC.</small></span></div>
            <div><span className="benefit-icon">02</span><span><strong>Login with TC</strong><small>Use the same account on supported platforms.</small></span></div>
            <div><span className="benefit-icon">03</span><span><strong>You're in control</strong><small>Manage your profile and connected apps.</small></span></div>
          </div>
        </section>

        <section className="auth-card" aria-labelledby="form-title">
          <div className="card-topline"><span>TC ACCOUNT</span><span className="secure-label">PRIVATE BY DESIGN</span></div>
          <div className="mode-switch" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button>
            <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? "active" : ""} onClick={() => switchMode("register")}>Create account</button>
          </div>

          <div className="form-heading">
            <h2 id="form-title">{isRegister ? "Create your TC Account" : "Welcome back."}</h2>
            <p>{isRegister ? "Register directly with Theegget Creations." : "Sign in with your TC credentials."}</p>
          </div>

          <form onSubmit={handleSubmit}>
            {isRegister && <Field label="TC username" placeholder="Choose a username" value={username} onChange={setUsername} autoComplete="username" />}
            {!isRegister && <Field label="TC username or email" placeholder="Enter your username or email" value={username} onChange={setUsername} autoComplete="username" />}
            {isRegister && <Field label="Email address" type="email" placeholder="you@example.com" value={email} onChange={setEmail} autoComplete="email" />}
            <Field label="Password" type="password" placeholder={isRegister ? "Create a strong password" : "Enter your password"} value={password} onChange={setPassword} autoComplete={isRegister ? "new-password" : "current-password"} />
            {isRegister && <p className="field-note">Use an email address you already own. TC employee email addresses are reserved for employees.</p>}
            {!isRegister && <button className="forgot-link" type="button" onClick={() => setNotice("Password recovery will be available once the secure account backend is connected.")}>Forgot password?</button>}
            <button className="primary-button" type="submit">{isRegister ? "Create TC Account" : "Sign in"} <span aria-hidden="true">→</span></button>
          </form>

          {notice && <div className="notice" role="status">{notice}</div>}

          <div className="divider"><span>TC IDENTITY</span></div>
          <p className="no-external">TC Accounts are created directly with TC. External accounts such as Google, Microsoft, and Apple cannot be used to create a TC Account.</p>
          <p className="switch-prompt">{isRegister ? "Already have a TC Account?" : "New to TC Accounts?"} <button type="button" onClick={() => switchMode(isRegister ? "login" : "register")}>{isRegister ? "Sign in" : "Create one"}</button></p>
        </section>
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} Theegget Creations</span>
        <span>TC Accounts <span className="footer-separator">/</span> Identity</span>
      </footer>
    </div>
  );
}