import { describe, expect, it } from 'vitest';
import { generateMemberCode } from '@/features/students/utils/memberCode';

describe('generateMemberCode', () => {
  it.each([
    ['Lương Huỳnh Bảo Trân', 'CS192013', 'TranLHBCS192013'],
    ['Trần Thảo Ngân', 'CS191667', 'NganTTCS191667'],
    ['  đẶNG   ĐỨC  ĐẠT  ', ' cs123  ', 'DatDDCS123'],
    ['Ngân', 'cs1', 'NganCS1'],
    ['Tra\u0302\u0300n Tha\u0309o Nga\u0302n', 'cs2', 'NganTTCS2'],
  ])('generates %s + %s', (name, id, expected) => expect(generateMemberCode(name, id)).toBe(expected));

  it.each([['', 'CS1'], ['Trân', ''], ['123', 'CS1'], ['Ngân', 'CS 1'], ['A'.repeat(51), 'CS1'], ['Ngân', 'A'.repeat(255)]])(
    'does not suggest an invalid or oversized code', (name, id) => expect(generateMemberCode(name, id)).toBe(''),
  );
});
