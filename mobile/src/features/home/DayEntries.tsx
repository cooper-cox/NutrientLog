import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../../api/client";
import type { Day } from "../../api/food";
import { Button, Input } from "../../ui/components";
import { kcalText } from "../food/amounts";
import { colors } from "../../ui/theme";

type Props = {
  day: Day;
  /** "Today", "Yesterday", "Mon, Oct 5". */
  label: string;
  isToday: boolean;
  remove: (entryId: string) => Promise<void>;
  /** Rejects with the reason (an ApiError) when the typed amount can't be used. */
  changeAmount: (entryId: string, text: string) => Promise<void>;
};

/** What was eaten on one day, with Edit (amount) and Remove on every entry. */
export function DayEntries({
  day,
  label,
  isToday,
  remove,
  changeAmount,
}: Props) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    text: string;
  } | null>(null);
  const [editProblem, setEditProblem] = useState<string | null>(null);

  async function saveEdit() {
    if (!editing) return;
    try {
      await changeAmount(editing.id, editing.text.trim());
      setEditing(null);
      setEditProblem(null);
    } catch (error) {
      setEditProblem(
        error instanceof ApiError
          ? error.message
          : "Could not change that amount.",
      );
    }
  }

  return (
    <View>
      {day.entries.length === 0 ? (
        <Text style={styles.empty}>
          {isToday
            ? "Nothing yet. Search for a food to start."
            : "Nothing was logged this day."}
        </Text>
      ) : (
        day.entries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.entryText}>
              <Text style={styles.entryName}>{entry.food_name}</Text>
              <Text style={styles.entryLine}>
                {entry.amount_text ?? `${Math.round(entry.grams)} g`} ·{" "}
                {kcalText(entry.nutrients.calories ?? null)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${entry.food_name}`}
              onPress={() => {
                setEditProblem(null);
                setEditing({
                  id: entry.id,
                  name: entry.food_name,
                  text: entry.amount_text ?? `${Math.round(entry.grams)} g`,
                });
              }}
              style={styles.action}
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${entry.food_name}`}
              onPress={() => void remove(entry.id)}
              style={styles.action}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}

      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.backdrop}
        >
          {editing ? (
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.sheetTitle}>{editing.name}</Text>
              <Input
                accessibilityLabel={`New amount for ${editing.name}`}
                value={editing.text}
                onChangeText={(text) => setEditing({ ...editing, text })}
                placeholder="2 bars, 150 g, 1 cup"
                autoCapitalize="none"
                autoFocus
                hasError={editProblem !== null}
              />
              {editProblem ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {editProblem}
                </Text>
              ) : null}
              <Button title="Save amount" onPress={() => void saveEdit()} />
              <Button
                title="Cancel"
                onPress={() => {
                  setEditing(null);
                  setEditProblem(null);
                }}
                secondary
              />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 16, color: colors.muted, marginTop: 8 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  entryText: { flex: 1 },
  entryName: { fontSize: 16, fontWeight: "600", color: colors.text },
  entryLine: { fontSize: 14, color: colors.muted, marginTop: 2 },
  action: { paddingVertical: 8, paddingHorizontal: 10 },
  editText: { fontSize: 15, color: colors.accent },
  removeText: { fontSize: 15, color: colors.danger },
  error: { fontSize: 16, color: colors.danger, marginVertical: 12 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
});
