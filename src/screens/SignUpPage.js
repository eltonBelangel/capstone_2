import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

// EmailJS keys, from your .env file (see setup notes)
const EMAILJS_SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
// Needed because EmailJS is in strict mode. Keep this out of public releases.
const EMAILJS_PRIVATE_KEY = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY;

const CODE_TTL_MS = 5 * 60 * 1000; // code is valid for 5 minutes
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const cleanPhone = (v) => v.replace(/[\s-]/g, "");
const isValidPhone = (v) => /^09\d{9}$/.test(cleanPhone(v));
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));

async function sendCodeEmail(to, code) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: { to_email: to, passcode: code, time: "5 minutes" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`EmailJS said: ${detail}`);
  }
}

export default function SignUpPage({ navigation }) {
  const [step, setStep] = useState("form"); // "form" | "code"
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Code step
  const [pending, setPending] = useState(null); // { code, expiresAt }
  const [entered, setEntered] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validateForm = () => {
    if (username.trim().length < 3) return "Username must be at least 3 characters.";
    if (!isValidEmail(email)) return "Enter a valid email address.";
    if (!isValidPhone(phone)) {
      return "Phone must be 11 digits and start with 09, for example 09171234567.";
    }
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  };

  const sendCode = async () => {
    const problem = validateForm();
    if (problem) {
      Alert.alert("Check your details", problem);
      return;
    }
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      Alert.alert(
        "Setup needed",
        "Add the EmailJS keys to your .env file, then restart with npx expo start -c."
      );
      return;
    }

    setSending(true);
    try {
      const code = makeCode();
      await sendCodeEmail(email.trim().toLowerCase(), code);
      setPending({ code, expiresAt: Date.now() + CODE_TTL_MS });
      setEntered("");
      setAttempts(0);
      setCooldown(RESEND_SECONDS);
      setStep("code");
    } catch (e) {
      Alert.alert("Could not send code", e.message);
    } finally {
      setSending(false);
    }
  };

  const verifyAndCreate = async () => {
    if (entered.length !== 6) {
      Alert.alert("Enter the code", "The code has 6 digits.");
      return;
    }
    if (!pending || Date.now() > pending.expiresAt) {
      Alert.alert("Code expired", "Request a new code.");
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert("Too many tries", "Request a new code.");
      return;
    }
    if (entered !== pending.code) {
      setAttempts((n) => n + 1);
      Alert.alert("Wrong code", "Check the email and try again.");
      return;
    }

    setCreating(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      await setDoc(doc(db, "users", cred.user.uid), {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone(phone),
        role: "user",
        emailVerified: true,
        createdAt: new Date(),
      });
      // createUserWithEmailAndPassword already signed the user in
      navigation.replace("MainTabs");
    } catch (e) {
      Alert.alert("Sign up failed", e.message);
    } finally {
      setCreating(false);
    }
  };

  const changeDetails = () => {
    setStep("form");
    setPending(null);
    setEntered("");
    setCooldown(0);
  };

  // ---------- Step 2: enter the code ----------
  if (step === "code") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.formArea}>
            <Text style={styles.formTitle}>Verify your email</Text>
            <Text style={styles.formSubtitle}>
              Step 2 of 2: we sent a 6-digit verification code to{" "}
              {email.trim().toLowerCase()}. Enter it below to complete your registration. The
              code expires in 5 minutes.
            </Text>

            <TextInput
              style={styles.codeInput}
              value={entered}
              onChangeText={(v) => setEntered(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="#CBD5E1"
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, creating && styles.disabled]}
              onPress={verifyAndCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Verify and continue</Text>
              )}
            </TouchableOpacity>

            <View style={styles.codeActions}>
              <TouchableOpacity onPress={sendCode} disabled={cooldown > 0 || sending}>
                {sending ? (
                  <ActivityIndicator color="#1A56DB" />
                ) : (
                  <Text style={[styles.linkText, cooldown > 0 && styles.disabledText]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={changeDetails}>
                <Text style={styles.linkText}>Change details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---------- Step 1: fill in the form ----------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formArea}>
          <Text style={styles.formTitle}>Create Account</Text>
          <Text style={styles.formSubtitle}>
            Step 1 of 2: enter your details. You will verify your email in the next step.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>USERNAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor="#B0B8C1"
              value={username}
              onChangeText={setUsername}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#B0B8C1"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              placeholder="09XX XXX XXXX"
              placeholderTextColor="#B0B8C1"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={13}
            />
            <Text style={styles.hint}>11 digits, starting with 09</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Create a password"
                placeholderTextColor="#B0B8C1"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Email verification required</Text>
            <Text style={styles.noticeText}>
              After you submit, we will send a 6-digit verification code (OTP) to your email
              address. You will need to enter it on the next screen to complete your
              registration.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, sending && styles.disabled]}
            onPress={sendCode}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Submit</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.loginLinkText}>
              Already have an account?{"  "}
              <Text style={styles.loginLinkHighlight}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: { paddingBottom: 80 },
  formArea: { paddingHorizontal: 28, paddingTop: 60 },
  formTitle: { fontSize: 22, fontWeight: "700", color: "#0F172A", marginBottom: 4 },
  formSubtitle: { fontSize: 14, color: "#94A3B8", marginBottom: 24 },
  inputGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 1, marginBottom: 7 },
  hint: { fontSize: 12, color: "#94A3B8", marginTop: 6 },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: "#0F172A",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: "#0F172A" },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13, justifyContent: "center" },
  eyeText: { fontSize: 13, fontWeight: "600", color: "#1A56DB" },
  codeInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingVertical: 14,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 12,
    textAlign: "center",
    color: "#0F172A",
    marginBottom: 18,
  },
  button: {
    backgroundColor: "#1A56DB",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  noticeBox: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  noticeTitle: { fontSize: 13, fontWeight: "700", color: "#1E40AF", marginBottom: 4 },
  noticeText: { fontSize: 13, lineHeight: 19, color: "#1E3A8A" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  disabled: { opacity: 0.6 },
  codeActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  linkText: { color: "#1A56DB", fontWeight: "600", fontSize: 14 },
  disabledText: { color: "#94A3B8" },
  loginLink: { alignItems: "center", paddingVertical: 8 },
  loginLinkText: { fontSize: 14, color: "#64748B" },
  loginLinkHighlight: { color: "#1A56DB", fontWeight: "700" },
});