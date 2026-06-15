export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

export const PASSWORD_VALIDATION_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character';

export function isValidPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}
