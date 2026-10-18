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
  saveFood,
  type Serving,
} from "../../api/food";
import { Button, FormGroup, Input } from "../../ui/components";
import {
  defaultAmountText,
  displayName,
  kcalText,
  manualFormFrom,
  type ManualForm,
  mergeServings,
  nutrientIn,
  servingAmountText,
  type PickedFood,
} from "./amounts";

const WAIT_MS = 350;

type Props = {
  picked: PickedFood;
  onAdded: () => void;
  onBack: () => void;
  /** Open the correction form, filled in with this food's numbers. */
  onFix: (form: ManualForm) => void;
};

function gramsText(value: number | null): string {
  return value === null ? "?" : `${Math.round(value * 10) / 10} g`;
}

/** One food: type an amount in any unit, see what it contains, add it to today. */
export function FoodDetail({ picked, onAdded, onBack, onFix }: Props) {
  const insets = useSafeAreaInsets();
  const food = picked.food;
  const [servings, setServings] = useState<Serving[]>(food.servings);
  const hasMoreMeasures =
    picked.kind === "candidate" && picked.food.source === "usda";
  const [loadingMeasures, setLoadingMeasures] = useState(hasMoreMeasures);
  const [text, setText] = useState(() => defaultAmountText(food.servings));
  const [gramsFor, setGramsFor] = useState<number | null>(null);
  const [problemFor, setProblemFor] = useState<string | null>(null);
  const blank = text.trim() === "";
  const grams = blank ? null : gramsFor;
  const problem = blank ? null : problemFor;
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

  // Work out the grams from what was typed, a moment after typing stops.
  useEffect(() => {
    if (text.trim() === "") return;
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
  }, [text, servings, food.name]);

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
      await addLogEntry(foodId, grams, text.trim());
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
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Button title="Back" onPress={onBack} secondary />
      <Text style={styles.name} accessibilityRole="header">
        {displayName(food)}
      </Text>

      <FormGroup
        label="How much?"
        help='Any unit works: "1 medium", "1/2 cup", "8 oz", "100 g", "2 tbsp".'
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

      <View style={styles.summary} accessibilityLabel="What this contains">
        <Text style={styles.big}>
          {ready ? kcalText(nutrientIn(per100, "calories", shown)) : "— kcal"}
        </Text>
        <Text style={styles.small}>
          {ready ? `${gramsText(grams)} of food` : "Enter an amount"}
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
        title="Add to today"
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
