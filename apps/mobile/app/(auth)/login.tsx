import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Button, HelperText, Snackbar, Text, TextInput, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorMessage, useAuthStore } from "@/lib/auth";

export default function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailInvalid = email.length > 0 && !email.includes("@");
  const canSubmit = email.includes("@") && password.length >= 8 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text variant="headlineMedium" style={styles.title}>
            Anka Farm
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Çiftlik paneline giriş
          </Text>

          <TextInput
            label="E-posta"
            accessibilityLabel="E-posta"
            testID="login-email"
            mode="outlined"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            error={emailInvalid}
            returnKeyType="next"
          />
          <HelperText type="error" visible={emailInvalid}>
            Geçerli bir e-posta girin
          </HelperText>

          <TextInput
            label="Şifre"
            accessibilityLabel="Şifre"
            testID="login-password"
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType="password"
            autoComplete="password"
            right={<TextInput.Icon icon={showPassword ? "eye-off" : "eye"} onPress={() => setShowPassword((v) => !v)} />}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <HelperText type="info" visible={password.length > 0 && password.length < 8}>
            En az 8 karakter
          </HelperText>

          <Button mode="contained" onPress={submit} loading={busy} disabled={!canSubmit} style={styles.button} testID="login-submit">
            Giriş yap
          </Button>
        </View>
      </ScrollView>

      <Snackbar visible={error !== null} onDismiss={() => setError(null)} duration={4000}>
        {error ?? ""}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 20, justifyContent: "center" },
  card: { width: "100%", maxWidth: 440, alignSelf: "center", gap: 4 },
  title: { textAlign: "center" },
  subtitle: { textAlign: "center", opacity: 0.7, marginBottom: 24 },
  button: { marginTop: 8 },
});
