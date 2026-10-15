import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { fetchAuthSession, signIn, signOut, type ApiError, type AuthSession } from "./api";

// Single-user sign-in (Milestone 4). When the API has a password configured, nothing renders
// until the session cookie exists, and an expired session brings the form back.
export function SignInGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAuthSession()
      .then(setSession)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  // Any API call that comes back 401 means the session ended.
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (response.status === 401 && url.startsWith("/api/") && !url.startsWith("/api/auth/")) {
        setSession((current) => (current ? { ...current, signedIn: false } : current));
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await signIn(password));
      setPassword("");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <div className="shell">{error ? <div className="error">{error}</div> : <p className="status">Loading…</p>}</div>;
  }
  if (session.required && !session.signedIn) {
    return (
      <div className="shell">
        <section className="panel sign-in">
          <h2>Sign in</h2>
          <form onSubmit={(event) => void submit(event)}>
            <div className="field">
              <label htmlFor="sign-in-password">Password</label>
              <input
                id="sign-in-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
              />
            </div>
            {error ? <div className="error">{error}</div> : null}
            <button className="btn" type="submit" disabled={busy || password.length === 0}>
              Sign in
            </button>
          </form>
        </section>
      </div>
    );
  }
  return (
    <>
      {children}
      {session.required ? (
        <button className="btn ghost sign-out" type="button" onClick={() => void signOut().then(setSession)}>
          Sign out
        </button>
      ) : null}
    </>
  );
}
