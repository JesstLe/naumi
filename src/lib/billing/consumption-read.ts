/** Shared read-side classification: a custom administrator reason is not proof of customer usage. */
export const ADMIN_CREDIT_ADJUSTMENT_FEATURE='credits.adjust';
/** Build the shared SQL predicate that classifies administrative debits from the legacy reason or independently joined adjustment evidence.
 * Arguments are trusted SQL expressions supplied by repositories, not request values.
 */
export function administrativeDebitPredicate(reasonSql:string,adjustmentEvidenceSql:string):string {
  return `(${reasonSql}='管理员调整积分' OR ${adjustmentEvidenceSql})`;
}
