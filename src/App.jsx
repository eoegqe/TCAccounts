import { useEffect, useState } from "react";

const API = "/api";

async function request(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
  return data;
}

function Brand() {
  return <a className="brand" href="/" aria-label="TC Accounts home"><span className="brand-icon">TC</span><span>TC Accounts</span></a>;
}

function TextField({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} required /></label>;
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    request("/me").then(result => {
      if (active) setUser(result.user || null);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const accountsPage = path === "/accounts" || path.startsWith("/accounts/");

  function navigate(nextPath) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    setMessage("");
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword("");
    setMessage("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = mode === "register"
        ? await request("/register", { method: "POST", body: JSON.stringify({ username: identifier.trim(), email: email.trim(), password }) })
        : await request("/login", { method: "POST", body: JSON.stringify({ identifier: identifier.trim(), password }) });
      setUser(result.user || null);
      setPassword("");
      navigate("/accounts");
    } catch (error) {
      setMessage(error.message || "We couldn't complete that request.");
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await request("/logout", { method: "POST", body: "{}" });
      setUser(null);
      setIdentifier("");
      setPassword("");
      navigate("/");
    } catch (error) {
      setMessage(error.message || "Sign out failed.");
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="page"><header className="header"><Brand /></header><main className="loading"><span className="spinner" /><p>Loading TC Accounts</p><small>Checking your session…</small></main></div>;
  }

  return (
    <div className="page">
      <header className="header">
        <Brand />
        <a className="header-link" href="https://creations.theegget.com">Theegget Creations <span aria-hidden="true">↗</span></a>
      </header>
      <main className="layout">
        <section className="welcome">
          <div className="overline"><span className="live-dot" /> THEEGGET CREATIONS</div>
          <h1>One account.<br /><span>All of TC.</span></h1>
          <p className="lead">One identity for participating Theegget Creations products and services.</p>
          <div className="feature-list">
            <div><span className="feature-number">01</span><span><b>One TC identity</b><small>Use your account across supported TC services.</small></span></div>
            <div><span className="feature-number">02</span><span><b>Direct sign-in</b><small>Your TC credentials stay separate from other platforms.</small></span></div>
            <div><span className="feature-number">03</span><span><b>Your account details</b><small>View your profile after signing in.</small></span></div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><span>TC ACCOUNT</span><span className="panel-status">{accountsPage && user ? "SIGNED IN" : "ACCOUNT ACCESS"}</span></div>
          {accountsPage && user ? (
            <>
              <h2>Your account</h2>
              <p className="muted">You're signed in to Theegget Creations.</p>
              <div className="profile">
                <div><span>Username</span><strong>{user.username}</strong></div>
                <div><span>Email</span><strong>{user.email}</strong></div>
                <div><span>Status</span><strong>{user.status}</strong></div>
                <div><span>TC user ID</span><strong>{user.id}</strong></div>
              </div>
              {message && <p className={`message ${messageType}`} role="status">{message}</p>}
              <button className="button secondary" disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out"}</button>
            </>
          ) : accountsPage && !user ? (
            <>
              <h2>Sign in required</h2>
              <p className="muted">Sign in to view your TC Account details.</p>
              <button className="button" onClick={() => navigate("/")}>Go to sign in <span>→</span></button>
            </>
          ) : (
            <>
              <div className="tabs" role="tablist" aria-label="Account options">
                <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => changeMode("login")}>Sign in</button>
                <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => changeMode("register")}>Create account</button>
              </div>
              <h2>{mode === "register" ? "Create your TC Account" : "Welcome back."}</h2>
              <p className="muted">{mode === "register" ? "Create an account with Theegget Creations." : "Sign in with your TC username or email."}</p>
              <form onSubmit={submit}>
                <TextField label={mode === "register" ? "Username" : "Username or email"} value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder={mode === "register" ? "Choose a username" : "Enter username or email"} autoComplete="username" minLength={mode === "register" ? 3 : undefined} />
                {mode === "register" && <TextField label="Email address" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />}
                <TextField label="Password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : undefined} />
                {mode === "login" && <button type="button" className="text-button" onClick={() => { setMessage("Password recovery isn't available yet. Contact TC support for help."); setMessageType("info"); }}>Forgot password?</button>}
                <button className="button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create TC Account" : "Sign in"} <span>→</span></button>
              </form>
              {message && <p className={`message ${messageType}`} role="status">{message}</p>}
              <p className="privacy-note">TC Accounts are created directly with Theegget Creations. External accounts cannot be used to sign in.</p>
              <p className="switch-copy">{mode === "register" ? "Already have an account?" : "New to TC Accounts?"} <button type="button" onClick={() => changeMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Sign in" : "Create one"}</button></p>
            </>
          )}
        </section>
      </main>
      <footer className="footer"><span>© {new Date().getFullYear()} Theegget Creations</span><span>TC Accounts <i>/</i> Identity</span></footer>
    </div>
  );
}
