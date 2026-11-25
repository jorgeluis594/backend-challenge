export type Result<T, E extends string> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; error: E }>;
export const ok = <T>(data: T) => ({ success: true as const, data });
export const fail = <E extends string>(error: E) => ({ success: false as const, error });
