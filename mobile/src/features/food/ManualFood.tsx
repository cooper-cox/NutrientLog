import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import { saveFood, type SavedFood } from "../../api/food";
import { Button, FormGroup, Input } from "../../ui/components";
import { manualFood, type ManualForm } from "./amounts";
import { colors } from "../../ui/theme";

type Props = {
  /** Start from these values (a copy of a food to correct), or from just a name. */
  initial: ManualForm;
  /** True when correcting a copy of a database food (changes the wording). */
  correcting?: boolean;
  onSaved: (food: SavedFood) => void;
  onBack: () => void;
};

/** The failsafe: type in a food from its package label (numbers "per serving"). */
export function ManualFood({
  initial,
  correcting = false,
  onSaved,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<ManualForm>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ManualForm) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    const checked = manualFood(form);
    if (!checked.ok) {
      setMessage(checked.message);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      onSaved(await saveFood(checked.food));
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Could not save that food.",
      );
      setSaving(false);
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Button title="Back" onPress={onBack} secondary />
      <Text style={styles.title} accessibilityRole="header">
        {correcting ? "Correct the numbers" : "Add a food by hand"}
      </Text>
      <Text style={styles.help}>
        {correcting
          ? "Copy the numbers from the package. This makes your own copy (the database entry stays as it is). Only calories, protein, fat and carbs are kept."
          : "Copy the numbers from the label. They are all for one serving."}
      </Text>

      <FormGroup label="Name">
        <Input
          value={form.name}
          onChangeText={set("name")}
          accessibilityLabel="Name"
        />
      </FormGroup>
      <FormGroup
        label="Serving name"
        help='What one serving is, like "1 bar" or "1 cup".'
      >
        <Input
          value={form.servingLabel}
          onChangeText={set("servingLabel")}
          maxLength={40}
          accessibilityLabel="Serving name"
        />
      </FormGroup>
      <FormGroup
        label="Serving size (grams)"
        help='On the label: "Serving size 30 g".'
      >
        <Input
          value={form.servingGrams}
          onChangeText={set("servingGrams")}
          keyboardType="decimal-pad"
          maxLength={8}
          accessibilityLabel="Serving size in grams"
        />
      </FormGroup>
      <FormGroup label="Calories per serving">
        <Input
          value={form.calories}
          onChangeText={set("calories")}
          keyboardType="decimal-pad"
          maxLength={8}
          accessibilityLabel="Calories per serving"
        />
      </FormGroup>
      <FormGroup label="Protein (g), if you know">
        <Input
          value={form.protein}
          onChangeText={set("protein")}
          keyboardType="decimal-pad"
          maxLength={8}
          accessibilityLabel="Protein in grams"
        />
      </FormGroup>
      <FormGroup label="Fat (g), if you know">
        <Input
          value={form.fat}
          onChangeText={set("fat")}
          keyboardType="decimal-pad"
          maxLength={8}
          accessibilityLabel="Fat in grams"
        />
      </FormGroup>
      <FormGroup label="Carbs (g), if you know">
        <Input
          value={form.carbs}
          onChangeText={set("carbs")}
          keyboardType="decimal-pad"
          maxLength={8}
          accessibilityLabel="Carbs in grams"
        />
      </FormGroup>

      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Button
        title="Save and continue"
        onPress={() => void save()}
        disabled={saving}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: 16 },
  help: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 21,
  },
  error: { fontSize: 15, color: colors.danger, marginBottom: 8 },
});
