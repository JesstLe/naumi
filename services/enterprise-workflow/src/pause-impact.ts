import type {PoolClient} from 'pg';
import type {Actor,WorkOrder} from './contracts';
import {cancellationImpact} from './cancellation-impact';
import type {PauseImpact} from './pause-contracts';
export async function pauseImpact(tx:PoolClient,a:Actor,o:WorkOrder){const {pauses,...business}=o;const context=await cancellationImpact(tx,a,business);const impact:PauseImpact={...context.impact,plans:o.tasks.map(t=>({taskId:t.id,planStart:t.planStart??null,planEnd:t.planEnd??null,estimatedHours:t.estimatedHours??null,dueAt:t.dueAt})),capacityPolicy:'reserve-wip-and-planned-hours'};return {...context,impact};}
