/**
 * Backend selector — reads VITE_BACKEND at build time.
 *
 *   VITE_BACKEND=local   (default) → IndexedDB, no server needed
 *   VITE_BACKEND=server            → Express API (requires the server to be running)
 *
 * Both implementations expose the same api.* surface so no call site needs
 * to know which backend is in use. The `capabilities` object lets the UI
 * conditionally render server-only affordances (calendar, invites, contacts).
 */
import { serverApi } from "./server.js";
import { localApi }  from "./local.js";

const BACKEND   = import.meta.env.VITE_BACKEND ?? "local";
const useServer = BACKEND === "server";

export const api = useServer ? serverApi : localApi;

/**
 * Feature flags — gate server-only UI on these rather than checking BACKEND
 * directly in components.
 */
export const capabilities = {
  /** True only in server mode — affects all features below. */
  server:   useServer,
  /** Google Calendar freebusy and hang-sync. */
  calendar: useServer,
  /** Email / iMessage / GCal invite dispatch and the cascade worker. */
  invites:  useServer,
  /** macOS Contacts import. */
  contacts: useServer,
};
