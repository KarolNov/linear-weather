export interface Viewer {
  name: string;
  avatarUrl: string | null;
  organization: { name: string };
}

export interface AppProps {
  viewer: Viewer | null;
  /** We couldn't tell whether anyone is signed in, because the server or Linear failed. */
  linearUnavailable?: boolean;
  authError?: string;
}

export function App({ viewer, linearUnavailable, authError }: AppProps) {
  return (
    <main>
      <header>
        <h1>Linear Weather</h1>
        {viewer ? (
          <form method="post" action="/auth/logout">
            {viewer.avatarUrl && <img src={viewer.avatarUrl} alt="" width={24} height={24} />}
            <span>
              {viewer.name} · {viewer.organization.name}
            </span>{" "}
            <button type="submit">Sign out</button>
          </form>
        ) : null}
      </header>
      {viewer ? (
        <p>Team load forecast coming soon. ☀️ ⛅ 🌧️ ⛈️</p>
      ) : linearUnavailable ? (
        <p role="alert">Couldn't reach Linear just now. Please reload in a minute.</p>
      ) : (
        <section>
          {authError && <p role="alert">{signInErrorMessage(authError)}</p>}
          <p>See who on your team is overloaded now, and who is about to be.</p>
          <a href="/auth/login">Sign in with Linear</a>
        </section>
      )}
    </main>
  );
}

function signInErrorMessage(code: string): string {
  if (code === "access_denied") return "Sign-in was cancelled.";
  return "Signing in with Linear failed. Please try again.";
}
