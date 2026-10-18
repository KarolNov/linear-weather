import { BoardShell } from "./BoardShell";
import { SignInPage } from "./SignInPage";

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
  /** Showing the mocked Avengers workspace (`/?demo=true`). */
  demo?: boolean;
}

export function App({ viewer, linearUnavailable, authError, demo }: AppProps) {
  if (viewer) return <BoardShell viewer={viewer} demo={demo} />;
  return <SignInPage linearUnavailable={linearUnavailable} authError={authError} />;
}
