import type { ArchivePolicy } from '@runeditrun/rer/modules/portability';
declare const policy: ArchivePolicy;
export default policy;

export function verifyFreeFormRecord(envelope: import('./model').Envelope): Promise<boolean>;
