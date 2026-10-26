/** Shared team error identity; no team repository or grant lifecycle import. */
export class TeamError extends Error { constructor(message: string, public status = 403) { super(message); } }
