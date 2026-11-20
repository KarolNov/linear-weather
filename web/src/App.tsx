import { BoardShell } from "./BoardShell";
import type { Board, BoardError, Viewer } from "./board";
import { InfoPage, type InfoPageName } from "./InfoPages";
import { SignInPage } from "./SignInPage";

export interface AppProps {
  /** One of the public pages (/about, /privacy), shown whoever is signed in. */
  page?: InfoPageName;
  /** On a public page: whether this browser has a session, to offer the board instead of sign-in. */
  signedIn?: boolean;
  viewer: Viewer | null;
  /** We couldn't tell whether anyone is signed in, because the server or Linear failed. */
  linearUnavailable?: boolean;
  authError?: string;
  /** Showing the mocked Avengers workspace (`/?demo=true`). */
  demo?: boolean;
  /** The signed-in viewer's board, or null when it couldn't load. */
  board?: Board | null;
  boardError?: BoardError;
}

export function App({
  page,
  signedIn,
  viewer,
  linearUnavailable,
  authError,
  demo,
  board,
  boardError,
}: AppProps) {
  if (page) return <InfoPage page={page} signedIn={signedIn} />;
  if (viewer) {
    return <BoardShell viewer={viewer} board={board ?? null} boardError={boardError} demo={demo} />;
  }
  return <SignInPage linearUnavailable={linearUnavailable} authError={authError} />;
}
