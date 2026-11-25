import { describe, expect, test } from 'vitest';
import { parseReply } from '@/app/parse-reply';

describe('SI confirms the appointment, whatever its case, accent, spaces or punctuation around it', () => {
  test.each([
    { title: 'plain upper case SI', text: 'SI', expected: 'confirm' },
    { title: 'lower case si', text: 'si', expected: 'confirm' },
    { title: 'Sí with a capital and an accent (statement example)', text: 'Sí', expected: 'confirm' },
    { title: 'SÍ in upper case with an accent', text: 'SÍ', expected: 'confirm' },
    { title: 'si. with a trailing full stop (statement example)', text: 'si.', expected: 'confirm' },
    { title: 'SI! with an exclamation mark', text: 'SI!', expected: 'confirm' },
    { title: 'si surrounded by spaces', text: '  si  ', expected: 'confirm' },
    { title: 'Sí surrounded by Spanish exclamation marks', text: '¡Sí!', expected: 'confirm' },
    { title: 'si followed by a line break', text: 'si\n', expected: 'confirm' },
  ] as const)('$title', ({ text, expected }) => {
    expect(parseReply(text)).toBe(expected);
  });
});

describe('NO cancels the appointment, whatever its case, spaces or punctuation around it', () => {
  test.each([
    { title: 'plain upper case NO', text: 'NO', expected: 'cancel' },
    { title: 'lower case no', text: 'no', expected: 'cancel' },
    { title: 'NO! with an exclamation mark (statement example)', text: 'NO!', expected: 'cancel' },
    { title: 'no. with a trailing full stop', text: 'no.', expected: 'cancel' },
    { title: 'No surrounded by spaces', text: '  No  ', expected: 'cancel' },
    { title: 'no surrounded by Spanish exclamation marks', text: '¡no!', expected: 'cancel' },
  ] as const)('$title', ({ text, expected }) => {
    expect(parseReply(text)).toBe(expected);
  });
});

describe('any other text is ignored', () => {
  test.each([
    { title: 'an empty message', text: '' },
    { title: 'a message with only spaces', text: '   ' },
    { title: 'a message with only punctuation', text: '!?.' },
    { title: 'a sentence', text: 'Quiero cambiar la hora de mi cita' },
    { title: 'si followed by other words', text: 'si, gracias' },
    { title: 'no followed by other words', text: 'no puedo ir' },
    { title: 'a word that only contains si', text: 'sino' },
    { title: 'a word that starts with no', text: 'nos vemos' },
    { title: 'a word that ends with no', text: 'bueno' },
    { title: 'si and no in the same message', text: 'si no' },
    { title: 'si written twice', text: 'si si' },
    { title: 'the English yes', text: 'yes' },
  ])('$title', ({ text }) => {
    expect(parseReply(text)).toBeNull();
  });
});
