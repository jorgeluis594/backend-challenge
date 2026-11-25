let fixed: Date | null = null;

export const now = () => fixed ?? new Date();

export const setClock = (date: Date) => {
  fixed = date;
};
