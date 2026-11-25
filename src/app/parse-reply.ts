import type { Reply } from '@/domain/inbound-message';

const ACCENTS = /\p{Diacritic}/gu;
const SURROUNDING_SYMBOLS = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** SI confirms and NO cancels, regardless of case, accents and surrounding spaces or punctuation. */
export function parseReply(text: string): Reply | null {
  const word = text.normalize('NFD').replace(ACCENTS, '').toLowerCase().replace(SURROUNDING_SYMBOLS, '');
  if (word === 'si') return 'confirm';
  if (word === 'no') return 'cancel';
  return null;
}
