/** A form suggestion only; does not change Import or Backend validation. */
export function generateMemberCode(fullName: string, studentId: string): string {
  const name = fullName.trim().replace(/\s+/gu, ' ');
  const id = studentId.trim().toUpperCase();
  if (!name || name.length > 50 || !/^[A-Z0-9]+$/.test(id) || id.length > 255) return '';
  const words = name.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').split(' ');
  if (words.some((word) => !/^[A-Za-z]+$/.test(word))) return '';
  const firstName = words.pop()!;
  const code = firstName[0].toUpperCase() + firstName.slice(1).toLowerCase()
    + words.map((word) => word[0].toUpperCase()).join('') + id;
  return code.length <= 255 ? code : '';
}
