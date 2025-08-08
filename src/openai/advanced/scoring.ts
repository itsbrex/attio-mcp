// Compatibility shim for legacy test imports
export class RelevanceScoring {
  calculateScore(_: string, __: string): number {
    return 0;
  }
}

export default {
  RelevanceScoring,
};
