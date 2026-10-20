import { shortDate } from "../home/dates";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import {
  addLogEntry,
  amountToGrams,
  getMeasures,
  getPortions,
  saveFood,
  type Portion,
  type Serving,
} from "../../api/food";
import { Button, FormGroup, Input } from "../../ui/components";
import { AmountWheel } from "./AmountWheel";
import {
  defaultAmountText,
  defaultChoice,
  displayName,
  kcalText,
  manualFormFrom,
  type ManualForm,
  mergeServings,
  nutrientIn,
  portionGrams,
  portionText,
  servingAmountText,
  type PickedFood,
} from "./amounts";

const WAIT_MS = 350;

type Props = {
  picked: PickedFood;
  /** The day to add to (YYYY-MM-DD); null is today. */
  date?: string | null;
  onAdded: () => void;
  onBack: () => void;
  /** Open the correction form, filled in with this food's numbers. */
  onFix: (form: ManualForm) => void;
};

function gramsText(value: number | null): string {
  return value === null ? "?" : `${Math.round(value * 10) / 10} g`;
}

/** One food: type an amount in any unit, see what it contains, add it to today. */
export function FoodDetail({
  picked,
  date = null,
  onAdded,
  onBack,
  onFix,
}: Props) {
  const insets = useSafeAreaInsets();
  const food = picked.food;
  const [servings, setServings] = useState<Serving[]>(food.servings);
  const hasMoreMeasures =
    picked.kind === "candidate" && picked.food.source === "usda";
  const [loadingMeasures, setLoadingMeasures] = useState(hasMoreMeasures);
  const [text, setText] = useState(() => defaultAmountText(food.servings));
  const [gramsFor, setGramsFor] = useState<number | null>(null);
  const [problemFor, setProblemFor] = useState<string | null>(null);
  // The wheel is how most people give an amount; typing is for anything it does not offer.
  const [typing, setTyping] = useState(false);
  const [portions, setPortions] = useState<Portion[]>([]);
  const [wheel, setWheel] = useState<{
    unit: string;
    quantity: number;
    picked: boolean;
  } | null>(null);
  const blank = text.trim() === "";
  const chosenPortion = portions.find((p) => p.label === wheel?.unit);
  const wheelReady = chosenPortion !== undefined && wheel !== null;
  const typedGrams = blank ? null : gramsFor;
  const grams = typing
    ? typedGrams
    : wheelReady
      ? portionGrams(chosenPortion, wheel.quantity)
      : null;
  const amountText = typing
    ? text.trim()
    : wheelReady
      ? portionText(chosenPortion, wheel.quantity)
      : "";
  const problem = typing && !blank ? problemFor : null;
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // A search result only carries its package serving; USDA has more ("1 cup", "1 medium").
  useEffect(() => {
    if (picked.kind !== "candidate" || picked.food.source !== "usda") return;
    let live = true;
    getMeasures(picked.food.source, picked.food.source_id)
      .then((extra) => {
        if (live) setServings((own) => mergeServings(own, extra));
      })
      .catch(() => {
        // Not fatal: grams and the food's own serving still work.
      })
      .finally(() => {
        if (live) setLoadingMeasures(false);
      });
    return () => {
      live = false;
    };
  }, [picked]);

  // The wheel's choices for this food (its own servings, rough sizes, exact units).
  useEffect(() => {
    let live = true;
    getPortions(
      food.name,
      servings.map(({ label, grams: g }) => ({ label, grams: g })),
    )
      .then((found) => {
        if (!live) return;
        setPortions(found);
        setWheel((now) => {
          // Better choices can arrive after the first ones (USDA's own measures); keep what
          // the person picked, but move an untouched wheel to the best starting point.
          const kept = found.find((p) => p.label === now?.unit);
          if (now?.picked && kept && kept.quantities.includes(now.quantity))
            return now;
          const start = defaultChoice(found);
          return start
            ? { unit: start.label, quantity: start.quantity, picked: false }
            : null;
        });
      })
      .catch(() => {
        // Not fatal: typing an amount still works.
        if (live) setTyping(true);
      });
    return () => {
      live = false;
    };
  }, [food.name, servings]);

  // Work out the grams from what was typed, a moment after typing stops.
  useEffect(() => {
    if (!typing || text.trim() === "") return;
    let live = true;
    const timer = setTimeout(() => {
      amountToGrams(text, food.name, servings)
        .then((reply) => {
          if (!live) return;
          setGramsFor(reply.grams);
          setProblemFor(null);
        })
        .catch((error: unknown) => {
          if (!live) return;
          setGramsFor(null);
          setProblemFor(
            error instanceof ApiError
              ? error.message
              : "Could not work that out.",
          );
        });
    }, WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typing, text, servings, food.name]);

  async function add() {
    if (grams === null) return;
    setAdding(true);
    setAddError(null);
    try {
      let foodId: string;
      if (picked.kind === "saved") {
        foodId = picked.food.id;
      } else {
        const candidate = picked.food;
        const savedFood = await saveFood({
          name: candidate.name,
          brand: candidate.brand,
          barcode: candidate.barcode,
          nutrients: candidate.nutrients,
          servings: servings.map(({ label, grams: g }) => ({
            label,
            grams: g,
          })),
          source: candidate.source === "off" ? "off" : "usda",
          source_id: candidate.source_id,
        });
        foodId = savedFood.id;
      }
      await addLogEntry(foodId, grams, amountText, date ?? undefined);
      onAdded();
    } catch (error) {
      setAddError(
        error instanceof ApiError ? error.message : "Could not add that.",
      );
      setAdding(false);
    }
  }

  const per100 = food.nutrients;
  const shown = grams ?? 0;
  const ready = grams !== null;

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Button title="Back" onPress={onBack} secondary />
      <Text style={styles.name} accessibilityRole="header">
        {displayName(food)}
      </Text>

      {typing ? (
        <>
          <FormGroup
            label="How much?"
            help='Any unit works: "1 medium", "1/2 cup", "8 oz", "100 g", "1/4 of a container".'
            error={problem ?? undefined}
          >
            <Input
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Amount"
              hasError={problem !== null}
            />
          </FormGroup>

          {servings.length > 0 || loadingMeasures ? (
            <View style={styles.chips} accessibilityLabel="Quick amounts">
              {servings.slice(0, 10).map((serving) => (
                <Pressable
                  key={serving.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${serving.label}`}
                  onPress={() => setText(servingAmountText(serving.label))}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{serving.label}</Text>
                </Pressable>
              ))}
              {loadingMeasures ? (
                <ActivityIndicator style={styles.spinner} />
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <FormGroup
          label="How much?"
          help="Scroll to pick. Sizes marked ~ are estimates."
        >
          {wheel ? (
            <AmountWheel
              portions={portions}
              unit={wheel.unit}
              quantity={wheel.quantity}
              onChange={(unit, quantity) =>
                setWheel({ unit, quantity, picked: true })
              }
            />
          ) : (
            <ActivityIndicator style={styles.spinner} />
          )}
        </FormGroup>
      )}
      <Button
        title={
          typing ? "Use the wheel instead" : "Type an exact amount instead"
        }
        onPress={() => setTyping((now) => !now)}
        secondary
      />

      <View style={styles.summary} accessibilityLabel="What this contains">
        <Text style={styles.big}>
          {ready ? kcalText(nutrientIn(per100, "calories", shown)) : "— kcal"}
        </Text>
        <Text style={styles.small}>
          {ready ? `${gramsText(grams)} of food` : "Choose an amount"}
        </Text>
        {ready ? (
          <View style={styles.macros}>
            <Text style={styles.macro}>
              Protein {gramsText(nutrientIn(per100, "protein_g", shown))}
            </Text>
            <Text style={styles.macro}>
              Fat {gramsText(nutrientIn(per100, "fat_g", shown))}
            </Text>
            <Text style={styles.macro}>
              Carbs {gramsText(nutrientIn(per100, "carb_g", shown))}
            </Text>
          </View>
        ) : null}
      </View>

      {addError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {addError}
        </Text>
      ) : null}
      <Button
        title={date ? `Add to ${shortDate(date)}` : "Add to today"}
        onPress={() => void add()}
        disabled={!ready || adding}
      />
      <Button
        title="These numbers are wrong: fix them"
        onPress={() =>
          onFix(
            manualFormFrom({
              name: food.name,
              nutrients: food.nutrients,
              servings,
            }),
          )
        }
        secondary
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20 },
  name: { fontSize: 24, fontWeight: "700", color: "#111111", marginTop: 16 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#999999",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { fontSize: 14, color: "#111111" },
  spinner: { marginLeft: 8 },
  summary: {
    borderRadius: 12,
    backgroundColor: "#f3f3f3",
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  big: { fontSize: 36, fontWeight: "700", color: "#111111" },
  small: { fontSize: 15, color: "#555555", marginTop: 2 },
  macros: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 10,
  },
  macro: { fontSize: 15, color: "#111111", marginHorizontal: 8 },
  error: { fontSize: 15, color: "#b00020", marginBottom: 8 },
});
