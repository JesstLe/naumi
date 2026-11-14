import {createHash} from 'node:crypto';
import {canonicalConfig} from '../model-config/snapshot-value';
import type {CreateVideoInput} from './submission-types';
export function videoCreationInputDigest(input:CreateVideoInput){const {billingConfirmation:_confirmation,idempotencyKey:_key,...intent}=input;return createHash('sha256').update(canonicalConfig(intent)).digest('hex');}
