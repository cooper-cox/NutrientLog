import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

export const DISCLAIMER =
  'NutrientLog gives general estimates for healthy adults. It is not medical advice. If you are ' +
  'pregnant or breastfeeding, have a medical condition, or have had an eating disorder, talk to ' +
  'your doctor before changing how you eat.';

/** A label, some help text, the input(s) and an error message, kept together. */
export function FormGroup({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
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
      placeholderTextColor="#888888"
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
  label: { fontSize: 17, fontWeight: '600', color: '#111111' },
  help: { fontSize: 14, color: '#555555', marginTop: 2, lineHeight: 19 },
  error: { fontSize: 15, color: '#b00020', marginTop: 6 },
  input: {
    minHeight: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#999999',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 18,
    color: '#111111',
    backgroundColor: '#ffffff',
  },
  inputError: { borderColor: '#b00020' },
  choice: {
    minHeight: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#999999',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  choiceSelected: { backgroundColor: '#111111', borderColor: '#111111' },
  choiceLabel: { fontSize: 17, color: '#111111' },
  choiceLabelSelected: { color: '#ffffff' },
  choiceDetail: { fontSize: 14, color: '#555555', marginTop: 2 },
  button: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonSecondary: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#111111' },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  buttonTextSecondary: { color: '#111111' },
});
