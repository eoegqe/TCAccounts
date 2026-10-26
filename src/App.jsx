import { useEffect, useState } from "react";

const API = "/api";

function safeReturnTo(value) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\\\")) return value;
  try {
    const target = new URL(value);
    if (target.protocol === "https:" && ["https://panel-eggser.theegget.com", "https://panel.eggser.theegget.com"].includes(target.origin)) return target.toString();
  } catch {}
  return null;
}

function getReturnTo() {
  const params = new URLSearchParams(window.location.search);
  return safeReturnTo(params.get("return_to") || params.get("redirect_uri"));
}

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
  const [oauthClients, setOauthClients] = useState([]);
  const [clientName, setClientName] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [clientBusy, setClientBusy] = useState(false);
  const [accountSection, setAccountSection] = useState("overview");

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    request("/me").then(result => {
      if (!active) return;
      const signedInUser = result.user || null;
      setUser(signedInUser);
      const returnTo = getReturnTo();
      if (signedInUser && returnTo) window.location.replace(returnTo);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || path !== "/auth") return;
    let active = true;
    request("/oauth/clients").then(result => { if (active) setOauthClients(result.clients || []); }).catch(error => { if (active) { setOauthClients([]); setMessage(error.message || "OAuth applications could not be loaded."); setMessageType("error"); } });
    return () => { active = false; };
  }, [user, path]);

  async function createOAuthClient(event) {
    event.preventDefault();
    setClientBusy(true);
    setMessage("");
    try {
      const result = await request("/oauth/clients", { method: "POST", body: JSON.stringify({ name: clientName.trim(), redirect_uris: redirectUris.split("\\n").map(x => x.trim()).filter(Boolean), scopes: ["profile", "email"] }) });
      setOauthClients(items => [result.client, ...items]);
      setClientName("");
      setRedirectUris("");
      setMessage("OAuth application registered. Save its client ID.");
      setMessageType("info");
    } catch (error) {
      setMessage(error.message || "Could not register application.");
      setMessageType("error");
    } finally { setClientBusy(false); }
  }

  async function deleteOAuthClient(clientId) {
    if (!window.confirm("Revoke and delete this OAuth application? Existing tokens for it will no longer be usable.")) return;
    try {
      await request("/oauth/clients/" + encodeURIComponent(clientId), { method: "DELETE", body: "{}" });
      setOauthClients(items => items.filter(item => item.client_id !== clientId));
      setMessage("OAuth application deleted.");
      setMessageType("info");
    } catch (error) { setMessage(error.message || "Could not delete application."); setMessageType("error"); }
  }

  const accountsPage = path === "/accounts" || path.startsWith("/accounts/");
  const authPage = path === "/auth" || path.startsWith("/auth/");

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
      const returnTo = getReturnTo();
      window.location.assign(returnTo || "/accounts");
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
          <div className="panel-heading"><span>{authPage ? "TC AUTHORIZATIONS" : "TC ACCOUNT"}</span><span className="panel-status">{(accountsPage || authPage) && user ? "SIGNED IN" : "ACCOUNT ACCESS"}</span></div>
          {authPage && user ? (
            <>
              <h2>Authorizations</h2>
              <p className="muted">Manage OAuth applications registered to your TC Account. Review redirect URLs and revoke applications you no longer trust.</p>
              <a className="button secondary" href="/accounts">Account management <span>↗</span></a>
              <h3>Register an application</h3>
              <form onSubmit={createOAuthClient}>
                <TextField label="Application name" value={clientName} onChange={event => setClientName(event.target.value)} placeholder="Eggser Control Center" minLength={2} maxLength={80} />
                <label className="field"><span>Redirect URLs (one per line)</span><textarea required rows={3} value={redirectUris} onChange={event => setRedirectUris(event.target.value)} placeholder="https://your-app.example/oauth/callback" /></label>
                <button className="button" type="submit" disabled={clientBusy}>{clientBusy ? "Registering…" : "Register application"} <span>→</span></button>
              </form>
              <h3>Your registered applications</h3>
              <div className="oauth-client-list">
                {oauthClients.length === 0 ? <p className="muted">No registered OAuth applications yet.</p> : oauthClients.map(client => <div className="oauth-client" key={client.client_id}>
                  <strong>{client.name}</strong><small>Client ID</small><code>{client.client_id}</code><small>Redirect URLs</small>
                  {(client.redirect_uris || []).map(uri => <code key={uri}>{uri}</code>)}
                  <small>Scopes: {(client.scopes || []).join(", ")}</small>
                  <button type="button" className="text-button danger" onClick={() => deleteOAuthClient(client.client_id)}>Revoke and delete application</button>
                </div>)}
              </div>
              {message && <p className={`message ${messageType}`} role="status">{message}</p>}
            </>
          ) : (accountsPage || authPage) && !user ? (
            <>
              <h2>Sign in required</h2><p className="muted">Sign in to manage your TC Account and authorizations.</p>
              <button className="button" onClick={() => navigate("/")}>Go to sign in <span>→</span></button>
            </>
          ) : accountsPage && user ? (
            <>
              <div className="dashboard-welcome">
                <span className="overline"><span className="live-dot" /> YOUR TC ACCOUNT</span>
                <h2>Welcome back, {user.username}.</h2>
                <p className="muted">Your account hub for Theegget Creations. Review your details, security, and connected applications from here.</p>
              </div>
              <div className="dashboard-actions feature-list">
                <div>
                  <span className="feature-number">01</span>
                  <span><b>Profile</b><small>Review your username, email address, and account ID.</small></span>
                  <button type="button" className="text-button" onClick={() => setAccountSection("profile")}>Open →</button>
                </div>
                <div>
                  <span className="feature-number">02</span>
                  <span><b>Security</b><small>Review your sign-in status and account access.</small></span>
                  <button type="button" className="text-button" onClick={() => setAccountSection("security")}>Open →</button>
                </div>
                <div>
                  <span className="feature-number">03</span>
                  <span><b>Authorizations</b><small>Register or revoke applications connected to your TC Account.</small></span>
                  <a className="text-button" href="/auth">Open →</a>
                </div>
              </div>
              <h3>Account summary</h3>
              <div className="profile">
                <div><span>Username</span><strong>{user.username}</strong></div>
                <div><span>Status</span><strong>{user.status || "Active"}</strong></div>
                <div><span>Email</span><strong>{user.email || "Not provided"}</strong></div>
                <div><span>TC user ID</span><strong>{user.id}</strong></div>
              </div>
              <h3>Manage your account</h3>
              <nav className="tabs account-nav" aria-label="Account management">
                <button type="button" className={accountSection === "overview" ? "selected" : ""} aria-pressed={accountSection === "overview"} onClick={() => setAccountSection("overview")}>Overview</button>
                <button type="button" className={accountSection === "profile" ? "selected" : ""} aria-pressed={accountSection === "profile"} onClick={() => setAccountSection("profile")}>Profile</button>
                <button type="button" className={accountSection === "security" ? "selected" : ""} aria-pressed={accountSection === "security"} onClick={() => setAccountSection("security")}>Security</button>
              </nav>
              {accountSection === "overview" && (
                <>
                  <p className="muted">This is your personal TC Account dashboard. Use the options above to review your account or manage applications that have been registered by you.</p>
                  <button className="button secondary" disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out of TC Accounts"}</button>
                </>
              )}
              {accountSection === "profile" && (
                <>
                  <h3>Profile information</h3>
                  <div className="profile">
                    <div><span>Username</span><strong>{user.username}</strong></div>
                    <div><span>Email address</span><strong>{user.email || "Not provided"}</strong></div>
                    <div><span>TC user ID</span><strong>{user.id}</strong></div>
                    <div><span>Account status</span><strong>{user.status || "Active"}</strong></div>
                  </div>
                  <p className="muted">These details are currently read-only because the account API does not yet provide profile-editing actions.</p>
                </>
              )}
              {accountSection === "security" && (
                <>
                  <h3>Security and access</h3>
                  <div className="profile">
                    <div><span>Signed-in account</span><strong>{user.username}</strong></div>
                    <div><span>Session</span><strong>Currently signed in</strong></div>
                  </div>
                  <p className="muted">Password changes, password recovery, and active-session management are not yet available through the account API.</p>
                  <button className="button secondary" disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out"}</button>
                </>
              )}
              {message && <p className={`message ${messageType}`} role="status">{message}</p>}
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
