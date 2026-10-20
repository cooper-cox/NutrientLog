import type { Portion } from "../../api/food";
import {
  defaultAmountText,
  defaultChoice,
  displayName,
  EMPTY_MANUAL,
  kcalText,
  manualFood,
  manualFormFrom,
  mergeServings,
  nutrientIn,
  parseNumber,
  portionGrams,
  portionItemLabel,
  portionSummary,
  portionText,
  quantityLabel,
  resultLine,
  servingAmountText,
  startQuantity,
} from "./amounts";

describe("servings as typed amounts", () => {
  it("drops the gram weight from a serving label", () => {
    expect(servingAmountText("1 medium (118 g)")).toBe("1 medium");
    expect(servingAmountText("1 cup, sliced (150 g)")).toBe("1 cup, sliced");
    expect(servingAmountText("1 bar")).toBe("1 bar");
  });

  it("starts the amount box with the first serving, or 100 g", () => {
    expect(defaultAmountText([{ label: "1 bar (68 g)", grams: 68 }])).toBe(
      "1 bar",
    );
    expect(defaultAmountText([])).toBe("100 g");
  });

  it("adds extra measures without repeating one", () => {
    const own = [{ label: "1 cup (244 g)", grams: 244 }];
    const extra = [
      { label: "1 CUP (244 g)", grams: 244 },
      { label: "1 fl oz (30.5 g)", grams: 30.5 },
    ];
    expect(mergeServings(own, extra).map((s) => s.label)).toEqual([
      "1 cup (244 g)",
      "1 fl oz (30.5 g)",
    ]);
  });
});

describe("what a food contains", () => {
  it("scales per-100-g values and keeps unknown as unknown", () => {
    expect(nutrientIn({ calories: 89 }, "calories", 118)).toBeCloseTo(105.02);
    expect(
      nutrientIn({ calories: 89, sodium_mg: null }, "sodium_mg", 118),
    ).toBeNull();
    expect(nutrientIn({}, "calories", 100)).toBeNull();
  });

  it("writes calories the way people read them", () => {
    expect(kcalText(105.4)).toBe("105 kcal");
    expect(kcalText(null)).toBe("? kcal");
  });

  it("describes a result per serving with protein, or per 100 g without one", () => {
    const nutrients = { calories: 382.4, protein_g: 16.2 };
    expect(
      resultLine({
        nutrients,
        servings: [{ label: "1 bar (68 g)", grams: 68 }],
      }),
    ).toBe("260 kcal · 11 g protein per 1 bar (68 g)");
    expect(resultLine({ nutrients: { calories: 89 }, servings: [] })).toBe(
      "89 kcal per 100 g",
    );
    expect(resultLine({ nutrients, servings: [] })).toBe(
      "382 kcal · 16.2 g protein per 100 g",
    );
  });
});

