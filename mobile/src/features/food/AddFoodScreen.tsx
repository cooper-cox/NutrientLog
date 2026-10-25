import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FoodCandidate, SavedFood } from "../../api/food";
import { Button, Input } from "../../ui/components";
import {
  displayName,
  EMPTY_MANUAL,
  resultLine,
  type ManualForm,
  type PickedFood,
} from "./amounts";
import { FoodDetail } from "./FoodDetail";
import { ManualFood } from "./ManualFood";
import { useFoodSearch } from "./useFoodSearch";
import { colors } from "../../ui/theme";

/** How many results show at first, and how many more each "Show more" adds. */
export const PAGE_SIZE = 20;

type Props = {
  /** The day to add to (YYYY-MM-DD); null is today. */
  date?: string | null;
  /** Open on the search box (default) or straight on the add-by-hand form. */
  start?: "search" | "manual";
  onAdded: () => void;
  onBack: () => void;
};

type Step =
  | { kind: "search" }
  | { kind: "manual"; initial: ManualForm; correcting: boolean }
  | { kind: "detail"; picked: PickedFood };

function Row({
  name,
  line,
  tag,
  onPress,
}: {
  name: string;
  line: string;
  tag?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${line}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowName}>{name}</Text>
      {tag ? <Text style={styles.rowBrand}>{tag}</Text> : null}
      <Text style={styles.rowLine}>{line}</Text>
    </Pressable>
  );
}

/** Find a food (one search box), pick an amount, add it to today. Or type one in by hand. */
export function AddFoodScreen({
  date = null,
  start = "search",
  onAdded,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const search = useFoodSearch();
  // How many results show; a new search starts again at the first page.
  const [paged, setPaged] = useState({ query: "", count: PAGE_SIZE });
  const shown = paged.query === search.query ? paged.count : PAGE_SIZE;
  const setShown = (count: number) => setPaged({ query: search.query, count });
  const [step, setStep] = useState<Step>(
    start === "manual"
      ? { kind: "manual", initial: EMPTY_MANUAL, correcting: false }
      : { kind: "search" },
  );

  if (step.kind === "detail") {
    return (
      <FoodDetail
        picked={step.picked}
        date={date}
        onAdded={onAdded}
        onBack={() => setStep({ kind: "search" })}
        onFix={(initial: ManualForm) =>
          setStep({ kind: "manual", initial, correcting: true })
        }
      />
    );
  }
  if (step.kind === "manual") {
    return (
      <ManualFood
        initial={step.initial}
        correcting={step.correcting}
        onSaved={(food: SavedFood) =>
          setStep({ kind: "detail", picked: { kind: "saved", food } })
        }
        onBack={() => setStep({ kind: "search" })}
      />
    );
  }

  const nothingFound =
    search.searched &&
    !search.loading &&
    search.saved.length === 0 &&
    search.results.length === 0;

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
    >
      <Button title="Back" onPress={onBack} secondary />
      <Text style={styles.title} accessibilityRole="header">
        Add food
      </Text>
      <Input
        value={search.query}
        onChangeText={search.setQuery}
        placeholder='Search, e.g. "banana" or "peanut butter clif bar"'
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        accessibilityLabel="Search foods"
      />

      <View style={styles.manual}>
        <Button
          title="Add a food by hand"
          onPress={() =>
            setStep({
              kind: "manual",
              initial: { ...EMPTY_MANUAL, name: search.query.trim() },
              correcting: false,
            })
          }
          secondary
        />
      </View>

      {search.loading ? <ActivityIndicator style={styles.spinner} /> : null}
      {search.extending ? (
        <Text style={styles.warning}>Checking one more database…</Text>
      ) : null}
      {search.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {search.error}
        </Text>
      ) : null}
      {search.warnings.map((warning) => (
        <Text key={warning} style={styles.warning}>
          {warning}
        </Text>
      ))}

      {search.saved.map((food) => (
        <Row
          key={food.id}
          name={displayName(food)}
          line={resultLine(food)}
          tag="Saved"
          onPress={() =>
            setStep({ kind: "detail", picked: { kind: "saved", food } })
          }
        />
      ))}
      {search.results.slice(0, shown).map((food: FoodCandidate) => (
        <Row
          key={`${food.source}:${food.source_id}`}
          name={displayName(food)}
          line={resultLine(food)}
          onPress={() =>
            setStep({ kind: "detail", picked: { kind: "candidate", food } })
          }
        />
      ))}

      {nothingFound ? (
        <Text style={styles.empty}>Nothing found. Try other words.</Text>
      ) : null}
      {!search.loading && (search.results.length > shown || search.hasMore) ? (
        <Button
          title="Show more"
          onPress={() => {
            if (search.results.length <= shown) search.loadMore();
            setShown(shown + PAGE_SIZE);
          }}
          secondary
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.text,
    marginVertical: 16,
  },
  spinner: { marginTop: 12 },
  error: { fontSize: 15, color: colors.danger, marginTop: 10 },
  warning: { fontSize: 14, color: colors.warn, marginTop: 8 },
  empty: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 16,
    textAlign: "center",
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowPressed: { backgroundColor: colors.surface2 },
  rowName: { fontSize: 17, fontWeight: "600", color: colors.text },
  rowBrand: { fontSize: 14, color: colors.muted, marginTop: 2 },
  rowLine: { fontSize: 14, color: colors.text, marginTop: 2 },
  manual: { marginTop: 12 },
});
