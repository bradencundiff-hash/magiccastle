export type WordEntry = {
  id: string;
  word: string;
  hint?: string;
};

export type RoundPhase = "idle" | "typing" | "celebrate";
