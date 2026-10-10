import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Goal, Profile } from '../../api/users';
import { formatRate, formatWeight } from '../../lib/units';
import { Button, DISCLAIMER } from '../../ui/components';

type Props = {
  profile: Profile;
  goal: Goal;
  onChangeAnswers: () => void;
  onCheckConnection: () => void;
};

function signed(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/** The result of the survey: today's targets and a plain explanation of where they came from. */
export function ResultsScreen({ profile, goal, onChangeAnswers, onCheckConnection }: Props) {
  const insets = useSafeAreaInsets();
  const units = profile.unit_preference;
  const trying = goal.rate_kg_per_week > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        {profile.name ? `${profile.name}, your daily targets` : 'Your daily targets'}
      </Text>

      <View style={styles.hero}>
        <Text style={styles.calories} accessibilityLabel={`${goal.calories} calories per day`}>
          {goal.calories}
        </Text>
        <Text style={styles.caloriesLabel}>calories per day</Text>
      </View>

      <View style={styles.macros}>
        <Macro label="Protein" grams={goal.protein_g} />
        <Macro label="Fat" grams={goal.fat_g} />
        <Macro label="Carbs" grams={goal.carb_g} />
      </View>

      {goal.weeks_to_goal !== null && profile.goal_weight_kg !== null ? (
        <Text style={styles.paragraph}>
          At {formatRate(goal.rate_kg_per_week, units)}, reaching{' '}
          {formatWeight(profile.goal_weight_kg, units)} would take about {goal.weeks_to_goal}{' '}
          {goal.weeks_to_goal === 1 ? 'week' : 'weeks'}.
        </Text>
      ) : null}

      {goal.rate_was_capped ? (
        <Text style={styles.notice}>
          The pace you asked for was faster than we consider safe, so it was reduced to{' '}
          {formatRate(goal.rate_kg_per_week, units)}.
        </Text>
      ) : null}
      {goal.floor_was_applied ? (
        <Text style={styles.notice}>
          Your target was raised to the lowest daily amount we recommend, so it is higher than the
          maths alone gave.
        </Text>
      ) : null}

      <Text style={styles.heading}>How we worked this out</Text>
      <Text style={styles.paragraph}>
        Your body burns about {Math.round(goal.bmr)} calories a day at rest. With your activity
        level that comes to about {Math.round(goal.tdee)} a day to stay at the same weight.
        {trying
          ? ` To ${profile.goal_type === 'gain' ? 'gain' : 'lose'} weight we ${
              profile.goal_type === 'gain' ? 'add' : 'remove'
            } ${Math.abs(Math.round(goal.daily_adjustment))} calories (${signed(goal.daily_adjustment)} a day).`
          : ' Because you want to stay where you are, nothing is added or removed.'}
      </Text>
      <Text style={styles.paragraph}>
        These are estimates. Real bodies vary, so adjust if your weight isn’t moving the way you
        want.
      </Text>

      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>

      <Button title="Change my answers" onPress={onChangeAnswers} />
      <Button title="Check server connection" onPress={onCheckConnection} secondary />
    </ScrollView>
  );
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${label}: ${grams} grams`}>
      <Text style={styles.macroValue}>{grams} g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#111111' },
  hero: { alignItems: 'center', marginVertical: 28 },
  calories: { fontSize: 64, fontWeight: '700', color: '#111111' },
  caloriesLabel: { fontSize: 18, color: '#555555' },
  macros: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  macro: { flex: 1, alignItems: 'center' },
  macroValue: { fontSize: 24, fontWeight: '600', color: '#111111' },
  macroLabel: { fontSize: 15, color: '#555555', marginTop: 2 },
  heading: { fontSize: 20, fontWeight: '600', color: '#111111', marginTop: 12, marginBottom: 8 },
  paragraph: { fontSize: 16, color: '#222222', lineHeight: 23, marginBottom: 12 },
  notice: { fontSize: 15, color: '#7a4b00', lineHeight: 21, marginBottom: 12 },
  disclaimer: { fontSize: 14, color: '#555555', lineHeight: 19, marginVertical: 20 },
});
