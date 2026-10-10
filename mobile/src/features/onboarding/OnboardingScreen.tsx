import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import type { ActivityLevel, GoalType, ProfileSaved, Sex } from '../../api/users';
import { formatRate } from '../../lib/units';
import { getTimeZone } from '../../lib/timezone';
import { Button, ChoiceGroup, DISCLAIMER, FormGroup, Input } from '../../ui/components';
import { saveSurvey } from './saveSurvey';
import {
  buildProfileRequest,
  changeUnits,
  DEFAULT_RATE_KG,
  emptyForm,
  type FieldErrors,
  RATE_CHOICES,
  type SurveyForm,
} from './survey';

const SEX_CHOICES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'no_answer', label: 'Prefer not to say' },
];

const ACTIVITY_CHOICES: { value: ActivityLevel; label: string; detail: string }[] = [
  { value: 'sedentary', label: 'Sedentary', detail: 'Little or no exercise' },
  { value: 'light', label: 'Lightly active', detail: '1-3 workouts a week' },
  { value: 'moderate', label: 'Moderately active', detail: '3-5 workouts a week' },
  { value: 'very_active', label: 'Very active', detail: '6-7 workouts a week' },
  { value: 'extra_active', label: 'Extra active', detail: 'Hard daily training or a physical job' },
];

const GOAL_CHOICES: { value: GoalType; label: string }[] = [
  { value: 'gain', label: 'Gain weight' },
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain my weight' },
];

type Props = {
  /** Start from these answers (when changing them later) instead of an empty survey. */
  initialForm?: SurveyForm;
  onSaved: (saved: ProfileSaved) => void;
  /** Shown as a "Cancel" button when the person is editing existing answers. */
  onCancel?: () => void;
};

