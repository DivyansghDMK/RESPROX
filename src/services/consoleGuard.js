// src/services/consoleGuard.js
//
// The live site's console. The production build drops every console call
// (vite.config.js), so nothing the app does is printed there. What is left
// is this one warning, because the console is where a scammer asks someone
// to paste code that would act as them, with their access to patients' data.

const STOP = 'color:#dc2626;font-size:42px;font-weight:800;';
const TEXT = 'font-size:15px;line-height:1.5;';
const BOLD = `${TEXT}font-weight:700;`;

export function guardConsole() {
  // Reached through globalThis so the build does not drop it with the rest.
  const out = globalThis.console;
  out.log('%cStop!', STOP);
  out.log(
    '%cThis is a browser feature for DeckMount developers. %cYou are not supposed to do anything here.',
    TEXT, BOLD,
  );
  out.log(
    '%cIf someone told you to copy or paste something here, it is a scam: it would give them your Resprox account and your patients\' data. Close this panel.',
    TEXT,
  );

  // Errors the app has not caught are shown on the page (ErrorBoundary and
  // notices), not printed here.
  window.addEventListener('error', (e) => e.preventDefault());
  window.addEventListener('unhandledrejection', (e) => e.preventDefault());
}
