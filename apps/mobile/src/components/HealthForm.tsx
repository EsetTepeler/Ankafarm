import { labels, type HealthType } from "@anka/shared";
import { ScrollView, StyleSheet, View } from "react-native";
import { Chip, TextInput } from "react-native-paper";

import { DateField } from "@/components/DateField";
import type { HealthFormValues } from "@/features/health/repo";

const types = Object.entries(labels.healthType) as [HealthType, string][];

interface Props {
  values: HealthFormValues;
  onChange: (patch: Partial<HealthFormValues>) => void;
}

/** Tekli ve toplu sağlık girişinin ortak formu. */
export function HealthForm({ values, onChange }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {types.map(([value, label]) => (
          <Chip key={value} selected={values.type === value} onPress={() => onChange({ type: value })} testID={`health-type-${value}`}>
            {label}
          </Chip>
        ))}
      </ScrollView>

      <TextInput
        label={values.type === "vaccine" ? "Aşı adı" : values.type === "medication" || values.type === "deworming" ? "İlaç adı" : "Açıklama"}
        mode="outlined"
        value={values.productName}
        onChangeText={(v) => onChange({ productName: v })}
        testID="health-product"
      />

      <View style={styles.row}>
        <TextInput
          label="Doz"
          mode="outlined"
          value={values.dose}
          onChangeText={(v) => onChange({ dose: v })}
          keyboardType="decimal-pad"
          style={styles.flex}
          testID="health-dose"
        />
        <TextInput label="Birim" mode="outlined" value={values.doseUnit} onChangeText={(v) => onChange({ doseUnit: v })} style={styles.unit} testID="health-unit" />
      </View>

      <DateField label="Uygulama tarihi" value={values.appliedAt} onChange={(v) => onChange({ appliedAt: v })} testID="health-applied" />

      <TextInput label="Veteriner (isteğe bağlı)" mode="outlined" value={values.vetName} onChangeText={(v) => onChange({ vetName: v })} testID="health-vet" />

      <DateField label="Sonraki doz veya kontrol (isteğe bağlı)" value={values.nextDueAt} onChange={(v) => onChange({ nextDueAt: v })} testID="health-nextdue" />

      <View style={styles.row}>
        <TextInput
          label="Arınma süresi, gün"
          mode="outlined"
          value={values.withdrawalDays}
          onChangeText={(v) => onChange({ withdrawalDays: v })}
          keyboardType="number-pad"
          style={styles.flex}
          testID="health-withdrawal"
        />
        <TextInput
          label="Maliyet, TL"
          mode="outlined"
          value={values.cost}
          onChangeText={(v) => onChange({ cost: v })}
          keyboardType="decimal-pad"
          style={styles.flex}
          testID="health-cost"
        />
      </View>

      <TextInput label="Not" mode="outlined" value={values.notes} onChangeText={(v) => onChange({ notes: v })} multiline testID="health-notes" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  chips: { gap: 8, paddingVertical: 4 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  unit: { width: 100 },
});
