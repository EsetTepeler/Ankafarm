import { useEffect, useState } from "react";
import { HelperText, TextInput } from "react-native-paper";

import { displayToIso, isoToDisplay } from "@/utils/date";

interface Props {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  testID?: string;
  error?: string | null;
  disabled?: boolean;
}

/** Tarih alanı: kullanıcı GG.AA.YYYY yazar, değer ISO (YYYY-AA-GG) olarak tutulur. */
export function DateField({ label, value, onChange, testID, error, disabled }: Props) {
  const [text, setText] = useState(isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  function commit() {
    if (!text.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const iso = displayToIso(text);
    setInvalid(iso === null);
    if (iso) {
      onChange(iso);
      setText(isoToDisplay(iso));
    }
  }

  return (
    <>
      <TextInput
        label={label}
        accessibilityLabel={label}
        testID={testID}
        mode="outlined"
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder="GG.AA.YYYY"
        keyboardType="numbers-and-punctuation"
        disabled={disabled}
        error={invalid || !!error}
        right={<TextInput.Icon icon="calendar" onPress={commit} />}
      />
      <HelperText type="error" visible={invalid || !!error}>
        {invalid ? "Tarih GG.AA.YYYY biçiminde olmalı" : (error ?? "")}
      </HelperText>
    </>
  );
}
