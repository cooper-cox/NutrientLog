import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "../../ui/components";
import { useWeek } from "./useWeek";
import { WeekView } from "./WeekView";

type Props = {
  reloadKey: number;
  onPickDay: (date: string) => void;
};

/** The week summary, loaded when this tab is opened. */
export function WeekTab({ reloadKey, onPickDay }: Props) {
  const { state, reload } = useWeek(reloadKey, null);
  if (state.kind === "loading") return <ActivityIndicator />;
  if (state.kind === "error") {
    return (
      <View>
        <Text
          accessibilityRole="alert"
          style={{ color: "#b00020", marginVertical: 16 }}
        >
          {state.message}
        </Text>
        <Button title="Try again" onPress={reload} secondary />
      </View>
    );
  }
  return (
    <WeekView week={state.week} today={state.week.end} onPickDay={onPickDay} />
  );
}
