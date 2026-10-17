import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminCenterShell } from '../src/components/admin/center-shell';
import { EnterpriseWorkbench } from '../src/components/enterprise-workbench/workbench';
createRoot(document.getElementById('app')!).render(<AdminCenterShell active='enterprise-workbench' light><EnterpriseWorkbench/></AdminCenterShell>);
