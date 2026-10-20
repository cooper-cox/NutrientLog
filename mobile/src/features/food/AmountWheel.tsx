import { Picker } from "@react-native-picker/picker";
import { StyleSheet, Text, View } from "react-native";

import type { Portion } from "../../api/food";
import {
  portionItemLabel,
  portionSummary,
  quantityLabel,
  startQuantity,
} from "./amounts";

type Props = {
  portions: Portion[];
  unit: string;
  quantity: number;
  onChange: (unit: string, quantity: number) => void;
};

/**
 * Two scroll wheels, like a timer: how many (1/4, 1/2, 1, 1 1/2...) and of what (small bowl,
 * cup, container, g...). Rough sizes say about how big they are, so nobody needs to know grams.
 */
export function AmountWheel({ portions, unit, quantity, onChange }: Props) {
  const chosen = portions.find((portion) => portion.label === unit);
  if (!chosen) return null;
  return (
    <View>
      <View style={styles.wheels}>
        <Picker
          style={styles.number}
          accessibilityLabel="How many"
          selectedValue={quantity}
          onValueChange={(value: number) => onChange(unit, value)}
        >
          {chosen.quantities.map((value) => (
            <Picker.Item
              key={value}
              label={quantityLabel(value)}
              value={value}
            />
          ))}
        </Picker>
        <Picker
          style={styles.unit}
          accessibilityLabel="Unit"
          selectedValue={unit}
          onValueChange={(label: string) => {
            const next = portions.find((portion) => portion.label === label);
            if (next) onChange(label, startQuantity(next, quantity));
          }}
        >
          {portions.map((portion) => (
            <Picker.Item
              key={portion.label}
              label={portionItemLabel(portion)}
              value={portion.label}
            />
          ))}
        </Picker>
      </View>
      <Text style={styles.summary} accessibilityLabel="Amount in weight">
        {portionSummary(chosen, quantity)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wheels: { flexDirection: "row" },
  number: { flex: 2 },
  unit: { flex: 5 },
  summary: {
    textAlign: "center",
    fontSize: 15,
    color: "#555555",
    marginBottom: 8,
  },
});
