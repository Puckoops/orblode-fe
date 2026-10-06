/** user-svc lower-cases and trims too; doing it here keeps the address shown back to the person identical. */
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const looksLikeEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

/** user-svc's password rule for every product: 8–72 characters with upper and lower case, a digit and a symbol. */
export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;

export const PASSWORD_HINT = "8+ characters, with upper and lower case, a digit and a symbol.";
