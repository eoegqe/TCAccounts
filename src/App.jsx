import { useEffect, useState } from "react";

const API = "/api";

function safeReturnTo(value) {
  if (!value || value.includes("\\")) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin === window.location.origin && !target.username && !target.password) {
      return target.pathname + target.search + target.hash;
    }
  } catch {}
  return null;
}

function getReturnTo() {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("return_to") || params.get("redirect_url") || params.get("redirect_uri");
  const internal = safeReturnTo(candidate);
  if (internal) return internal;

  // When the user opens app registration from Eggser, keep them on that
  // registration page after signing in instead of sending them to /accounts.
  if (window.location.pathname === "/auth" && candidate) {
    try {
      const target = new URL(candidate);
      if (
        target.protocol === "https:" &&
        !target.username &&
        !target.password &&
        ["panel-eggser.theegget.com", "panel.eggser.theegget.com"].includes(target.hostname)
      ) {
        return window.location.pathname + window.location.search;
      }
    } catch {}
  }
  return null;
}

function getRegistrationDefaults() {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("return_to") || params.get("redirect_uri");
  if (!candidate) return { name: "", redirectUri: "" };
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return { name: "", redirectUri: "" };
    const redirectUri = url.origin + (url.pathname || "/");
    const name = url.hostname.includes("eggser") ? "Eggser Control Center" : url.hostname;
    return { name, redirectUri };
  } catch {
    return { name: "", redirectUri: "" };
  }
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

const ROLE_LABELS = { 0: "Banned", 1: "User", 2: "Support", 3: "Admin", 4: "Co-owner", 5: "Owner" };

function TextField({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} required /></label>;
}

