/** Only a server-confirmed rejection before staging permits discarding an ID. */
export function publicationNotStaged(value: { code?: string; operationNotStaged?: boolean }) {
  return value.operationNotStaged === true && ["CONFIG_CONFLICT", "DRAFT_CONFLICT", "PUBLICATION_PENDING"].includes(value.code || "");
}
