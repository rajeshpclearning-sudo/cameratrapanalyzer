import {
  normalizeSpeciesCommonLabel,
  resolveCanonicalWildlifeName,
} from "../species-dimension";

describe("species-dimension", () => {
  it("maps common aliases to canonical names", () => {
    expect(resolveCanonicalWildlifeName("Wild Boar")).toBe("Indian Wild Pig");
    expect(resolveCanonicalWildlifeName("Elephant")).toBe("Asian Elephant");
    expect(resolveCanonicalWildlifeName("Chital")).toBe("Spotted Deer");
    expect(resolveCanonicalWildlifeName("Leopard")).toBe("Common Leopard");
    expect(resolveCanonicalWildlifeName("Dhole")).toBe("Wild Dog");
  });

  it("normalizes multi-species labels", () => {
    expect(normalizeSpeciesCommonLabel("Sambar + Chital")).toBe(
      "Sambar Deer + Spotted Deer",
    );
  });

  it("leaves empty-frame and human labels alone", () => {
    expect(normalizeSpeciesCommonLabel("No animal detected")).toBe(
      "No animal detected",
    );
    expect(normalizeSpeciesCommonLabel("Human")).toBe("Human");
    expect(normalizeSpeciesCommonLabel("Human (armed)")).toBe("Human (armed)");
  });
});
