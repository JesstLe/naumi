-- Run independently against the workflow database, outside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS notification_inbox_unread
  ON enterprise_workflow.notifications(enterprise_id,team_id,subject)
  INCLUDE(order_id) WHERE read_at IS NULL;
