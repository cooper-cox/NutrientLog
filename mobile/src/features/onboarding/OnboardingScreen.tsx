import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  type FieldName,
  answersWithText,
  cleanNumber,
  groupReady,
  RATE_CHOICES,
  type SurveyForm,
} from './survey';
import { useLimits } from './useLimits';

/** How long without typing before an answer is checked (milliseconds). */
const IDLE_MS = 800;

/** Long enough for the biggest accepted number with a decimal, e.g. 660.5 */
const MAX_NUMBER_LENGTH = 5;

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
  const { limits, unavailable: limitsUnavailable } = useLimits();
  const timeZone = getTimeZone();
  const [today] = useState(() => new Date());
  const [form, setForm] = useState<SurveyForm>(initialForm ?? emptyForm());
  // Problems the server found that the phone's own checks did not (cleared when anything changes).
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  // Which answers have been left (and so may show a problem). After pressing the button, all do.
  const [shown, setShown] = useState<ReadonlySet<FieldName>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Where each group of boxes sits in the scrolling form, to scroll to the first problem.
  const [groupTops, setGroupTops] = useState<Partial<Record<FieldName, number>>>({});

  const metric = form.units === 'metric';

  // Every answer is checked on every change; what is *shown* is decided below.
  const checked = useMemo(
    () => buildProfileRequest(form, timeZone, today, limits),
    [form, timeZone, today, limits],
  );
  const problems: FieldErrors = checked.ok ? {} : checked.errors;
  const errorFor = (field: FieldName): string | undefined =>
    serverErrors[field] ?? (showAll || shown.has(field) ? problems[field] : undefined);

  const update = (change: (current: SurveyForm) => SurveyForm) => {
    setForm(change);
    setServerErrors({});
    setProblem(null);
  };
  const set = <K extends keyof SurveyForm>(key: K, value: SurveyForm[K]) =>
    update((current) => ({ ...current, [key]: value }));

  // Pausing for a moment counts as "done typing": answers that are filled in can show a problem
  // even if the person hasn't left the box (for example the keyboard has no Done key).
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown((current) => {
        const missing = answersWithText(form).filter((field) => !current.has(field));
        return missing.length === 0 ? current : new Set([...current, ...missing]);
      });
    }, IDLE_MS);
    return () => clearTimeout(timer);
  }, [form]);

  /** Called when the person leaves one of the boxes of an answer. */
  const left = (field: FieldName) => {
    if (groupReady(form, field)) setShown((current) => new Set(current).add(field));
  };
  const trackPosition = (field: FieldName) => (event: LayoutChangeEvent) => {
    const top = event.nativeEvent.layout.y;
    setGroupTops((current) => (current[field] === top ? current : { ...current, [field]: top }));
  };

  function scrollToFirstProblem(fields: FieldName[]) {
    const tops = fields.map((field) => groupTops[field]).filter((y) => y !== undefined);
    if (tops.length > 0) {
      scrollRef.current?.scrollTo({ y: Math.max(0, Math.min(...tops) - 16), animated: true });
    }
  }

  function explain(fields: FieldName[]): string {
    return fields.length === 1
      ? '1 answer needs fixing. It is marked in red.'
      : `${fields.length} answers need fixing. They are marked in red.`;
  }

  async function submit() {
    if (saving) return;
    setProblem(null);

    if (!checked.ok) {
      setShowAll(true);
      const fields = Object.keys(checked.errors) as FieldName[];
      setProblem(explain(fields));
      scrollToFirstProblem(fields);
      return;
    }
    setSaving(true);
    try {
      onSaved(await saveSurvey(checked.body));
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const fields = Object.keys(error.fieldErrors) as FieldName[];
        setServerErrors(error.fieldErrors as FieldErrors);
        setProblem(explain(fields));
        scrollToFirstProblem(fields);
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
        ref={scrollRef}
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
        {limitsUnavailable ? (
          <Text style={styles.notice}>
            Couldn’t load the answer limits from the server, so some problems will only show when
            you press the button.
          </Text>
        ) : null}

        <FormGroup
          label="Your name (optional)"
          error={errorFor('name')}
          onLayout={trackPosition('name')}
        >
          <Input
            accessibilityLabel="Your name"
            value={form.name}
            onChangeText={(text) => set('name', text)}
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={100}
            hasError={!!errorFor('name')}
            onBlur={() => left('name')}
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
            onChange={(units) => update((current) => changeUnits(current, units))}
          />
        </FormGroup>

        <FormGroup
          label="Sex (used for the calorie formula)"
          help="'Prefer not to say' uses an average of the male and female formulas."
          error={errorFor('sex')}
          onLayout={trackPosition('sex')}
        >
          <ChoiceGroup
            label="Sex"
            choices={SEX_CHOICES}
            value={form.sex}
            onChange={(sex) => set('sex', sex)}
          />
        </FormGroup>

        <FormGroup
          label="Birth date"
          error={errorFor('birth_date')}
          onLayout={trackPosition('birth_date')}
        >
          <View style={styles.row}>
            <Input
              accessibilityLabel="Birth month"
              placeholder="MM"
              keyboardType="number-pad"
              maxLength={2}
              value={form.birthMonth}
              onChangeText={(text) => set('birthMonth', text)}
              hasError={!!errorFor('birth_date')}
              onBlur={() => left('birth_date')}
              style={styles.small}
            />
            <Input
              accessibilityLabel="Birth day"
              placeholder="DD"
              keyboardType="number-pad"
              maxLength={2}
              value={form.birthDay}
              onChangeText={(text) => set('birthDay', text)}
              hasError={!!errorFor('birth_date')}
              onBlur={() => left('birth_date')}
              style={styles.small}
            />
            <Input
              accessibilityLabel="Birth year"
              placeholder="YYYY"
              keyboardType="number-pad"
              maxLength={4}
              value={form.birthYear}
              onChangeText={(text) => set('birthYear', text)}
              hasError={!!errorFor('birth_date')}
              onBlur={() => left('birth_date')}
              style={styles.medium}
            />
          </View>
        </FormGroup>

        <FormGroup
          label="Height"
          error={errorFor('height_cm')}
          onLayout={trackPosition('height_cm')}
        >
          {metric ? (
            <Input
              accessibilityLabel="Height in centimetres"
              placeholder="cm"
              keyboardType="decimal-pad"
              value={form.heightCm}
              onChangeText={(text) => set('heightCm', cleanNumber(text))}
              maxLength={MAX_NUMBER_LENGTH}
              hasError={!!errorFor('height_cm')}
              onBlur={() => left('height_cm')}
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
                hasError={!!errorFor('height_cm')}
                onBlur={() => left('height_cm')}
                style={styles.small}
              />
              <Input
                accessibilityLabel="Height, inches"
                placeholder="in"
                keyboardType="decimal-pad"
                maxLength={4}
                value={form.heightInches}
                onChangeText={(text) => set('heightInches', cleanNumber(text))}
                hasError={!!errorFor('height_cm')}
                onBlur={() => left('height_cm')}
                style={styles.small}
              />
            </View>
          )}
        </FormGroup>

        <FormGroup
          label="Current weight"
          error={errorFor('weight_kg')}
          onLayout={trackPosition('weight_kg')}
        >
          <Input
            accessibilityLabel={`Current weight in ${metric ? 'kilograms' : 'pounds'}`}
            placeholder={metric ? 'kg' : 'lb'}
            keyboardType="decimal-pad"
            value={form.weight}
            onChangeText={(text) => set('weight', cleanNumber(text))}
            maxLength={MAX_NUMBER_LENGTH}
            hasError={!!errorFor('weight_kg')}
            onBlur={() => left('weight_kg')}
          />
        </FormGroup>

        <FormGroup
          label="How active are you?"
          error={errorFor('activity_level')}
          onLayout={trackPosition('activity_level')}
        >
          <ChoiceGroup
            label="Activity level"
            choices={ACTIVITY_CHOICES}
            value={form.activity}
            onChange={(activity) => set('activity', activity)}
          />
        </FormGroup>

        <FormGroup
          label="Your goal"
          error={errorFor('goal_type')}
          onLayout={trackPosition('goal_type')}
        >
          <ChoiceGroup
            label="Goal"
            choices={GOAL_CHOICES}
            value={form.goalType}
            onChange={(goalType) =>
              update((current) => ({ ...current, goalType, rateKg: DEFAULT_RATE_KG }))
            }
          />
        </FormGroup>

        {rateChoices.length > 0 ? (
          <FormGroup
            label="How fast?"
            error={errorFor('rate_kg_per_week')}
            onLayout={trackPosition('rate_kg_per_week')}
          >
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
          error={errorFor('goal_weight_kg')}
          onLayout={trackPosition('goal_weight_kg')}
        >
          <Input
            accessibilityLabel={`Goal weight in ${metric ? 'kilograms' : 'pounds'}`}
            placeholder={metric ? 'kg' : 'lb'}
            keyboardType="decimal-pad"
            value={form.goalWeight}
            onChangeText={(text) => set('goalWeight', cleanNumber(text))}
            maxLength={MAX_NUMBER_LENGTH}
            hasError={!!errorFor('goal_weight_kg')}
            onBlur={() => left('goal_weight_kg')}
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
  notice: { fontSize: 14, color: '#7a4b00', marginBottom: 16, lineHeight: 19 },
  problem: { fontSize: 16, color: '#b00020', marginBottom: 12 },
});