export default function App() {
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has("reset_token") ? "reset" : "login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset_token") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [path, setPath] = useState(window.location.pathname);
  const [oauthClients, setOauthClients] = useState([]);
  const [clientName, setClientName] = useState(() => getRegistrationDefaults().name);
  const [redirectUris, setRedirectUris] = useState(() => getRegistrationDefaults().redirectUri);
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
      if (active) setUser(result.user || null);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading || !user || path !== "/" || mode === "reset") return;
    const returnTo = getReturnTo();
    window.location.replace(returnTo || "/accounts");
  }, [loading, user, path, mode]);

  useEffect(() => {
    if (!user || path !== "/auth") return;
    let active = true;
    request("/oauth/clients").then(result => {
      if (active) setOauthClients(result.clients || []);
    }).catch(error => {
      if (active) {
        setOauthClients([]);
        setMessage(error.message || "Applications could not be loaded.");
        setMessageType("error");
      }
    });
    return () => { active = false; };
  }, [user, path]);

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
    if (nextMode !== "reset") setResetToken("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        const result = await request("/password-reset/request", { method: "POST", body: JSON.stringify({ email: identifier.trim() }) });
        setMessage(result.message || "If an active TC account uses that email address, a password reset link will be sent shortly.");
        setMessageType("info");
        return;
      }
      if (mode === "reset") {
        const result = await request("/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password }) });
        setPassword("");
        setResetToken("");
        window.history.replaceState({}, "", "/");
        setPath("/");
        setMode("login");
        setIdentifier("");
        setMessage(result.message || "Your password has been reset. Sign in with your new password.");
        setMessageType("info");
        return;
      }
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
    setMessage("");
    try {
      await request("/logout", { method: "POST", body: "{}" });
      setUser(null);
      setIdentifier("");
      setPassword("");
      navigate("/");
      changeMode("login");
    } catch (error) {
      setMessage(error.message || "Sign out failed.");
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  async function createOAuthClient(event) {
    event.preventDefault();
    setClientBusy(true);
    setMessage("");
    try {
      const result = await request("/oauth/clients", {
        method: "POST",
        body: JSON.stringify({
          name: clientName.trim(),
          redirect_uris: redirectUris.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
          scopes: ["profile", "email"]
        })
      });
      setOauthClients(items => [result.client, ...items]);
      setClientName("");
      setRedirectUris("");
      setMessage("Application registered. Save its client ID.");
      setMessageType("info");
    } catch (error) {
      setMessage(error.message || "Could not register application.");
      setMessageType("error");
    } finally {
      setClientBusy(false);
    }
  }

  async function deleteOAuthClient(clientId) {
    if (!window.confirm("Revoke and delete this application? Its existing tokens will no longer be usable.")) return;
    try {
      await request("/oauth/clients/" + encodeURIComponent(clientId), { method: "DELETE", body: "{}" });
      setOauthClients(items => items.filter(item => item.client_id !== clientId));
      setMessage("Application deleted.");
      setMessageType("info");
    } catch (error) {
      setMessage(error.message || "Could not delete application.");
      setMessageType("error");
    }
  }

  const feedback = message && <p className={`message ${messageType}`} role="status">{message}</p>;

  if (loading) {
    return <main className="auth-shell"><section className="panel loading-panel"><div className="tc-mark">TC</div><p className="brand-name">Theegget Creations</p><span className="spinner" /><p className="muted">Checking your session…</p></section></main>;
  }

  return (
    <main className="auth-shell">
      <section className={`panel ${accountsPage && user ? "dashboard-panel" : authPage && user ? "applications-panel" : "sign-in-panel"}`}>
        <div className="brand-lockup"><span className="tc-mark">TC</span><span className="brand-name">Theegget Creations</span></div>
        <div className="panel-heading"><span>{authPage ? "CONNECTED APPLICATIONS" : accountsPage ? "YOUR ACCOUNT" : "ACCOUNT ACCESS"}</span><span className="panel-status">{user ? "SIGNED IN" : "SECURE SIGN-IN"}</span></div>

        {authPage && user ? (
          <>
            <h1>Connected applications</h1>
            <p className="muted">Manage apps that can request permission to use your TC identity. When you open this page from an app link, its name and HTTPS redirect URL are filled in for you; review them and register the app below.</p>
            <a className="button secondary" href="/accounts">Back to account <span>↗</span></a>
            <h2 className="section-title">Register an application</h2>
            <form onSubmit={createOAuthClient}>
              <TextField label="Application name" value={clientName} onChange={event => setClientName(event.target.value)} placeholder="Eggser Control Center" minLength={2} maxLength={80} />
              <label className="field"><span>Redirect URLs (one per line)</span><textarea required rows={3} value={redirectUris} onChange={event => setRedirectUris(event.target.value)} placeholder="https://your-app.example/oauth/callback" /></label>
              <button className="button" type="submit" disabled={clientBusy}>{clientBusy ? "Registering…" : "Register application"} <span>→</span></button>
            </form>
            <h2 className="section-title">Your applications</h2>
            <div className="oauth-client-list">
              {oauthClients.length === 0 ? <p className="muted">No applications registered yet.</p> : oauthClients.map(client => (
                <div className="oauth-client" key={client.client_id}>
                  <strong>{client.name}</strong><small>Client ID</small><code>{client.client_id}</code><small>Redirect URLs</small>
                  {(client.redirect_uris || []).map(uri => <code key={uri}>{uri}</code>)}
                  <small>Permissions: {(client.scopes || []).join(", ")}</small>
                  <button type="button" className="text-button danger" onClick={() => deleteOAuthClient(client.client_id)}>Revoke application</button>
                </div>
              ))}
            </div>
            {feedback}
          </>
        ) : accountsPage && !user ? (
          <>
            <h1>Sign in required</h1>
            <p className="muted">Sign in to manage your Theegget Creations account.</p>
            <button className="button" onClick={() => navigate("/")}>Go to sign in <span>→</span></button>
          </>
        ) : accountsPage && user ? (
          <>
            <p className="eyebrow">ACCOUNT OVERVIEW</p>
            <h1>Welcome back, {user.username}.</h1>
            <p className="muted">Manage your Theegget Creations identity and connected applications.</p>
            <div className="profile">
              <div><span>Username</span><strong>{user.username}</strong></div>
              <div><span>Email</span><strong>{user.email || "Not provided"}</strong></div>
              <div><span>Status</span><strong>{user.status || "Active"}</strong></div>
              <div><span>Account ID</span><strong>{user.id}</strong></div>
              <div><span>TCAdmin role</span><strong>{ROLE_LABELS[Number(user.role ?? 1)] || "User"}</strong></div>
            </div>
            <nav className="account-actions">
              <button className={accountSection === "overview" ? "selected" : ""} onClick={() => setAccountSection("overview")}>Overview</button>
              <button className={accountSection === "security" ? "selected" : ""} onClick={() => setAccountSection("security")}>Security</button>
              <a href="/auth">Connected apps ↗</a>
            </nav>
            {accountSection === "security" && <div className="notice"><strong>Account security</strong><p>Password recovery and active-session management are not available yet. Keep your password private and sign out on shared devices.</p></div>}
            {accountSection === "overview" && <p className="muted">Your TC identity can be used with applications that support Sign in with TC.</p>}
            <button className="button secondary" disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out"} <span>↗</span></button>
            {feedback}
          </>
        ) : (
          <>
            <h1>{mode === "register" ? "Create your account." : mode === "forgot" ? "Reset your password." : mode === "reset" ? "Choose a new password." : "Sign in."}</h1>
            <p className="muted">{mode === "register" ? "Create your Theegget Creations account." : mode === "forgot" ? "Enter the email address linked to your TC account. If it matches, we’ll send a one-time reset link." : mode === "reset" ? "Choose a new password for your Theegget Creations account." : "Use your Theegget Creations account to continue."}</p>
            <form onSubmit={submit}>
              {mode === "register" ? <TextField label="Username" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Choose a username" autoComplete="username" minLength={3} /> : mode === "login" ? <TextField label="Username or email" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Enter username or email" autoComplete="username" /> : mode === "forgot" ? <TextField label="Email address" type="email" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="you@example.com" autoComplete="email" required /> : null}
              {mode === "register" && <TextField label="Email address" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />}
              {(mode === "login" || mode === "register" || mode === "reset") && <TextField label={mode === "reset" ? "New password" : "Password"} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" || mode === "reset" ? "At least 12 characters" : "Enter your password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 12} required />}
              <button className="button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Reset password" : "Sign in"} <span>→</span></button>
            </form>
            {feedback}
            <p className="switch-copy">{mode === "register" ? "Already have an account?" : mode === "forgot" || mode === "reset" ? "Remembered your password?" : "New to Theegget Creations?"} <button type="button" onClick={() => changeMode(mode === "register" || mode === "forgot" || mode === "reset" ? "login" : "register")}>{mode === "register" ? "Sign in instead" : mode === "forgot" || mode === "reset" ? "Back to sign in" : "Create an account"}</button></p>
            {mode !== "forgot" && mode !== "reset" && <p className="privacy-note">Your account is managed by Theegget Creations. External accounts cannot be used to sign in.</p>}
          </>
        )}
        <footer className="auth-footer">© {new Date().getFullYear()} Theegget Creations</footer>
      </section>
    </main>
  );
}
