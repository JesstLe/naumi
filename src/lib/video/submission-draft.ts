import 'server-only';
import {storageKeyFromManagedUrl} from '../object-storage/runtime';
import {videoSubmissionDraftValue} from './submission-draft-value';
import type {CreateVideoInput} from './submission-types';
export const videoSubmissionDraft=(input:CreateVideoInput)=>videoSubmissionDraftValue(input,storageKeyFromManagedUrl);
