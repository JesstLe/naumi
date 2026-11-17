'use client';

import { useState } from 'react';
import type { EnterpriseSnapshot } from '@/lib/enterprise/contracts';
import { EnterpriseAnalyticsPanel } from './enterprise-analytics';
import styles from './enterprise.module.css';

export function EnterpriseHistoryUsage({ snapshot, dedicated, onMember }: {
  snapshot: EnterpriseSnapshot;
  dedicated: boolean;
  onMember: (email: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return <details className={styles.legacyUsage} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>成员历史用量</summary>
    {expanded && <>
      {!dedicated && <p className={styles.legacyNotice}>以下为当前可见成员的个人账户历史，企业归属未确认；可用积分来自成员账户，不是企业钱包。</p>}
      <EnterpriseAnalyticsPanel snapshot={snapshot} onMember={onMember} />
    </>}
  </details>;
}
