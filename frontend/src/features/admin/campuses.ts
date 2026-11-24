export interface CampusFormValues {
  code: string;
  name: string;
  address: string;
  email: string;
  phone: string;
}

/** Returns a plain-English problem, or null when the campus form is fine. */
export function validateCampusForm(values: CampusFormValues, options: { existingCodes?: string[]; editing?: boolean } = {}): string | null {
  const code = values.code.trim().toUpperCase();
  if (!options.editing) {
    if (!/^[A-Z0-9]{2,10}$/.test(code)) return 'Use a short code of 2 to 10 letters or numbers, for example BST.';
    if ((options.existingCodes ?? []).some((c) => c.toUpperCase() === code)) return `A campus with the code ${code} already exists.`;
  }
  if (values.name.trim().length < 3) return 'Enter the full name of the school.';
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return 'That email address does not look right.';
  if (values.phone.trim() && !/^[0-9+()\-\s]{7,30}$/.test(values.phone.trim())) return 'Enter a valid phone number, for example 0917 123 4567.';
  return null;
}
