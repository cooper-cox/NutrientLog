import type { ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { colors } from './theme';

export const DISCLAIMER =
  'NutrientLog gives general estimates for healthy adults. It is not medical advice. If you are ' +
  'pregnant or breastfeeding, have a medical condition, or have had an eating disorder, talk to ' +
  'your doctor before changing how you eat.';

/** A label, some help text, the input(s) and an error message, kept together. */
export function FormGroup({
  label,
  help,
  error,
  onLayout,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  /** Lets a screen find out where this group is, e.g. to scroll to the first problem. */
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.group} onLayout={onLayout}>
      <Text style={styles.label}>{label}</Text>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {children}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps & { hasError?: boolean }) {
  const { hasError, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      style={[styles.input, hasError && styles.inputError, style]}
      {...rest}
    />
  );
}

export type Choice<T extends string | number> = { value: T; label: string; detail?: string };

/** A short list of options where exactly one can be picked. */
export function ChoiceGroup<T extends string | number>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={String(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={choice.label}
            onPress={() => onChange(choice.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
              {choice.label}
            </Text>
            {choice.detail ? (
              <Text style={[styles.choiceDetail, selected && styles.choiceLabelSelected]}>
                {choice.detail}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 22 },
  label: { fontSize: 17, fontWeight: '600', color: colors.text },
  help: { fontSize: 14, color: colors.muted, marginTop: 2, lineHeight: 19 },
  error: { fontSize: 15, color: colors.danger, marginTop: 6 },
  input: {
    minHeight: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  choice: {
    minHeight: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  choiceSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceLabel: { fontSize: 17, color: colors.text },
  choiceLabelSelected: { color: colors.onAccent },
  choiceDetail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  button: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.onAccent, fontSize: 18, fontWeight: '600' },
  buttonTextSecondary: { color: colors.accent },
});