describe("numbers typed in a box", () => {
  it("accepts commas and rejects words", () => {
    expect(parseNumber("2,5")).toBe(2.5);
    expect(parseNumber(" 30 ")).toBe(30);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("a food typed in by hand", () => {
  const FILLED = {
    ...EMPTY_MANUAL,
    name: " Granola ",
    servingGrams: "40",
    calories: "180",
    protein: "5",
  };

  it("scales the label numbers to per 100 g", () => {
    const result = manualFood(FILLED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.food.name).toBe("Granola");
    expect(result.food.nutrients.calories).toBeCloseTo(450);
    expect(result.food.nutrients.protein_g).toBeCloseTo(12.5);
    expect(result.food.nutrients).not.toHaveProperty("fat_g"); // left blank stays unknown
    expect(result.food.servings).toEqual([{ label: "1 serving", grams: 40 }]);
  });

  it.each([
    [{ name: "" }, /name/i],
    [{ servingGrams: "0" }, /serving size/i],
    [{ servingGrams: "x" }, /serving size/i],
    [{ calories: "" }, /calories/i],
    [{ protein: "lots" }, /protein/i],
    [{ fat: "-1" }, /fat/i],
  ])("explains a problem: %j", (change, message) => {
    const result = manualFood({ ...FILLED, ...change });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });
});

describe("correcting a database food", () => {
  it("copies one serving of the numbers into the form", () => {
    const form = manualFormFrom({
      name: "Crunchy Peanut Butter",
      nutrients: { calories: 382.4, protein_g: 16.2, fat_g: null, carb_g: 50 },
      servings: [{ label: "1 bar (68 g)", grams: 68 }],
    });
    expect(form).toEqual({
      name: "Crunchy Peanut Butter",
      servingLabel: "1 bar",
      servingGrams: "68",
      calories: "260",
      protein: "11",
      fat: "", // unknown stays blank, not 0
      carbs: "34",
    });
  });

  it("uses 100 g when the food has no serving, and the typed serving name when saving", () => {
    const form = manualFormFrom({
      name: "Flour",
      nutrients: { calories: 364 },
      servings: [],
    });
    expect(form.servingGrams).toBe("100");
    const saved = manualFood({
      ...form,
      servingLabel: " 1 bar ",
      servingGrams: "68",
    });
    expect(saved.ok && saved.food.servings).toEqual([
      { label: "1 bar", grams: 68 },
    ]);
  });
});

describe("names in lists", () => {
  it("puts the brand first and splits the product from its flavour", () => {
    expect(
      displayName({ name: "Nut Butter Bar, Peanut Butter", brand: "Clif Bar" }),
    ).toBe("Clif Bar · Nut Butter Bar – Peanut Butter");
  });

  it("does not repeat a brand the name already starts with", () => {
    expect(
      displayName({
        name: "Clif Bar Crunchy Peanut Butter",
        brand: "Clif Bar",
      }),
    ).toBe("Clif Bar Crunchy Peanut Butter");
  });

  it("leaves plain foods alone", () => {
    expect(displayName({ name: "Milk, whole", brand: null })).toBe(
      "Milk, whole",
    );
  });
});

describe("the amount wheel helpers", () => {
  const bowl: Portion = {
    label: "small bowl",
    grams: 123,
    kind: "rough",
    note: "about 4.3 oz (123 g)",
    quantities: [0.5, 1, 2],
  };
  const grams: Portion = {
    label: "g",
    grams: 1,
    kind: "exact",
    note: "",
    quantities: [50, 100, 150],
  };
  const container: Portion = {
    label: "container",
    grams: 170,
    kind: "own",
    note: "",
    quantities: [0.25, 1],
  };

  it("writes quantities the way people say them", () => {
    expect(quantityLabel(0.25)).toBe("1/4");
    expect(quantityLabel(1 / 3)).toBe("1/3");
    expect(quantityLabel(2 / 3)).toBe("2/3");
    expect(quantityLabel(1)).toBe("1");
    expect(quantityLabel(1.5)).toBe("1 1/2");
    expect(quantityLabel(1.75)).toBe("1 3/4");
    expect(quantityLabel(150)).toBe("150");
    expect(quantityLabel(0.4)).toBe("0.4");
  });

  it("writes an amount as text the server understands", () => {
    expect(portionText(bowl, 0.5)).toBe("1/2 small bowl");
    expect(portionText(bowl, 1)).toBe("1 small bowl");
    expect(portionText(bowl, 2)).toBe("2 small bowls");
    expect(portionText(container, 0.25)).toBe("1/4 container");
    expect(portionText(grams, 150)).toBe("150 g");
  });

  it("works out grams and a readable summary", () => {
    expect(portionGrams(bowl, 2)).toBe(246);
    expect(portionGrams(container, 0.25)).toBe(42.5);
    expect(portionSummary(bowl, 1)).toBe("about 4.3 oz (123 g)");
    expect(portionSummary(bowl, 4)).toBe("about 17 oz (492 g)");
    expect(portionSummary(grams, 150)).toBe("150 g");
  });

  it("marks rough sizes with their size on the wheel", () => {
    expect(portionItemLabel(bowl)).toBe("small bowl ~4.3 oz");
    expect(portionItemLabel(container)).toBe("container (170 g)");
    expect(portionItemLabel(grams)).toBe("g");
  });

  it("keeps a quantity the new unit offers, else starts sensibly", () => {
    expect(startQuantity(bowl, 2)).toBe(2);
    expect(startQuantity(bowl, 150)).toBe(1);
    expect(startQuantity(grams, 1)).toBe(100);
    expect(startQuantity(container)).toBe(1);
  });

  it("starts on the food's own serving, else grams", () => {
    expect(defaultChoice([bowl, container, grams])).toEqual({
      label: "container",
      quantity: 1,
    });
    expect(defaultChoice([bowl, grams])).toEqual({ label: "g", quantity: 100 });
    expect(defaultChoice([])).toBeNull();
  });
});