/** The first-run survey: a few questions, then a calorie and macro target. */
export function OnboardingScreen({ initialForm, onSaved, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<SurveyForm>(initialForm ?? emptyForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const metric = form.units === 'metric';
  const set = <K extends keyof SurveyForm>(key: K, value: SurveyForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    if (saving) return;
    setProblem(null);

    const result = buildProfileRequest(form, getTimeZone(), new Date());
    if (!result.ok) {
      setErrors(result.errors);
      setProblem('Some answers need fixing. They are marked below.');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onSaved(await saveSurvey(result.body));
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors as FieldErrors);
        setProblem('Some answers need fixing. They are marked below.');
      } else {
        setProblem(error instanceof Error ? error.message : 'Something went wrong.');
      }
    } finally {
      setSaving(false);
    }
  }

  const rateChoices =
    form.goalType === 'gain' || form.goalType === 'lose'
      ? RATE_CHOICES[form.goalType].map((kg) => ({
          value: kg,
          label: formatRate(kg, form.units),
        }))
      : [];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title} accessibilityRole="header">
          Let’s set your targets
        </Text>
        <Text style={styles.intro}>
          A few questions about you, then NutrientLog works out how many calories and how much
          protein, fat and carbs to aim for each day.
        </Text>
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>

        <FormGroup label="Your name (optional)" error={errors.name}>
          <Input
            accessibilityLabel="Your name"
            value={form.name}
            onChangeText={(text) => set('name', text)}
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={100}
            hasError={!!errors.name}
          />
        </FormGroup>

        <FormGroup label="Units" help="You can change these later.">
          <ChoiceGroup
            label="Units"
            choices={[
              { value: 'imperial' as const, label: 'Pounds and feet' },
              { value: 'metric' as const, label: 'Kilograms and centimetres' },
            ]}
            value={form.units}
            onChange={(units) => setForm((current) => changeUnits(current, units))}
          />
        </FormGroup>

        <FormGroup
          label="Sex (used for the calorie formula)"
          help="'Prefer not to say' uses an average of the male and female formulas."
          error={errors.sex}
        >
          <ChoiceGroup
            label="Sex"
            choices={SEX_CHOICES}
            value={form.sex}
            onChange={(sex) => set('sex', sex)}
          />
        </FormGroup>

        <FormGroup label="Birth date" error={errors.birth_date}>
          <View style={styles.row}>
            <Input
              accessibilityLabel="Birth month"
              placeholder="MM"
              keyboardType="number-pad"
              maxLength={2}
              value={form.birthMonth}
              onChangeText={(text) => set('birthMonth', text)}
              hasError={!!errors.birth_date}
              style={styles.small}
            />
            <Input
              accessibilityLabel="Birth day"
              placeholder="DD"
              keyboardType="number-pad"
              maxLength={2}
              value={form.birthDay}
              onChangeText={(text) => set('birthDay', text)}
              hasError={!!errors.birth_date}
              style={styles.small}
            />
            <Input
              accessibilityLabel="Birth year"
              placeholder="YYYY"
              keyboardType="number-pad"
              maxLength={4}
              value={form.birthYear}
              onChangeText={(text) => set('birthYear', text)}
              hasError={!!errors.birth_date}
              style={styles.medium}
            />
          </View>
        </FormGroup>

        <FormGroup label="Height" error={errors.height_cm}>
          {metric ? (
            <Input
              accessibilityLabel="Height in centimetres"
              placeholder="cm"
              keyboardType="decimal-pad"
              value={form.heightCm}
              onChangeText={(text) => set('heightCm', text)}
              hasError={!!errors.height_cm}
            />
          ) : (
            <View style={styles.row}>
              <Input
                accessibilityLabel="Height, feet"
                placeholder="ft"
                keyboardType="number-pad"
                maxLength={1}
                value={form.heightFeet}
                onChangeText={(text) => set('heightFeet', text)}
                hasError={!!errors.height_cm}
                style={styles.small}
              />
              <Input
                accessibilityLabel="Height, inches"
                placeholder="in"
                keyboardType="decimal-pad"
                maxLength={4}
                value={form.heightInches}
                onChangeText={(text) => set('heightInches', text)}
                hasError={!!errors.height_cm}
                style={styles.small}
              />
            </View>
          )}
        </FormGroup>

        <FormGroup label="Current weight" error={errors.weight_kg}>
          <Input
            accessibilityLabel={`Current weight in ${metric ? 'kilograms' : 'pounds'}`}
            placeholder={metric ? 'kg' : 'lb'}
            keyboardType="decimal-pad"
            value={form.weight}
            onChangeText={(text) => set('weight', text)}
            hasError={!!errors.weight_kg}
          />
        </FormGroup>

        <FormGroup label="How active are you?" error={errors.activity_level}>
          <ChoiceGroup
            label="Activity level"
            choices={ACTIVITY_CHOICES}
            value={form.activity}
            onChange={(activity) => set('activity', activity)}
          />
        </FormGroup>

        <FormGroup label="Your goal" error={errors.goal_type}>
          <ChoiceGroup
            label="Goal"
            choices={GOAL_CHOICES}
            value={form.goalType}
            onChange={(goalType) =>
              setForm((current) => ({ ...current, goalType, rateKg: DEFAULT_RATE_KG }))
            }
          />
        </FormGroup>

        {rateChoices.length > 0 ? (
          <FormGroup label="How fast?" error={errors.rate_kg_per_week}>
            <ChoiceGroup
              label="Weekly pace"
              choices={rateChoices}
              value={form.rateKg}
              onChange={(rateKg) => set('rateKg', rateKg)}
            />
          </FormGroup>
        ) : null}

        <FormGroup
          label="Goal weight (optional)"
          help="Used to estimate how long it will take."
          error={errors.goal_weight_kg}
        >
          <Input
            accessibilityLabel={`Goal weight in ${metric ? 'kilograms' : 'pounds'}`}
            placeholder={metric ? 'kg' : 'lb'}
            keyboardType="decimal-pad"
            value={form.goalWeight}
            onChangeText={(text) => set('goalWeight', text)}
            hasError={!!errors.goal_weight_kg}
          />
        </FormGroup>

        {problem ? (
          <Text style={styles.problem} accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}

        <Button
          title={saving ? 'Saving…' : 'Calculate my targets'}
          onPress={() => void submit()}
          disabled={saving}
        />
        {onCancel ? <Button title="Cancel" onPress={onCancel} secondary disabled={saving} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 30, fontWeight: '700', color: '#111111' },
  intro: { fontSize: 16, color: '#333333', marginTop: 8, lineHeight: 22 },
  disclaimer: {
    fontSize: 14,
    color: '#555555',
    marginTop: 12,
    marginBottom: 24,
    lineHeight: 19,
  },
  row: { flexDirection: 'row', gap: 10 },
  small: { flex: 1 },
  medium: { flex: 1.5 },
  problem: { fontSize: 16, color: '#b00020', marginBottom: 12 },
});
